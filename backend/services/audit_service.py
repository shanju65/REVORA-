from datetime import datetime, timezone
import json
from typing import Any


class AuditService:
    """
    Audit & Compliance Layer for Revora.

    Principle: Records WHAT HAPPENED.
    Maintains an immutable, append-only ledger of every risk detection,
    AI diagnosis, guardrail evaluation, and simulated execution event.
    Provides complete transparency, replayability, and operational auditability.
    """

    def record(self, connection: Any, transaction_id: str, event_type: str, actor: str, description: str, metadata: dict[str, Any] | None = None, batch_id: int | None = None) -> None:
        connection.execute("INSERT INTO audit_logs (timestamp, transaction_id, event_type, actor, description, metadata, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)", (datetime.now(timezone.utc).isoformat(), transaction_id, event_type, actor, description, json.dumps(metadata or {}), batch_id))
