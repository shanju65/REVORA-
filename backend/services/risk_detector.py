"""
Risk Engine for Revora.
Evaluates contextual signals across transaction value, retry count, failure severity,
customer history, and compliance flags to compute an explicit 0-100 risk score and tier.
Clearly separates: "How risky is this event?" from "Why did it fail?".
"""
from typing import Any


class RiskDetector:
    """
    Detection & Risk Evaluation Layer for Revora.
    Produces deterministic 0-100 risk scores and categorical risk tiers:
    - LOW (0 - 25): Low friction, high recovery potential, routine retries.
    - MEDIUM (26 - 50): Moderate risk, requires contextual intervention selection.
    - HIGH (51 - 75): Elevated loss or chargeback risk; close to guardrail thresholds.
    - CRITICAL (76 - 100): High stakes, compliance triggers, or hard-stop constraints.
    """

    def assess(self, transaction: Any) -> dict[str, Any]:
        def _get(key: str, default: Any = None) -> Any:
            if isinstance(transaction, dict):
                return transaction.get(key, default)
            try:
                val = transaction[key]
                return default if val is None else val
            except (KeyError, IndexError, TypeError):
                return default

        failed = _get("payment_status") == "FAILED"
        if not failed:
            return {
                "is_revenue_at_risk": False,
                "risk_score": 0.0,
                "risk_tier": "LOW",
                "risk_level": "LOW",
                "risk_factors": ["Payment settled successfully; zero revenue at risk."],
                "reasoning_summary": "Transaction completed without failure.",
                "reason": "Payment completed successfully.",
                "signals": {},
            }

        amount = float(_get("amount") or 0.0)
        retries = int(_get("retry_count") or 0)
        reason = str(_get("failure_reason") or "UNKNOWN_ERROR")
        time_since = int(_get("time_since_failure_minutes") or 0)
        cust_success = float(_get("customer_success_rate") or 0.80)
        method = str(_get("payment_method") or "CARD")
        do_not_contact = bool(_get("do_not_contact"))
        mandate_revoked = bool(_get("mandate_revoked"))
        card_status = str(_get("card_status") or "ACTIVE").upper()

        score = 20.0  # Base risk for any failed payment
        factors: list[str] = []

        # 1. Financial exposure factor
        if amount > 10000:
            score += 30.0
            factors.append(f"High-value exposure: ₹{amount:,.0f} exceeds auto-action limit (₹10,000)")
        elif amount > 5000:
            score += 15.0
            factors.append(f"Substantial transaction amount: ₹{amount:,.0f}")
        elif amount > 2500:
            score += 5.0

        # 2. Retry exhaustion factor
        if retries >= 2:
            score += 25.0
            factors.append(f"Retry limit reached: {retries}/2 attempts exhausted")
        elif retries == 1:
            score += 12.0
            factors.append("Second attempt: prior recovery already failed once")

        # 3. Failure severity factor
        if reason in {"BANK_DECLINED", "PERMANENT_BANK_DECLINE"}:
            score += 22.0
            factors.append(f"Hard issuer decline: {reason}")
        elif reason in {"INSUFFICIENT_FUNDS", "AUTHENTICATION_FAILED"}:
            score += 12.0
            factors.append(f"Customer-side drop: {reason}")
        elif reason in {"NETWORK_ERROR", "TIMEOUT", "TEMPORARY_BANK_ERROR"}:
            score += 5.0
            factors.append(f"Transient gateway/network drop: {reason}")
        else:
            score += 10.0

        # 4. Temporal decay factor
        if time_since > 1440:
            score += 20.0
            factors.append(f"Recovery window expired: {time_since}m elapsed (>24h)")
        elif time_since > 180:
            score += 10.0
            factors.append(f"Stale transaction: {time_since}m elapsed since failure")

        # 5. Customer profile factor
        if cust_success < 0.60:
            score += 18.0
            factors.append(f"Low customer track record: {cust_success:.0%} lifetime payment success")
        elif cust_success < 0.75:
            score += 8.0

        # 6. Hard compliance & account status triggers
        if do_not_contact:
            score += 30.0
            factors.append("Compliance trigger: Customer opted into Do Not Contact list")
        if mandate_revoked:
            score += 30.0
            factors.append("Compliance trigger: Payment mandate explicitly revoked by customer")
        if card_status in {"STOLEN", "BLOCKED", "SUSPENDED"}:
            score += 35.0
            factors.append(f"Security trigger: Instrument status marked as {card_status}")

        final_score = round(max(5.0, min(100.0, score)), 1)

        if final_score >= 76.0:
            tier = "CRITICAL"
        elif final_score >= 51.0:
            tier = "HIGH"
        elif final_score >= 26.0:
            tier = "MEDIUM"
        else:
            tier = "LOW"

        summary = f"Risk evaluated as {tier} ({final_score}/100) based on {len(factors)} contextual factors."
        if factors:
            summary += f" Primary driver: {factors[0]}."

        return {
            "is_revenue_at_risk": True,
            "risk_score": final_score,
            "risk_tier": tier,
            "risk_level": tier,
            "risk_factors": factors,
            "reasoning_summary": summary,
            "reason": summary,
            "signals": {
                "amount": amount,
                "retry_count": retries,
                "failure_reason": reason,
                "time_since_failure_minutes": time_since,
                "customer_success_rate": cust_success,
                "payment_method": method,
                "do_not_contact": do_not_contact,
                "mandate_revoked": mandate_revoked,
                "card_status": card_status,
            },
        }
