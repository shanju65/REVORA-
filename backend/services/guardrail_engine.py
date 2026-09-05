"""
Deterministic Policy Gateway (Final Financial Authority) for Revora.

Principle: "AI can recommend. Only the Deterministic Policy Gateway can authorize financial action."
The Recovery Agent or Voice AI recommends WHAT SHOULD HAPPEN.
The Deterministic Policy Gateway deterministically decides WHAT IS ALLOWED TO HAPPEN.

Hard Financial & Compliance Invariants:
1. MAX_RETRIES = 2: Prevents runaway retry storms and issuer compliance penalties.
2. MAX_AUTO_ACTION_AMOUNT = 10,000 INR: Forces human escalation on high-value payments.
3. MAX_RECOVERY_WINDOW_MINUTES = 1440 (24h): Rejects stale payment retries.
4. MIN_RECOVERY_CONFIDENCE = 0.60: Blocks low-confidence autonomous actions.
5. INTERVENTION_BUDGET: Bounded recovery budget per case (max 2 retries, max 1 customer outreach).
6. DO_NOT_CONTACT: Blocks customer communications if customer opted out.
7. MANDATE_REVOKED: Hard-stops any recurring debit attempts on revoked mandates.
8. CARD_STATUS_CHECK: Hard-stops recovery on stolen, expired, or blocked instruments.
"""
from typing import Any


class GuardrailEngine:
    """
    Deterministic Policy Gateway (Final Financial Authority).
    Evaluates every proposed AI or Voice action against hard regulatory,
    financial, and operational constraints.
    """
    MAX_RETRIES = 2
    MAX_RECOVERY_WINDOW_MINUTES = 1440
    MAX_AUTO_ACTION_AMOUNT = 10000
    MIN_RECOVERY_CONFIDENCE = 0.60
    MAX_CUSTOMER_WORKFLOWS = 1

    def validate(self, transaction: Any, recommendation: dict[str, Any]) -> dict[str, Any]:
        rules_checked: list[str] = []

        def _get(key: str, default: Any = None) -> Any:
            if isinstance(transaction, dict):
                return transaction.get(key, default)
            try:
                val = transaction[key]
                return default if val is None else val
            except (KeyError, IndexError, TypeError):
                return default

        rules_checked.append("PAYMENT_STATUS_CHECK")
        if _get("payment_status") != "FAILED":
            return self._result("STOPPED", "STOP_RECOVERY", "Not a failed payment", "FAILED_PAYMENT_ONLY", rules_checked)

        rules_checked.append("MANDATE_REVOKED_CHECK")
        if bool(_get("mandate_revoked")):
            return self._result("STOPPED", "STOP_RECOVERY", "Payment mandate explicitly revoked by customer", "MANDATE_REVOKED", rules_checked)

        rules_checked.append("CARD_STATUS_CHECK")
        card_status = str(_get("card_status") or "ACTIVE").upper()
        if card_status in {"STOLEN", "BLOCKED", "SUSPENDED", "EXPIRED"}:
            return self._result("STOPPED", "STOP_RECOVERY", f"Payment instrument marked as {card_status}", "INVALID_CARD_STATUS", rules_checked)

        rules_checked.append("MAX_RETRIES_CHECK")
        if int(_get("retry_count") or 0) >= self.MAX_RETRIES:
            return self._result("STOPPED", "STOP_RECOVERY", "Maximum retries reached", "MAX_RETRIES", rules_checked)

        rules_checked.append("MAX_AUTO_ACTION_AMOUNT_CHECK")
        amount = float(_get("amount") or 0.0)
        if amount > self.MAX_AUTO_ACTION_AMOUNT:
            return self._result("ESCALATED", "ESCALATE_TO_HUMAN", "Amount exceeds automatic action limit", "MAX_AUTO_ACTION_AMOUNT", rules_checked)

        rules_checked.append("MAX_RECOVERY_WINDOW_CHECK")
        time_since = int(_get("time_since_failure_minutes") or 0)
        if time_since > self.MAX_RECOVERY_WINDOW_MINUTES:
            return self._result("STOPPED", "STOP_RECOVERY", "Recovery window expired", "MAX_RECOVERY_WINDOW", rules_checked)

        rules_checked.append("DO_NOT_CONTACT_CHECK")
        if bool(_get("do_not_contact")) and recommendation.get("recommendation") == "CONTACT_CUSTOMER":
            return self._result("BLOCKED", "STOP_RECOVERY", "Customer opted out of contact (Do Not Contact)", "DO_NOT_CONTACT", rules_checked)

        rules_checked.append("INTERVENTION_BUDGET_CHECK")
        if recommendation.get("recommendation") == "CONTACT_CUSTOMER" and int(_get("retry_count") or 0) >= self.MAX_CUSTOMER_WORKFLOWS:
            return self._result("STOPPED", "STOP_RECOVERY", "Intervention budget exhausted for customer outreach", "INTERVENTION_BUDGET", rules_checked)

        rules_checked.append("MIN_RECOVERY_CONFIDENCE_CHECK")
        rec_prob = float(recommendation.get("recovery_probability") or 0.0)
        conf = float(recommendation.get("confidence") or 0.0)
        if rec_prob < self.MIN_RECOVERY_CONFIDENCE or conf < self.MIN_RECOVERY_CONFIDENCE:
            return self._result("BLOCKED", "STOP_RECOVERY", "Recovery confidence is below the automatic action threshold", "MIN_RECOVERY_CONFIDENCE", rules_checked)

        rules_checked.append("SUPPORTED_ACTION_CHECK")
        rec_action = recommendation.get("recommendation")
        if rec_action not in {"RETRY_NOW", "RETRY_LATER", "CONTACT_CUSTOMER", "ESCALATE_TO_HUMAN", "STOP_RECOVERY"}:
            return self._result("BLOCKED", "STOP_RECOVERY", "Unsupported recovery action", "SUPPORTED_ACTION", rules_checked)

        if rec_action == "STOP_RECOVERY":
            return self._result("STOPPED", "STOP_RECOVERY", "Recovery halted by policy stopping rule", "POLICY_STOP", rules_checked)

        if rec_action == "ESCALATE_TO_HUMAN":
            return self._result("ESCALATED", "ESCALATE_TO_HUMAN", "Human review requested by policy recommendation", "POLICY_ESCALATE", rules_checked)

        return self._result("APPROVED", rec_action, None, "ALL_GUARDRAILS", rules_checked)

    @staticmethod
    def _result(status: str, final_action: str, blocked_reason: str | None, guardrail_name: str, rules_checked: list[str]) -> dict[str, Any]:
        return {
            "guardrail_status": status,
            "approved": status == "APPROVED",
            "final_action": final_action,
            "blocked_reason": blocked_reason,
            "guardrail_name": guardrail_name,
            "rules_checked": rules_checked,
        }


# Alias for architectural clarity
DeterministicPolicyGateway = GuardrailEngine
PolicyGateway = GuardrailEngine
