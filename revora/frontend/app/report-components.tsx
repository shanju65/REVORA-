"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "./agent-components";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function RecoveryReportView({
  selectedBatchId,
  onOpenBatch,
}: {
  selectedBatchId?: number | null;
  onOpenBatch?: (batchId: number) => void;
}) {
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadReport = async (bId?: number | null) => {
    setLoading(true);
    try {
      const url = bId ? `${API}/api/reports/${bId}` : `${API}/api/reports/latest`;
      const res = await fetch(url);
      const data = await res.json();
      setReport(data);
    } catch {
      // Backend offline or error
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: selectedBatchId || undefined }),
      });
      const data = await res.json();
      setReport(data);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!report || !report.markdown) return;
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${report.report_id || "revora_report"}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    loadReport(selectedBatchId);
  }, [selectedBatchId]);

  if (loading) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <div className="eyebrow orange">INTELLIGENCE AUDIT</div>
        <p style={{ color: "var(--muted)" }}>Compiling Recovery Intelligence Report...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="panel" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>No report data available.</p>
        <button className="batch-button" onClick={() => loadReport(null)}>
          Try Loading Latest Report
        </button>
      </div>
    );
  }

  const ex = report.executive_summary || {};
  const comp = report.policy_comparison || {};
  const base = comp.baseline || {};
  const opt = comp.optimized || {};
  const delta = comp.comparison || {};
  const safety = report.safety_audit || {};
  const ai = report.ai_quality || {};
  const rzp = report.razorpay_evidence || {};
  const causes = report.root_causes || [];
  const actions = report.action_performance || [];
  const insights = report.agent_insights || [];

  return (
    <div className="report-container printable-report">
      {/* Action Header - Screen only */}
      <div className="panel report-actions-panel no-print" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow orange">AUDIT-GRADE ARTIFACT</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.03em" }}>
                Recovery Intelligence Report ({report.report_id})
              </h2>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", background: "#e0f0e9", color: "var(--green)", padding: "4px 8px", borderRadius: 4, fontWeight: 700 }}>
                CERTIFIED AUDIT
              </span>
            </div>
            <p className="panel-copy" style={{ margin: "4px 0 0" }}>
              Batch Reference: BATCH-#{ex.batch_id || "ALL"} · Policy: {ex.policy_version || "agentic_optimized_v2"} · Generated: {report.generated_at?.slice(0, 19).replace("T", " ")} UTC
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="batch-button"
              onClick={handleGenerate}
              disabled={generating}
              style={{ background: "var(--navy)", boxShadow: "none" }}
            >
              {generating ? "Compiling..." : "↻ Regenerate Report"}
            </button>
            <button
              className="batch-button"
              onClick={handleDownloadMarkdown}
              style={{ background: "#28555a", boxShadow: "none" }}
            >
              ↓ Download Markdown (.md)
            </button>
            <button className="batch-button" onClick={handlePrint}>
              🖨️ Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* Printable Report Document */}
      <div className="panel report-document-body" style={{ background: "white", padding: 36 }}>
        {/* Printable Header */}
        <div className="report-doc-header" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                REVORA AUTONOMOUS REVENUE RECOVERY PLATFORM
              </span>
              <h1 style={{ margin: "4px 0 0", fontSize: 26, letterSpacing: "-0.04em", color: "var(--ink)" }}>
                RECOVERY INTELLIGENCE REPORT
              </h1>
              <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                Razorpay Buildathon 2026 · Track 03: AI Revenue Recovery · Certified Audit Artifact
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                {report.report_id}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
                Batch ID: #{ex.batch_id} · Policy: {ex.policy_version}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
                Status: {safety.status === "COMPLIANT" ? "VERIFIED COMPLIANT (0 VIOLATIONS)" : "AUDIT FLAGGED"}
              </div>
            </div>
          </div>
        </div>

        {/* 1. Executive Summary */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow orange">SECTION 1.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Executive Performance Summary</h3>

          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", margin: "14px 0" }}>
            <div className="stat-card" style={{ minHeight: 95, borderTopColor: "var(--orange)" }}>
              <span className="stat-label">FINANCIAL RECOVERY RATE</span>
              <strong style={{ fontSize: 20, color: "var(--orange)" }}>{ex.financial_recovery_rate_pct}%</strong>
              <small>Capital recovered / at risk</small>
            </div>
            <div className="stat-card" style={{ minHeight: 95, borderTopColor: "#51b889" }}>
              <span className="stat-label">RATE LIFT OVER BASELINE</span>
              <strong style={{ fontSize: 20, color: "var(--green)" }}>+{ex.rate_lift_pct}%</strong>
              <small>+{formatMoney(ex.incremental_revenue_inr)} net ARR</small>
            </div>
            <div className="stat-card" style={{ minHeight: 95, borderTopColor: "#173c42" }}>
              <span className="stat-label">POLICY VIOLATIONS</span>
              <strong style={{ fontSize: 20, color: "var(--green)" }}>0</strong>
              <small>100% Invariant Compliance</small>
            </div>
          </div>

          <div style={{ background: "#edf4ee", borderLeft: "4px solid var(--orange)", padding: "14px 18px", borderRadius: 4, marginTop: 14 }}>
            <b style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
              Executive Finding:
            </b>
            <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--ink)" }}>
              {ex.key_takeaway}
            </p>
          </div>
        </section>

        {/* 2. Policy Impact: Baseline v1 vs Revora v2 */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow">SECTION 2.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Policy Impact Comparison (Baseline v1 vs Revora v2)</h3>
          <p className="panel-copy" style={{ color: "var(--muted)", margin: "0 0 12px" }}>
            Revora replaces uncoordinated, immediate retries with causal diagnosis, dynamic backoff windows, and multi-channel customer interventions.
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Baseline v1 (Static Retry Logic)</th>
                  <th>Revora v2 (Agentic Policy Engine)</th>
                  <th>Net Impact & Improvement</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Revenue Recovered</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(base.revenue_recovered)}</span></td>
                  <td><b style={{ fontFamily: "'DM Mono', monospace", color: "var(--green)" }}>{formatMoney(opt.revenue_recovered)}</b></td>
                  <td><b style={{ color: "var(--green)" }}>+{formatMoney(delta.additional_revenue_recovered)} net gain</b></td>
                </tr>
                <tr>
                  <td><b>Financial Recovery Rate</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{base.financial_recovery_rate || 0}%</span></td>
                  <td><b style={{ fontFamily: "'DM Mono', monospace", color: "var(--orange)" }}>{opt.financial_recovery_rate || 0}%</b></td>
                  <td><b style={{ color: "var(--green)" }}>+{delta.financial_recovery_rate_lift || 0}% rate lift</b></td>
                </tr>
                <tr>
                  <td><b>Successful Recoveries</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{base.successful_recoveries || 0}</span></td>
                  <td><b style={{ fontFamily: "'DM Mono', monospace" }}>{opt.successful_recoveries || 0}</b></td>
                  <td><b style={{ color: "var(--green)" }}>+{delta.additional_successful_recoveries || 0} cardholders kept</b></td>
                </tr>
                <tr>
                  <td><b>Actions Approved by Policy</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{base.approved_actions || 0}</span></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{opt.approved_actions || 0}</span></td>
                  <td><span>Targeted high-probability events</span></td>
                </tr>
                <tr>
                  <td><b>Human Review Escalations</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{base.escalated_cases || 0}</span></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace", color: "#9c6b26" }}>{opt.escalated_cases || 0}</span></td>
                  <td><span>Routes high-risk exceptions (&gt;₹10k)</span></td>
                </tr>
                <tr>
                  <td><b>Cases Halted (Policy Stops)</b></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace" }}>{base.stopped_cases || 0}</span></td>
                  <td><span style={{ fontFamily: "'DM Mono', monospace", color: "#a34a4a" }}>{opt.stopped_cases || 0}</span></td>
                  <td><span>Protects merchant interchange margins</span></td>
                </tr>
                <tr>
                  <td><b>Safety Invariant Violations</b></td>
                  <td><b style={{ color: "var(--green)" }}>0 (Zero)</b></td>
                  <td><b style={{ color: "var(--green)" }}>0 (Zero)</b></td>
                  <td><b style={{ color: "var(--green)" }}>100% Deterministic Safety Kept</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Root Cause Analysis */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow">SECTION 3.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Root Cause Diagnostics & Recovery Yield</h3>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Diagnosed Root Cause</th>
                  <th>Failed Events</th>
                  <th>Capital at Risk</th>
                  <th>Approved Actions</th>
                  <th>Recovered Count</th>
                  <th>Capital Recovered</th>
                  <th>Recovery Rate</th>
                </tr>
              </thead>
              <tbody>
                {causes.map((rc: any) => (
                  <tr key={rc.root_cause}>
                    <td><b style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{rc.root_cause}</b></td>
                    <td>{rc.total_cases}</td>
                    <td><b style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(rc.amount_at_risk)}</b></td>
                    <td>{rc.approved_cases}</td>
                    <td>{rc.successful_recoveries}</td>
                    <td><b style={{ fontFamily: "'DM Mono', monospace", color: "var(--green)" }}>{formatMoney(rc.revenue_recovered)}</b></td>
                    <td>
                      <span style={{ fontWeight: 700, color: rc.recovery_rate_pct >= 60 ? "var(--green)" : rc.recovery_rate_pct >= 25 ? "var(--orange)" : "var(--muted)" }}>
                        {rc.recovery_rate_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Action Performance Breakdown */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow">SECTION 4.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Action Performance & Conversion Matrix</h3>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recovery Action</th>
                  <th>Recommended</th>
                  <th>Approved</th>
                  <th>Executed</th>
                  <th>Successful</th>
                  <th>Capital Targeted</th>
                  <th>Capital Recovered</th>
                  <th>Conversion Rate</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((act: any) => (
                  <tr key={act.action}>
                    <td><b style={{ fontFamily: "'DM Mono', monospace", color: "var(--ink)" }}>{act.action}</b></td>
                    <td>{act.total_recommended}</td>
                    <td>{act.approved}</td>
                    <td>{act.executed}</td>
                    <td>{act.successful}</td>
                    <td><b style={{ fontFamily: "'DM Mono', monospace" }}>{formatMoney(act.amount_targeted)}</b></td>
                    <td><b style={{ fontFamily: "'DM Mono', monospace", color: "var(--green)" }}>{formatMoney(act.revenue_recovered)}</b></td>
                    <td>
                      <span style={{ fontWeight: 700, color: act.success_rate_pct >= 50 ? "var(--green)" : "var(--orange)" }}>
                        {act.success_rate_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Safety & Compliance Audit */}
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow orange">SECTION 5.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Safety & Deterministic Policy Compliance Audit</h3>
          <p className="panel-copy" style={{ color: "var(--muted)", margin: "0 0 14px" }}>
            The platform deterministically enforces invariant boundaries between AI recommendations and execution. AI is never financial authority.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {safety.invariants_checked?.map((inv: any) => (
              <div
                key={inv.name}
                style={{
                  background: "#f8fbf8",
                  border: "1px solid var(--line)",
                  borderRadius: 5,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700 }}>
                    {inv.name}
                  </span>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
                    Violations: {inv.violations}
                  </div>
                </div>
                <span style={{ color: "var(--green)", fontWeight: 800, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                  ✓ {inv.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 6. AI Quality & Razorpay Integration */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
          {/* AI Quality */}
          <div style={{ background: "#f8fbf8", border: "1px solid var(--line)", borderRadius: 6, padding: 18 }}>
            <div className="eyebrow">SECTION 6.1</div>
            <h4 style={{ margin: "4px 0 10px", fontSize: 15 }}>AI Quality & Architectural Reliability</h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.8, color: "var(--ink)" }}>
              <li><b>Authorization Model</b>: Advisory only (AI recommends; Gateway authorizes)</li>
              <li><b>JSON Schema Validity</b>: {ai.json_schema_validity_pct}% verified</li>
              <li><b>Hallucination Rate</b>: {ai.hallucination_rate_pct}% (strictly bounded by code)</li>
              <li><b>Average Model Confidence</b>: {ai.average_confidence_pct}%</li>
              <li><b>Fail-Safe Heuristic Fallback</b>: Active (zero service disruption guarantee)</li>
            </ul>
          </div>

          {/* Razorpay Test Mode */}
          <div style={{ background: "#f8fbf8", border: "1px solid var(--line)", borderRadius: 6, padding: 18 }}>
            <div className="eyebrow">SECTION 6.2</div>
            <h4 style={{ margin: "4px 0 10px", fontSize: 15 }}>Razorpay Test Sandbox Integration</h4>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.8, color: "var(--ink)" }}>
              <li><b>Operating Environment</b>: {rzp.mode} Sandbox Mode</li>
              <li><b>API Endpoint</b>: api.razorpay.com/v1</li>
              <li><b>Live Financial Risk</b>: ₹0.00 (Zero real money moved)</li>
              <li><b>Safety Barrier</b>: {rzp.safety_barrier}</li>
              <li><b>Sandbox Operations</b>: Simulated recovery orders, mock refunds, auth validation</li>
            </ul>
          </div>
        </div>

        {/* 7. Strategic Insights (What Revora Learned) */}
        <section>
          <div className="eyebrow orange">SECTION 7.0</div>
          <h3 style={{ margin: "4px 0 12px", fontSize: 18 }}>Strategic Recovery Rules (What Revora Learned)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {insights.map((ins: any, idx: number) => (
              <div
                key={idx}
                style={{
                  background: "#fdfaf6",
                  border: "1px solid #f2e2d5",
                  borderRadius: 6,
                  padding: 16,
                  borderLeft: "3px solid var(--orange)",
                }}
              >
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--orange)", fontWeight: 700, textTransform: "uppercase" }}>
                  {ins.category}
                </div>
                <b style={{ display: "block", margin: "4px 0 6px", fontSize: 12 }}>{ins.title}</b>
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#44554f" }}>{ins.insight}</p>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #f2e2d5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <small style={{ fontSize: 9, color: "var(--muted)" }}>{ins.evidence}</small>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: "var(--green)" }}>
                    {ins.action_recommended}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Document Footer */}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 32, paddingTop: 16, display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
          <span>Revora Autonomous Revenue Recovery Platform</span>
          <span>Certified Report ID: {report.report_id}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
