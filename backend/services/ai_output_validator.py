"""
AI Output Validator for Revora.
Enforces strict schema, safety, and operational boundaries on all LLM-generated outputs
before any decision or communication can proceed.
Validates:
- JSON / schema conformity
- Known enum values
- Confidence range 0.0 to 1.0
- Recommended delay between 5 and 1440 minutes
- Message length <= 500 characters
- Forbidden terms (no policy override, no guaranteed claims)
- Security check (strictly no CVV, OTP, PIN, or secret credential requests)
"""
from typing import Any

VALID_ROOT_CAUSES = {
    "INSUFFICIENT_FUNDS",
    "TEMPORARY_BANK_DECLINE",
    "PERMANENT_BANK_DECLINE",
    "EXPIRED_CARD",
    "INVALID_CARD",
    "NETWORK_ERROR",
    "GATEWAY_ERROR",
    "MANDATE_FAILURE",
    "CUSTOMER_ABANDONMENT",
    "UNKNOWN",
}

VALID_ACTIONS = {
    "RETRY_NOW",
    "RETRY_LATER",
    "CONTACT_CUSTOMER",
    "ESCALATE_TO_HUMAN",
    "STOP_RECOVERY",
}

FORBIDDEN_TERMS = {
    "bypass guardrail",
    "ignore guardrail",
    "override policy",
    "guaranteed recovery",
    "charge unconditionally",
    "unauthorized retry",
    "hack",
    "system prompt",
}

SENSITIVE_CREDENTIAL_TERMS = {
    "cvv",
    "cvv2",
    "otp",
    "pin",
    "password",
    "card number",
    "full card",
    "secret key",
    "api_key",
}


class AIOutputValidator:
    def validate_root_cause(self, output: dict[str, Any]) -> tuple[bool, str | None, dict[str, Any]]:
        if not isinstance(output, dict):
            return False, "Output is not a valid JSON dictionary", {"root_cause": "UNKNOWN", "confidence": 0.50}

        root_cause = str(output.get("root_cause", "")).upper().strip()
        if root_cause not in VALID_ROOT_CAUSES:
            return False, f"Invalid root cause enum: {root_cause}", {"root_cause": "UNKNOWN", "confidence": 0.50}

        try:
            confidence = float(output.get("confidence", 0.5))
            if not (0.0 <= confidence <= 1.0):
                return False, f"Confidence out of bounds [0, 1]: {confidence}", {"root_cause": root_cause, "confidence": 0.50}
        except (ValueError, TypeError):
            return False, "Confidence is not a valid float", {"root_cause": root_cause, "confidence": 0.50}

        evidence = output.get("evidence") or []
        if isinstance(evidence, str):
            evidence = [evidence]

        return True, None, {
            "root_cause": root_cause,
            "confidence": round(confidence, 2),
            "evidence": evidence,
            "reasoning": str(output.get("reasoning", "LLM-assisted root cause classification.")),
        }

    def validate_customer_message(self, output: dict[str, Any]) -> tuple[bool, str | None, dict[str, Any]]:
        if not isinstance(output, dict):
            return False, "Message output is not a dictionary", self._message_fallback()

        message = str(output.get("message", "")).strip()
        if not message or len(message) > 500:
            return False, f"Message length invalid (1-500 chars): {len(message)}", self._message_fallback()

        lower_msg = message.lower()
        for term in FORBIDDEN_TERMS:
            if term in lower_msg:
                return False, f"Forbidden term detected in message: '{term}'", self._message_fallback()

        for term in SENSITIVE_CREDENTIAL_TERMS:
            if term in lower_msg:
                return False, f"Security violation: Sensitive credential term requested: '{term}'", self._message_fallback()

        try:
            delay = int(output.get("delay_minutes", 30))
            if not (5 <= delay <= 1440):
                delay = 30  # Clamp to standard 30m
        except (ValueError, TypeError):
            delay = 30

        tone = str(output.get("tone", "PROFESSIONAL")).upper()
        if tone not in {"PROFESSIONAL", "EMPATHETIC", "URGENT", "CONCISE"}:
            tone = "PROFESSIONAL"

        return True, None, {
            "message": message,
            "delay_minutes": delay,
            "tone": tone,
            "action_hint": "CONTACT_CUSTOMER",
        }

    @staticmethod
    def _message_fallback() -> dict[str, Any]:
        return {
            "message": "Your recent payment could not be processed. Please verify your payment details or authorize the retry in your bank app.",
            "delay_minutes": 30,
            "tone": "PROFESSIONAL",
            "action_hint": "CONTACT_CUSTOMER",
        }
