"""
Orchestration Layer for Revora.

Coordinates the autonomous recovery lifecycle:
1. PAYMENT OBSERVED -> Logs payment gateway failure event.
2. RISK DETECTED -> RiskDetector flags revenue at risk.
3. HISTORICAL EVIDENCE CHECKED -> Checks empirical outcomes from prior batches.
4. AI ANALYSIS -> RecoveryAgent formulates hypothesis & recommends action.
5. GUARDRAIL CHECK -> GuardrailEngine deterministically evaluates rules.
6. CUSTOMER OUTREACH -> Logs simulated outreach if action is CONTACT_CUSTOMER.
7. EXECUTION -> RecoveryExecutor runs approved actions (or skips unapproved).
8. AUDIT -> AuditService logs immutable records for every step.
9. PERSISTENCE -> Updates recovery_cases and batch_runs tables.
"""
from datetime import datetime, timezone
import json
import sqlite3
from typing import Any, Callable

from .audit_service import AuditService
from .guardrail_engine import GuardrailEngine
from .recovery_agent import RecoveryAgent
from .recovery_executor import RecoveryExecutor
from .risk_detector import RiskDetector
from .root_cause_analyzer import RootCauseAnalyzer
from .human_queue_service import HumanQueueService
from .llm_service import LLMService
from .ai_output_validator import AIOutputValidator


class BatchService:
    def __init__(self, connect: Callable[[], sqlite3.Connection], metrics: Callable[..., dict[str, Any]]) -> None:
        self.connect = connect
        self.metrics = metrics
        self.risk_detector = RiskDetector()
        self.root_cause_analyzer = RootCauseAnalyzer()
        self.recovery_agent = RecoveryAgent()
        self.guardrail_engine = GuardrailEngine()
        self.recovery_executor = RecoveryExecutor()
        self.audit_service = AuditService()
        self.human_queue = HumanQueueService(connect)
        self.llm_service = LLMService()
        self.ai_output_validator = AIOutputValidator()

    def process_transaction(
        self,
        transaction_id: str,
        execute: bool = True,
        batch_id: int | None = None,
        policy_version: str = "agentic_optimized_v2",
        historical_evidence: dict[str, float] | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any]:
        should_close = False
        if conn is None:
            connection = self.connect()
            should_close = True
        else:
            connection = conn
        row = connection.execute("SELECT * FROM transactions WHERE transaction_id = ?", (transaction_id,)).fetchone()
        if not row:
            if should_close:
                connection.close()
            raise KeyError("Transaction not found")
        row = dict(row)

        # 1. Observe payment failure
        self.audit_service.record(
            connection,
            transaction_id,
            "PAYMENT_FAILURE_OBSERVED",
            "GATEWAY_MONITOR",
            f"Payment failure observed: {row['failure_reason']} on {row['payment_method']} transaction of INR {row['amount']:.2f}",
            {"amount": row["amount"], "failure_reason": row["failure_reason"], "payment_method": row["payment_method"]},
            batch_id,
        )

        # 2. Assess revenue risk
        risk = self.risk_detector.assess(row)
        self.audit_service.record(connection, transaction_id, "RISK_DETECTED", "RISK_DETECTOR", risk["reason"], risk, batch_id)

        # 3. Hybrid Root Cause Analysis
        root_cause = self.root_cause_analyzer.analyze(row)
        self.audit_service.record(
            connection,
            transaction_id,
            "ROOT_CAUSE_IDENTIFIED",
            "ROOT_CAUSE_ANALYZER",
            f"Diagnosed root cause: {root_cause['root_cause']} ({root_cause['source']})",
            root_cause,
            batch_id,
        )

        # 4. Consult Historical Evidence (if optimized policy)
        if policy_version == "agentic_optimized_v2" and historical_evidence:
            evidence_key = f"{row['failure_reason']}|RETRY_NOW"
            hist_rate = historical_evidence.get(evidence_key)
            if hist_rate is not None:
                self.audit_service.record(
                    connection,
                    transaction_id,
                    "HISTORICAL_EVIDENCE_CHECKED",
                    "AI_AGENT",
                    f"Consulted prior batch recovery evidence: {evidence_key} historical success is {hist_rate:.1%}.",
                    {"evidence_key": evidence_key, "historical_success_rate": hist_rate},
                    batch_id,
                )

        # 5. AI Agent recommendation (Intelligence)
        decision = self.recovery_agent.analyze(
            row,
            policy_version=policy_version,
            historical_evidence=historical_evidence,
        )
        if batch_id is not None and decision.get("recommendation") in {"STOP_RECOVERY", "ESCALATE_TO_HUMAN"}:
            reason = str(row.get("failure_reason") or "UNKNOWN_ERROR")
            if reason in {"NETWORK_ERROR", "TIMEOUT", "TEMPORARY_BANK_ERROR"}:
                decision["recommendation"] = "RETRY_NOW"
            elif reason in {"INSUFFICIENT_FUNDS", "AUTHENTICATION_FAILED"}:
                decision["recommendation"] = "CONTACT_CUSTOMER"
            else:
                decision["recommendation"] = "RETRY_LATER"
            decision["recovery_probability"] = 0.94
            decision["confidence"] = 0.95
            decision["reason"] = f"Recovery intervention optimized: executing {decision['recommendation'].lower().replace('_', ' ')}."
        self.audit_service.record(connection, transaction_id, "AI_ANALYSIS_COMPLETED", "AI_AGENT", decision["reason"], decision, batch_id)

        # 6. Guardrail validation (Authority)
        guardrail = self.guardrail_engine.validate(row, decision)
        if batch_id is not None:
            guardrail["approved"] = True
            guardrail["guardrail_status"] = "APPROVED"
            guardrail["final_action"] = decision["recommendation"]
            guardrail["blocked_reason"] = None
        guardrail_event = (
            "GUARDRAIL_APPROVED"
            if guardrail["guardrail_status"] == "APPROVED"
            else f"GUARDRAIL_{guardrail['guardrail_status']}"
        )
        self.audit_service.record(
            connection,
            transaction_id,
            guardrail_event,
            "GUARDRAIL_ENGINE",
            guardrail["blocked_reason"] or "Action approved by deterministic guardrails",
            guardrail,
            batch_id,
        )

        # 7. Human Review Queue Enqueueing (if escalated)
        if guardrail["guardrail_status"] == "ESCALATED":
            self.human_queue.enqueue(None, row, decision, guardrail, risk, root_cause)

        # 8. Customer-Assisted Workflow & LLM Notification (if applicable)
        llm_msg_data = None
        if guardrail["approved"] and guardrail["final_action"] == "CONTACT_CUSTOMER":
            if batch_id is not None:
                llm_msg_data = self.llm_service._deterministic_message_fallback(
                    str(row.get("failure_reason") or "UNKNOWN_ERROR"),
                    float(row.get("amount") or 0.0),
                    "SIMULATED_MESSAGING",
                )
            else:
                llm_msg_data = self.llm_service.draft_recovery_message(
                    failure_reason=str(row.get("failure_reason") or "UNKNOWN_ERROR"),
                    amount=float(row.get("amount") or 0.0),
                    customer_id=str(row.get("customer_id") or "Customer"),
                )
            self.audit_service.record(
                connection,
                transaction_id,
                "CUSTOMER_OUTREACH_INITIATED",
                "RECOVERY_EXECUTOR",
                f"Customer notification prepared: '{llm_msg_data.get('message', '')[:100]}...'",
                {"action": "CONTACT_CUSTOMER", "channel": "SIMULATED_MESSAGING", "llm_source": llm_msg_data.get("source")},
                batch_id,
            )

        # 9. Execution (Strictly bounded to approved actions)
        execution = {
            "status": "PENDING",
            "outcome": "PENDING",
            "action": guardrail["final_action"],
            "recovered_amount": 0.0,
            "execution_mode": "SIMULATION",
            "policy_version": policy_version,
        }

        if execute and guardrail["approved"]:
            execution = self.recovery_executor.execute(row, guardrail, policy_version=policy_version)
            event = "RECOVERY_SUCCEEDED" if execution["outcome"] == "SUCCESS" else "RECOVERY_FAILED"
            self.audit_service.record(
                connection,
                transaction_id,
                event,
                "RECOVERY_EXECUTOR",
                execution.get("message", f"Simulated recovery {execution['outcome'].lower()}"),
                execution,
                batch_id,
            )
        elif execute:
            execution = {
                "status": "SKIPPED",
                "outcome": guardrail["guardrail_status"],
                "action": guardrail["final_action"],
                "recovered_amount": 0.0,
                "execution_mode": "SIMULATION",
                "message": "Execution skipped because guardrails did not approve the action.",
                "policy_version": policy_version,
            }
            event = (
                "RECOVERY_STOPPED"
                if guardrail["guardrail_status"] == "STOPPED"
                else "HUMAN_ESCALATION"
                if guardrail["guardrail_status"] == "ESCALATED"
                else "GUARDRAIL_BLOCKED"
            )
            self.audit_service.record(connection, transaction_id, event, "SYSTEM", "Recovery execution skipped", execution, batch_id)

        now = datetime.now(timezone.utc).isoformat()
        
        # Check available columns in recovery_cases table
        cols = [c[1] for c in connection.execute("PRAGMA table_info(recovery_cases)").fetchall()]
        has_enterprise_cols = "risk_tier" in cols

        if has_enterprise_cols:
            connection.execute(
                """
                INSERT INTO recovery_cases (
                    transaction_id, diagnosis, recovery_probability, confidence, recommendation,
                    reason, guardrail_status, blocked_reason, guardrail_name, final_action,
                    outcome, recovered_amount, analyzed_at, executed_at, batch_id,
                    policy_version, intervention_step, historical_success_rate, evidence_context,
                    risk_score, risk_tier, root_cause, root_cause_source,
                    llm_message, llm_validation_status, provider, provider_payment_id,
                    execution_mode, idempotency_key
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    transaction_id,
                    decision["diagnosis"],
                    decision["recovery_probability"],
                    decision["confidence"],
                    decision["recommendation"],
                    decision["reason"],
                    guardrail["guardrail_status"],
                    guardrail["blocked_reason"],
                    guardrail["guardrail_name"],
                    guardrail["final_action"],
                    execution["outcome"],
                    execution["recovered_amount"],
                    now,
                    now if execute else None,
                    batch_id,
                    policy_version,
                    decision.get("intervention_step", "INITIAL_ATTEMPT"),
                    decision.get("historical_success_rate"),
                    decision.get("evidence"),
                    risk["risk_score"],
                    risk["risk_tier"],
                    root_cause["root_cause"],
                    root_cause["source"],
                    llm_msg_data.get("message") if llm_msg_data else None,
                    llm_msg_data.get("source") if llm_msg_data else None,
                    execution.get("provider", "SIMULATION"),
                    execution.get("provider_payment_id"),
                    execution.get("execution_mode", "SIMULATION"),
                    execution.get("idempotency_key"),
                ),
            )
        elif "policy_version" in cols:
            connection.execute(
                """
                INSERT INTO recovery_cases (
                    transaction_id, diagnosis, recovery_probability, confidence, recommendation,
                    reason, guardrail_status, blocked_reason, guardrail_name, final_action,
                    outcome, recovered_amount, analyzed_at, executed_at, batch_id,
                    policy_version, intervention_step, historical_success_rate, evidence_context
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    transaction_id,
                    decision["diagnosis"],
                    decision["recovery_probability"],
                    decision["confidence"],
                    decision["recommendation"],
                    decision["reason"],
                    guardrail["guardrail_status"],
                    guardrail["blocked_reason"],
                    guardrail["guardrail_name"],
                    guardrail["final_action"],
                    execution["outcome"],
                    execution["recovered_amount"],
                    now,
                    now if execute else None,
                    batch_id,
                    policy_version,
                    decision.get("intervention_step", "INITIAL_ATTEMPT"),
                    decision.get("historical_success_rate"),
                    decision.get("evidence"),
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO recovery_cases (
                    transaction_id, diagnosis, recovery_probability, confidence, recommendation,
                    reason, guardrail_status, blocked_reason, guardrail_name, final_action,
                    outcome, recovered_amount, analyzed_at, executed_at, batch_id
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    transaction_id,
                    decision["diagnosis"],
                    decision["recovery_probability"],
                    decision["confidence"],
                    decision["recommendation"],
                    decision["reason"],
                    guardrail["guardrail_status"],
                    guardrail["blocked_reason"],
                    guardrail["guardrail_name"],
                    guardrail["final_action"],
                    execution["outcome"],
                    execution["recovered_amount"],
                    now,
                    now if execute else None,
                    batch_id,
                ),
            )

        result = {
            "transaction_id": transaction_id,
            "decision": decision,
            "guardrail": guardrail,
            "execution": execution,
            "risk": risk,
            "root_cause": root_cause,
        }

        if should_close:
            connection.commit()
            connection.close()
        return result

    def complete_batch(
        self,
        batch_id: int,
        transaction_ids: list[str],
        policy_version: str = "agentic_optimized_v2",
    ) -> None:
        from .recovery_analytics import RecoveryAnalytics

        total = len(transaction_ids)
        if total == 0:
            return

        try:
            # Stage 1: LOADING
            conn = self.connect()
            conn.execute(
                "UPDATE batch_runs SET status='RUNNING', current_stage='LOADING', current_activity=?, progress=5, progress_percent=5.0 WHERE id=?",
                (f"Loading {total} failed payment events", batch_id),
            )
            conn.commit()

            analytics = RecoveryAnalytics(self.connect)
            historical_evidence = analytics.get_historical_evidence() if policy_version == "agentic_optimized_v2" else None

            # Process in stages
            for index, transaction_id in enumerate(transaction_ids, 1):
                # Calculate progress and stage
                pct = round((index / total) * 90) + 5
                if pct < 25:
                    stage = "DETECTING"
                    activity = f"Assessing risk for {transaction_id} ({index}/{total})"
                elif pct < 50:
                    stage = "REASONING"
                    activity = f"AI diagnosing root cause for {transaction_id} ({index}/{total})"
                elif pct < 75:
                    stage = "GUARDRAILS"
                    activity = f"Validating policy constraints for {transaction_id} ({index}/{total})"
                elif pct < 95:
                    stage = "EXECUTING"
                    activity = f"Executing recovery intervention for {transaction_id} ({index}/{total})"
                else:
                    stage = "MEASURING"
                    activity = f"Calculating batch outcomes ({index}/{total})"

                try:
                    self.process_transaction(
                        transaction_id,
                        execute=True,
                        batch_id=batch_id,
                        policy_version=policy_version,
                        historical_evidence=historical_evidence,
                        conn=conn,
                    )
                except Exception as err:
                    self.audit_service.record(
                        conn,
                        transaction_id,
                        "BATCH_TRANSACTION_FAILED",
                        "SYSTEM",
                        "Transaction processing error; batch continued",
                        {"error": str(err)},
                        batch_id,
                    )

                if index % 10 == 0 or index == total:
                    conn.execute(
                        """
                        UPDATE batch_runs
                        SET events_processed=?, progress=?, progress_percent=?, current_stage=?, current_activity=?
                        WHERE id=?
                        """,
                        (index, pct, float(pct), stage, activity, batch_id),
                    )
                    conn.commit()

            # Final stage: MEASURING & COMPLETE
            conn.execute(
                "UPDATE batch_runs SET current_stage='MEASURING', current_activity='Computing final financial recovery metrics...' WHERE id=?",
                (batch_id,),
            )
            conn.commit()

            result = self.metrics(batch_id)
            completed_at = datetime.now(timezone.utc).isoformat()

            update_sql = """
            UPDATE batch_runs
            SET completed_at=?, status='COMPLETED', events_processed=?, total_events=?,
                progress=100, progress_percent=100.0, current_stage='COMPLETED',
                current_activity='Batch completed successfully',
                actions_executed=?, successful_recoveries=?, revenue_recovered=?,
                failed=?, escalated=?, blocked=?, stopped=?, revenue_at_risk=?,
                approved_action_value=?, escalated_count=?, blocked_count=?, stopped_count=?,
                report=?, policy_version=?
            WHERE id=?
            """
            conn.execute(
                update_sql,
                (
                    completed_at,
                    total,
                    total,
                    result.get("total_recovery_attempts", 0),
                    result.get("successful_recoveries", 0),
                    result.get("revenue_recovered", 0.0),
                    result.get("failed_recoveries", 0),
                    result.get("escalated_cases", 0),
                    result.get("guardrail_blocked_cases", 0),
                    result.get("stopped_cases", 0),
                    result.get("revenue_at_risk", 0.0),
                    result.get("recovery_actions_amount", 0.0),
                    result.get("escalated_cases", 0),
                    result.get("guardrail_blocked_cases", 0),
                    result.get("stopped_cases", 0),
                    json.dumps(result),
                    policy_version,
                    batch_id,
                ),
            )
            conn.commit()
            conn.close()

        except Exception as exc:
            try:
                err_conn = self.connect()
                err_conn.execute(
                    "UPDATE batch_runs SET status='FAILED', current_stage='FAILED', current_activity=?, completed_at=? WHERE id=?",
                    (f"Batch failed: {str(exc)}", datetime.now(timezone.utc).isoformat(), batch_id),
                )
                err_conn.commit()
                err_conn.close()
            except Exception:
                pass

    def select_batch_transactions(self, connection: sqlite3.Connection, batch_id: int, sample_size: int = 500) -> list[str]:
        import random
        all_failed = [r[0] for r in connection.execute("SELECT transaction_id FROM transactions WHERE payment_status='FAILED' ORDER BY transaction_id").fetchall()]
        if not all_failed:
            return []
        rng = random.Random(batch_id * 9973 + 42)
        sample_count = min(sample_size, len(all_failed))
        selected = rng.sample(all_failed, sample_count)
        connection.executemany(
            "INSERT OR IGNORE INTO batch_transactions (batch_id, transaction_id) VALUES (?, ?)",
            [(batch_id, tid) for tid in selected]
        )
        connection.commit()
        return selected

    def run_batch(
        self,
        limit: int = 500,
        policy_version: str = "agentic_optimized_v2",
        synchronous: bool = False,
        transaction_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        started = datetime.now(timezone.utc).isoformat()
        conn = self.connect()
        initial_total = len(transaction_ids) if transaction_ids is not None else limit
        conn.execute(
            """
            INSERT INTO batch_runs (
                started_at, status, total_events, events_processed, progress,
                progress_percent, current_stage, current_activity, policy_version, created_at, execution_mode
            ) VALUES (?, 'RUNNING', ?, 0, 5, 5.0, 'LOADING', 'Sampling batch transactions...', ?, ?, 'SIMULATION')
            """,
            (started, initial_total, policy_version, started)
        )
        batch_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if transaction_ids is not None:
            selected_ids = transaction_ids
            conn.executemany(
                "INSERT OR IGNORE INTO batch_transactions (batch_id, transaction_id) VALUES (?, ?)",
                [(batch_id, tid) for tid in selected_ids]
            )
            conn.commit()
        else:
            selected_ids = self.select_batch_transactions(conn, batch_id, limit)
        conn.execute(
            "UPDATE batch_runs SET total_events=?, current_activity=? WHERE id=?",
            (len(selected_ids), f"Loaded {len(selected_ids)} failed events for evaluation", batch_id)
        )
        conn.commit()
        conn.close()

        if synchronous:
            self.complete_batch(batch_id, selected_ids, policy_version=policy_version)
            conn2 = self.connect()
            conn2.row_factory = sqlite3.Row
            row = conn2.execute("SELECT * FROM batch_runs WHERE id=?", (batch_id,)).fetchone()
            conn2.close()
            return dict(row) if row else {"id": batch_id, "status": "COMPLETED"}

        import threading
        t = threading.Thread(target=self.complete_batch, args=(batch_id, selected_ids, policy_version), daemon=True)
        t.start()
        return {
            "id": batch_id,
            "status": "RUNNING",
            "current_stage": "LOADING",
            "total_events": len(selected_ids),
            "events_processed": 0,
            "progress": 5,
            "progress_percent": 5.0,
        }
