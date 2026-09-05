"""
LLM Service for Revora.
Connects to Google Gemini for structured reasoning:
- Ambiguous root cause diagnosis
- Customer communication drafting (SMS / WhatsApp / Voice notification)
- Contextual delay recommendations (within 5-1440m limits)

IMPORTANT SAFETY BOUNDARY:
The LLM does NOT possess financial authorization authority. It can only diagnose and draft.
Every output passes through AIOutputValidator, and all financial actions must pass
the Deterministic Policy Gateway before execution.
"""
import json
import os
import urllib.request
import urllib.error
from typing import Any
from .ai_output_validator import AIOutputValidator


class LLMService:
    def __init__(self, api_key: str | None = None) -> None:
        if api_key is not None:
            self.api_key = api_key
        else:
            if not os.getenv("GEMINI_API_KEY"):
                from pathlib import Path
                for p in (Path(__file__).resolve().parent.parent.parent / ".env", Path(__file__).resolve().parent.parent / ".env"):
                    if p.exists():
                        try:
                            with open(p, "r", encoding="utf-8") as f:
                                for line in f:
                                    if line.strip().startswith("GEMINI_API_KEY="):
                                        os.environ["GEMINI_API_KEY"] = line.strip().split("=", 1)[1].strip("'\"")
                        except Exception:
                            pass
            self.api_key = os.getenv("GEMINI_API_KEY")
        self.validator = AIOutputValidator()
        self.MODELS = ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.5-flash", "gemini-3.6-flash"]
        self.model = "gemini-flash-latest"
        self.timeout_seconds = 12.0

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 10)

    def diagnose_root_cause(
        self,
        failure_reason: str,
        gateway_code: str | None = None,
        amount: float = 0.0,
        retries: int = 0,
        payment_method: str = "CARD",
    ) -> dict[str, Any]:
        """
        Calls Gemini to classify ambiguous payment failure root causes.
        Falls back deterministically if unconfigured, offline, or invalid.
        """
        if not self.is_configured:
            return self._deterministic_root_cause_fallback(failure_reason, gateway_code)

        prompt = f"""
You are an expert payment systems diagnostician.
Analyze this payment failure and return ONLY valid JSON matching this schema:
{{
  "root_cause": "INSUFFICIENT_FUNDS" | "TEMPORARY_BANK_DECLINE" | "PERMANENT_BANK_DECLINE" | "EXPIRED_CARD" | "INVALID_CARD" | "NETWORK_ERROR" | "GATEWAY_ERROR" | "MANDATE_FAILURE" | "CUSTOMER_ABANDONMENT" | "UNKNOWN",
  "confidence": float between 0.0 and 1.0,
  "evidence": ["string explaining observation 1", "string explaining observation 2"],
  "reasoning": "string concise explanation"
}}

Payment details:
- Failure Reason: {failure_reason}
- Gateway Decline Code: {gateway_code or 'None'}
- Payment Method: {payment_method}
- Amount: INR {amount:.2f}
- Retries: {retries}
"""
        raw_response = self._call_gemini_json(prompt)
        if raw_response:
            is_valid, err, validated = self.validator.validate_root_cause(raw_response)
            if is_valid:
                validated["source"] = "LLM"
                return validated

        # Fallback if call or validation failed
        fallback = self._deterministic_root_cause_fallback(failure_reason, gateway_code)
        fallback["source"] = "FALLBACK"
        return fallback

    def draft_recovery_message(
        self,
        failure_reason: str,
        amount: float = 0.0,
        customer_id: str = "Customer",
        channel: str = "WHATSAPP",
    ) -> dict[str, Any]:
        """
        Calls Gemini to draft a context-aware customer notification.
        Falls back deterministically if unconfigured, offline, or invalid.
        """
        if not self.is_configured:
            return self._deterministic_message_fallback(failure_reason, amount, channel)

        prompt = f"""
You are an AI communication assistant for Razorpay payment recovery.
Draft a short, professional, customer-friendly notification (under 200 characters) to help the customer resolve a payment issue.
NEVER ask for CVV, OTP, PIN, passwords, or card numbers.
Return ONLY valid JSON matching this schema:
{{
  "message": "string (maximum 200 characters)",
  "delay_minutes": integer between 5 and 120,
  "tone": "PROFESSIONAL" | "EMPATHETIC" | "CONCISE"
}}

Context:
- Failure: {failure_reason}
- Amount: INR {amount:,.0f}
- Channel: {channel}
"""
        raw_response = self._call_gemini_json(prompt)
        if raw_response:
            is_valid, err, validated = self.validator.validate_customer_message(raw_response)
            if is_valid:
                validated["source"] = "LLM"
                return validated

        fallback = self._deterministic_message_fallback(failure_reason, amount, channel)
        fallback["source"] = "FALLBACK"
        return fallback

    def _call_gemini_json(self, prompt: str) -> dict[str, Any] | None:
        models_to_try = [self.model] + [m for m in self.MODELS if m != self.model]
        for m in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.1,
                },
            }

            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        self.model = m
                        return json.loads(text)
            except Exception:
                continue
        return None

    def generate_text(
        self,
        prompt: str,
        system_instruction: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> str | None:
        if not self.is_configured:
            return None

        contents = []
        if history:
            cleaned_history: list[dict[str, Any]] = []
            for h in history:
                role = "model" if h.get("role") in ("assistant", "model") else "user"
                t = h.get("text") or h.get("content") or ""
                if not t or not t.strip():
                    continue
                if not cleaned_history and role != "user":
                    continue
                if cleaned_history and cleaned_history[-1]["role"] == role:
                    cleaned_history[-1]["parts"][0]["text"] += "\n" + t.strip()
                else:
                    cleaned_history.append({"role": role, "parts": [{"text": t.strip()}]})

            if cleaned_history and cleaned_history[-1]["role"] == "user":
                cleaned_history.pop()

            contents.extend(cleaned_history)

        contents.append({"role": "user", "parts": [{"text": prompt}]})

        models_to_try = [self.model] + [m for m in self.MODELS if m != self.model]
        for m in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
            payload: dict[str, Any] = {
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.3,
                },
            }
            if system_instruction:
                payload["systemInstruction"] = {
                    "parts": [{"text": system_instruction}]
                }

            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if "text" in part and part["text"].strip():
                                self.model = m
                                return part["text"].strip()
            except Exception:
                continue
        return None

    @staticmethod
    def _deterministic_root_cause_fallback(failure_reason: str, gateway_code: str | None) -> dict[str, Any]:
        reason_upper = failure_reason.upper()
        if reason_upper in {"NETWORK_ERROR", "TIMEOUT"}:
            rc = "NETWORK_ERROR"
            conf = 0.92
            ev = [f"Transient gateway transport drop: {failure_reason}"]
        elif reason_upper in {"INSUFFICIENT_FUNDS"}:
            rc = "INSUFFICIENT_FUNDS"
            conf = 0.95
            ev = ["Issuer returned soft insufficient funds decline code"]
        elif reason_upper in {"TEMPORARY_BANK_ERROR"}:
            rc = "TEMPORARY_BANK_DECLINE"
            conf = 0.90
            ev = ["Bank core banking gateway temporary disruption"]
        elif reason_upper in {"AUTHENTICATION_FAILED", "CUSTOMER_ABANDONMENT"}:
            rc = "CUSTOMER_ABANDONMENT"
            conf = 0.85
            ev = ["3D Secure or OTP verification challenge expired or failed"]
        elif reason_upper in {"BANK_DECLINED"}:
            rc = "PERMANENT_BANK_DECLINE"
            conf = 0.88
            ev = ["Issuer declined transaction without automated retry grant"]
        else:
            rc = "UNKNOWN"
            conf = 0.50
            ev = [f"Unmapped failure signature: {failure_reason} (code: {gateway_code or 'none'})"]

        return {
            "root_cause": rc,
            "confidence": conf,
            "evidence": ev,
            "reasoning": f"Deterministic root cause classification based on payment gateway decline mapping.",
            "source": "RULE",
        }

    @staticmethod
    def _deterministic_message_fallback(failure_reason: str, amount: float, channel: str) -> dict[str, Any]:
        reason_upper = failure_reason.upper()
        amt_str = f"₹{amount:,.0f}" if amount > 0 else "your payment"

        if reason_upper == "INSUFFICIENT_FUNDS":
            msg = f"Your payment of {amt_str} could not be completed due to insufficient balance. Please top up your account and authorize retry."
            delay = 30
        elif reason_upper in {"AUTHENTICATION_FAILED", "CUSTOMER_ABANDONMENT"}:
            msg = f"Your payment of {amt_str} timed out during verification. Click here to safely complete 3D Secure authorization."
            delay = 15
        elif reason_upper in {"NETWORK_ERROR", "TIMEOUT", "TEMPORARY_BANK_ERROR"}:
            msg = f"A temporary bank network glitch paused {amt_str}. We will automatically retry in a few moments."
            delay = 20
        else:
            msg = f"Your transaction of {amt_str} was declined by the bank. Please check your payment details or use an alternate method."
            delay = 60

        return {
            "message": msg,
            "delay_minutes": delay,
            "tone": "PROFESSIONAL",
            "source": "FALLBACK",
        }
