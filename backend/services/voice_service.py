"""
Voice AI Recovery Service for Revora.
Provides conversational voice recovery interface unified with RAGService:
Speech Input -> Intent & Entity Detection -> Multi-Source Retrieval -> Gemini Grounding -> Policy Gateway -> Speech Playback.

SAFETY INVARIANTS:
1. Strictly rejects sensitive inputs (CVV, OTP, PIN, Card Numbers).
2. Voice confirmation does NOT bypass the Deterministic Policy Gateway.
3. Every recovery execution triggered via voice must pass the policy gateway first.
"""
from datetime import datetime, timezone
import uuid
from typing import Any, Callable
import sqlite3

from .guardrail_engine import GuardrailEngine
from .recovery_executor import RecoveryExecutor
from .rag_service import RAGService


class VoiceService:
    def __init__(
        self,
        connect_fn: Callable[[], sqlite3.Connection],
        gateway: GuardrailEngine | None = None,
        executor: RecoveryExecutor | None = None,
        rag: RAGService | None = None,
    ) -> None:
        self.connect = connect_fn
        self.gateway = gateway or GuardrailEngine()
        self.executor = executor or RecoveryExecutor()
        self.rag = rag or RAGService(connect_fn, gateway=self.gateway, executor=self.executor)

    def process_utterance(
        self,
        session_id: str | None,
        user_text: str,
        transaction_id: str | None = None,
    ) -> dict[str, Any]:
        session_id = session_id or f"voice_sess_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()

        # 1. Security Check: reject any sensitive credential disclosure immediately
        if self.rag.check_sensitive_credentials(user_text):
            speech = (
                "For your security, Revora never asks for or accepts CVVs, OTPs, PINs, or card numbers over voice. "
                "Please never share payment credentials."
            )
            self._save_session(session_id, transaction_id or "UNKNOWN", "CUSTOMER", "REJECTED_SENSITIVE_INPUT", "BLOCKED", user_text, speech, None)
            return {
                "session_id": session_id,
                "transaction_id": transaction_id,
                "user_text": user_text,
                "detected_intent": "REJECTED_SENSITIVE_INPUT",
                "speech_response": speech,
                "policy_decision": "BLOCKED",
                "execution_result": None,
                "status": "SECURITY_VIOLATION",
                "sources_used": ["Zero-Trust Security Filter"],
            }

        # 2. Build session context
        session_context: dict[str, Any] = {}
        if transaction_id:
            session_context["active_transaction_id"] = transaction_id

        # 3. Delegate to RAGService for real domain retrieval, intent routing, and grounded synthesis
        rag_res = self.rag.answer_query(session_id, user_text, session_context)
        speech = rag_res["answer"]
        intent = rag_res.get("intent", "GENERAL_INQUIRY")
        policy_decision = rag_res.get("policy_decision") or ("APPROVED" if intent == "RETRY_PAYMENT" and "approved" in speech.lower() else "INFORMATIONAL")
        execution_result = rag_res.get("action_result")

        # 4. Save voice session audit
        active_tx = session_context.get("active_transaction_id") or transaction_id or "UNKNOWN"
        self._save_session(session_id, active_tx, "CUSTOMER", intent, policy_decision, user_text, speech, execution_result)

        return {
            "session_id": rag_res["conversation_id"],
            "transaction_id": active_tx,
            "user_text": user_text,
            "detected_intent": intent,
            "policy_decision": policy_decision,
            "speech_response": speech,
            "execution_result": execution_result,
            "status": rag_res.get("status", "COMPLETED"),
            "sources_used": rag_res.get("sources_used", []),
        }

    def _save_session(
        self,
        session_id: str,
        transaction_id: str,
        customer_id: str,
        intent: str,
        policy_decision: str,
        user_text: str,
        speech_text: str,
        exec_res: dict[str, Any] | None,
    ) -> None:
        try:
            conn = self.connect()
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                INSERT OR REPLACE INTO voice_sessions (
                    session_id, transaction_id, customer_id, status,
                    conversation_transcript, detected_intent, policy_decision,
                    execution_result, started_at, ended_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    transaction_id,
                    customer_id,
                    "COMPLETED",
                    f"User: {user_text}\nRevora Voice: {speech_text}",
                    intent,
                    policy_decision,
                    str(exec_res) if exec_res else None,
                    now,
                    now,
                ),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

    def get_recent_sessions(self, limit: int = 20) -> list[dict[str, Any]]:
        try:
            conn = self.connect()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM voice_sessions ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []
