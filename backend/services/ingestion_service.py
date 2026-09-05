"""
Enterprise Ingestion Layer for Revora.
Validates incoming payment failure records, normalizes fields, safely rejects malformed rows,
and persists raw events for audit and downstream processing.
"""
from datetime import datetime, timezone
import io
import csv
import time
from typing import Any, Callable
from pydantic import BaseModel, Field, field_validator
import json
import random
import sqlite3


class RawEvent(BaseModel):
    transaction_id: str = Field(..., min_length=2, max_length=64)
    customer_id: str = Field(..., min_length=2, max_length=64)
    amount: float = Field(..., gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    payment_method: str = Field(default="CARD")
    failure_reason: str = Field(default="UNKNOWN_ERROR")
    gateway_error_code: str | None = None
    retry_count: int = Field(default=0, ge=0)
    created_at: str | None = None
    customer_success_rate: float = Field(default=0.80, ge=0.0, le=1.0)
    customer_previous_transactions: int = Field(default=10, ge=0)
    customer_history: str | None = None
    do_not_contact: bool = False
    mandate_revoked: bool = False
    card_status: str = Field(default="ACTIVE")
    ground_truth_recoverable: int | None = None  # Evaluation dataset only; NEVER production decisioning

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("payment_method")
    @classmethod
    def normalize_method(cls, v: str) -> str:
        norm = v.strip().upper()
        if norm not in {"CARD", "UPI", "NETBANKING", "WALLET"}:
            return "CARD"
        return norm

    @field_validator("card_status")
    @classmethod
    def normalize_card_status(cls, v: str) -> str:
        norm = v.strip().upper()
        if norm not in {"ACTIVE", "EXPIRED", "STOLEN", "BLOCKED", "SUSPENDED"}:
            return "ACTIVE"
        return norm


class IngestionService:
    def __init__(self, connect_fn: Callable[[], sqlite3.Connection]) -> None:
        self.connect = connect_fn

    def ingest_event(self, raw: dict[str, Any], persist: bool = True) -> tuple[bool, RawEvent | None, str | None]:
        try:
            event = RawEvent(**raw)
            if persist:
                self._persist_event(event, status="VALID", error=None)
            return True, event, None
        except Exception as err:
            if persist:
                try:
                    self._persist_raw_rejected(raw, str(err))
                except Exception:
                    pass
            return False, None, str(err)

    def ingest_batch(self, events: list[dict[str, Any]], persist: bool = True) -> dict[str, Any]:
        t0 = time.time()
        valid_events: list[RawEvent] = []
        errors: list[dict[str, Any]] = []

        for idx, item in enumerate(events):
            success, parsed, err = self.ingest_event(item, persist=persist)
            if success and parsed:
                valid_events.append(parsed)
            else:
                errors.append({"index": idx, "transaction_id": item.get("transaction_id"), "error": err})

        duration_ms = round((time.time() - t0) * 1000, 2)
        return {
            "total_received": len(events),
            "valid_count": len(valid_events),
            "rejected_count": len(errors),
            "normalized_count": len(valid_events),
            "errors": errors[:50],  # cap sample
            "ingestion_time_ms": duration_ms,
            "status": "SUCCESS" if len(errors) == 0 else "PARTIAL_SUCCESS" if valid_events else "FAILED",
        }

    def ingest_csv(self, csv_text: str, persist: bool = True) -> dict[str, Any]:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        rows = []
        for r in reader:
            normalized_row = {}
            for k, v in r.items():
                if not k:
                    continue
                clean_key = k.strip().lower()
                clean_val = v.strip() if v else None
                if clean_key in {"amount", "customer_success_rate"}:
                    normalized_row[clean_key] = float(clean_val) if clean_val else 0.0
                elif clean_key in {"retry_count", "customer_previous_transactions", "ground_truth_recoverable"}:
                    normalized_row[clean_key] = int(clean_val) if clean_val else 0
                elif clean_key in {"do_not_contact", "mandate_revoked"}:
                    normalized_row[clean_key] = str(clean_val).lower() in {"1", "true", "yes"}
                else:
                    normalized_row[clean_key] = clean_val
            rows.append(normalized_row)
        return self.ingest_batch(rows, persist=persist)

    def _persist_event(self, event: RawEvent, status: str, error: str | None) -> None:
        conn = self.connect()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO raw_events (
                transaction_id, customer_id, amount, currency, payment_method,
                failure_reason, gateway_error_code, retry_count, created_at,
                customer_success_rate, customer_history, do_not_contact, mandate_revoked,
                card_status, ingestion_status, validation_errors, ingested_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                event.transaction_id,
                event.customer_id,
                event.amount,
                event.currency,
                event.payment_method,
                event.failure_reason,
                event.gateway_error_code,
                event.retry_count,
                event.created_at or now,
                event.customer_success_rate,
                event.customer_history or f"{event.customer_previous_transactions} prior txns",
                1 if event.do_not_contact else 0,
                1 if event.mandate_revoked else 0,
                event.card_status,
                status,
                error,
                now,
            ),
        )

        # Upsert into transactions table so new events are available to recovery pipeline
        conn.execute(
            """
            INSERT INTO transactions (
                transaction_id, customer_id, merchant_id, amount, currency,
                timestamp, payment_method, payment_status, failure_reason,
                retry_count, customer_success_rate, customer_previous_transactions,
                time_since_failure_minutes, customer_segment, risk_score,
                ground_truth_recoverable, gateway_error_code, do_not_contact,
                mandate_revoked, card_status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(transaction_id) DO UPDATE SET
                amount=excluded.amount,
                failure_reason=excluded.failure_reason,
                retry_count=excluded.retry_count,
                do_not_contact=excluded.do_not_contact,
                mandate_revoked=excluded.mandate_revoked,
                card_status=excluded.card_status
            """,
            (
                event.transaction_id,
                event.customer_id,
                "MER_INGEST_001",
                event.amount,
                event.currency,
                event.created_at or now,
                event.payment_method,
                "FAILED",
                event.failure_reason,
                event.retry_count,
                event.customer_success_rate,
                event.customer_previous_transactions,
                5,
                "GROWTH",
                0.5,
                event.ground_truth_recoverable if event.ground_truth_recoverable is not None else 0,
                event.gateway_error_code,
                1 if event.do_not_contact else 0,
                1 if event.mandate_revoked else 0,
                event.card_status,
            ),
        )
        conn.commit()
        conn.close()

    def _persist_raw_rejected(self, raw: dict[str, Any], error: str) -> None:
        conn = self.connect()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO raw_events (
                transaction_id, customer_id, amount, currency, payment_method,
                failure_reason, gateway_error_code, retry_count, created_at,
                customer_success_rate, customer_history, do_not_contact, mandate_revoked,
                card_status, ingestion_status, validation_errors, ingested_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                str(raw.get("transaction_id", "UNKNOWN")),
                str(raw.get("customer_id", "UNKNOWN")),
                float(raw.get("amount", 0.0) or 0.0),
                str(raw.get("currency", "INR")),
                str(raw.get("payment_method", "CARD")),
                str(raw.get("failure_reason", "UNKNOWN_ERROR")),
                str(raw.get("gateway_error_code", "")),
                int(raw.get("retry_count", 0) or 0),
                now,
                0.0,
                "REJECTED",
                1 if raw.get("do_not_contact") else 0,
                1 if raw.get("mandate_revoked") else 0,
                str(raw.get("card_status", "ACTIVE")),
                "REJECTED",
                error,
                now,
            ),
        )
        conn.commit()
        conn.close()

    def get_stats(self) -> dict[str, Any]:
        conn = self.connect()
        total = conn.execute("SELECT COUNT(*) FROM raw_events").fetchone()[0]
        valid = conn.execute("SELECT COUNT(*) FROM raw_events WHERE ingestion_status='VALID'").fetchone()[0]
        rejected = conn.execute("SELECT COUNT(*) FROM raw_events WHERE ingestion_status='REJECTED'").fetchone()[0]
        recent = conn.execute("SELECT * FROM raw_events ORDER BY event_id DESC LIMIT 10").fetchall()
        conn.close()
        return {
            "total_ingested": total,
            "valid_records": valid,
            "rejected_records": rejected,
            "recent_events": [dict(r) for r in recent],
        }

    def ingest_csv_dataset(self, csv_text: str, dataset_name: str, filename: str) -> dict[str, Any]:
        """
        Ingests a CSV dataset, associates every valid transaction with the dataset,
        and registers the dataset record in the database.
        """
        conn = self.connect()
        # Ensure datasets table exists
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id TEXT PRIMARY KEY,
                name TEXT,
                filename TEXT,
                uploaded_at TEXT,
                total_rows INTEGER DEFAULT 0,
                valid_rows INTEGER DEFAULT 0,
                invalid_rows INTEGER DEFAULT 0,
                status TEXT DEFAULT 'ACTIVE',
                summary_json TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dataset_transactions (
                dataset_id TEXT,
                transaction_id TEXT,
                PRIMARY KEY (dataset_id, transaction_id)
            )
            """
        )
        conn.commit()

        dataset_id = f"DS-{int(time.time())}-{random.randint(100, 999)}"
        now = datetime.now(timezone.utc).isoformat()

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        valid_tids: list[str] = []
        errors: list[dict[str, Any]] = []
        total_rows = 0
        total_amount = 0.0

        for idx, r in enumerate(reader):
            total_rows += 1
            normalized_row = {}
            for k, v in r.items():
                if not k:
                    continue
                clean_key = k.strip().lower()
                clean_val = v.strip() if v else None
                if clean_key in {"amount", "customer_success_rate"}:
                    normalized_row[clean_key] = float(clean_val) if clean_val else 0.0
                elif clean_key in {"retry_count", "customer_previous_transactions", "ground_truth_recoverable"}:
                    normalized_row[clean_key] = int(clean_val) if clean_val else 0
                elif clean_key in {"do_not_contact", "mandate_revoked"}:
                    normalized_row[clean_key] = str(clean_val).lower() in {"1", "true", "yes"}
                else:
                    normalized_row[clean_key] = clean_val

            success, parsed, err = self.ingest_event(normalized_row, persist=True)
            if success and parsed:
                valid_tids.append(parsed.transaction_id)
                total_amount += parsed.amount
            else:
                errors.append({"row": idx + 1, "transaction_id": normalized_row.get("transaction_id"), "error": err})

        # Associate transactions to dataset
        if valid_tids:
            conn.executemany(
                "INSERT OR IGNORE INTO dataset_transactions (dataset_id, transaction_id) VALUES (?, ?)",
                [(dataset_id, tid) for tid in valid_tids],
            )

        summary = {
            "total_rows": total_rows,
            "valid_rows": len(valid_tids),
            "invalid_rows": len(errors),
            "total_amount_inr": round(total_amount, 2),
            "sample_errors": errors[:10],
        }

        conn.execute(
            """
            INSERT INTO datasets (dataset_id, name, filename, uploaded_at, total_rows, valid_rows, invalid_rows, status, summary_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            """,
            (dataset_id, dataset_name, filename, now, total_rows, len(valid_tids), len(errors), json.dumps(summary)),
        )
        conn.commit()
        conn.close()

        return {
            "dataset_id": dataset_id,
            "name": dataset_name,
            "filename": filename,
            "uploaded_at": now,
            "total_rows": total_rows,
            "valid_rows": len(valid_tids),
            "invalid_rows": len(errors),
            "total_amount_inr": round(total_amount, 2),
            "sample_errors": errors[:5],
            "status": "SUCCESS" if len(errors) == 0 else "PARTIAL_SUCCESS" if valid_tids else "FAILED",
        }

    def list_datasets(self) -> list[dict[str, Any]]:
        conn = self.connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS datasets (
                    dataset_id TEXT PRIMARY KEY,
                    name TEXT,
                    filename TEXT,
                    uploaded_at TEXT,
                    total_rows INTEGER DEFAULT 0,
                    valid_rows INTEGER DEFAULT 0,
                    invalid_rows INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'ACTIVE',
                    summary_json TEXT
                )
                """
            )
            rows = conn.execute("SELECT * FROM datasets ORDER BY uploaded_at DESC").fetchall()
            result = []
            for r in rows:
                item = dict(r)
                if item.get("summary_json"):
                    try:
                        item["summary"] = json.loads(item["summary_json"])
                    except Exception:
                        item["summary"] = {}
                result.append(item)
            conn.close()
            return result
        except Exception:
            conn.close()
            return []

    def get_dataset_transactions(self, dataset_id: str) -> list[str]:
        conn = self.connect()
        try:
            rows = conn.execute(
                "SELECT transaction_id FROM dataset_transactions WHERE dataset_id = ?",
                (dataset_id,),
            ).fetchall()
            conn.close()
            return [r[0] for r in rows]
        except Exception:
            conn.close()
            return []
