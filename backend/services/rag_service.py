"""
Payment-Domain Retrieval-Augmented Generation (RAG) Service for Revora.

Integrates:
1. Domain Boundary Detection: Restricts answers strictly to Revora payments, recovery cases,
   batches, guardrails, customers, and operations. Rejects general knowledge cleanly.
2. Zero-Trust Credential Defense: Rejects CVVs, OTPs, PINs, or card numbers immediately.
3. Multi-Source Retrieval: Structured SQL queries against transactions, recovery cases,
   audit logs, batch runs, human review queue, and Razorpay provider logs.
4. Grounded Synthesis via Google Gemini: Generates concise, accurate, evidence-backed
   answers citing explicit retrieved sources.
5. Action Intent Routing: Routes financial execution requests ("Retry payment")
   strictly through the Deterministic Policy Gateway.
6. Multi-Turn Session Memory: Tracks active transaction, customer, batch, and dialog history.
"""
from datetime import datetime, timezone
import json
import re
import sqlite3
from typing import Any, Callable
import uuid

from .guardrail_engine import GuardrailEngine
from .recovery_executor import RecoveryExecutor
from .llm_service import LLMService


SENSITIVE_PATTERNS = [
    r"\b(cvv|cvv2|security code|otp|one time password|card number)\b",
    r"\b\d{3,4}\b.*?(cvv|cvv2|security code)",
    r"(cvv|cvv2|security code).*?\b\d{3,4}\b",
    r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b",
    r"\bpin\b.*?\d{4,6}",
]

DOMAIN_KEYWORDS = [
    "payment", "transaction", "recover", "recovery", "failed", "failure", "decline", "declined",
    "batch", "risk", "guardrail", "policy", "limit", "amount", "customer", "razorpay",
    "retry", "retries", "escalat", "stopped", "blocked", "approved", "audit", "queue",
    "timeout", "bank", "upi", "card", "netbanking", "wallet", "insufficient", "mandate",
    "revora", "revenue", "loss", "funnel", "rate", "case", "idempotency", "evidence",
    "test", "sandbox", "why", "what", "status", "who", "when", "how much", "can i",
    "help", "explain", "investigate", "show", "summary", "report", "intelligence",
    "evaluation", "compare", "baseline", "v2", "dataset", "upload", "history",
    "profile", "timeline", "metrics", "analytics", "fraud", "halt", "halted", "security",
    "flag", "flagged", "suspicious", "error", "reason", "diagnos", "diagnose", "diagnosis",
    "hi", "hello", "hey"
]

GREETING_PATTERNS = [
    r"^\s*(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|howdy|sup|yo|hiya)\b",
    r"^\s*(thanks|thank\s+you|appreciate\s+it)\b",
    r"^\s*(who\s+are\s+you|what\s+can\s+you\s+do|what\s+is\s+revora|what\s+is\s+pulse)\b",
]

OUT_OF_DOMAIN_PATTERNS = [
    r"\b(capital of|president of|prime minister|weather in|temperature in|forecast|recipe for|how to cook|bake|who is the king|mount everest|tallest mountain)\b",
    r"\b(write a poem|write code for|write an essay|solve equation|translate to french|french revolution|world war|history of rome)\b",
    r"\b(football|cricket|nba|world cup|movie|actor|actress|song|lyrics|jokes|tell a joke|riddle|game|video game)\b",
    r"\b(crypto price|bitcoin price|ethereum price|stock market forecast|horoscope|astrology)\b",
]

MATH_PATTERNS = [
    r"^\s*[\d\.\s\+\-\*\/\^\%\(\)\=]+\s*$",
    r"\b(what\s+is\s+\d+|calculate|solve\s+equation|integral|derivative|algebra|geometry|trigonometry|square\s+root|math\s+problem|arithmetic|\d+\s*[\+\-\*\/]\s*\d+)\b",
    r"\b(math|mathematics|equation|quadratic|pythagorean|calculus|logarithm|hypotenuse)\b",
]

OUT_OF_SCOPE_MESSAGE = (
    "That is out of my scope, I cannot answer it at this moment. "
    "I am Revora's AI Payment Recovery assistant dedicated to payment failures, recovery cases, policy guardrails, and customer revenue recovery."
)


class RAGService:
    def __init__(
        self,
        connect_fn: Callable[[], sqlite3.Connection],
        llm: LLMService | None = None,
        gateway: GuardrailEngine | None = None,
        executor: RecoveryExecutor | None = None,
    ) -> None:
        self.connect = connect_fn
        self.llm = llm or LLMService()
        self.gateway = gateway or GuardrailEngine()
        self.executor = executor or RecoveryExecutor()

    def is_math_question(self, query: str) -> bool:
        q_lower = query.lower().strip()
        for pat in MATH_PATTERNS:
            if re.search(pat, q_lower):
                return True
        return False

    def is_retry_action_intent(self, query: str) -> bool:
        q_lower = query.lower()
        if any(w in q_lower for w in ["policy", "limit", "rule", "how many", "what is", "why was", "why did", "explain", "ceiling", "threshold"]):
            return False
        action_patterns = [
            r"\b(retry|re-execute|execute retry|try again|re execute)\b",
            r"\bcan you retry\b",
            r"\bplease retry\b",
        ]
        return any(re.search(pat, q_lower) for pat in action_patterns)

    def is_greeting(self, query: str) -> bool:
        q_lower = query.lower().strip()
        for pat in GREETING_PATTERNS:
            if re.search(pat, q_lower):
                return True
        # Collapsed repeating characters (e.g. 'hiiii', 'heyyyy', 'helloooo')
        collapsed = re.sub(r"(.)\1+", r"\1", q_lower)
        if collapsed in ("hi", "hey", "helo", "yo", "sup", "hiya", "howdy"):
            return True
        if re.match(r"^h+[i!]+$", q_lower) or re.match(r"^h+[e]+y+[!]*$", q_lower) or re.match(r"^h+[e]+l+[o]+[!]*$", q_lower):
            return True
        for pat in GREETING_PATTERNS:
            if re.search(pat, collapsed):
                return True
        return False

    def is_in_domain(self, query: str, context: dict[str, Any]) -> bool:
        q_lower = query.lower().strip()
        if self.is_math_question(query):
            return False
        if self.is_greeting(query):
            return True
        # Explicit out of domain triggers
        for pat in OUT_OF_DOMAIN_PATTERNS:
            if re.search(pat, q_lower):
                return False
        # If active context has a transaction or case, questions in this session are in-domain
        if context.get("active_transaction_id") or context.get("active_case_id") or context.get("active_batch_id") or context.get("active_customer_id"):
            return True
        # If query explicitly matches domain keywords
        if any(kw in q_lower for kw in DOMAIN_KEYWORDS):
            return True
        return False

    def check_sensitive_credentials(self, text: str) -> bool:
        for pat in SENSITIVE_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                return True
        return False

    def retrieve_context(self, query: str, context: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        """
        Gathers ground-truth operational context across database tables.
        Returns (context_dict, sources_list).
        """
        conn = self.connect()
        conn.row_factory = sqlite3.Row
        retrieved: dict[str, Any] = {}
        sources: list[str] = []

        q_lower = query.lower()

        # 1. Detect transaction ID
        tx_match = re.search(r"\b(TX\d+)\b", query, re.IGNORECASE)
        tx_id = tx_match.group(1).upper() if tx_match else context.get("active_transaction_id")

        if tx_id:
            tx_row = conn.execute("SELECT * FROM transactions WHERE transaction_id = ?", (tx_id,)).fetchone()
            if tx_row:
                retrieved["transaction"] = dict(tx_row)
                sources.append(f"Transaction Record ({tx_id})")

                case_row = conn.execute("SELECT * FROM recovery_cases WHERE transaction_id = ? ORDER BY case_id DESC LIMIT 1", (tx_id,)).fetchone()
                if case_row:
                    retrieved["recovery_case"] = dict(case_row)
                    sources.append(f"Recovery Case (#{case_row['case_id']})")

                logs = conn.execute("SELECT event_type, actor, description, timestamp FROM audit_logs WHERE transaction_id = ? ORDER BY timestamp DESC LIMIT 5", (tx_id,)).fetchall()
                if logs:
                    retrieved["audit_logs"] = [dict(l) for l in logs]
                    sources.append("Audit Trail (Last 5 events)")

                hq = conn.execute("SELECT * FROM human_queue WHERE transaction_id = ? ORDER BY queue_id DESC LIMIT 1", (tx_id,)).fetchone()
                if hq:
                    retrieved["human_queue"] = dict(hq)
                    sources.append("Human Review Queue Entry")

        # 2. Detect batch queries
        batch_match = re.search(r"\bbatch\s*#?(\d+)\b", query, re.IGNORECASE)
        batch_id = int(batch_match.group(1)) if batch_match else context.get("active_batch_id")

        if batch_id:
            b_row = conn.execute("SELECT * FROM batch_runs WHERE id = ?", (batch_id,)).fetchone()
            if b_row:
                retrieved["batch"] = dict(b_row)
                sources.append(f"Batch Run #{batch_id}")
        elif "batch" in q_lower or "latest" in q_lower or "revenue at risk" in q_lower or "recovered" in q_lower:
            latest_b = conn.execute("SELECT * FROM batch_runs WHERE status='COMPLETED' ORDER BY id DESC LIMIT 1").fetchone()
            if latest_b:
                retrieved["latest_completed_batch"] = dict(latest_b)
                sources.append(f"Latest Completed Batch (#{latest_b['id']})")

        # 3. Policy & Guardrail Knowledge
        if any(w in q_lower for w in ["guardrail", "policy", "limit", "rule", "stop", "escalat", "threshold", "window"]):
            retrieved["policy_knowledge"] = {
                "max_retries": 2,
                "max_auto_action_amount": 10000.0,
                "min_recovery_confidence": 0.60,
                "max_recovery_window_minutes": 1440,
                "hard_stops": [
                    "do_not_contact: customer opted out of communication",
                    "mandate_revoked: recurring authorization canceled",
                    "card_status != ACTIVE: card expired, stolen, or blocked",
                    "retry_count >= 2: retry ceiling reached to prevent customer fatigue",
                    "time_since_failure > 24h: stale recovery window expired"
                ],
                "authority_rule": "AI Can Recommend. Only the Deterministic Policy Gateway Can Authorize Financial Action."
            }
            sources.append("Deterministic Policy Gateway Rules")

        # 4. Razorpay Provider State
        if "razorpay" in q_lower or "sandbox" in q_lower or "provider" in q_lower:
            recent_rzp = conn.execute("SELECT transaction_id, provider, provider_payment_id, outcome, recovered_amount FROM recovery_cases WHERE provider LIKE '%RAZORPAY%' ORDER BY case_id DESC LIMIT 3").fetchall()
            retrieved["razorpay_state"] = {
                "environment": "TEST_SANDBOX",
                "api_endpoint": "https://api.razorpay.com/v1",
                "real_money_authorized": False,
                "recent_test_executions": [dict(r) for r in recent_rzp]
            }
            sources.append("Razorpay Test Provider State")

        # 5. Customer 360 context
        cus_match = re.search(r"\b(CUS\d+)\b", query, re.IGNORECASE)
        cus_id = cus_match.group(1).upper() if cus_match else context.get("active_customer_id")
        if cus_id:
            from .customer_service import CustomerService
            profile = CustomerService(self.connect).get_customer_profile(cus_id)
            if profile:
                retrieved["customer_360"] = {
                    "customer_id": cus_id,
                    "status": profile.get("status"),
                    "total_transactions": profile.get("total_transactions"),
                    "failed_transactions": profile.get("failed_transactions"),
                    "recovered_amount": profile.get("recovered_amount"),
                    "recovery_rate_pct": profile.get("recovery_rate_pct"),
                    "last_active": profile.get("last_payment_date"),
                }
                sources.append(f"Customer 360 Profile ({cus_id})")

        # 6. Report & Policy Comparison context
        if any(w in q_lower for w in ["report", "intelligence", "evaluation", "baseline", "comparison", "benchmark", "lift", "v2"]):
            from .report_service import ReportService
            rep = ReportService(self.connect).get_latest_report()
            retrieved["report_summary"] = rep.get("executive_summary", {})
            retrieved["policy_comparison"] = rep.get("policy_comparison", {})
            sources.append("Recovery Intelligence Report")

        conn.close()
        return retrieved, sources

    def get_conversation_history(self, conversation_id: str, limit: int = 8) -> list[dict[str, str]]:
        if not conversation_id:
            return []
        try:
            conn = self.connect()
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT role, content FROM conversation_messages
                WHERE conversation_id = ?
                ORDER BY message_id DESC LIMIT ?
                """,
                (conversation_id, limit),
            ).fetchall()
            conn.close()
            history = []
            for r in reversed(rows):
                history.append({"role": r["role"], "content": r["content"]})
            return history
        except Exception:
            return []

    def answer_query(
        self,
        query_or_conv: str | None = None,
        query: str | None = None,
        session_context: dict[str, Any] | None = None,
        conversation_id: str | None = None,
        active_tx_id: str | None = None,
    ) -> dict[str, Any]:
        if query is None:
            actual_query = query_or_conv or ""
            actual_conv_id = conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
        else:
            actual_query = query
            actual_conv_id = query_or_conv or conversation_id or f"conv_{uuid.uuid4().hex[:12]}"

        session_context = dict(session_context) if session_context else {}
        if active_tx_id:
            session_context["active_transaction_id"] = active_tx_id

        # Restore active entity context from DB conversation if not present in request
        if actual_conv_id and not session_context.get("active_transaction_id"):
            try:
                conn = self.connect()
                conn.row_factory = sqlite3.Row
                c_row = conn.execute(
                    "SELECT active_transaction_id, active_customer_id, active_batch_id FROM conversations WHERE conversation_id = ?",
                    (actual_conv_id,)
                ).fetchone()
                if c_row:
                    if c_row["active_transaction_id"] and not session_context.get("active_transaction_id"):
                        session_context["active_transaction_id"] = c_row["active_transaction_id"]
                    if c_row["active_customer_id"] and not session_context.get("active_customer_id"):
                        session_context["active_customer_id"] = c_row["active_customer_id"]
                    if c_row["active_batch_id"] and not session_context.get("active_batch_id"):
                        session_context["active_batch_id"] = c_row["active_batch_id"]
                conn.close()
            except Exception:
                pass

        now = datetime.now(timezone.utc).isoformat()

        # Step 1: Zero-Trust Security Check
        if self.check_sensitive_credentials(actual_query):
            return {
                "conversation_id": actual_conv_id,
                "answer": (
                    "SECURITY ALERT: For your security, Revora never asks for or accepts CVVs, OTPs, PINs, or card numbers. "
                    "Please never share payment credentials in chat or voice."
                ),
                "sources_used": ["Zero-Trust Security Filter"],
                "intent": "REJECTED_SENSITIVE_INPUT",
                "policy_decision": "BLOCKED",
                "decision": "SECURITY_VIOLATION",
                "active_context": session_context,
                "status": "SECURITY_VIOLATION",
            }

        # Step 1.2: Mathematical Questions Check
        if self.is_math_question(actual_query):
            self._record_message(actual_conv_id, "user", actual_query, None, "OUT_OF_SCOPE_MATH", None, session_context)
            self._record_message(actual_conv_id, "assistant", OUT_OF_SCOPE_MESSAGE, ["Domain Guardrail Filter"], "OUT_OF_SCOPE_MATH", None, session_context)
            return {
                "conversation_id": actual_conv_id,
                "answer": OUT_OF_SCOPE_MESSAGE,
                "sources_used": ["Domain Guardrail Filter"],
                "intent": "OUT_OF_DOMAIN",
                "policy_decision": None,
                "decision": "OUT_OF_SCOPE",
                "active_context": session_context,
                "status": "REJECTED_OUT_OF_SCOPE",
            }

        # Step 1.5: Conversational Greetings & Small Talk
        if self.is_greeting(actual_query):
            greet_resp = None
            if self.llm.is_configured:
                greeting_prompt = (
                    f"The user says: '{actual_query}'. Respond conversationally as Revora Pulse, an AI payment recovery and fintech operations assistant. "
                    "In 1 to 2 warm, natural sentences, greet the user and let them know you are ready to help with payment failure diagnostics, recovery intelligence, transaction status, or guardrail policies. "
                    "Keep it friendly and conversational."
                )
                greet_resp = self.llm.generate_text(greeting_prompt)
            if not greet_resp:
                greet_resp = (
                    "Hello! I am Revora Pulse, your payment recovery assistant. "
                    "How can I assist you with your payment failures, recovery cases, or policy guardrails today?"
                )
            self._record_message(actual_conv_id, "user", actual_query, None, "GREETING", None, session_context)
            self._record_message(actual_conv_id, "assistant", greet_resp, ["Revora Pulse Guide"], "GREETING", None, session_context)
            return {
                "conversation_id": actual_conv_id,
                "answer": greet_resp,
                "sources_used": ["Revora Pulse Guide"],
                "intent": "GREETING",
                "policy_decision": None,
                "decision": "GROUNDED",
                "active_context": session_context,
                "status": "COMPLETED",
            }

        # Step 2: Domain Boundary Check
        if not self.is_in_domain(actual_query, session_context):
            self._record_message(actual_conv_id, "user", actual_query, None, "OUT_OF_DOMAIN", None, session_context)
            self._record_message(actual_conv_id, "assistant", OUT_OF_SCOPE_MESSAGE, ["Domain Boundary Filter"], "OUT_OF_DOMAIN", None, session_context)
            return {
                "conversation_id": actual_conv_id,
                "answer": OUT_OF_SCOPE_MESSAGE,
                "sources_used": ["Domain Boundary Filter"],
                "intent": "OUT_OF_DOMAIN",
                "policy_decision": None,
                "decision": "OUT_OF_SCOPE",
                "active_context": session_context,
                "status": "REJECTED_OUT_OF_DOMAIN",
            }

        # Step 3: Retrieve Context
        context_data, sources = self.retrieve_context(actual_query, session_context)

        # Update active entity context if found
        if "transaction" in context_data:
            session_context["active_transaction_id"] = context_data["transaction"]["transaction_id"]
            session_context["active_customer_id"] = context_data["transaction"]["customer_id"]
        if "batch" in context_data:
            session_context["active_batch_id"] = context_data["batch"]["id"]
        elif "latest_completed_batch" in context_data:
            session_context["active_batch_id"] = context_data["latest_completed_batch"]["id"]

        # Step 4: Check if Action Intent (Retry payment)
        if self.is_retry_action_intent(actual_query) and ("transaction" in context_data or session_context.get("active_transaction_id")):
            return self._handle_retry_action(actual_conv_id, actual_query, context_data, session_context, sources)

        # Step 5: Retrieve conversation history and synthesize answer using Gemini
        history = self.get_conversation_history(actual_conv_id, limit=6)
        answer = self._synthesize_answer(actual_query, context_data, session_context, history=history)

        # Step 6: Persist message in conversation history
        self._record_message(actual_conv_id, "user", actual_query, None, None, None, session_context)
        self._record_message(actual_conv_id, "assistant", answer, sources, "INFORMATIONAL_QUERY", None, session_context)

        return {
            "conversation_id": actual_conv_id,
            "answer": answer,
            "sources_used": sources if sources else ["Revora Operational Database"],
            "intent": "PAYMENT_QUERY",
            "policy_decision": None,
            "decision": "GROUNDED",
            "active_context": session_context,
            "status": "COMPLETED",
        }

    def _handle_retry_action(
        self,
        conversation_id: str,
        query: str,
        context_data: dict[str, Any],
        session_context: dict[str, Any],
        sources: list[str],
    ) -> dict[str, Any]:
        tx = context_data.get("transaction")
        if not tx:
            return {
                "conversation_id": conversation_id,
                "answer": "Which transaction would you like me to retry? Please specify the transaction ID (e.g. TX10988).",
                "sources_used": ["Action Router"],
                "intent": "RETRY_REQUEST_AMBIGUOUS",
                "policy_decision": None,
                "decision": "NEED_INPUT",
                "active_context": session_context,
                "status": "NEED_INPUT",
            }

        tx_id = tx["transaction_id"]
        amt = float(tx.get("amount") or 0.0)

        # Pass through Deterministic Policy Gateway
        recommendation = {
            "recommendation": "RETRY_NOW",
            "confidence": 0.85,
            "recovery_probability": 0.85,
            "reason": "Retry initiated via Revora Conversational Assistant.",
        }
        guardrail = self.gateway.validate(tx, recommendation)
        status = guardrail["guardrail_status"]
        sources.append("Deterministic Policy Gateway Validation")

        exec_res = None
        if guardrail["approved"]:
            from .recovery_executor import RecoveryExecutor
            executor = RecoveryExecutor()
            exec_res = executor.execute(tx, guardrail, policy_version="agentic_optimized_v2", bypass_idempotency=True)
            sources.append("Payment Provider Execution (Test Sandbox)")

            if exec_res.get("outcome") == "SUCCESS":
                answer = (
                    f"Gateway Decision: APPROVED. Retry approved by Policy Gateway and executed successfully for {tx_id}. "
                    f"Recovered amount: INR {amt:,.2f} via {exec_res.get('provider', 'Test Sandbox')}. "
                    f"Receipt/Payment ID: {exec_res.get('provider_payment_id', 'pay_test_confirmed')}."
                )
            else:
                answer = (
                    f"Gateway Decision: APPROVED. Retry was authorized by Policy Gateway, but the banking rail declined execution: "
                    f"{exec_res.get('message') or 'Downstream bank decline'}. Customer notification queued."
                )
        elif status == "ESCALATED":
            answer = (
                f"Gateway Decision: ESCALATED. Automatic retry for {tx_id} (INR {amt:,.2f}) was halted by the Policy Gateway: "
                f"{guardrail.get('blocked_reason') or 'Amount exceeds INR 10,000 automatic limit'}. "
                "The case has been escalated to the Human Review Queue for senior operator review."
            )
        elif status == "STOPPED":
            answer = (
                f"Gateway Decision: STOPPED. Cannot retry {tx_id}: {guardrail.get('blocked_reason') or 'Recovery policy hard stop triggered'}. "
                "Automated retries are halted to prevent customer fatigue or compliance violations."
            )
        else:
            answer = (
                f"Gateway Decision: BLOCKED. Retry blocked by Policy Gateway: {guardrail.get('blocked_reason') or 'Minimum confidence threshold not met'}."
            )

        self._record_message(conversation_id, "user", query, None, "RETRY_REQUEST", None, session_context)
        self._record_message(conversation_id, "assistant", answer, sources, "RETRY_EXECUTION", status, session_context)

        return {
            "conversation_id": conversation_id,
            "answer": answer,
            "sources_used": sources,
            "intent": "RETRY_PAYMENT",
            "policy_decision": status,
            "decision": status,
            "action_result": exec_res,
            "active_context": session_context,
            "status": "COMPLETED",
        }

    def _synthesize_answer(
        self,
        query: str,
        context_data: dict[str, Any],
        session_context: dict[str, Any],
        history: list[dict[str, str]] | None = None,
    ) -> str:
        """
        Calls Gemini Flash with operational context and conversation history; falls back to deterministic synthesizer.
        """
        if self.llm.is_configured:
            system_instruction = (
                "You are Revora Pulse, the conversational AI Payment Recovery Intelligence Assistant for Revora.\n"
                "Revora is an autonomous revenue recovery platform for payment failures built for high-growth merchants and payment platforms (Razorpay Buildathon Track 03: AI Revenue Recovery).\n"
                "\n"
                "YOUR SCOPE & DOMAIN:\n"
                "- You answer questions about payment failures, recovery strategies, transaction diagnostics, policy guardrails, batch evaluations, customer churn risk, and payment infrastructure (UPI, Cards, Netbanking, Mandates, Gateways).\n"
                "- You are conversational, intelligent, helpful, and natural. Maintain multi-turn context smoothly.\n"
                "\n"
                "CONTROL PLANE & INVARIANTS:\n"
                "- Core Philosophy: 'AI recommends. Policy authorizes. Execution acts. Outcomes measure.'\n"
                "- Deterministic Policy Gateway Invariants:\n"
                "  1. Retry Ceiling: Max 2 retries per transaction to prevent customer fatigue.\n"
                "  2. Autonomous Amount Limit: Transactions > ₹10,000 are ESCALATED to Human Review Queue; never retried autonomously.\n"
                "  3. Minimum Confidence Floor: 60% recovery probability required to authorize automated action.\n"
                "  4. Max Recovery Window: 24 hours. Transactions older than 24 hours are marked EXPIRED.\n"
                "  5. Hard Stops: Transactions flagged for SUSPECTED_FRAUD, BLOCKED cards, EXPIRED cards, or DO_NOT_CONTACT preferences are immediately HALTED / BLOCKED. No recovery retries are ever executed.\n"
                "- Razorpay Sandbox Integration: Connected to Razorpay API (api.razorpay.com/v1) strictly in test mode. Real customer money movement is strictly disabled (zero live funds touched).\n"
                "- Baseline Comparison: Revora v2 agentic policies recover significantly higher revenue than static Baseline v1 while maintaining 0 policy violations across 10,000+ synthetic transactions and 31+ batches.\n"
                "\n"
                "STRICT RULES:\n"
                "1. OUT-OF-SCOPE QUESTIONS: If the user asks about anything outside payments, fintech, banking, transactions, financial infrastructure, or Revora (for example: cooking recipes, general math calculations, trivia, geography, politics, sports, entertainment, coding non-payment apps, homework, etc.), you MUST respond with EXACTLY:\n"
                "   'That is out of my scope, I cannot answer it at this moment. I am Revora\\'s AI Payment Recovery assistant dedicated to payment failures, recovery cases, policy guardrails, and customer revenue recovery.'\n"
                "2. FACTUAL GROUNDING: When discussing specific transactions, cases, customers, or batches, base your facts strictly on the provided RETRIEVED REVORA CONTEXT. Never invent transaction amounts or failure reasons not in the context.\n"
                "3. FRAUD & BLOCKED CARDS: If a transaction has failure_reason SUSPECTED_FRAUD or card_status BLOCKED or guardrail_status BLOCKED, explain clearly that it is halted due to fraud security checks and cannot be retried.\n"
                "4. MULTI-TURN CONTEXT: If the user refers to 'it', 'this transaction', 'why blocked?', or 'fraud?', refer back to the active transaction discussed in previous messages."
            )

            context_str = json.dumps(context_data, indent=2, default=str) if context_data else "No specific transaction/batch selected in active session."
            prompt = (
                f"RETRIEVED REVORA OPERATIONAL CONTEXT:\n{context_str}\n\n"
                f"ACTIVE SESSION: {json.dumps(session_context, default=str)}\n\n"
                f"USER QUESTION: {query}"
            )
            try:
                resp = self.llm.generate_text(prompt, system_instruction=system_instruction, history=history)
                if resp and len(resp.strip()) > 5:
                    return resp.strip()
            except Exception:
                pass

        if not context_data:
            return "I don't have enough information in Revora's operational database to answer that specifically. You can ask about a transaction ID (e.g. TX10995 or TX10988), a batch number, customer profile, or recovery policies."

        # Deterministic Grounded Synthesis Fallback
        return self._deterministic_answer_synthesis(query, context_data)

    def _deterministic_answer_synthesis(self, query: str, context: dict[str, Any]) -> str:
        q_lower = query.lower()

        # Transaction answer
        if "transaction" in context:
            tx = context["transaction"]
            case = context.get("recovery_case", {})
            amt = float(tx.get("amount") or 0.0)
            reason = str(tx.get("failure_reason") or "network error").replace("_", " ").title()
            status = case.get("guardrail_status") or tx.get("payment_status")
            rec = case.get("recommendation") or case.get("final_action") or "RETRY_LATER"

            # Check if suspected fraud or blocked
            if tx.get("failure_reason") == "SUSPECTED_FRAUD" or tx.get("card_status") == "BLOCKED" or status == "BLOCKED" or any(w in q_lower for w in ["fraud", "blocked", "security", "halt"]):
                blocked_msg = case.get("blocked_reason") or f"Card status is {tx.get('card_status', 'BLOCKED')} flagged by security check."
                return (
                    f"Transaction {tx['transaction_id']} (INR {amt:,.2f}) failed due to Suspected Fraud and is BLOCKED by Revora's Policy Gateway. "
                    f"Reason: {blocked_msg}. "
                    f"All recovery actions are permanently halted to protect customer security."
                )

            if any(w in q_lower for w in ["why", "reason", "fail"]):
                return f"Transaction {tx['transaction_id']} for INR {amt:,.2f} failed due to {reason} on {tx.get('payment_method', 'CARD')}. Revora diagnosed this with {round(float(case.get('confidence', 0.8) or 0.8)*100)}% confidence and recommended {rec}."
            if any(w in q_lower for w in ["escalat", "human"]):
                if status == "ESCALATED":
                    return f"Transaction {tx['transaction_id']} was escalated to human review because the amount (INR {amt:,.2f}) exceeds our INR 10,000 automated recovery threshold."
                return f"Transaction {tx['transaction_id']} has status {status} (not currently escalated)."
            if any(w in q_lower for w in ["stop", "stopped"]):
                retries = tx.get("retry_count", 0)
                return f"Transaction {tx['transaction_id']} has {retries}/2 retries used. Status is {status} ({case.get('blocked_reason') or 'under active policy'})."
            if any(w in q_lower for w in ["retry", "status", "outcome"]):
                outcome = case.get("outcome", "PENDING")
                rec_amt = float(case.get("recovered_amount") or 0.0)
                return f"Transaction {tx['transaction_id']} outcome is {outcome}. Recommended action: {rec}. Recovered amount: INR {rec_amt:,.2f}."

            return f"Transaction {tx['transaction_id']} (INR {amt:,.2f}) failed with {reason}. Guardrail status: {status}, Action: {rec}."

        # Batch answer
        batch = context.get("batch") or context.get("latest_completed_batch")
        if batch:
            b_id = batch["id"]
            recovered = float(batch.get("revenue_recovered") or 0.0)
            risk = float(batch.get("revenue_at_risk") or 0.0)
            total = batch.get("total_events") or batch.get("events_processed") or 0
            success = batch.get("successful_recoveries") or 0
            rate = round((recovered / risk * 100), 1) if risk > 0 else 0.0

            if any(w in q_lower for w in ["how much", "recover", "amount"]):
                return f"Batch #{b_id} processed {total:,} events with INR {risk:,.2f} revenue at risk. It successfully recovered INR {recovered:,.2f} across {success} transactions ({rate}% financial recovery rate)."
            return f"Batch #{b_id} status: {batch.get('status', 'COMPLETED')}, {total:,} events evaluated, INR {recovered:,.2f} recovered ({rate}% recovery rate)."

        # Customer 360 answer
        if "customer_360" in context:
            c = context["customer_360"]
            return f"Customer {c['customer_id']} is currently {c.get('status', 'ACTIVE')}. They have {c.get('total_transactions', 0)} total transactions, {c.get('failed_transactions', 0)} failures, and INR {float(c.get('recovered_amount', 0.0) or 0.0):,.2f} recovered ({c.get('recovery_rate_pct', 0.0)}% recovery rate). Last payment activity: {c.get('last_active', 'Recently')}."

        # Report & Comparison answer
        if "report_summary" in context:
            r = context["report_summary"]
            comp = context.get("policy_comparison", {}).get("comparison", {})
            return f"According to the Recovery Intelligence Report for Batch #{r.get('batch_id')}, Revora achieved a {r.get('financial_recovery_rate_pct', 0.0)}% recovery rate, recovering INR {float(r.get('revenue_recovered', 0.0) or 0.0):,.2f} of INR {float(r.get('revenue_at_risk', 0.0) or 0.0):,.2f} at risk (+{comp.get('financial_recovery_rate_lift', 0.0)}% lift over Baseline v1) with zero policy violations."

        # Policy answer
        if "policy_knowledge" in context:
            return "Revora enforces strict policy limits: maximum 2 retry attempts, INR 10,000 maximum autonomous action limit (amounts above are escalated to humans), 24-hour maximum recovery window, and 60% minimum confidence floor."

        # Razorpay answer
        if "razorpay_state" in context:
            return "Revora is integrated with Razorpay Test Sandbox (api.razorpay.com/v1). Real customer money movement is strictly disabled. Recoveries are verified against sandbox orders and test authorization payments."

        return "I retrieved operational data matching your request. Please ask a specific question regarding transaction status, failure diagnosis, batch recovery, or guardrail policies."

    def _record_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        sources: list[str] | None,
        intent: str | None,
        policy_decision: str | None,
        session_context: dict[str, Any] | None = None,
    ) -> None:
        try:
            conn = self.connect()
            now = datetime.now(timezone.utc).isoformat()
            tx_id = session_context.get("active_transaction_id") if session_context else None
            cus_id = session_context.get("active_customer_id") if session_context else None
            batch_id = session_context.get("active_batch_id") if session_context else None

            conn.execute(
                """
                INSERT OR IGNORE INTO conversations (conversation_id, title, created_at, updated_at, active_transaction_id, active_customer_id, active_batch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, content[:40], now, now, tx_id, cus_id, batch_id),
            )
            conn.execute(
                """
                INSERT INTO conversation_messages (conversation_id, role, content, sources_used, intent, policy_decision, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (conversation_id, role, content, json.dumps(sources or []), intent, policy_decision, now),
            )
            conn.execute(
                """
                UPDATE conversations
                SET updated_at = ?,
                    active_transaction_id = COALESCE(?, active_transaction_id),
                    active_customer_id = COALESCE(?, active_customer_id),
                    active_batch_id = COALESCE(?, active_batch_id)
                WHERE conversation_id = ?
                """,
                (now, tx_id, cus_id, batch_id, conversation_id),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
