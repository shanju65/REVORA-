"""
Human Review Queue Service for Revora.
Manages high-value transactions and escalated cases requiring human-in-the-loop oversight.

Architectural Rule:
Even when a human reviewer approves an intervention, any subsequent execution
MUST still pass the Deterministic Policy Gateway. No human can bypass hard security invariants.
"""
from datetime import datetime, timezone
from typing import Any, Callable
import sqlite3
from .guardrail_engine import GuardrailEngine


class HumanQueueService:
    def __init__(self, connect_fn: Callable[[], sqlite3.Connection]) -> None:
        self.connect = connect_fn
        self.gateway = GuardrailEngine()

    def enqueue(
        self,
        case_id: int | None,
        transaction: dict[str, Any],
        recommendation: dict[str, Any],
        guardrail_result: dict[str, Any],
        risk_result: dict[str, Any] | None = None,
        root_cause_result: dict[str, Any] | None = None,
    ) -> int:
        conn = self.connect()
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.cursor()

        risk_score = (
            risk_result.get("risk_score")
            if risk_result
            else transaction.get("risk_score", 50.0)
        )
        root_cause = (
            root_cause_result.get("root_cause")
            if root_cause_result
            else transaction.get("failure_reason", "UNKNOWN_ERROR")
        )

        cursor.execute(
            """
            INSERT INTO human_queue (
                case_id, transaction_id, customer_id, amount, risk_score,
                root_cause, agent_recommendation, confidence, guardrail_trigger,
                reason, created_at, status
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                case_id,
                transaction.get("transaction_id"),
                transaction.get("customer_id"),
                float(transaction.get("amount") or 0.0),
                float(risk_score or 50.0),
                str(root_cause),
                str(recommendation.get("recommendation", "ESCALATE_TO_HUMAN")),
                float(recommendation.get("confidence", 0.70)),
                str(guardrail_result.get("guardrail_name", "MAX_AUTO_ACTION_AMOUNT")),
                str(guardrail_result.get("blocked_reason") or recommendation.get("reason", "High-value escalation")),
                now,
                "OPEN",
            ),
        )
        queue_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return queue_id or 0

    def list_queue(self, status: str = "ALL", limit: int = 50) -> list[dict[str, Any]]:
        conn = self.connect()
        conn.row_factory = sqlite3.Row
        if status.upper() in {"OPEN", "IN_REVIEW", "RESOLVED"}:
            rows = conn.execute(
                "SELECT * FROM human_queue WHERE status = ? ORDER BY queue_id DESC LIMIT ?",
                (status.upper(), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM human_queue ORDER BY queue_id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_item(self, queue_id: int) -> dict[str, Any] | None:
        conn = self.connect()
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM human_queue WHERE queue_id = ?", (queue_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def review_item(
        self,
        queue_id: int,
        action: str,  # "START_REVIEW" | "APPROVE_ACTION" | "REJECT_ACTION" | "RESOLVE"
        reviewed_by: str = "Finance Ops",
        notes: str = "",
    ) -> dict[str, Any]:
        item = self.get_item(queue_id)
        if not item:
            return {"success": False, "error": f"Queue item {queue_id} not found."}

        conn = self.connect()
        now = datetime.now(timezone.utc).isoformat()

        new_status = item["status"]
        if action == "START_REVIEW":
            new_status = "IN_REVIEW"
        elif action in {"APPROVE_ACTION", "REJECT_ACTION", "RESOLVE"}:
            new_status = "RESOLVED"

        conn.execute(
            """
            UPDATE human_queue
            SET status = ?, reviewed_by = ?, review_notes = ?, resolved_at = ?
            WHERE queue_id = ?
            """,
            (new_status, reviewed_by, notes, now if new_status == "RESOLVED" else None, queue_id),
        )
        conn.commit()
        conn.close()

        return {
            "success": True,
            "queue_id": queue_id,
            "previous_status": item["status"],
            "new_status": new_status,
            "reviewed_by": reviewed_by,
            "notes": notes,
        }

    def get_stats(self) -> dict[str, Any]:
        conn = self.connect()
        total = conn.execute("SELECT COUNT(*) FROM human_queue").fetchone()[0]
        open_count = conn.execute("SELECT COUNT(*) FROM human_queue WHERE status = 'OPEN'").fetchone()[0]
        in_review = conn.execute("SELECT COUNT(*) FROM human_queue WHERE status = 'IN_REVIEW'").fetchone()[0]
        resolved = conn.execute("SELECT COUNT(*) FROM human_queue WHERE status = 'RESOLVED'").fetchone()[0]
        conn.close()
        return {
            "total_escalated": total,
            "open": open_count,
            "in_review": in_review,
            "resolved": resolved,
        }
