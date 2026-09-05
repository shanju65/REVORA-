"""
Customer 360 Service for Revora.

Aggregates operational customer state across transactions, recovery cases, and human review queue.
Provides deterministic customer health status: HEALTHY, AT_RISK, RECOVERING, ESCALATED.
Exposes payment history timelines and empirical recovery action performance.
"""
from datetime import datetime, timezone
import sqlite3
from typing import Any, Callable


class CustomerService:
    def __init__(self, connect_fn: Callable[[], sqlite3.Connection]) -> None:
        self.connect = connect_fn

    def determine_status(
        self,
        has_escalation: bool,
        has_pending_recovery: bool,
        failed_count: int,
        success_rate: float,
    ) -> str:
        """Assigns deterministic operational status based on real customer state."""
        if has_escalation:
            return "ESCALATED"
        if has_pending_recovery:
            return "RECOVERING"
        if failed_count > 0 and success_rate < 0.70:
            return "AT_RISK"
        return "HEALTHY"

    def list_customers(
        self,
        search: str | None = None,
        status_filter: str | None = None,
        segment_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conn = self.connect()
        conn.row_factory = sqlite3.Row

        open_escalations_sql = """
            SELECT DISTINCT customer_id FROM human_queue
            UNION
            SELECT DISTINCT t_esc.customer_id 
            FROM recovery_cases c_esc 
            JOIN transactions t_esc ON t_esc.transaction_id = c_esc.transaction_id 
            WHERE c_esc.outcome = 'ESCALATED' OR c_esc.final_action = 'ESCALATE_TO_HUMAN'
        """

        pending_recoveries_sql = """
            SELECT DISTINCT t_rec.customer_id
            FROM recovery_cases c_rec
            JOIN transactions t_rec ON t_rec.transaction_id = c_rec.transaction_id
            WHERE c_rec.final_action IN ('RETRY_LATER', 'RETRY_NOW', 'CONTACT_CUSTOMER')
               OR c_rec.outcome = 'PENDING'
        """

        target_status: str | None = None
        if status_filter and status_filter.strip().upper() not in ("ALL", ""):
            st = status_filter.strip().upper()
            target_status = "RECOVERING" if st in ("RECOVERY", "RECOVERING") else st

        query = """
        SELECT
            t.customer_id,
            COUNT(t.transaction_id) AS total_payments,
            SUM(CASE WHEN t.payment_status = 'SUCCESS' THEN 1 ELSE 0 END) AS successful_payments,
            SUM(CASE WHEN t.payment_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_payments,
            SUM(t.amount) AS total_volume,
            MAX(t.timestamp) AS last_payment_date,
            COALESCE(MAX(t.customer_segment), 'STANDARD') AS customer_segment,
            COALESCE(MAX(t.customer_success_rate), 0.85) AS historical_rate
        FROM transactions t
        WHERE 1=1
        """
        params: list[Any] = []
        if search:
            query += " AND (t.customer_id LIKE ? OR t.customer_segment LIKE ?)"
            term = f"%{search.strip()}%"
            params.extend([term, term])
        if segment_filter:
            query += " AND t.customer_segment = ?"
            params.append(segment_filter.strip())

        if target_status == "ESCALATED":
            query += f" AND t.customer_id IN ({open_escalations_sql})"
        elif target_status == "RECOVERING":
            query += f" AND t.customer_id IN ({pending_recoveries_sql}) AND t.customer_id NOT IN ({open_escalations_sql})"
        elif target_status == "AT_RISK":
            query += f" AND t.customer_id NOT IN ({open_escalations_sql}) AND t.customer_id NOT IN ({pending_recoveries_sql})"
        elif target_status == "HEALTHY":
            query += f" AND t.customer_id NOT IN ({open_escalations_sql}) AND t.customer_id NOT IN ({pending_recoveries_sql})"

        query += " GROUP BY t.customer_id"

        if target_status == "AT_RISK":
            query += " HAVING failed_payments > 0 AND (CAST(successful_payments AS REAL) / total_payments) < 0.70"
        elif target_status == "HEALTHY":
            query += " HAVING failed_payments = 0 OR (CAST(successful_payments AS REAL) / total_payments) >= 0.70"

        query += " ORDER BY total_volume DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()

        # Gather escalated and recovering customers for memory check
        open_escalations = {r[0] for r in conn.execute(open_escalations_sql).fetchall()}
        pending_by_customer = {r[0] for r in conn.execute(pending_recoveries_sql).fetchall()}

        # Gather recovered amounts per customer
        recovered_by_customer = {
            r[0]: float(r[1] or 0.0)
            for r in conn.execute(
                """
                SELECT t.customer_id, SUM(c.recovered_amount)
                FROM recovery_cases c
                JOIN transactions t ON t.transaction_id = c.transaction_id
                WHERE c.outcome = 'SUCCESS'
                GROUP BY t.customer_id
                """
            ).fetchall()
        }

        conn.close()

        customers = []
        for r in rows:
            cid = r["customer_id"]
            tot = r["total_payments"] or 0
            succ = r["successful_payments"] or 0
            failed = r["failed_payments"] or 0
            vol = round(float(r["total_volume"] or 0.0), 2)
            rec_vol = round(recovered_by_customer.get(cid, 0.0), 2)
            rate = round((succ / tot) * 100, 1) if tot > 0 else 100.0

            status = self.determine_status(
                has_escalation=(cid in open_escalations),
                has_pending_recovery=(cid in pending_by_customer),
                failed_count=failed,
                success_rate=(succ / tot) if tot > 0 else 1.0,
            )

            # Strict guardrail: guarantee returned customers strictly match target status
            if target_status and status != target_status:
                continue

            customers.append({
                "customer_id": cid,
                "customer_segment": r["customer_segment"],
                "total_payments": tot,
                "successful_payments": succ,
                "failed_payments": failed,
                "total_volume": vol,
                "recovered_volume": rec_vol,
                "success_rate": rate,
                "status": status,
                "last_payment_date": r["last_payment_date"],
            })

        return customers

    def get_customer_profile(self, customer_id: str, status_filter: str | None = None) -> dict[str, Any] | None:
        conn = self.connect()
        conn.row_factory = sqlite3.Row

        tx_rows = conn.execute(
            """
            SELECT * FROM transactions
            WHERE customer_id = ?
            ORDER BY timestamp DESC
            LIMIT 100
            """,
            (customer_id,),
        ).fetchall()

        if not tx_rows:
            conn.close()
            return None

        transactions = [dict(r) for r in tx_rows]
        tot = len(transactions)
        succ = sum(1 for t in transactions if t.get("payment_status") == "SUCCESS")
        failed = sum(1 for t in transactions if t.get("payment_status") == "FAILED")
        total_vol = round(sum(float(t.get("amount") or 0.0) for t in transactions), 2)

        # Recovery cases for this customer
        cases_rows = conn.execute(
            """
            SELECT c.*, t.amount, t.failure_reason, t.payment_method
            FROM recovery_cases c
            JOIN transactions t ON t.transaction_id = c.transaction_id
            WHERE t.customer_id = ?
            ORDER BY c.analyzed_at DESC
            """,
            (customer_id,),
        ).fetchall()
        cases = [dict(c) for c in cases_rows]

        recovered_vol = round(
            sum(float(c.get("recovered_amount") or 0.0) for c in cases if c.get("outcome") == "SUCCESS"),
            2,
        )

        # Escalations in human queue or recovery cases
        escalations = conn.execute(
            "SELECT * FROM human_queue WHERE customer_id = ? ORDER BY created_at DESC",
            (customer_id,),
        ).fetchall()
        has_open_escalation = (
            any(e["status"] == "OPEN" for e in escalations)
            or any(c.get("outcome") == "ESCALATED" or c.get("final_action") == "ESCALATE_TO_HUMAN" for c in cases)
        )
        has_pending = any(
            c.get("outcome") == "PENDING"
            or c.get("final_action") in ("RETRY_LATER", "RETRY_NOW", "CONTACT_CUSTOMER")
            for c in cases
        )

        # Index cases and escalations by transaction_id
        cases_by_tx = {}
        for c in cases:
            tid = c.get("transaction_id")
            if tid and tid not in cases_by_tx:
                cases_by_tx[tid] = c

        open_hq_tx = {
            e["transaction_id"] for e in escalations
            if e["status"] == "OPEN" and e.get("transaction_id")
        }

        # Tag each recovery case with case_health
        for c in cases:
            if c.get("outcome") == "ESCALATED" or c.get("final_action") == "ESCALATE_TO_HUMAN":
                c["case_health"] = "ESCALATED"
            elif c.get("final_action") in ("RETRY_LATER", "RETRY_NOW", "CONTACT_CUSTOMER"):
                c["case_health"] = "RECOVERING"
            elif c.get("outcome") == "SUCCESS":
                c["case_health"] = "HEALTHY"
            else:
                c["case_health"] = "AT_RISK"

        # Deterministically tag every transaction with its operational health status
        for t in transactions:
            tid = t.get("transaction_id")
            c = cases_by_tx.get(tid)
            is_esc = (
                (c and (c.get("outcome") == "ESCALATED" or c.get("final_action") == "ESCALATE_TO_HUMAN"))
                or (tid in open_hq_tx)
            )
            is_rec = (
                not is_esc
                and c
                and (
                    c.get("final_action") in ("RETRY_LATER", "RETRY_NOW", "CONTACT_CUSTOMER")
                    or c.get("outcome") in ("PENDING", "SUCCESS")
                )
            )
            if is_esc:
                t["health_status"] = "ESCALATED"
            elif is_rec:
                t["health_status"] = "RECOVERING"
            elif t.get("payment_status") == "SUCCESS":
                t["health_status"] = "HEALTHY"
            else:
                t["health_status"] = "AT_RISK"

        # Action performance breakdown
        action_stats: dict[str, dict[str, Any]] = {}
        for c in cases:
            act = c.get("final_action") or c.get("recommendation") or "UNKNOWN"
            if act not in action_stats:
                action_stats[act] = {"action": act, "attempts": 0, "successful": 0, "recovered": 0.0}
            action_stats[act]["attempts"] += 1
            if c.get("outcome") == "SUCCESS":
                action_stats[act]["successful"] += 1
                action_stats[act]["recovered"] += float(c.get("recovered_amount") or 0.0)

        action_performance = []
        for act, data in action_stats.items():
            att = data["attempts"]
            s = data["successful"]
            success_pct = round((s / att) * 100, 1) if att > 0 else 0.0
            action_performance.append({
                "action": act,
                "attempts": att,
                "successful": s,
                "success_rate": success_pct,
                "recovered_amount": round(data["recovered"], 2),
            })

        action_performance.sort(key=lambda x: x["attempts"], reverse=True)

        rate = round((succ / tot) * 100, 1) if tot > 0 else 100.0
        status = self.determine_status(
            has_escalation=has_open_escalation,
            has_pending_recovery=has_pending,
            failed_count=failed,
            success_rate=(succ / tot) if tot > 0 else 1.0,
        )

        # Contextual priors for AI reasoning
        best_action = action_performance[0]["action"] if action_performance else "RETRY_NOW"
        contextual_priors = {
            "customer_id": customer_id,
            "lifetime_transactions": tot,
            "historical_success_rate": round(succ / tot, 3) if tot > 0 else 0.85,
            "recovery_prone_action": best_action,
            "status": status,
        }

        conn.close()

        # Handle status filtering if requested
        target_status: str | None = None
        if status_filter and status_filter.strip().upper() not in ("ALL", ""):
            st = status_filter.strip().upper()
            target_status = "RECOVERING" if st in ("RECOVERY", "RECOVERING") else st

        filtered_transactions = transactions
        filtered_cases = cases
        if target_status:
            filtered_transactions = [t for t in transactions if t.get("health_status") == target_status]
            filtered_cases = [c for c in cases if c.get("case_health") == target_status]

        return {
            "customer_id": customer_id,
            "customer_segment": transactions[0].get("customer_segment") or "GROWTH",
            "status": status,
            "total_payments": tot,
            "total_transactions": tot,
            "successful_payments": succ,
            "failed_payments": failed,
            "failed_transactions": failed,
            "total_volume": total_vol,
            "recovered_volume": recovered_vol,
            "recovered_amount": recovered_vol,
            "success_rate": rate,
            "recovery_rate_pct": round((recovered_vol / max(1.0, sum(float(c.get("amount") or 0.0) for c in cases))) * 100, 1) if cases else 0.0,
            "last_payment_date": transactions[0].get("timestamp"),
            "payment_history": transactions,
            "timeline": filtered_transactions,
            "all_transactions": transactions,
            "recovery_cases": filtered_cases,
            "all_cases": cases,
            "action_performance": action_performance,
            "contextual_priors": contextual_priors,
        }
