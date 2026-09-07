"""
Security Service for Revora AI Revenue Recovery Platform.

Provides cryptographic SHA-256 hashing and tamper-evident audit trail integrity verification.
Follows deterministic canonical JSON encoding and sequential hash chaining.
Strictly scrubs sensitive credentials (CVV, OTP, PIN, card numbers, passwords, secrets)
to guarantee no credential data is ever hashed or persisted.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

GENESIS_PREVIOUS_HASH: str | None = None

# Sensitive keys that must NEVER be hashed or recorded in audit metadata
SENSITIVE_KEY_PATTERNS = {
    "cvv",
    "cvc",
    "cvv2",
    "otp",
    "pin",
    "card_number",
    "pan",
    "card_no",
    "account_number",
    "password",
    "secret",
    "api_key",
    "auth_token",
    "access_token",
    "private_key",
    "authorization",
}


def sanitize_for_audit(data: Any) -> Any:
    """
    Recursively sanitize audit data structures to strip or mask any
    sensitive credentials or secrets before canonical serialization.
    """
    if isinstance(data, dict):
        sanitized: dict[str, Any] = {}
        for key, value in data.items():
            key_lower = str(key).lower()
            if any(pattern in key_lower for pattern in SENSITIVE_KEY_PATTERNS):
                continue
            sanitized[key] = sanitize_for_audit(value)
        return sanitized
    elif isinstance(data, (list, tuple)):
        return [sanitize_for_audit(item) for item in data]
    return data


def canonical_json(data: Any) -> str:
    """
    Produce a deterministic, canonical JSON representation of audit data.
    - Sorted keys
    - Consistent compact separators (no trailing or extra whitespace)
    - Deterministic string encoding (UTF-8 compatible)
    """
    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )


def compute_sha256(data: str | bytes | dict[str, Any] | list[Any]) -> str:
    """
    Calculate the SHA-256 hexadecimal hash using Python's standard hashlib library.
    Never stores or processes raw sensitive credentials.
    """
    if isinstance(data, (dict, list)):
        canonical_str = canonical_json(sanitize_for_audit(data))
        raw_bytes = canonical_str.encode("utf-8")
    elif isinstance(data, str):
        raw_bytes = data.encode("utf-8")
    elif isinstance(data, (bytes, bytearray)):
        raw_bytes = bytes(data)
    else:
        raw_bytes = str(data).encode("utf-8")

    return hashlib.sha256(raw_bytes).hexdigest()


def build_canonical_payload(
    event_type: str,
    description: str,
    actor: str,
    timestamp: str,
    transaction_id: str,
    metadata: Any,
    previous_event_hash: str | None,
) -> dict[str, Any]:
    """
    Construct the standardized canonical dictionary representing an audit event.
    Order-independent because canonical_json sorts keys deterministically.
    """
    clean_meta = metadata
    if isinstance(clean_meta, str):
        try:
            clean_meta = json.loads(clean_meta)
        except Exception:
            clean_meta = {"raw": clean_meta}
    if not isinstance(clean_meta, dict):
        clean_meta = {}

    return {
        "actor": str(actor or ""),
        "description": str(description or ""),
        "event_type": str(event_type or ""),
        "metadata": sanitize_for_audit(clean_meta),
        "previous_event_hash": previous_event_hash,
        "timestamp": str(timestamp or ""),
        "transaction_id": str(transaction_id or ""),
    }


def compute_event_hash(
    event_data: dict[str, Any],
    previous_event_hash: str | None,
) -> tuple[str, dict[str, Any]]:
    """
    Computes the SHA-256 hash of an audit event linked to previous_event_hash.
    Returns a tuple of (event_hash, canonical_payload).
    """
    payload = build_canonical_payload(
        event_type=event_data.get("event_type", ""),
        description=event_data.get("description", ""),
        actor=event_data.get("actor", ""),
        timestamp=event_data.get("timestamp", ""),
        transaction_id=event_data.get("transaction_id", ""),
        metadata=event_data.get("metadata", {}),
        previous_event_hash=previous_event_hash,
    )
    serialized = canonical_json(payload)
    event_hash = compute_sha256(serialized)
    return event_hash, payload


def verify_audit_chain(connection: Any) -> dict[str, Any]:
    """
    Verifies the cryptographic integrity of the entire audit trail in chronological order.
    Checks:
    1. Every record contains a valid SHA-256 event_hash.
    2. The first record links to None (or GENESIS).
    3. Each subsequent record's previous_event_hash strictly equals the preceding record's event_hash.
    4. Recalculates each record's SHA-256 hash and validates it matches stored event_hash.

    Returns:
      {
          "valid": True,
          "events_checked": int,
          "first_invalid_event": None
      }
    or if tampered:
      {
          "valid": False,
          "events_checked": int,
          "first_invalid_event": int,
          "reason": "HASH_MISMATCH" | "CHAIN_BROKEN" | "UNHASHED_EVENT"
      }
    """
    cursor = connection.cursor()

    # Check if table exists and has hash columns
    try:
        cursor.execute("PRAGMA table_info(audit_logs)")
        cols = {row[1] for row in cursor.fetchall()}
        if "event_hash" not in cols or "previous_event_hash" not in cols:
            return {
                "valid": False,
                "events_checked": 0,
                "first_invalid_event": None,
                "reason": "MIGRATION_REQUIRED_MISSING_HASH_COLUMNS",
            }
    except Exception as e:
        return {
            "valid": False,
            "events_checked": 0,
            "first_invalid_event": None,
            "reason": f"DATABASE_ERROR: {str(e)}",
        }

    cursor.execute(
        "SELECT id, timestamp, transaction_id, event_type, actor, description, metadata, event_hash, previous_event_hash "
        "FROM audit_logs ORDER BY id ASC"
    )
    rows = cursor.fetchall()

    if not rows:
        return {
            "valid": True,
            "events_checked": 0,
            "first_invalid_event": None,
        }

    expected_prev_hash: str | None = None

    for i, row in enumerate(rows):
        if hasattr(row, "keys"):
            row_dict = dict(row)
        else:
            row_dict = {
                "id": row[0],
                "timestamp": row[1],
                "transaction_id": row[2],
                "event_type": row[3],
                "actor": row[4],
                "description": row[5],
                "metadata": row[6],
                "event_hash": row[7],
                "previous_event_hash": row[8],
            }

        event_id = row_dict["id"]
        stored_hash = row_dict.get("event_hash")
        stored_prev_hash = row_dict.get("previous_event_hash")

        # 1. Ensure event has been hashed
        if not stored_hash:
            return {
                "valid": False,
                "events_checked": i,
                "first_invalid_event": event_id,
                "reason": "UNHASHED_EVENT",
            }

        # 2. Check previous hash linkage
        if i == 0:
            if stored_prev_hash not in (None, "", "GENESIS"):
                return {
                    "valid": False,
                    "events_checked": i,
                    "first_invalid_event": event_id,
                    "reason": "INVALID_GENESIS_PREVIOUS_HASH",
                }
        else:
            if stored_prev_hash != expected_prev_hash:
                return {
                    "valid": False,
                    "events_checked": i,
                    "first_invalid_event": event_id,
                    "reason": "CHAIN_BROKEN",
                }

        # 3. Recalculate hash from canonical content
        computed_hash, _ = compute_event_hash(row_dict, stored_prev_hash)
        if computed_hash != stored_hash:
            return {
                "valid": False,
                "events_checked": i,
                "first_invalid_event": event_id,
                "reason": "HASH_MISMATCH",
            }

        expected_prev_hash = stored_hash

    return {
        "valid": True,
        "events_checked": len(rows),
        "first_invalid_event": None,
    }


def backfill_audit_chain(connection: Any) -> int:
    """
    Safely migrates and backfills unhashed legacy audit records into the cryptographic chain.
    - Preserves all existing business fields and records.
    - Never deletes or overwrites existing records.
    - Calculates hashes chronologically and establishes parent-child linkage.
    Returns the number of records backfilled.
    """
    cursor = connection.cursor()

    # Ensure columns exist
    try:
        cursor.execute("ALTER TABLE audit_logs ADD COLUMN event_hash TEXT DEFAULT NULL")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE audit_logs ADD COLUMN previous_event_hash TEXT DEFAULT NULL")
    except Exception:
        pass

    cursor.execute(
        "SELECT id, timestamp, transaction_id, event_type, actor, description, metadata, event_hash, previous_event_hash "
        "FROM audit_logs ORDER BY id ASC"
    )
    all_rows = cursor.fetchall()

    if not all_rows:
        return 0

    # Determine starting previous_hash
    prev_hash: str | None = None
    to_update: list[tuple[str, str | None, int]] = []

    for row in all_rows:
        if hasattr(row, "keys"):
            r = dict(row)
        else:
            r = {
                "id": row[0],
                "timestamp": row[1],
                "transaction_id": row[2],
                "event_type": row[3],
                "actor": row[4],
                "description": row[5],
                "metadata": row[6],
                "event_hash": row[7],
                "previous_event_hash": row[8],
            }

        event_id = r["id"]
        current_hash = r.get("event_hash")

        if current_hash:
            prev_hash = current_hash
        else:
            evt_hash, _ = compute_event_hash(r, prev_hash)
            to_update.append((evt_hash, prev_hash, event_id))
            prev_hash = evt_hash

    if to_update:
        cursor.executemany(
            "UPDATE audit_logs SET event_hash = ?, previous_event_hash = ? WHERE id = ?",
            to_update,
        )
        if hasattr(connection, "commit"):
            connection.commit()

    return len(to_update)
