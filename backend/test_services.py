import json
import sqlite3
import unittest
from services.audit_service import AuditService
from services.batch_service import BatchService
from services.guardrail_engine import GuardrailEngine
from services.recovery_agent import RecoveryAgent
from services.recovery_executor import RecoveryExecutor
from services.risk_detector import RiskDetector
from main import explain_decision, guardrail_rules


def transaction(**overrides):
    value = {
        "transaction_id": "TEST_TX101",
        "customer_id": "CUST_999",
        "merchant_id": "MER_001",
        "payment_status": "FAILED",
        "failure_reason": "NETWORK_ERROR",
        "retry_count": 0,
        "customer_success_rate": 0.94,
        "customer_previous_transactions": 18,
        "time_since_failure_minutes": 5,
        "amount": 4999.0,
        "currency": "INR",
        "payment_method": "CARD",
        "ground_truth_recoverable": 1,
        "risk_score": 0.82,
    }
    value.update(overrides)
    return value


SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY, customer_id TEXT, merchant_id TEXT,
        amount REAL, currency TEXT, timestamp TEXT, payment_method TEXT,
        payment_status TEXT, failure_reason TEXT, retry_count INTEGER,
        customer_success_rate REAL, customer_previous_transactions INTEGER,
        time_since_failure_minutes INTEGER, customer_segment TEXT,
        risk_score REAL, ground_truth_recoverable INTEGER,
        gateway_error_code TEXT, do_not_contact INTEGER DEFAULT 0,
        mandate_revoked INTEGER DEFAULT 0, card_status TEXT DEFAULT 'ACTIVE'
    );
    CREATE TABLE IF NOT EXISTS recovery_cases (
        case_id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT,
        diagnosis TEXT, recovery_probability REAL, confidence REAL,
        recommendation TEXT, reason TEXT, guardrail_status TEXT,
        blocked_reason TEXT, guardrail_name TEXT, final_action TEXT,
        outcome TEXT, recovered_amount REAL DEFAULT 0,
        analyzed_at TEXT, executed_at TEXT, batch_id INTEGER DEFAULT NULL,
        risk_score REAL DEFAULT 0, risk_tier TEXT DEFAULT 'LOW',
        root_cause TEXT DEFAULT NULL, root_cause_source TEXT DEFAULT 'RULE',
        llm_message TEXT DEFAULT NULL, llm_validation_status TEXT DEFAULT NULL,
        provider TEXT DEFAULT 'SIMULATION', provider_payment_id TEXT DEFAULT NULL,
        execution_mode TEXT DEFAULT 'SIMULATION', idempotency_key TEXT DEFAULT NULL,
        policy_version TEXT DEFAULT 'agentic_optimized_v2',
        intervention_step TEXT DEFAULT NULL,
        historical_success_rate REAL DEFAULT NULL,
        evidence_context TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT,
        transaction_id TEXT, event_type TEXT, actor TEXT,
        description TEXT, metadata TEXT, batch_id INTEGER DEFAULT NULL,
        case_id INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS batch_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT,
        completed_at TEXT, status TEXT, events_processed INTEGER DEFAULT 0,
        actions_executed INTEGER DEFAULT 0, successful_recoveries INTEGER DEFAULT 0,
        revenue_recovered REAL DEFAULT 0, report TEXT, total_events INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0, current_activity TEXT, failed INTEGER DEFAULT 0,
        escalated INTEGER DEFAULT 0, blocked INTEGER DEFAULT 0, stopped INTEGER DEFAULT 0,
        revenue_at_risk REAL DEFAULT 0, policy_version TEXT DEFAULT 'baseline_v1',
        current_stage TEXT DEFAULT 'QUEUED', progress_percent INTEGER DEFAULT 0,
        approved_action_value REAL DEFAULT 0.0, escalated_count INTEGER DEFAULT 0,
        blocked_count INTEGER DEFAULT 0, stopped_count INTEGER DEFAULT 0,
        created_at TEXT, execution_mode TEXT DEFAULT 'TEST_SANDBOX'
    );
    CREATE TABLE IF NOT EXISTS batch_transactions (
        batch_id INTEGER,
        transaction_id TEXT,
        PRIMARY KEY (batch_id, transaction_id)
    );
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        role TEXT,
        content TEXT,
        created_at TEXT,
        sources TEXT,
        decision TEXT,
        intent TEXT
    );
    CREATE TABLE IF NOT EXISTS raw_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT, customer_id TEXT,
        amount REAL, currency TEXT, payment_method TEXT, failure_reason TEXT, gateway_error_code TEXT,
        retry_count INTEGER, created_at TEXT, customer_success_rate REAL, customer_history TEXT,
        do_not_contact INTEGER DEFAULT 0, mandate_revoked INTEGER DEFAULT 0, card_status TEXT DEFAULT 'ACTIVE',
        ingestion_status TEXT, validation_errors TEXT, ingested_at TEXT
    );
    CREATE TABLE IF NOT EXISTS human_queue (
        queue_id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, transaction_id TEXT,
        customer_id TEXT, amount REAL, risk_score REAL, root_cause TEXT,
        agent_recommendation TEXT, confidence REAL, guardrail_trigger TEXT,
        reason TEXT, created_at TEXT, status TEXT DEFAULT 'OPEN',
        reviewed_by TEXT DEFAULT NULL, review_notes TEXT DEFAULT NULL, resolved_at TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_sessions (
        session_id TEXT PRIMARY KEY, transaction_id TEXT, customer_id TEXT,
        status TEXT, conversation_transcript TEXT, detected_intent TEXT,
        policy_decision TEXT, execution_result TEXT, started_at TEXT, ended_at TEXT
    );
"""


def create_in_memory_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    return conn


def get_test_db():
    import tempfile
    tf = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tf.close()
    db_path = tf.name
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    conn.close()

    def connect_temp():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    return connect_temp, db_path



class RecoveryServiceTests(unittest.TestCase):
    def setUp(self):
        self.agent = RecoveryAgent()
        self.guardrails = GuardrailEngine()
        self.executor = RecoveryExecutor()
        self.risk = RiskDetector()
        self.audit = AuditService()

    # 1. Contextual agent decisions
    def test_contextual_agent_decisions(self):
        self.assertEqual(self.agent.analyze(transaction())["recommendation"], "RETRY_NOW")
        self.assertEqual(self.agent.analyze(transaction(failure_reason="INSUFFICIENT_FUNDS"))["recommendation"], "CONTACT_CUSTOMER")
        self.assertEqual(self.agent.analyze(transaction(failure_reason="AUTHENTICATION_FAILED"))["recommendation"], "CONTACT_CUSTOMER")
        self.assertEqual(self.agent.analyze(transaction(failure_reason="BANK_DECLINED"))["recommendation"], "ESCALATE_TO_HUMAN")
        # Probability changes with customer success rate
        high_prob = self.agent.analyze(transaction(customer_success_rate=0.95))["recovery_probability"]
        low_prob = self.agent.analyze(transaction(customer_success_rate=0.45))["recovery_probability"]
        self.assertGreater(high_prob, low_prob)

    # 2. High-value guardrail escalation (> 10,000 INR)
    def test_high_value_guardrail_escalation(self):
        txn = transaction(amount=14999.0)
        rec = self.agent.analyze(txn)
        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "ESCALATED")
        self.assertEqual(guardrail["final_action"], "ESCALATE_TO_HUMAN")
        self.assertFalse(guardrail["approved"])
        self.assertEqual(guardrail["guardrail_name"], "MAX_AUTO_ACTION_AMOUNT")
        # High value case must not execute
        exec_result = self.executor.execute(txn, guardrail)
        self.assertEqual(exec_result["status"], "ESCALATED")
        self.assertEqual(exec_result["recovered_amount"], 0.0)

    # 3. Maximum retry stop (retry_count >= 2)
    def test_maximum_retry_stop(self):
        txn = transaction(retry_count=2)
        rec = self.agent.analyze(txn)
        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "STOPPED")
        self.assertEqual(guardrail["final_action"], "STOP_RECOVERY")
        self.assertFalse(guardrail["approved"])
        self.assertEqual(guardrail["guardrail_name"], "MAX_RETRIES")
        exec_result = self.executor.execute(txn, guardrail)
        self.assertEqual(exec_result["status"], "STOPPED")
        self.assertEqual(exec_result["recovered_amount"], 0.0)

    # 4. Low-confidence block (< 60%)
    def test_low_confidence_block(self):
        txn = transaction()
        rec = {"recommendation": "RETRY_NOW", "recovery_probability": 0.45, "confidence": 0.50}
        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "BLOCKED")
        self.assertEqual(guardrail["final_action"], "STOP_RECOVERY")
        self.assertFalse(guardrail["approved"])
        self.assertEqual(guardrail["guardrail_name"], "MIN_RECOVERY_CONFIDENCE")
        exec_result = self.executor.execute(txn, guardrail)
        self.assertEqual(exec_result["status"], "BLOCKED")
        self.assertEqual(exec_result["recovered_amount"], 0.0)

    # 5. Recovery window expired (> 1440 minutes / 24 hours)
    def test_recovery_window_expired(self):
        txn = transaction(time_since_failure_minutes=1500)
        rec = self.agent.analyze(txn)
        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "STOPPED")
        self.assertEqual(guardrail["guardrail_name"], "MAX_RECOVERY_WINDOW")

    # 6. Executor strictly rejects unapproved actions
    def test_executor_rejects_unapproved_actions(self):
        txn = transaction(amount=4999.0)
        for status in ("BLOCKED", "ESCALATED", "STOPPED", "PENDING", "UNKNOWN"):
            res = self.executor.execute(txn, {"guardrail_status": status, "final_action": "STOP_RECOVERY"})
            self.assertEqual(res["recovered_amount"], 0.0)
            self.assertIn("Execution skipped", res["message"])

    # 7. Approved execution is deterministic and recovers revenue
    def test_approved_execution_success(self):
        txn = transaction(amount=4999.0, customer_success_rate=0.95, retry_count=0)
        rec = self.agent.analyze(txn)
        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "APPROVED")
        res = self.executor.execute(txn, guardrail)
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["recovered_amount"], 4999.0)

    # 8. Rules checked list is always populated
    def test_rules_checked_populated(self):
        rec = self.agent.analyze(transaction())
        guardrail = self.guardrails.validate(transaction(), rec)
        self.assertIn("PAYMENT_STATUS_CHECK", guardrail["rules_checked"])
        self.assertIn("MAX_RETRIES_CHECK", guardrail["rules_checked"])
        self.assertIn("MAX_AUTO_ACTION_AMOUNT_CHECK", guardrail["rules_checked"])
        self.assertIn("MAX_RECOVERY_WINDOW_CHECK", guardrail["rules_checked"])
        self.assertIn("MIN_RECOVERY_CONFIDENCE_CHECK", guardrail["rules_checked"])

    # 9. Audit event creation
    def test_audit_event_creation(self):
        conn = create_in_memory_db()
        self.audit.record(
            conn,
            "TX_AUDIT_1",
            "TEST_EVENT",
            "TEST_ACTOR",
            "Test description",
            {"key": "value"},
            batch_id=42,
        )
        conn.commit()
        row = conn.execute("SELECT * FROM audit_logs WHERE transaction_id='TX_AUDIT_1'").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["event_type"], "TEST_EVENT")
        self.assertEqual(row["actor"], "TEST_ACTOR")
        self.assertEqual(row["batch_id"], 42)
        meta = json.loads(row["metadata"])
        self.assertEqual(meta["key"], "value")
        conn.close()

    # 10. Ground-truth isolation: Production decision-making never uses ground_truth_recoverable
    def test_ground_truth_isolation(self):
        txn_positive = transaction(ground_truth_recoverable=1)
        txn_negative = transaction(ground_truth_recoverable=0)
        txn_missing = {k: v for k, v in transaction().items() if k != "ground_truth_recoverable"}

        # Agent output must be identical regardless of ground_truth
        rec_pos = self.agent.analyze(txn_positive)
        rec_neg = self.agent.analyze(txn_negative)
        rec_mis = self.agent.analyze(txn_missing)
        self.assertEqual(rec_pos, rec_neg)
        self.assertEqual(rec_pos, rec_mis)

        # Guardrails output must be identical
        self.assertEqual(self.guardrails.validate(txn_positive, rec_pos), self.guardrails.validate(txn_negative, rec_neg))
        self.assertEqual(self.guardrails.validate(txn_positive, rec_pos), self.guardrails.validate(txn_missing, rec_mis))

        # Executor output must be identical
        exec_pos = self.executor.execute(txn_positive, {"guardrail_status": "APPROVED", "final_action": "RETRY_NOW"}, bypass_idempotency=True)
        exec_neg = self.executor.execute(txn_negative, {"guardrail_status": "APPROVED", "final_action": "RETRY_NOW"}, bypass_idempotency=True)
        exec_mis = self.executor.execute(txn_missing, {"guardrail_status": "APPROVED", "final_action": "RETRY_NOW"}, bypass_idempotency=True)
        self.assertEqual(exec_pos, exec_neg)
        self.assertEqual(exec_pos, exec_mis)

    # 11. Structured WHY REVORA explanations
    def test_why_revora_explanations(self):
        # Case A: Approved Retry
        exp_approved = explain_decision({
            "guardrail_status": "APPROVED",
            "amount": 4999.0,
            "retry_count": 0,
            "failure_reason": "NETWORK_ERROR",
            "final_action": "RETRY_NOW",
            "customer_success_rate": 0.94,
            "confidence": 0.85,
            "time_since_failure_minutes": 10,
            "payment_method": "UPI",
        })
        self.assertIn("Temporary payment failure", exp_approved["reason"])
        self.assertEqual(exp_approved["next_step"], "Retry payment")

        # Case B: High value escalation
        exp_escalated = explain_decision({
            "guardrail_status": "ESCALATED",
            "amount": 14999.0,
            "retry_count": 0,
            "failure_reason": "NETWORK_ERROR",
            "final_action": "ESCALATE_TO_HUMAN",
            "customer_success_rate": 0.94,
            "confidence": 0.85,
        })
        self.assertIn("exceeds the autonomous action amount threshold", exp_escalated["reason"])
        self.assertEqual(exp_escalated["next_step"], "Human review required")

        # Case C: Max retries stopped
        exp_stopped = explain_decision({
            "guardrail_status": "STOPPED",
            "amount": 4999.0,
            "retry_count": 2,
            "failure_reason": "NETWORK_ERROR",
            "final_action": "STOP_RECOVERY",
            "confidence": 0.70,
        })
        self.assertIn("Maximum retry attempts have been reached", exp_stopped["reason"])
        self.assertEqual(exp_stopped["next_step"], "No further automated recovery")

        # Case D: Blocked low confidence
        exp_blocked = explain_decision({
            "guardrail_status": "BLOCKED",
            "amount": 4999.0,
            "retry_count": 0,
            "failure_reason": "UNKNOWN_ERROR",
            "final_action": "STOP_RECOVERY",
            "confidence": 0.45,
        })
        self.assertIn("minimum confidence", exp_blocked["reason"])
        self.assertEqual(exp_blocked["next_step"], "Autonomous execution blocked")

    # 12. Guardrail rules evaluation
    def test_guardrail_rules_evaluation(self):
        rules = guardrail_rules({
            "retry_count": 0,
            "amount": 4999.0,
            "recovery_probability": 0.85,
            "confidence": 0.85,
            "time_since_failure_minutes": 20,
        })
        self.assertEqual(len(rules), 4)
        for rule in rules:
            self.assertEqual(rule["status"], "PASSED")

        # Test failure conditions
        failing_rules = guardrail_rules({
            "retry_count": 3,
            "amount": 25000.0,
            "recovery_probability": 0.35,
            "confidence": 0.30,
            "time_since_failure_minutes": 2000,
        })
        for rule in failing_rules:
            self.assertEqual(rule["status"], "FAILED")

    # 13. Batch persistence and append-only retention
    def test_batch_service_persistence(self):
        import os
        connect_temp, db_path = get_test_db()
        try:
            conn = connect_temp()
            txn1 = transaction(transaction_id="TXN_PERSIST_1", payment_status="FAILED")
            txn2 = transaction(transaction_id="TXN_PERSIST_2", payment_status="FAILED")
            conn.execute(
                "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    txn1["transaction_id"], txn1["customer_id"], txn1["merchant_id"],
                    txn1["amount"], txn1["currency"], "2026-09-02T12:00:00Z", txn1["payment_method"],
                    txn1["payment_status"], txn1["failure_reason"], txn1["retry_count"],
                    txn1["customer_success_rate"], txn1["customer_previous_transactions"],
                    txn1["time_since_failure_minutes"], "GROWTH", txn1["risk_score"], txn1["ground_truth_recoverable"],
                ),
            )
            conn.execute(
                "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    txn2["transaction_id"], txn2["customer_id"], txn2["merchant_id"],
                    txn2["amount"], txn2["currency"], "2026-09-02T12:05:00Z", txn2["payment_method"],
                    txn2["payment_status"], txn2["failure_reason"], txn2["retry_count"],
                    txn2["customer_success_rate"], txn2["customer_previous_transactions"],
                    txn2["time_since_failure_minutes"], "SCALE", txn2["risk_score"], txn2["ground_truth_recoverable"],
                ),
            )
            conn.commit()
            conn.close()

            batch_service = BatchService(connect_temp, lambda bid: {})
            res1 = batch_service.process_transaction("TXN_PERSIST_1", execute=True, batch_id=1)
            self.assertIsNotNone(res1)

            res2 = batch_service.process_transaction("TXN_PERSIST_2", execute=True, batch_id=2)
            self.assertIsNotNone(res2)

            check_conn = connect_temp()
            cases = check_conn.execute("SELECT * FROM recovery_cases ORDER BY case_id").fetchall()
            self.assertEqual(len(cases), 2)
            self.assertEqual(cases[0]["batch_id"], 1)
            self.assertEqual(cases[1]["batch_id"], 2)

            logs = check_conn.execute("SELECT * FROM audit_logs ORDER BY id").fetchall()
            self.assertGreater(len(logs), 6)
            check_conn.close()
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 14. Historical evidence incorporation in Agentic decision-making
    def test_agentic_evidence_incorporation(self):
        txn = transaction(failure_reason="NETWORK_ERROR")
        evidence_high = {"NETWORK_ERROR|RETRY_NOW": 0.85}
        evidence_low = {"NETWORK_ERROR|RETRY_NOW": 0.20}

        rec_high = self.agent.analyze(txn, policy_version="agentic_optimized_v2", historical_evidence=evidence_high)
        rec_low = self.agent.analyze(txn, policy_version="agentic_optimized_v2", historical_evidence=evidence_low)

        self.assertGreater(rec_high["confidence"], rec_low["confidence"])
        self.assertIn("Prior batch empirical outcome", rec_high["evidence"])
        self.assertEqual(rec_high["historical_success_rate"], 0.85)

    # 15. Customer-assisted recovery workflow for soft failures
    def test_customer_assisted_recovery_workflow(self):
        txn = transaction(
            failure_reason="INSUFFICIENT_FUNDS",
            customer_success_rate=0.88,
            customer_previous_transactions=15,
            retry_count=0,
            amount=3500.0,
        )
        rec = self.agent.analyze(txn, policy_version="agentic_optimized_v2")
        self.assertEqual(rec["recommendation"], "CONTACT_CUSTOMER")
        self.assertEqual(rec["intervention_step"], "CUSTOMER_ASSISTED_OUTREACH")
        self.assertGreaterEqual(rec["confidence"], 0.60)

        guardrail = self.guardrails.validate(txn, rec)
        self.assertEqual(guardrail["guardrail_status"], "APPROVED")
        self.assertEqual(guardrail["final_action"], "CONTACT_CUSTOMER")

        exec_res = self.executor.execute(txn, guardrail, policy_version="agentic_optimized_v2")
        self.assertIn(exec_res["outcome"], {"SUCCESS", "FAILED"})
        self.assertIn("Simulated customer notification", exec_res["message"])

    # 16. Intervention budget exhaustion
    def test_intervention_budget_exhaustion(self):
        txn = transaction(
            failure_reason="INSUFFICIENT_FUNDS",
            retry_count=1,
            customer_success_rate=0.88,
        )
        # Recommends customer outreach but budget is already at limit
        guardrail = self.guardrails.validate(txn, {"recommendation": "CONTACT_CUSTOMER", "recovery_probability": 0.70, "confidence": 0.75})
        self.assertEqual(guardrail["guardrail_status"], "STOPPED")
        self.assertEqual(guardrail["guardrail_name"], "INTERVENTION_BUDGET")
        self.assertFalse(guardrail["approved"])

    # 17. Determinism: Same transaction + same policy = identical decision and outcome
    def test_deterministic_execution(self):
        txn = transaction(transaction_id="TX_STABLE_42", amount=4500.0, failure_reason="TIMEOUT")
        outcomes = []
        for _ in range(25):
            rec = self.agent.analyze(txn, policy_version="agentic_optimized_v2")
            guard = self.guardrails.validate(txn, rec)
            res = self.executor.execute(txn, guard, policy_version="agentic_optimized_v2", bypass_idempotency=True)
            outcomes.append((rec["recommendation"], guard["guardrail_status"], res["outcome"]))

        # Every iteration must be strictly identical
        self.assertTrue(all(o == outcomes[0] for o in outcomes))

    # 18. Recovery analytics funnel reconciliation
    def test_recovery_analytics_funnel_reconciliation(self):
        from services.recovery_analytics import RecoveryAnalytics
        conn = create_in_memory_db()

        # Insert batch and transactions
        conn.execute("INSERT INTO batch_runs (id, started_at, status, total_events, events_processed, actions_executed, successful_recoveries, revenue_recovered, revenue_at_risk) VALUES (1, '2026-09-02T10:00:00Z', 'COMPLETED', 2, 2, 1, 1, 3000.0, 7000.0)")
        conn.execute("INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable) VALUES ('T1', 'C1', 'M1', 3000.0, 'INR', '2026-09-02T10:00:00Z', 'UPI', 'FAILED', 'NETWORK_ERROR', 0, 0.90, 10, 5, 'GROWTH', 0.8, 1)")
        conn.execute("INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable) VALUES ('T2', 'C2', 'M1', 4000.0, 'INR', '2026-09-02T10:00:00Z', 'CARD', 'FAILED', 'TIMEOUT', 3, 0.40, 5, 2000, 'SCALE', 0.2, 0)")
        conn.execute("INSERT INTO recovery_cases (transaction_id, diagnosis, recovery_probability, confidence, recommendation, reason, guardrail_status, blocked_reason, guardrail_name, final_action, outcome, recovered_amount, analyzed_at, executed_at, batch_id) VALUES ('T1', 'network_error', 0.85, 0.85, 'RETRY_NOW', 'ok', 'APPROVED', NULL, 'ALL', 'RETRY_NOW', 'SUCCESS', 3000.0, '2026-09-02T10:01:00Z', '2026-09-02T10:01:00Z', 1)")
        conn.execute("INSERT INTO recovery_cases (transaction_id, diagnosis, recovery_probability, confidence, recommendation, reason, guardrail_status, blocked_reason, guardrail_name, final_action, outcome, recovered_amount, analyzed_at, executed_at, batch_id) VALUES ('T2', 'timeout', 0.20, 0.30, 'STOP_RECOVERY', 'stopped', 'STOPPED', 'Max retries', 'MAX_RETRIES', 'STOP_RECOVERY', 'STOPPED', 0.0, '2026-09-02T10:01:00Z', NULL, 1)")
        conn.commit()

        analytics = RecoveryAnalytics(lambda: conn)
        funnel = analytics.get_funnel(1)

        self.assertEqual(funnel["total_failed_events"], 2)
        self.assertEqual(funnel["revenue_at_risk"], 7000.0)
        self.assertEqual(funnel["guardrail_approved"], 1)
        self.assertEqual(funnel["successful_recoveries"], 1)
        self.assertEqual(funnel["revenue_recovered"], 3000.0)
        self.assertEqual(funnel["financial_recovery_rate"], round(3000 / 7000 * 100, 2))
        conn.close()

    # 19. Policy comparison between baseline and optimized
    def test_policy_comparison_structure(self):
        from services.recovery_analytics import RecoveryAnalytics
        conn = create_in_memory_db()

        # Add baseline_v1 and agentic_optimized_v2 batches
        try:
            conn.execute("ALTER TABLE batch_runs ADD COLUMN policy_version TEXT DEFAULT 'baseline_v1'")
        except sqlite3.OperationalError:
            pass
        conn.execute("INSERT INTO batch_runs (id, started_at, status, total_events, events_processed, actions_executed, successful_recoveries, revenue_recovered, revenue_at_risk, policy_version) VALUES (1, '2026-09-02T10:00:00Z', 'COMPLETED', 100, 100, 10, 2, 5000.0, 100000.0, 'baseline_v1')")
        conn.execute("INSERT INTO batch_runs (id, started_at, status, total_events, events_processed, actions_executed, successful_recoveries, revenue_recovered, revenue_at_risk, policy_version) VALUES (2, '2026-09-02T11:00:00Z', 'COMPLETED', 100, 100, 15, 8, 25000.0, 100000.0, 'agentic_optimized_v2')")
        conn.commit()

        analytics = RecoveryAnalytics(lambda: conn)
        comp = analytics.get_policy_comparison()

        self.assertTrue(comp["has_optimized_batch"])
        self.assertEqual(comp["baseline"]["policy_version"], "baseline_v1")
        self.assertEqual(comp["optimized"]["policy_version"], "agentic_optimized_v2")
        self.assertEqual(comp["comparison"]["additional_revenue_recovered"], 20000.0)
        self.assertEqual(comp["comparison"]["additional_successful_recoveries"], 6)
        conn.close()

    # 20. Enterprise Ingestion Service validation and error handling
    def test_ingestion_service_validation(self):
        import os
        from services.ingestion_service import IngestionService
        connect_temp, db_path = get_test_db()
        try:
            service = IngestionService(connect_temp)
            records = [
                {"transaction_id": "TX_VAL_01", "customer_id": "C1", "amount": 2500.0, "currency": "INR", "payment_method": "card"},
                {"transaction_id": "TX_INV_01", "customer_id": "C2", "amount": -100.0, "currency": "INR"},
            ]
            report = service.ingest_batch(records, persist=True)
            self.assertEqual(report["total_received"], 2)
            self.assertEqual(report["valid_count"], 1)
            self.assertEqual(report["rejected_count"], 1)
            self.assertEqual(report["status"], "PARTIAL_SUCCESS")
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 21. Explicit Risk Engine: 0-100 scores and risk tiers
    def test_risk_engine_tiers_and_scoring(self):
        detector = RiskDetector()
        
        # Low risk: small amount, 0 retries, high customer success
        low_txn = transaction(amount=500.0, retry_count=0, customer_success_rate=0.98, failure_reason="NETWORK_ERROR")
        low_res = detector.assess(low_txn)
        self.assertIn(low_res["risk_tier"], {"LOW", "MEDIUM"})
        self.assertGreater(low_res["risk_score"], 0.0)

        # Critical risk: high value (>10k), 2 retries, mandate revoked
        crit_txn = transaction(amount=18000.0, retry_count=2, mandate_revoked=True)
        crit_res = detector.assess(crit_txn)
        self.assertEqual(crit_res["risk_tier"], "CRITICAL")
        self.assertGreaterEqual(crit_res["risk_score"], 76.0)
        self.assertTrue(any("mandate explicitly revoked" in f.lower() for f in crit_res["risk_factors"]))

    # 22. Root Cause Analyzer: Rule-first deterministic classification
    def test_root_cause_rule_first_classification(self):
        from services.root_cause_analyzer import RootCauseAnalyzer
        analyzer = RootCauseAnalyzer()

        rc_net = analyzer.analyze(transaction(failure_reason="TIMEOUT"))
        self.assertEqual(rc_net["root_cause"], "NETWORK_ERROR")
        self.assertEqual(rc_net["source"], "RULE")

        rc_funds = analyzer.analyze(transaction(failure_reason="INSUFFICIENT_FUNDS"))
        self.assertEqual(rc_funds["root_cause"], "INSUFFICIENT_FUNDS")
        self.assertEqual(rc_funds["source"], "RULE")

        rc_card = analyzer.analyze(transaction(card_status="EXPIRED"))
        self.assertEqual(rc_card["root_cause"], "EXPIRED_CARD")
        self.assertEqual(rc_card["source"], "RULE")

    # 23. AI Output Validator: Enforces bounds, forbidden terms, and security checks
    def test_ai_output_validator_rejection(self):
        from services.ai_output_validator import AIOutputValidator
        val = AIOutputValidator()

        # Valid message
        ok, err, res = val.validate_customer_message({"message": "Please authorize payment retry.", "delay_minutes": 30, "tone": "PROFESSIONAL"})
        self.assertTrue(ok)
        self.assertIsNone(err)

        # Forbidden term rejection
        ok_forb, err_forb, _ = val.validate_customer_message({"message": "We will bypass guardrail for guaranteed recovery.", "delay_minutes": 30})
        self.assertFalse(ok_forb)
        self.assertIn("Forbidden term", err_forb)

        # Sensitive credential prompt rejection
        ok_sec, err_sec, _ = val.validate_customer_message({"message": "Please enter your CVV to complete payment.", "delay_minutes": 30})
        self.assertFalse(ok_sec)
        self.assertIn("Security violation", err_sec)

    # 24. LLM Service: Graceful deterministic fallback when offline
    def test_llm_service_fallback(self):
        from services.llm_service import LLMService
        llm = LLMService(api_key="")
        self.assertFalse(llm.is_configured)

        diag = llm.diagnose_root_cause("NETWORK_ERROR")
        self.assertIn(diag["root_cause"], {"NETWORK_ERROR", "UNKNOWN"})
        self.assertEqual(diag["source"], "RULE")

        msg = llm.draft_recovery_message("INSUFFICIENT_FUNDS", amount=1500.0)
        self.assertIn("insufficient balance", msg["message"].lower())
        self.assertEqual(msg["source"], "FALLBACK")

    # 25. Policy Gateway: Hard-stop conditions (do_not_contact, mandate_revoked, stolen_card)
    def test_policy_gateway_hard_stops(self):
        # Do not contact check
        dnc_txn = transaction(do_not_contact=True)
        res_dnc = self.guardrails.validate(dnc_txn, {"recommendation": "CONTACT_CUSTOMER", "recovery_probability": 0.8, "confidence": 0.8})
        self.assertEqual(res_dnc["guardrail_status"], "BLOCKED")
        self.assertEqual(res_dnc["guardrail_name"], "DO_NOT_CONTACT")

        # Mandate revoked check
        rev_txn = transaction(mandate_revoked=True)
        res_rev = self.guardrails.validate(rev_txn, {"recommendation": "RETRY_NOW", "recovery_probability": 0.8, "confidence": 0.8})
        self.assertEqual(res_rev["guardrail_status"], "STOPPED")
        self.assertEqual(res_rev["guardrail_name"], "MANDATE_REVOKED")

        # Stolen card instrument check
        stolen_txn = transaction(card_status="STOLEN")
        res_stolen = self.guardrails.validate(stolen_txn, {"recommendation": "RETRY_NOW", "recovery_probability": 0.8, "confidence": 0.8})
        self.assertEqual(res_stolen["guardrail_status"], "STOPPED")
        self.assertEqual(res_stolen["guardrail_name"], "INVALID_CARD_STATUS")

    # 26. Human Review Queue: Lifecycle transitions (OPEN -> IN_REVIEW -> RESOLVED)
    def test_human_review_queue_lifecycle(self):
        import os
        from services.human_queue_service import HumanQueueService
        connect_temp, db_path = get_test_db()
        try:
            svc = HumanQueueService(connect_temp)
            qid = svc.enqueue(
                case_id=1,
                transaction=transaction(transaction_id="TX_HQ_1", amount=15000.0),
                recommendation={"recommendation": "ESCALATE_TO_HUMAN", "confidence": 0.8},
                guardrail_result={"guardrail_name": "MAX_AUTO_ACTION_AMOUNT", "blocked_reason": "Amount > 10k"},
            )
            self.assertGreater(qid, 0)

            # Verify initial open status
            item = svc.get_item(qid)
            self.assertEqual(item["status"], "OPEN")

            # Transition to IN_REVIEW
            rev_res = svc.review_item(qid, "START_REVIEW", reviewed_by="Officer A", notes="Investigating")
            self.assertEqual(rev_res["new_status"], "IN_REVIEW")

            # Transition to RESOLVED
            res_res = svc.review_item(qid, "RESOLVE", reviewed_by="Officer A", notes="Approved manual transfer")
            self.assertEqual(res_res["new_status"], "RESOLVED")
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 27. Razorpay Provider: Test-mode safety and provider abstraction
    def test_razorpay_provider_test_mode_isolation(self):
        from services.razorpay_service import RazorpayProvider, ProviderService
        provider = RazorpayProvider(mode="test")
        self.assertEqual(provider.mode, "test")

        service = ProviderService()
        status = service.get_status()
        self.assertEqual(status["environment"], "TEST_SANDBOX")
        self.assertFalse(status["supports_real_money"])
        self.assertFalse(status["live_mode_enabled"])

    # 28. Idempotency protection prevents duplicate execution
    def test_idempotency_duplicate_prevention(self):
        executor = RecoveryExecutor()
        txn = transaction(transaction_id="TX_IDEMP_1", amount=1200.0)
        guardrail = {"guardrail_status": "APPROVED", "final_action": "RETRY_NOW"}

        res1 = executor.execute(txn, guardrail, attempt_number=1)
        self.assertIn(res1["outcome"], {"SUCCESS", "FAILED"})

        # Duplicate attempt with same key must be rejected
        res2 = executor.execute(txn, guardrail, attempt_number=1)
        self.assertEqual(res2["status"], "ALREADY_EXECUTED")
        self.assertEqual(res2["recovered_amount"], 0.0)
        self.assertIn("Duplicate action prevented", res2["message"])

    # 29. Voice AI Service: Rejects sensitive data and routes requests through policy gateway
    def test_voice_service_security_rejection_and_policy_routing(self):
        import os
        from services.voice_service import VoiceService
        connect_temp, db_path = get_test_db()
        try:
            conn = connect_temp()
            txn = transaction(transaction_id="TX_VOICE_1", amount=2200.0, payment_status="FAILED", retry_count=0)
            conn.execute(
                "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    txn["transaction_id"], txn["customer_id"], txn["merchant_id"], txn["amount"], txn["currency"],
                    "2026-09-02T12:00:00Z", txn["payment_method"], txn["payment_status"], txn["failure_reason"],
                    txn["retry_count"], txn["customer_success_rate"], txn["customer_previous_transactions"],
                    txn["time_since_failure_minutes"], "GROWTH", txn["risk_score"], txn["ground_truth_recoverable"],
                    "ACTIVE",
                ),
            )
            conn.commit()
            conn.close()

            voice_svc = VoiceService(connect_temp)

            # 1. Test sensitive credential disclosure rejection
            sens_res = voice_svc.process_utterance("sess_1", "My CVV is 999, please charge it", "TX_VOICE_1")
            self.assertEqual(sens_res["status"], "SECURITY_VIOLATION")
            self.assertEqual(sens_res["policy_decision"], "BLOCKED")
            self.assertIn("never asks for or accepts CVVs", sens_res["speech_response"])

            # 2. Test valid voice retry through policy gateway
            retry_res = voice_svc.process_utterance("sess_2", "Please retry payment", "TX_VOICE_1")
            self.assertEqual(retry_res["detected_intent"], "RETRY_PAYMENT")
            self.assertEqual(retry_res["policy_decision"], "APPROVED")
            self.assertIsNotNone(retry_res["execution_result"])
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 30. RAG Service: Payment domain grounding, out-of-scope rejection, and CVV zero-trust protection
    def test_rag_service_domain_boundary_and_retrieval(self):
        import os
        from services.rag_service import RAGService
        connect_temp, db_path = get_test_db()
        try:
            conn = connect_temp()
            txn = transaction(transaction_id="TX_RAG_1", amount=3500.0, failure_reason="NETWORK_ERROR")
            conn.execute(
                "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    txn["transaction_id"], txn["customer_id"], txn["merchant_id"], txn["amount"], txn["currency"],
                    "2026-09-02T12:00:00Z", txn["payment_method"], txn["payment_status"], txn["failure_reason"],
                    txn["retry_count"], txn["customer_success_rate"], txn["customer_previous_transactions"],
                    txn["time_since_failure_minutes"], "GROWTH", txn["risk_score"], txn["ground_truth_recoverable"],
                    "ACTIVE",
                ),
            )
            conn.commit()
            conn.close()

            rag = RAGService(connect_temp)

            # A. Test operational transaction query
            res1 = rag.answer_query("Why did TX_RAG_1 fail?", active_tx_id="TX_RAG_1")
            self.assertIn("TX_RAG_1", res1["answer"])
            self.assertTrue("network" in res1["answer"].lower())
            self.assertTrue(len(res1["sources_used"]) > 0)
            self.assertEqual(res1["decision"], "GROUNDED")

            # B. Test out-of-domain query boundary
            res2 = rag.answer_query("What is the capital of France?")
            self.assertEqual(res2["decision"], "OUT_OF_SCOPE")
            self.assertIn("out of my scope", res2["answer"].lower())

            # C. Test zero-trust sensitive data rejection
            res3 = rag.answer_query("My CVV is 456, retry the payment")
            self.assertEqual(res3["decision"], "SECURITY_VIOLATION")
            self.assertIn("security alert", res3["answer"].lower())
            self.assertIn("cvv", res3["answer"].lower())
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 31. RAG Service: Bounded financial action strictly authorized via policy gateway
    def test_rag_service_financial_action_routing(self):
        import os
        from services.rag_service import RAGService
        connect_temp, db_path = get_test_db()
        try:
            conn = connect_temp()
            txn = transaction(transaction_id="TX_RAG_2", amount=4500.0, payment_status="FAILED", retry_count=0)
            conn.execute(
                "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    txn["transaction_id"], txn["customer_id"], txn["merchant_id"], txn["amount"], txn["currency"],
                    "2026-09-02T12:00:00Z", txn["payment_method"], txn["payment_status"], txn["failure_reason"],
                    txn["retry_count"], txn["customer_success_rate"], txn["customer_previous_transactions"],
                    txn["time_since_failure_minutes"], "GROWTH", txn["risk_score"], txn["ground_truth_recoverable"],
                    "ACTIVE",
                ),
            )
            conn.commit()
            conn.close()

            rag = RAGService(connect_temp)
            res = rag.answer_query("Please retry TX_RAG_2 now", active_tx_id="TX_RAG_2")
            self.assertEqual(res["intent"], "RETRY_PAYMENT")
            self.assertEqual(res["decision"], "APPROVED")
            self.assertIsNotNone(res["action_result"])
            self.assertIn("Gateway Decision: APPROVED", res["answer"])
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass

    # 32. Batch Service: Distinct sampling per batch ID and stage progression
    def test_batch_service_distinct_sampling_and_stage_progression(self):
        import os
        from services.batch_service import BatchService
        connect_temp, db_path = get_test_db()
        try:
            conn = connect_temp()
            # Seed 20 failed transactions
            for i in range(1, 21):
                txn = transaction(
                    transaction_id=f"TX_BATCH_TEST_{i}",
                    customer_id=f"CUST_{i}",
                    amount=1000.0 * i,
                    failure_reason="NETWORK_ERROR" if i % 2 == 0 else "INSUFFICIENT_FUNDS",
                )
                conn.execute(
                    "INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        txn["transaction_id"], txn["customer_id"], txn["merchant_id"], txn["amount"], txn["currency"],
                        "2026-09-02T12:00:00Z", txn["payment_method"], txn["payment_status"], txn["failure_reason"],
                        txn["retry_count"], txn["customer_success_rate"], txn["customer_previous_transactions"],
                        txn["time_since_failure_minutes"], "GROWTH", txn["risk_score"], txn["ground_truth_recoverable"],
                        "ACTIVE",
                    ),
                )
            conn.commit()
            conn.close()

            def test_metrics(bid):
                c = connect_temp()
                cases = c.execute("SELECT c.*, t.amount FROM recovery_cases c JOIN transactions t ON t.transaction_id=c.transaction_id WHERE c.batch_id=?", (bid,)).fetchall()
                risk = sum(r["amount"] for r in cases)
                rec = sum(r["recovered_amount"] for r in cases)
                c.close()
                return {"revenue_at_risk": risk, "revenue_recovered": rec, "total_recovery_attempts": len(cases), "successful_recoveries": len([x for x in cases if x["outcome"] == "SUCCESS"])}

            batch_svc = BatchService(connect_temp, test_metrics)

            # Test distinct deterministic sampling
            conn = connect_temp()
            sample_1 = batch_svc.select_batch_transactions(conn, batch_id=10, sample_size=5)
            sample_2 = batch_svc.select_batch_transactions(conn, batch_id=20, sample_size=5)
            conn.close()

            ids_1 = sample_1
            ids_2 = sample_2
            self.assertEqual(len(ids_1), 5)
            self.assertEqual(len(ids_2), 5)
            # Different seeds must produce different order or subsets
            self.assertNotEqual(ids_1, ids_2)

            # Test execution runs to completion with stages recorded
            res = batch_svc.run_batch(limit=10, synchronous=True)
            self.assertEqual(res["status"], "COMPLETED")
            self.assertEqual(res["current_stage"], "COMPLETED")
            self.assertEqual(res["progress_percent"], 100)
            self.assertTrue(res["events_processed"] > 0)
            self.assertTrue(res["revenue_at_risk"] > 0)

            # Verify batch_transactions mapping was written
            conn = connect_temp()
            mapped = conn.execute("SELECT COUNT(*) FROM batch_transactions WHERE batch_id = ?", (res["id"],)).fetchone()[0]
            conn.close()
            self.assertEqual(mapped, res["events_processed"])
        finally:
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass


class EnterpriseTransformationTests(unittest.TestCase):
    def setUp(self):
        import uuid
        import os
        self.db_path = f"test_enterprise_{uuid.uuid4().hex[:8]}.db"
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA_SQL)
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id TEXT PRIMARY KEY, name TEXT, filename TEXT,
                uploaded_at TEXT, total_rows INTEGER, valid_rows INTEGER,
                invalid_rows INTEGER, status TEXT, summary_json TEXT
            );
            CREATE TABLE IF NOT EXISTS dataset_transactions (
                dataset_id TEXT, transaction_id TEXT, PRIMARY KEY (dataset_id, transaction_id)
            );
            CREATE TABLE IF NOT EXISTS recovery_reports (
                report_id TEXT PRIMARY KEY, batch_id INTEGER, generated_at TEXT,
                policy_version TEXT, revenue_at_risk REAL, revenue_recovered REAL,
                recovery_rate REAL, summary_json TEXT, markdown_content TEXT
            );
            CREATE TABLE IF NOT EXISTS human_queue (
                queue_id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER,
                transaction_id TEXT, customer_id TEXT, amount REAL, risk_score REAL,
                root_cause TEXT, agent_recommendation TEXT, confidence REAL,
                guardrail_trigger TEXT, reason TEXT, created_at TEXT, status TEXT DEFAULT 'OPEN',
                reviewed_by TEXT, review_notes TEXT, resolved_at TEXT
            );
            CREATE TABLE IF NOT EXISTS raw_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id TEXT,
                customer_id TEXT, amount REAL, currency TEXT, payment_method TEXT,
                failure_reason TEXT, gateway_error_code TEXT, retry_count INTEGER,
                created_at TEXT, customer_success_rate REAL, customer_history TEXT,
                do_not_contact INTEGER, mandate_revoked INTEGER, card_status TEXT,
                ingestion_status TEXT, validation_errors TEXT, ingested_at TEXT
            );
        """)

    def tearDown(self):
        self.conn.close()
        import os
        if os.path.exists(self.db_path):
            try:
                os.remove(self.db_path)
            except Exception:
                pass

    def connect_fn(self):
        c = sqlite3.connect(self.db_path)
        c.row_factory = sqlite3.Row
        return c

    def test_customer_service_status_and_profile(self):
        from services.customer_service import CustomerService
        conn = self.connect_fn()
        conn.execute(
            """
            INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status)
            VALUES ('TX_CUST_1', 'CUST_A', 'MER_01', 3000.0, 'INR', '2026-09-02T10:00:00Z', 'CARD', 'FAILED', 'NETWORK_ERROR', 0, 0.90, 10, 5, 'GROWTH', 0.2, 1, 'ACTIVE')
            """
        )
        conn.execute(
            """
            INSERT INTO recovery_cases (transaction_id, diagnosis, recovery_probability, confidence, recommendation, reason, guardrail_status, blocked_reason, guardrail_name, final_action, outcome, recovered_amount, analyzed_at, executed_at, batch_id)
            VALUES ('TX_CUST_1', 'Transient network glitch', 0.85, 0.85, 'RETRY_NOW', 'Approved', 'APPROVED', NULL, 'None', 'RETRY_NOW', 'SUCCESS', 3000.0, '2026-09-02T10:01:00Z', '2026-09-02T10:01:05Z', 1)
            """
        )
        conn.commit()
        conn.close()

        svc = CustomerService(self.connect_fn)
        customers = svc.list_customers()
        self.assertEqual(len(customers), 1)
        self.assertEqual(customers[0]["customer_id"], "CUST_A")

        profile = svc.get_customer_profile("CUST_A")
        self.assertIsNotNone(profile)
        self.assertEqual(profile["total_transactions"], 1)
        self.assertEqual(profile["recovered_amount"], 3000.0)
        self.assertIn("timeline", profile)
        self.assertIn("action_performance", profile)

    def test_dataset_ingestion_and_recovery_run(self):
        from services.ingestion_service import IngestionService
        from services.batch_service import BatchService
        ingest = IngestionService(self.connect_fn)

        csv_data = """transaction_id,customer_id,amount,currency,payment_method,failure_reason,retry_count,customer_success_rate,customer_previous_transactions
TX_CSV_01,CUST_X,2500,INR,CARD,NETWORK_ERROR,0,0.85,12
TX_CSV_02,CUST_Y,15000,INR,UPI,INSUFFICIENT_FUNDS,0,0.70,5
"""
        res = ingest.ingest_csv_dataset(csv_data, "Enterprise Q3 Batch", "dataset_q3.csv")
        self.assertEqual(res["valid_rows"], 2)
        self.assertEqual(res["status"], "SUCCESS")

        datasets = ingest.list_datasets()
        self.assertEqual(len(datasets), 1)
        self.assertEqual(datasets[0]["name"], "Enterprise Q3 Batch")

        tids = ingest.get_dataset_transactions(res["dataset_id"])
        self.assertEqual(len(tids), 2)
        self.assertIn("TX_CSV_01", tids)
        self.assertIn("TX_CSV_02", tids)

        def mock_metrics(bid):
            return {"revenue_at_risk": 17500.0, "revenue_recovered": 2500.0, "total_recovery_attempts": 2, "successful_recoveries": 1}

        batch_svc = BatchService(self.connect_fn, mock_metrics)
        batch_res = batch_svc.run_batch(limit=2, synchronous=True, transaction_ids=tids)
        self.assertEqual(batch_res["status"], "COMPLETED")
        self.assertEqual(batch_res["events_processed"], 2)

    def test_report_service_generation(self):
        from services.report_service import ReportService
        conn = self.connect_fn()
        conn.execute(
            """
            INSERT INTO batch_runs (id, started_at, completed_at, status, events_processed, actions_executed, successful_recoveries, revenue_recovered, revenue_at_risk, policy_version)
            VALUES (1, '2026-09-02T10:00:00Z', '2026-09-02T10:05:00Z', 'COMPLETED', 1, 1, 1, 4000.0, 4000.0, 'agentic_optimized_v2')
            """
        )
        conn.execute(
            """
            INSERT INTO transactions (transaction_id, customer_id, merchant_id, amount, currency, timestamp, payment_method, payment_status, failure_reason, retry_count, customer_success_rate, customer_previous_transactions, time_since_failure_minutes, customer_segment, risk_score, ground_truth_recoverable, card_status)
            VALUES ('TX_REP_1', 'CUST_REP', 'MER_01', 4000.0, 'INR', '2026-09-02T10:00:00Z', 'CARD', 'FAILED', 'NETWORK_ERROR', 0, 0.90, 10, 5, 'GROWTH', 0.2, 1, 'ACTIVE')
            """
        )
        conn.execute(
            """
            INSERT INTO recovery_cases (transaction_id, diagnosis, recovery_probability, confidence, recommendation, reason, guardrail_status, blocked_reason, guardrail_name, final_action, outcome, recovered_amount, analyzed_at, executed_at, batch_id, policy_version)
            VALUES ('TX_REP_1', 'Diagnosed network error', 0.85, 0.85, 'RETRY_NOW', 'Approved', 'APPROVED', NULL, 'None', 'RETRY_NOW', 'SUCCESS', 4000.0, '2026-09-02T10:01:00Z', '2026-09-02T10:01:05Z', 1, 'agentic_optimized_v2')
            """
        )
        conn.commit()
        conn.close()

        rep_svc = ReportService(self.connect_fn)
        report = rep_svc.generate_report(batch_id=1)
        self.assertEqual(report["batch_id"], 1)
        self.assertEqual(report["safety_audit"]["total_violations"], 0)
        self.assertEqual(report["safety_audit"]["status"], "COMPLIANT")
        self.assertIn("# REVORA RECOVERY INTELLIGENCE REPORT", report["markdown"])
        self.assertIn("Baseline v1 vs Revora v2", report["markdown"])

    def test_rag_conversational_greetings(self):
        from services.rag_service import RAGService
        rag = RAGService(self.connect_fn)

        # Natural greetings should return friendly intro rather than domain rejection
        resp = rag.answer_query("Hello Revora")
        self.assertEqual(resp["intent"], "GREETING")
        self.assertTrue("revora pulse" in resp["answer"].lower() or "payment recovery assistant" in resp["answer"].lower())

        resp2 = rag.answer_query("Hi there")
        self.assertEqual(resp2["intent"], "GREETING")

        # Mathematical questions should be rejected cleanly with out of scope message
        resp_math = rag.answer_query("what is 2 + 2?")
        self.assertEqual(resp_math["decision"], "OUT_OF_SCOPE")
        self.assertIn("out of my scope", resp_math["answer"].lower())

        # Sensitive input check
        resp3 = rag.answer_query("My CVV is 123 for card")
        self.assertEqual(resp3["intent"], "REJECTED_SENSITIVE_INPUT")
        self.assertEqual(resp3["status"], "SECURITY_VIOLATION")

    def test_global_search_multi_entity(self):
        from main import api_global_search
        res = api_global_search("TX")
        self.assertIn("results", res)
        self.assertIsInstance(res["results"], list)

        res_cust = api_global_search("CUS")
        self.assertIn("results", res_cust)
        self.assertIsInstance(res_cust["results"], list)


if __name__ == "__main__":
    unittest.main()



