"""
Root Cause Analyzer for Revora.
Performs hybrid root-cause diagnosis:
1. FIRST: Deterministic business rules for known gateway decline patterns.
2. SECOND: Bounded LLM classification when decline codes or failure signatures are ambiguous.
3. THIRD: Deterministic safe fallback if LLM is offline or unconfigured.
"""
from typing import Any
from .llm_service import LLMService


class RootCauseAnalyzer:
    def __init__(self, llm_service: LLMService | None = None) -> None:
        self.llm = llm_service or LLMService()

    def analyze(self, transaction: dict[str, Any]) -> dict[str, Any]:
        def _get(key: str, default: Any = None) -> Any:
            if isinstance(transaction, dict):
                return transaction.get(key, default)
            try:
                val = transaction[key]
                return default if val is None else val
            except (KeyError, IndexError, TypeError):
                return default

        failure_reason = str(_get("failure_reason") or "UNKNOWN_ERROR").upper().strip()
        gateway_code = str(_get("gateway_error_code") or "").upper().strip()
        card_status = str(_get("card_status") or "ACTIVE").upper().strip()
        mandate_revoked = bool(_get("mandate_revoked"))

        # Rule-First Deterministic Classification
        if mandate_revoked:
            return {
                "root_cause": "MANDATE_FAILURE",
                "confidence": 0.99,
                "evidence": ["Customer explicitly revoked auto-debit recurring mandate."],
                "source": "RULE",
                "reasoning": "Direct compliance flag: mandate revoked.",
                "is_recoverable": False,
            }

        if card_status == "EXPIRED" or failure_reason == "EXPIRED_CARD":
            return {
                "root_cause": "EXPIRED_CARD",
                "confidence": 0.98,
                "evidence": ["Instrument expiry date passed prior to authorization."],
                "source": "RULE",
                "reasoning": "Card instrument expired.",
                "is_recoverable": False,
            }

        if card_status in {"STOLEN", "BLOCKED"}:
            return {
                "root_cause": "INVALID_CARD",
                "confidence": 0.99,
                "evidence": [f"Card issuer marked instrument as {card_status}."],
                "source": "RULE",
                "reasoning": f"Instrument flagged as {card_status}.",
                "is_recoverable": False,
            }

        if failure_reason in {"NETWORK_ERROR", "TIMEOUT"}:
            return {
                "root_cause": "NETWORK_ERROR",
                "confidence": 0.95,
                "evidence": [f"Connection timed out or socket dropped during bank handshake: {failure_reason}."],
                "source": "RULE",
                "reasoning": "Transient network/gateway packet drop.",
                "is_recoverable": True,
            }

        if failure_reason in {"TEMPORARY_BANK_ERROR"}:
            return {
                "root_cause": "TEMPORARY_BANK_DECLINE",
                "confidence": 0.90,
                "evidence": ["Bank host system reported temporary service unavailability."],
                "source": "RULE",
                "reasoning": "Core banking system temporary outage.",
                "is_recoverable": True,
            }

        if failure_reason in {"INSUFFICIENT_FUNDS"}:
            return {
                "root_cause": "INSUFFICIENT_FUNDS",
                "confidence": 0.95,
                "evidence": ["Cardholder account balance below transaction value."],
                "source": "RULE",
                "reasoning": "Insufficient funds in customer account.",
                "is_recoverable": True,  # Recoverable via customer outreach or delayed top-up
            }

        if failure_reason in {"AUTHENTICATION_FAILED"}:
            return {
                "root_cause": "CUSTOMER_ABANDONMENT",
                "confidence": 0.90,
                "evidence": ["3D Secure authentication challenge failed or OTP timed out."],
                "source": "RULE",
                "reasoning": "Two-factor authentication failure.",
                "is_recoverable": True,  # Recoverable via customer notification
            }

        if failure_reason in {"BANK_DECLINED"}:
            return {
                "root_cause": "PERMANENT_BANK_DECLINE",
                "confidence": 0.88,
                "evidence": ["Issuer bank declined charge without specifying retry interval."],
                "source": "RULE",
                "reasoning": "Hard issuer decline.",
                "is_recoverable": False,
            }

        # Ambiguous case: invoke bounded LLM classifier
        llm_result = self.llm.diagnose_root_cause(
            failure_reason=failure_reason,
            gateway_code=gateway_code,
            amount=float(transaction.get("amount") or 0.0),
            retries=int(transaction.get("retry_count") or 0),
            payment_method=str(transaction.get("payment_method") or "CARD"),
        )

        rc = llm_result.get("root_cause", "UNKNOWN")
        is_rec = rc in {"NETWORK_ERROR", "TEMPORARY_BANK_DECLINE", "INSUFFICIENT_FUNDS", "CUSTOMER_ABANDONMENT"}

        return {
            "root_cause": rc,
            "confidence": llm_result.get("confidence", 0.50),
            "evidence": llm_result.get("evidence", []),
            "source": llm_result.get("source", "LLM"),
            "reasoning": llm_result.get("reasoning", "Ambiguous failure analyzed by AI diagnostic layer."),
            "is_recoverable": is_rec,
        }
