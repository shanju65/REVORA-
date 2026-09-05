"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "./agent-components";
import { StatusPill } from "./branding";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function CustomerDirectoryView({
  onSelectCustomer,
  onOpenCopilot,
}: {
  onSelectCustomer: (customerId: string, status?: string) => void;
  onOpenCopilot?: (customerId: string) => void;
}) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter === "RECOVERY" ? "RECOVERING" : statusFilter);
      }
      const res = await fetch(`${API}/api/customers?${params}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      // Backend offline or error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers();
  };

  return (
    <div className="panel customer-directory-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow orange">PORTFOLIO INTELLIGENCE</div>
          <h2>Customer 360 Directory</h2>
          <p className="panel-copy">
            Continuous health monitoring, payment reliability scores, and historical recovery profiles across cardholders and accounts.
          </p>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            className="search"
            placeholder="Search customer ID or segment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
          <button type="submit" className="batch-button" style={{ padding: "9px 14px" }}>
            Search
          </button>
        </form>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {["ALL", "HEALTHY", "AT_RISK", "RECOVERY", "ESCALATED"].map((st) => (
            <button
              key={st}
              className={`filter-chip ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st.replace("_", " ")}
            </button>
          ))}
          <button className="refresh-btn" onClick={loadCustomers} style={{ marginLeft: 6 }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer ID</th>
              <th>Segment</th>
              <th>Health Status</th>
              <th>Total Payments</th>
              <th>Failed</th>
              <th>Total Volume</th>
              <th>Recovered Volume</th>
              <th>Success Rate</th>
              <th>Last Payment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  Loading customer profiles...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No customer records match the criteria.
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const cSt = c.status === "RECOVERING" ? "RECOVERY" : c.status;
                return (
                  <tr key={c.customer_id} onClick={() => onSelectCustomer(c.customer_id, cSt)}>
                    <td>
                      <b style={{ fontFamily: "'DM Mono', monospace", color: "var(--ink)" }}>{c.customer_id}</b>
                    </td>
                    <td>
                      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                        {c.customer_segment || "GROWTH"}
                      </span>
                    </td>
                    <td>
                      <StatusPill status={cSt} size="sm" />
                    </td>
                    <td>
                      <b>{c.total_payments}</b>
                    </td>
                    <td>
                      <span style={{ color: c.failed_payments > 0 ? "#a34a4a" : "var(--muted)", fontWeight: 600 }}>
                        {c.failed_payments}
                      </span>
                    </td>
                    <td>
                      <b style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(c.total_volume)}</b>
                    </td>
                    <td>
                      <b style={{ fontFamily: "'DM Mono', monospace", color: "var(--green)" }}>
                        {formatMoney(c.recovered_volume)}
                      </b>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: c.success_rate >= 80 ? "var(--green)" : "#d97706" }}>
                        {c.success_rate}%
                      </span>
                    </td>
                    <td>
                      <small style={{ color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                        {c.last_payment_date ? c.last_payment_date.slice(0, 10) : "N/A"}
                      </small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCustomer(c.customer_id, cSt);
                        }}
                        style={{ fontSize: 11 }}
                      >
                        Inspect 360 →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomerDetailView({
  customerId,
  initialStatusFilter = "ALL",
  onBack,
  onOpenCase,
  onOpenCopilot,
}: {
  customerId: string;
  initialStatusFilter?: string;
  onBack: () => void;
  onOpenCase: (transactionId: string) => void;
  onOpenCopilot?: (customerId: string) => void;
}) {
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timeline" | "performance" | "cases">("timeline");
  const [transactionFilter, setTransactionFilter] = useState<string>(initialStatusFilter || "ALL");

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/customers/${customerId}`);
        const data = await res.json();
        setProfile(data);
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    if (customerId) fetchProfile();
  }, [customerId]);

  if (loading) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <div className="eyebrow orange">CUSTOMER 360</div>
        <p style={{ color: "var(--muted)" }}>Loading Customer 360 profile for {customerId}...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Customer record not found.</p>
        <button className="batch-button" onClick={onBack}>
          ← Back to Directory
        </button>
      </div>
    );
  }

  const allTransactions = profile?.all_transactions || profile?.payment_history || profile?.timeline || [];
  const allCases = profile?.all_cases || profile?.recovery_cases || [];

  const getTxCount = (st: string) => {
    if (st === "ALL") return allTransactions.length;
    const target = st === "RECOVERY" ? "RECOVERING" : st;
    return allTransactions.filter((tx: any) => tx.health_status === target || tx.health_status === st).length;
  };

  const getCaseCount = (st: string) => {
    if (st === "ALL") return allCases.length;
    const target = st === "RECOVERY" ? "RECOVERING" : st;
    return allCases.filter((c: any) => c.case_health === target || c.case_health === st).length;
  };

  const filteredTimeline = allTransactions.filter((tx: any) => {
    if (transactionFilter === "ALL") return true;
    const target = transactionFilter === "RECOVERY" ? "RECOVERING" : transactionFilter;
    return tx.health_status === target || tx.health_status === transactionFilter;
  });

  const filteredCases = allCases.filter((c: any) => {
    if (transactionFilter === "ALL") return true;
    const target = transactionFilter === "RECOVERY" ? "RECOVERING" : transactionFilter;
    return c.case_health === target || c.case_health === transactionFilter;
  });

  return (
    <div className="customer-detail-wrapper">
      {/* Header bar */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <button
              onClick={onBack}
              style={{ background: "none", border: 0, color: "var(--green)", font: "700 11px 'Manrope'", cursor: "pointer", padding: 0, marginBottom: 8 }}
            >
              ← Back to Customer Directory
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.03em" }}>{profile.customer_id}</h2>
              <StatusPill status={profile.status === "RECOVERING" ? "RECOVERY" : profile.status} />
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", background: "#eef4f1", padding: "4px 8px", borderRadius: 4 }}>
                Segment: {profile.customer_segment}
              </span>
            </div>
            <p className="panel-copy" style={{ margin: "6px 0 0" }}>
              Customer 360 historical telemetry, empirical action efficiency matrix, and payment event log.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {onOpenCopilot && (
              <button
                className="batch-button"
                onClick={() => onOpenCopilot(profile.customer_id)}
                style={{ background: "var(--navy)", boxShadow: "none" }}
              >
                Ask Copilot about {profile.customer_id} 💬
              </button>
            )}
          </div>
        </div>

        {/* Quick KPI stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginTop: 18, marginBottom: 0 }}>
          <div className="stat-card" style={{ minHeight: 90 }}>
            <span className="stat-label">TOTAL VOLUME</span>
            <strong style={{ fontSize: 18 }}>{formatMoney(profile.total_volume)}</strong>
            <small>{profile.total_transactions} lifetime payments</small>
          </div>
          <div className="stat-card" style={{ minHeight: 90, borderTopColor: "var(--green)" }}>
            <span className="stat-label">RECOVERED REVENUE</span>
            <strong style={{ fontSize: 18, color: "var(--green)" }}>{formatMoney(profile.recovered_amount)}</strong>
            <small>Across active recovery cases</small>
          </div>
          <div className="stat-card" style={{ minHeight: 90, borderTopColor: "var(--orange)" }}>
            <span className="stat-label">RECOVERY RATE</span>
            <strong style={{ fontSize: 18, color: "var(--orange)" }}>{profile.recovery_rate_pct}%</strong>
            <small>Recovery efficiency</small>
          </div>
          <div className="stat-card" style={{ minHeight: 90, borderTopColor: profile.success_rate >= 80 ? "#51b889" : "#d87979" }}>
            <span className="stat-label">SUCCESS RATE</span>
            <strong style={{ fontSize: 18 }}>{profile.success_rate}%</strong>
            <small>{profile.successful_payments} successful txns</small>
          </div>
          <div className="stat-card" style={{ minHeight: 90, borderTopColor: profile.failed_transactions > 0 ? "#d87979" : "#51b889" }}>
            <span className="stat-label">FAILED TXNS</span>
            <strong style={{ fontSize: 18, color: profile.failed_transactions > 0 ? "#a34a4a" : "var(--ink)" }}>
              {profile.failed_transactions}
            </strong>
            <small>Total payment exceptions</small>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          className={`filter-chip ${activeTab === "timeline" ? "active" : ""}`}
          onClick={() => setActiveTab("timeline")}
          style={{ padding: "8px 16px", fontSize: 11 }}
        >
          Payment Timeline ({filteredTimeline.length}{transactionFilter !== "ALL" ? ` / ${allTransactions.length}` : ""})
        </button>
        <button
          className={`filter-chip ${activeTab === "performance" ? "active" : ""}`}
          onClick={() => setActiveTab("performance")}
          style={{ padding: "8px 16px", fontSize: 11 }}
        >
          Action Performance Matrix ({profile.action_performance?.length || 0})
        </button>
        <button
          className={`filter-chip ${activeTab === "cases" ? "active" : ""}`}
          onClick={() => setActiveTab("cases")}
          style={{ padding: "8px 16px", fontSize: 11 }}
        >
          Recovery Cases ({filteredCases.length}{transactionFilter !== "ALL" ? ` / ${allCases.length}` : ""})
        </button>
      </div>

      {/* Tab 1: Payment Timeline */}
      {activeTab === "timeline" && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">CHRONOLOGICAL EVENT STREAM</div>
              <h3>Payment History</h3>
              <p className="panel-copy">
                Detailed transaction audit log with deterministic health status attribution.
              </p>
            </div>
          </div>

          {/* Status Filter Toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>
                Filter By Health:
              </span>
              {["ALL", "HEALTHY", "AT_RISK", "RECOVERY", "ESCALATED"].map((st) => {
                const count = getTxCount(st);
                return (
                  <button
                    key={st}
                    className={`filter-chip ${transactionFilter === st ? "active" : ""}`}
                    onClick={() => setTransactionFilter(st)}
                    style={{ fontSize: 11, padding: "5px 11px" }}
                  >
                    {st.replace("_", " ")} ({count})
                  </button>
                );
              })}
            </div>
            {transactionFilter !== "ALL" && (
              <button
                className="text-button"
                onClick={() => setTransactionFilter("ALL")}
                style={{ fontSize: 11 }}
              >
                Reset Filter (Show All)
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Payment Status</th>
                  <th>Health Status</th>
                  <th>Failure Reason</th>
                  <th>Retries</th>
                  <th>Customer Prior Success</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                      No transactions found matching status <b>{transactionFilter}</b> for this customer.
                    </td>
                  </tr>
                ) : (
                  filteredTimeline.map((tx: any) => {
                    const hStatus = tx.health_status === "RECOVERING" ? "RECOVERY" : (tx.health_status || (tx.payment_status === "SUCCESS" ? "HEALTHY" : "AT_RISK"));
                    return (
                      <tr key={tx.transaction_id}>
                        <td>
                          <b style={{ fontFamily: "'DM Mono', monospace" }}>{tx.transaction_id}</b>
                        </td>
                        <td>
                          <b style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(tx.amount)}</b>
                        </td>
                        <td>
                          <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{tx.payment_method}</span>
                        </td>
                        <td>
                          <span className={`tag ${tx.payment_status === "SUCCESS" ? "approved" : "stopped"}`}>
                            {tx.payment_status}
                          </span>
                        </td>
                        <td>
                          <StatusPill status={hStatus} size="sm" />
                        </td>
                        <td>
                          <span className="reason" style={{ fontSize: 10 }}>
                            {tx.failure_reason || "None (Success)"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{tx.retry_count || 0}/2</span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                            {Math.round((tx.customer_success_rate || 0) * 100)}%
                          </span>
                        </td>
                        <td>
                          <small style={{ fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>
                            {tx.timestamp ? tx.timestamp.replace("T", " ").slice(0, 19) : "N/A"}
                          </small>
                        </td>
                        <td>
                          {tx.payment_status === "FAILED" && (
                            <button className="text-button" onClick={() => onOpenCase(tx.transaction_id)}>
                              Inspect Case →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Action Performance Matrix */}
      {activeTab === "performance" && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow orange">EMPIRICAL ACTION AFFINITY</div>
              <h3>Action Performance Breakdown for {profile.customer_id}</h3>
              <p className="panel-copy">
                Shows which autonomous interventions have historically succeeded or failed for this customer, helping the AI tune timing and outreach.
              </p>
            </div>
          </div>
          {profile.action_performance && profile.action_performance.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {profile.action_performance.map((act: any) => (
                <div
                  key={act.action}
                  style={{
                    background: "#f8fbf8",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: 16,
                    borderTop: "3px solid " + (act.success_rate >= 50 ? "var(--green)" : "var(--orange)"),
                  }}
                >
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>
                    {act.action}
                  </span>
                  <div style={{ margin: "10px 0 4px", fontSize: 22, fontWeight: 800, color: act.success_rate >= 50 ? "var(--green)" : "var(--orange)" }}>
                    {act.success_rate}% Success
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>Attempts: {act.attempts}</span>
                    <span>Successful: {act.successful}</span>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 10, color: "var(--green)", fontWeight: 700 }}>
                    Recovered: {formatMoney(act.recovered_amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No recovery actions have been dispatched for this customer yet.
            </p>
          )}
        </div>
      )}

      {/* Tab 3: Recovery Cases */}
      {activeTab === "cases" && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">ACTIVE & RESOLVED CASES</div>
              <h3>Recovery Cases for {profile.customer_id}</h3>
              <p className="panel-copy">
                Intervention history, policy approvals, and outcome disposition.
              </p>
            </div>
          </div>

          {/* Status Filter Toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10, padding: "10px 14px", background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>
                Filter Cases:
              </span>
              {["ALL", "HEALTHY", "AT_RISK", "RECOVERY", "ESCALATED"].map((st) => {
                const count = getCaseCount(st);
                return (
                  <button
                    key={st}
                    className={`filter-chip ${transactionFilter === st ? "active" : ""}`}
                    onClick={() => setTransactionFilter(st)}
                    style={{ fontSize: 11, padding: "5px 11px" }}
                  >
                    {st.replace("_", " ")} ({count})
                  </button>
                );
              })}
            </div>
            {transactionFilter !== "ALL" && (
              <button
                className="text-button"
                onClick={() => setTransactionFilter("ALL")}
                style={{ fontSize: 11 }}
              >
                Reset Filter (Show All)
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Amount</th>
                  <th>Case Health</th>
                  <th>Diagnosis</th>
                  <th>Recommendation</th>
                  <th>Guardrail Status</th>
                  <th>Final Action</th>
                  <th>Outcome</th>
                  <th>Recovered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
                      No recovery cases found matching status <b>{transactionFilter}</b> for this customer.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c: any) => {
                    const cStatus = c.case_health === "RECOVERING" ? "RECOVERY" : (c.case_health || "RECOVERY");
                    return (
                      <tr key={c.transaction_id} onClick={() => onOpenCase(c.transaction_id)}>
                        <td>
                          <b style={{ fontFamily: "'DM Mono', monospace" }}>{c.transaction_id}</b>
                        </td>
                        <td>
                          <b style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(c.amount)}</b>
                        </td>
                        <td>
                          <StatusPill status={cStatus} size="sm" />
                        </td>
                        <td>
                          <span style={{ fontSize: 10 }}>{c.diagnosis}</span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{c.recommendation}</span>
                        </td>
                        <td>
                          <span className={`tag ${c.guardrail_status?.toLowerCase()}`}>{c.guardrail_status}</span>
                        </td>
                        <td>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{c.final_action}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: c.outcome === "SUCCESS" ? "var(--green)" : "#a34a4a" }}>
                            {c.outcome}
                          </span>
                        </td>
                        <td>
                          <b style={{ fontFamily: "'DM Mono', monospace", color: "var(--green)" }}>
                            {formatMoney(c.recovered_amount)}
                          </b>
                        </td>
                        <td>
                          <button className="text-button" onClick={() => onOpenCase(c.transaction_id)}>
                            View Details →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
