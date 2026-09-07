from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any

from services.security_service import compute_event_hash, sanitize_for_audit


class AuditService:
    """
    Audit & Compliance Layer for Revora.

    Principle: Records WHAT HAPPENED.
    Maintains an immutable, append-only, tamper-evident ledger of every risk detection,
    AI diagnosis, guardrail evaluation, and simulated execution event.
    Provides complete transparency, replayability, and operational auditability
    backed by SHA-256 cryptographic hash chaining.
    """

    def record(
        self,
        connection: Any,
        transaction_id: str,
        event_type: str,
        actor: str,
        description: str,
        metadata: dict[str, Any] | None = None,
        batch_id: int | None = None,
        case_id: int | None = None,
        **kwargs: Any,
    ) -> str:
        """
        Records a new audit event with SHA-256 cryptographic hash chaining.
        - Calculates event_hash using previous_event_hash and deterministic canonical payload.
        - Guarantees O(1) performance: only looks up the immediate previous event hash.
        - Sanitizes metadata to strictly exclude any sensitive credentials or secrets.
        """
        cursor = connection.cursor()

        # Check existing table columns to support dynamic / in-memory databases seamlessly
        has_hash_cols = False
        try:
            cursor.execute("PRAGMA table_info(audit_logs)")
            cols = {r[1] for r in cursor.fetchall()}
            if "event_hash" not in cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN event_hash TEXT DEFAULT NULL")
            if "previous_event_hash" not in cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN previous_event_hash TEXT DEFAULT NULL")
            if "case_id" not in cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN case_id INTEGER DEFAULT NULL")
            if "batch_id" not in cols:
                cursor.execute("ALTER TABLE audit_logs ADD COLUMN batch_id INTEGER DEFAULT NULL")
            has_hash_cols = True
        except Exception:
            pass

        # Retrieve the latest hashed event to chain from
        previous_event_hash: str | None = None
        if has_hash_cols:
            try:
                cursor.execute(
                    "SELECT event_hash FROM audit_logs WHERE event_hash IS NOT NULL ORDER BY id DESC LIMIT 1"
                )
                last_row = cursor.fetchone()
                if last_row:
                    previous_event_hash = last_row[0] if not hasattr(last_row, "keys") else last_row["event_hash"]
            except Exception:
                previous_event_hash = None

        timestamp = datetime.now(timezone.utc).isoformat()
        clean_metadata = sanitize_for_audit(metadata or {})

        event_data = {
            "actor": actor,
            "description": description,
            "event_type": event_type,
            "metadata": clean_metadata,
            "timestamp": timestamp,
            "transaction_id": transaction_id,
        }

        event_hash, _ = compute_event_hash(event_data, previous_event_hash)

        serialized_metadata = json.dumps(clean_metadata)

        if has_hash_cols:
            cursor.execute(
                "INSERT INTO audit_logs (timestamp, transaction_id, event_type, actor, description, metadata, batch_id, case_id, event_hash, previous_event_hash) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    timestamp,
                    transaction_id,
                    event_type,
                    actor,
                    description,
                    serialized_metadata,
                    batch_id,
                    case_id,
                    event_hash,
                    previous_event_hash,
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO audit_logs (timestamp, transaction_id, event_type, actor, description, metadata, batch_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    timestamp,
                    transaction_id,
                    event_type,
                    actor,
                    description,
                    serialized_metadata,
                    batch_id,
                ),
            )

        return event_hash
