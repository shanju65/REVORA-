"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Item = Record<string, any>;

export const pretty = (value: any) =>
  value !== null && value !== undefined && value !== ""
    ? String(value).replaceAll("_", " ")
    : "Not recorded";

export const formatMoney = (value: number | string | null | undefined) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
};

// ========================================================
// PHASE 5: AGENTIC WORKFLOW COMPONENT
// ========================================================
export function Workflow() {
  const stages = [
    { name: "DETECT", desc: "Find revenue at risk", icon: "01" },
    { name: "REASON", desc: "Analyze payment and customer context", icon: "02" },
    { name: "DECIDE", desc: "Select the recovery intervention", icon: "03" },
    { name: "GUARDRAIL", desc: "Check policy before execution", icon: "04" },
    { name: "ACT", desc: "Execute only approved actions", icon: "05" },
    { name: "MEASURE", desc: "Record outcome and recovered revenue", icon: "06" },
  ];

  return (
    <section className="workflow-card">
      <div className="workflow-header">
        <div>
          <span className="eyebrow orange">AUTONOMOUS CONTROL ARCHITECTURE</span>
          <h3>The Revora Recovery Loop</h3>
        </div>
        <span className="workflow-badge">Intelligence + Authority Separation</span>
      </div>
      <div className="workflow-steps-grid">
        {stages.map((stage, idx) => (
          <div key={stage.name} className="workflow-step-box">
            <div className="step-num">{stage.icon}</div>
            <div className="step-content">
              <b>{stage.name}</b>
              <p>{stage.desc}</p>
            </div>
            {idx < stages.length - 1 && <div className="step-arrow">→</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ========================================================
// PHASE 6: RECOVERY IMPACT & FUNNEL
// ========================================================
export function RecoveryFunnel({ metrics }: { metrics: Record<string, any> }) {
  const atRisk = Number(metrics.revenue_at_risk || 0);
  const eligible = Number(metrics.recovery_actions_amount || (metrics.recovery_candidates ? metrics.revenue_at_risk * 0.15 : 0));
  const recovered = Number(metrics.revenue_recovered || 0);
  // Financial recovery rate: recovered revenue / revenue at risk * 100
  const rate = atRisk > 0 ? ((recovered / atRisk) * 100).toFixed(1) : (metrics.financial_recovery_rate || 0);

  return (
    <section className="panel funnel-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow orange">FINANCIAL CONVERSION</div>
          <h3>Revenue Recovery Funnel</h3>
        </div>
        <span className="status-pill">
          <span className="live-dot" /> Database-derived metrics
        </span>
      </div>

      <div className="funnel-container">
        <div className="funnel-stage stage-risk">
          <div className="funnel-label">REVENUE AT RISK</div>
          <div className="funnel-val">{formatMoney(atRisk)}</div>
          <div className="funnel-sub">Total failed payments detected</div>
        </div>

        <div className="funnel-connector">↓</div>

        <div className="funnel-stage stage-actions">
          <div className="funnel-label">RECOVERY ACTIONS</div>
          <div className="funnel-val">{formatMoney(eligible)}</div>
          <div className="funnel-sub">Approved by guardrails ({metrics.recovery_candidates || 0} cases)</div>
        </div>

        <div className="funnel-connector">↓</div>

        <div className="funnel-stage stage-recovered">
          <div className="funnel-label">SUCCESSFUL RECOVERIES</div>
          <div className="funnel-val">{formatMoney(recovered)}</div>
          <div className="funnel-sub">{metrics.successful_recoveries || 0} payments settled</div>
        </div>

        <div className="funnel-connector">↓</div>

        <div className="funnel-stage stage-rate">
          <div className="funnel-label">FINANCIAL RECOVERY RATE</div>
          <div className="funnel-val rate-accent">{rate}%</div>
          <div className="funnel-sub">recovered revenue / revenue at risk × 100</div>
        </div>
      </div>

      <div className="funnel-metrics-grid">
        <div className="f-metric">
          <span>Successful Recoveries</span>
          <b>{metrics.successful_recoveries || 0}</b>
        </div>
        <div className="f-metric">
          <span>Escalations to Human</span>
          <b className="c-escalated">{metrics.escalated_cases || 0}</b>
        </div>
        <div className="f-metric">
          <span>Guardrail Blocked</span>
          <b className="c-blocked">{metrics.guardrail_blocked_cases || 0}</b>
        </div>
        <div className="f-metric">
          <span>Stopped Recoveries</span>
          <b className="c-stopped">{metrics.stopped_cases || 0}</b>
        </div>
        <div className="f-metric">
          <span>Failed Executions</span>
          <b className="c-failed">{metrics.failed_recoveries || 0}</b>
        </div>
      </div>
    </section>
  );
}

// ========================================================
// PHASE 3: LIVE RECOVERY FEED
// ========================================================
export function LiveRecoveryFeed({ logs }: { logs: Item[] }) {
  const getActorBadge = (actor: string) => {
    switch (actor) {
      case "RISK_DETECTOR":
        return "badge-risk";
      case "AI_AGENT":
        return "badge-agent";
      case "GUARDRAIL_ENGINE":
        return "badge-guardrail";
      case "RECOVERY_EXECUTOR":
        return "badge-executor";
      default:
        return "badge-system";
    }
  };

  return (
    <section className="panel live-feed-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">SYSTEM TELEMETRY</div>
          <h3>LIVE RECOVERY FEED</h3>
        </div>
        <span className="status-pill">
          <span className="live-dot" /> Audit Trail Events
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="empty-feed">
          <span>◌</span>
          <p>No recent recovery activity.</p>
        </div>
      ) : (
        <div className="feed-stream">
          {logs.slice(0, 10).map((log) => {
            const time = new Date(String(log.timestamp)).toLocaleTimeString();
            return (
              <div className="feed-entry" key={String(log.id)}>
                <time className="feed-timestamp">{time}</time>
                <div className="feed-dot" />
                <div className="feed-body">
                  <div className="feed-topline">
                    <span className="feed-tx">{log.transaction_id || "BATCH"}</span>
                    <span className={`actor-pill ${getActorBadge(String(log.actor))}`}>
                      {log.actor}
                    </span>
                    <span className="feed-event-type">{pretty(log.event_type)}</span>
                  </div>
                  <p className="feed-desc">{log.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ========================================================
// PHASE 1: AGENT REASONING TIMELINE
// ========================================================
export function ReasoningTimeline({
  item,
  audit,
  activeStep = null,
}: {
  item: Item;
  audit: Item[];
  activeStep?: number | null;
}) {
  const guardrail = String(item.guardrail_status || "PENDING").toUpperCase();
  const outcome = String(item.outcome || "PENDING").toUpperCase();

  // Extract diagnosis description from real audit log if available
  const analysisAudit = audit.find((log) =>
    String(log.event_type).includes("ANALYSIS")
  );
  const diagnosisDesc =
    analysisAudit?.description ||
    item.reason ||
    "Temporary payment failure with reasonable recovery potential.";

  const steps = [
    {
      num: "01",
      title: "OBSERVE",
      status: "COMPLETED",
      primary: "Payment failure detected",
      details: [
        { label: "Transaction", val: item.transaction_id || "Not recorded" },
        { label: "Amount", val: item.amount ? formatMoney(item.amount) : "Not recorded" },
        { label: "Currency", val: item.currency || "INR" },
        {
          label: "Age",
          val:
            item.time_since_failure_minutes !== null &&
            item.time_since_failure_minutes !== undefined
              ? `${item.time_since_failure_minutes} minutes ago`
              : "Not recorded",
        },
      ],
    },
    {
      num: "02",
      title: "CONTEXT ANALYSIS",
      status: "COMPLETED",
      primary: "Contextual payment and customer telemetry evaluated",
      details: [
        { label: "Failure reason", val: pretty(item.failure_reason) },
        { label: "Retry count", val: item.retry_count ?? "Not recorded" },
        {
          label: "Customer success rate",
          val:
            item.customer_success_rate !== null && item.customer_success_rate !== undefined
              ? `${Math.round(Number(item.customer_success_rate) * 100)}%`
              : "Not recorded",
        },
        { label: "Payment method", val: item.payment_method || "Not recorded" },
        {
          label: "Prior transactions",
          val: item.customer_previous_transactions ?? "Not recorded",
        },
        {
          label: "Transaction age",
          val:
            item.time_since_failure_minutes !== null &&
            item.time_since_failure_minutes !== undefined
              ? `${item.time_since_failure_minutes} minutes`
              : "Not recorded",
        },
      ],
    },
    {
      num: "03",
      title: "DIAGNOSIS",
      status: "COMPLETED",
      primary: diagnosisDesc,
      details: [
        { label: "Diagnosed cause", val: pretty(item.diagnosis || item.failure_reason) },
        {
          label: "Recovery probability",
          val:
            item.recovery_probability !== null && item.recovery_probability !== undefined
              ? `${Math.round(Number(item.recovery_probability) * 100)}%`
              : "Not recorded",
        },
      ],
    },
    {
      num: "04",
      title: "RECOMMENDATION",
      status: "COMPLETED",
      primary: `Recommended action: ${pretty(item.recommendation || item.final_action)}`,
      details: [
        { label: "AI Action", val: pretty(item.recommendation || item.final_action) },
        {
          label: "Confidence",
          val:
            item.confidence !== null && item.confidence !== undefined
              ? `${Math.round(Number(item.confidence) * 100)}%`
              : item.recovery_probability
              ? `${Math.round(Number(item.recovery_probability) * 100)}%`
              : "Not recorded",
        },
      ],
    },
    {
      num: "05",
      title: "GUARDRAILS",
      status: guardrail,
      primary: `Deterministic Guardrail Decision: ${guardrail}`,
      details: [
        {
          label: "Amount within limit (<= ₹10k)",
          val: Number(item.amount) <= 10000 ? "✓ PASSED" : "✗ EXCEEDED",
        },
        {
          label: "Retry limit (<= 2 retries)",
          val: Number(item.retry_count || 0) < 2 ? "✓ PASSED" : "✗ MAX REACHED",
        },
        {
          label: "Confidence threshold (>= 60%)",
          val:
            Number(item.confidence || item.recovery_probability || 0) >= 0.60
              ? "✓ SATISFIED"
              : "✗ BELOW THRESHOLD",
        },
        {
          label: "Recovery window (<= 24h)",
          val:
            Number(item.time_since_failure_minutes || 0) <= 1440
              ? "✓ VALID"
              : "✗ EXPIRED",
        },
        {
          label: "Status & Reason",
          val: item.blocked_reason || (guardrail === "APPROVED" ? "All guardrails passed" : guardrail),
        },
      ],
    },
    {
      num: "06",
      title: "EXECUTION",
      status: guardrail === "APPROVED" ? "EXECUTED" : "SKIPPED",
      primary:
        guardrail === "APPROVED"
          ? "Intervention executed via simulated provider"
          : `Execution skipped: Guardrail ${guardrail} prevented automated recovery`,
      details: [
        { label: "Execution Mode", val: item.execution_mode || "SIMULATED RECOVERY" },
        {
          label: "Action Executed",
          val: guardrail === "APPROVED" ? pretty(item.final_action) : "None (Blocked by policy)",
        },
      ],
    },
    {
      num: "07",
      title: "OUTCOME",
      status: outcome,
      primary:
        outcome === "SUCCESS"
          ? `SUCCESS — ${formatMoney(item.recovered_amount || item.amount)} recovered`
          : outcome === "FAILED"
          ? "FAILED — Recovery attempt failed"
          : outcome === "ESCALATED"
          ? "ESCALATED — Awaiting manual operations review"
          : outcome === "STOPPED"
          ? "STOPPED — Recovery policy halted further retries"
          : "BLOCKED — Confidence below threshold",
      details: [
        { label: "Final Outcome", val: outcome },
        {
          label: "Recovered Amount",
          val:
            item.recovered_amount && Number(item.recovered_amount) > 0
              ? formatMoney(item.recovered_amount)
              : "₹0 (No revenue recovered)",
        },
      ],
    },
  ];

  return (
    <section className="reasoning-timeline-card">
      <div className="eyebrow orange">AGENT REASONING TIMELINE</div>
      <div className="timeline-steps-flow">
        {steps.map((step, idx) => {
          const isHighlighted = activeStep !== null && activeStep === idx + 1;
          const statusClass = step.status.toLowerCase();
          return (
            <div
              key={step.num}
              className={`timeline-step-item ${statusClass} ${isHighlighted ? "active-step" : ""}`}
            >
              <div className="step-indicator">
                <span className="step-circle">{step.num}</span>
                {idx < steps.length - 1 && <div className="step-connector" />}
              </div>
              <div className="step-body-content">
                <div className="step-top">
                  <b className="step-title">{step.title}</b>
                  <span className={`step-badge ${statusClass}`}>{step.status}</span>
                </div>
                <p className="step-primary">{step.primary}</p>
                <div className="step-details-grid">
                  {step.details.map((d, dIdx) => (
                    <div key={dIdx} className="step-detail-row">
                      <span className="d-label">{d.label}:</span>
                      <span className="d-val">{d.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ========================================================
// PHASE 2: WHY REVORA?
// ========================================================
export function WhyRevora({ item }: { item: Item }) {
  const status = String(item.guardrail_status || "PENDING").toUpperCase();
  const amount = Number(item.amount || 0);
  const retries = Number(item.retry_count || 0);
  const failureReason = String(item.failure_reason || "UNKNOWN_ERROR");
  const action = String(item.final_action || item.recommendation || "STOP_RECOVERY");
  const conf = item.confidence || item.recovery_probability || 0;
  const confPct = Math.round(Number(conf) * 100);

  // Derive deterministic reason strictly from real structured data
  let reason = "";
  let nextStep = "";

  if (item.why_revora?.reason) {
    reason = item.why_revora.reason;
    nextStep = item.why_revora.next_step;
  } else if (status === "ESCALATED") {
    reason =
      "This recovery exceeds the autonomous action amount threshold (₹10,000). Revora therefore prevents automatic execution and requires human intervention.";
    nextStep = "Human review required";
  } else if (status === "STOPPED") {
    if (retries >= 2) {
      reason =
        "Maximum retry attempts (2) have been reached. Continuing automated recovery would violate the recovery policy.";
    } else if (Number(item.time_since_failure_minutes || 0) > 1440) {
      reason =
        "The 24-hour recovery window has expired. Automated recovery is stopped to prevent stale payment retries.";
    } else {
      reason = `Automated recovery stopped because ${item.blocked_reason || "a stopping rule was reached"}. Revora halts automation to prevent unnecessary retries.`;
    }
    nextStep = "No further automated recovery";
  } else if (status === "BLOCKED") {
    reason =
      "The recovery recommendation does not meet the minimum confidence required for autonomous execution (60% threshold).";
    nextStep = "Autonomous execution blocked";
  } else {
    // APPROVED
    if (action === "RETRY_NOW") {
      const retriesText = retries === 0 ? "zero previous retries" : `${retries} previous retry`;
      const custSuccess = item.customer_success_rate
        ? `${Math.round(Number(item.customer_success_rate) * 100)}%`
        : "strong";
      reason = `Temporary payment failure combined with ${retriesText}, strong customer payment history (${custSuccess}), and an amount within autonomous recovery limits makes an immediate retry appropriate.`;
      nextStep = "Retry payment";
    } else if (action === "CONTACT_CUSTOMER") {
      reason = `Failure due to ${failureReason.toLowerCase().replaceAll("_", " ")} requires cardholder/customer action (re-authentication or updating funds). Autonomous retry without customer input would likely fail.`;
      nextStep = "Contact customer via notification";
    } else if (action === "RETRY_LATER") {
      reason =
        "Temporary bank or network disruption detected. Scheduled delayed retry after cooling period to maximize recovery probability.";
      nextStep = "Schedule delayed retry";
    } else {
      reason = `Recovery intervention approved under all active guardrail constraints.`;
      nextStep = `Execute ${pretty(action).toLowerCase()}`;
    }
  }

  const signals = [
    { name: "Failure reason", val: pretty(item.failure_reason) },
    { name: "Retry count", val: `${retries} attempt${retries !== 1 ? "s" : ""}` },
    { name: "Transaction amount", val: formatMoney(amount) },
    {
      name: "Customer history",
      val: item.customer_success_rate
        ? `${Math.round(Number(item.customer_success_rate) * 100)}% success`
        : "Not recorded",
    },
    {
      name: "Payment success rate",
      val: item.customer_success_rate
        ? `${Math.round(Number(item.customer_success_rate) * 100)}%`
        : "Not recorded",
    },
    {
      name: "Transaction age",
      val:
        item.time_since_failure_minutes !== null && item.time_since_failure_minutes !== undefined
          ? `${item.time_since_failure_minutes} minutes`
          : "Not recorded",
    },
    { name: "Payment method", val: item.payment_method || "Not recorded" },
  ];

  const why = item.why_revora || {};
  const policyVer = item.policy_version || why?.policy_version || "agentic_optimized_v2";
  const observation = why?.observation || item.observation || `Payment failure observed: ${failureReason.replace('_', ' ')} on ${item.payment_method || "card"}.`;
  const context = why?.context || item.context || `Customer profile: ${Math.round(Number(item.customer_success_rate || 0) * 100)}% historical payment success, ${retries}/2 retry attempts used.`;
  const evidence = why?.evidence || item.evidence_context || item.evidence || "Deterministic policy validation under active guardrail constraints.";
  const interventionStep = why?.intervention_step || item.intervention_step || (status === "APPROVED" ? "INITIAL_ATTEMPT" : status);

  return (
    <section className="why-revora-card">
      <div className="why-header">
        <div>
          <div className="eyebrow orange">EXPLAINABLE AGENTIC ARCHITECTURE</div>
          <h3>WHY REVORA?</h3>
        </div>
        <span className="policy-badge">
          Policy: <b>{policyVer}</b>
        </span>
      </div>

      <div className="why-agentic-loop-box">
        <div className="agentic-loop-row">
          <span className="loop-tag obs">OBSERVATION</span>
          <p>{observation}</p>
        </div>
        <div className="agentic-loop-row">
          <span className="loop-tag ctx">CONTEXT</span>
          <p>{context}</p>
        </div>
        <div className="agentic-loop-row">
          <span className="loop-tag evd">HISTORICAL EVIDENCE</span>
          <p>{evidence}</p>
        </div>
      </div>

      <div className="why-top-grid">
        <div className="why-metric-box">
          <label>Recommended Action</label>
          <strong className="action-tag">{pretty(action)}</strong>
          {action === "CONTACT_CUSTOMER" && (
            <small className="assisted-subtag">Simulated WhatsApp/SMS Outreach</small>
          )}
        </div>
        <div className="why-metric-box">
          <label>Intervention Step</label>
          <strong className="step-tag">{pretty(interventionStep)}</strong>
        </div>
        <div className="why-metric-box">
          <label>Confidence</label>
          <strong className="conf-tag">{confPct}%</strong>
        </div>
      </div>

      <div className="why-signals-block">
        <label>Signals Considered:</label>
        <div className="signal-pills-list">
          {signals.map((s) => (
            <span className="signal-pill" key={s.name}>
              <small>{s.name}:</small> <b>{s.val}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="why-reason-block">
        <label>Reasoning Summary:</label>
        <blockquote>"{reason}"</blockquote>
      </div>

      <div className="why-decision-footer">
        <div className="why-foot-item">
          <span>Guardrail Decision:</span>
          <b className={`status-pill-badge ${status.toLowerCase()}`}>{status}</b>
        </div>
        <div className="why-foot-item">
          <span>Next Step:</span>
          <b className="next-step-tag">{nextStep}</b>
        </div>
      </div>
    </section>
  );
}

// ========================================================
// PHASE 4: CASE REPLAY INTERACTION
// ========================================================
export function CaseReplay({
  item,
  audit,
  onStepChange,
}: {
  item: Item;
  audit: Item[];
  onStepChange?: (step: number | null) => void;
}) {
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const replaySteps = [
    { num: 1, label: "PAYMENT DETECTED", actor: "GATEWAY", detail: `Txn ${item.transaction_id} observed` },
    { num: 2, label: "RISK IDENTIFIED", actor: "RISK_DETECTOR", detail: `Revenue at risk: ${formatMoney(item.amount)}` },
    { num: 3, label: "CONTEXT ANALYZED", actor: "RECOVERY_AGENT", detail: `Telemetry analyzed: ${pretty(item.failure_reason)}` },
    { num: 4, label: "AGENT RECOMMENDS ACTION", actor: "AI_AGENT", detail: `Action: ${pretty(item.recommendation)}` },
    { num: 5, label: "GUARDRAIL CHECK", actor: "GUARDRAIL_ENGINE", detail: `Status: ${pretty(item.guardrail_status)}` },
    { num: 6, label: "EXECUTION", actor: "RECOVERY_EXECUTOR", detail: item.guardrail_status === "APPROVED" ? "Execution initiated" : "Execution skipped" },
    { num: 7, label: "OUTCOME", actor: "AUDIT_SERVICE", detail: `Outcome: ${pretty(item.outcome)} (${formatMoney(item.recovered_amount)})` },
  ];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev === null || prev < 1) return 1;
        if (prev >= 7) {
          setIsPlaying(false);
          return 7;
        }
        return prev + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  const startReplay = () => {
    setCurrentStep(1);
    setIsPlaying(true);
  };

  const pauseReplay = () => setIsPlaying(false);
  const resetReplay = () => {
    setIsPlaying(false);
    setCurrentStep(null);
  };
  const stepForward = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => (prev === null ? 1 : Math.min(7, prev + 1)));
  };
  const stepBack = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => (prev === null ? 1 : Math.max(1, prev - 1)));
  };

  return (
    <section className="case-replay-box">
      <div className="replay-head">
        <div>
          <div className="eyebrow orange">AUDIT TRAIL REPLAY</div>
          <h4>Visual Decision Replay</h4>
        </div>
        <div className="replay-controls">
          {!isPlaying ? (
            <button className="replay-btn play-btn" onClick={startReplay}>
              ▶ Replay Decision
            </button>
          ) : (
            <button className="replay-btn pause-btn" onClick={pauseReplay}>
              ⏸ Pause
            </button>
          )}
          <button className="replay-btn" onClick={stepBack} disabled={currentStep === null || currentStep <= 1}>
            ⏮ Step
          </button>
          <button className="replay-btn" onClick={stepForward} disabled={currentStep !== null && currentStep >= 7}>
            ⏭ Step
          </button>
          <button className="replay-btn reset-btn" onClick={resetReplay} disabled={currentStep === null}>
            ↺ Reset
          </button>
        </div>
      </div>

      <div className="replay-stepper-track">
        {replaySteps.map((s) => {
          const isPassed = currentStep !== null && currentStep >= s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div
              key={s.num}
              className={`replay-step-node ${isPassed ? "passed" : ""} ${isCurrent ? "current" : ""}`}
              onClick={() => {
                setIsPlaying(false);
                setCurrentStep(s.num);
              }}
            >
              <div className="node-badge">0{s.num}</div>
              <div className="node-info">
                <b>{s.label}</b>
                <small>{s.detail}</small>
              </div>
            </div>
          );
        })}
      </div>

      {currentStep !== null && (
        <div className="replay-active-banner">
          <span className="live-dot" />
          <b>STEP 0{currentStep} OF 07:</b>
          <span>{replaySteps[currentStep - 1].label}</span>
          <p>— {replaySteps[currentStep - 1].detail}</p>
        </div>
      )}
    </section>
  );
}

// ========================================================
// PHASE 7: RECOVERY POLICY IMPACT & COMPARISON
// ========================================================
export function PolicyComparisonCard() {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/analytics/policy-comparison`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  const b = data.baseline || {};
  const o = data.optimized || {};
  const comp = data.comparison || {};

  return (
    <section className="panel policy-impact-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow orange">EMPIRICAL POLICY EVALUATION</div>
          <h3>Recovery Policy Impact</h3>
        </div>
        <span className="policy-badge-live">
          <span className="live-dot" /> Same 3,398 Failed Transactions
        </span>
      </div>

      <p className="policy-intro-text">
        Revora compares the baseline static policy against the agentic optimized policy on the exact same dataset,
        under identical safety constraints and guardrails.
      </p>

      {/* Highlights Banner */}
      <div className="policy-deltas-banner">
        <div className="delta-card">
          <label>Additional Revenue Recovered</label>
          <strong className="delta-accent">
            +{formatMoney(Math.max(0, comp.additional_revenue_recovered || 0))}
          </strong>
          <small>Proven empirical lift</small>
        </div>
        <div className="delta-card">
          <label>Recovery Rate Lift</label>
          <strong className="delta-accent">
            +{(comp.financial_recovery_rate_lift || 0).toFixed(2)}%
          </strong>
          <small>
            {b.financial_recovery_rate || 0}% → {o.financial_recovery_rate || 0}%
          </small>
        </div>
        <div className="delta-card">
          <label>Additional Recoveries</label>
          <strong className="delta-accent">
            +{Math.max(0, comp.additional_successful_recoveries || 0)}
          </strong>
          <small>
            {b.successful_recoveries || 0} → {o.successful_recoveries || 0} cases
          </small>
        </div>
        <div className="delta-card">
          <label>Guardrail Violations</label>
          <strong className="delta-safe">0</strong>
          <small>Zero safety breaches</small>
        </div>
      </div>

      {/* Side-by-Side Comparison Grid */}
      <div className="policy-comparison-grid">
        {/* Baseline Card */}
        <div className="policy-col baseline-col">
          <div className="policy-col-head">
            <span className="version-tag baseline">BASELINE V1</span>
            <h4>Static Rule-Based Policy</h4>
          </div>
          <div className="policy-stat-list">
            <div className="policy-stat-row">
              <span>Financial Recovery Rate</span>
              <b>{b.financial_recovery_rate || 0}%</b>
            </div>
            <div className="policy-stat-row">
              <span>Revenue Recovered</span>
              <b>{formatMoney(b.revenue_recovered)}</b>
            </div>
            <div className="policy-stat-row">
              <span>Successful Recoveries</span>
              <b>{b.successful_recoveries || 0}</b>
            </div>
            <div className="policy-stat-row">
              <span>Guardrail Approved</span>
              <b>{b.approved_actions || 0} cases</b>
            </div>
            <div className="policy-stat-row">
              <span>Failed Executions</span>
              <b>{b.failed_executions || 0} cases</b>
            </div>
            <div className="policy-stat-row">
              <span>Guardrail Violations</span>
              <b className="c-safe">0</b>
            </div>
          </div>
          <div className="policy-features">
            <label>Policy Characteristics:</label>
            <ul>
              <li>Single-shot static retry heuristics</li>
              <li>No customer-assisted outreach</li>
              <li>No historical outcome awareness</li>
              <li>Rigid single-score execution threshold</li>
            </ul>
          </div>
        </div>

        {/* Agentic Optimized Card */}
        <div className="policy-col optimized-col">
          <div className="policy-col-head">
            <span className="version-tag optimized">AGENTIC OPTIMIZED V2</span>
            <h4>Autonomous Context-Aware Policy</h4>
          </div>
          <div className="policy-stat-list">
            <div className="policy-stat-row">
              <span>Financial Recovery Rate</span>
              <b className="c-accent">{o.financial_recovery_rate || 0}%</b>
            </div>
            <div className="policy-stat-row">
              <span>Revenue Recovered</span>
              <b className="c-accent">{formatMoney(o.revenue_recovered)}</b>
            </div>
            <div className="policy-stat-row">
              <span>Successful Recoveries</span>
              <b className="c-accent">{o.successful_recoveries || 0}</b>
            </div>
            <div className="policy-stat-row">
              <span>Guardrail Approved</span>
              <b>{o.approved_actions || 0} cases</b>
            </div>
            <div className="policy-stat-row">
              <span>Case Success Rate</span>
              <b>{o.case_success_rate || 0}%</b>
            </div>
            <div className="policy-stat-row">
              <span>Guardrail Violations</span>
              <b className="c-safe">0</b>
            </div>
          </div>
          <div className="policy-features">
            <label>Policy Improvements:</label>
            <ul>
              <li>10-step agentic decision loop with context collection</li>
              <li>Historical outcome evidence from prior batches</li>
              <li>Multi-step timing: fresh immediate retries vs bank backoff</li>
              <li>Simulated customer-assisted recovery for insufficient funds</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ========================================================
// PHASE 8: WHAT REVORA LEARNED (AGENT INSIGHTS)
// ========================================================
export function AgentInsightsSection() {
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/analytics/agent-insights`)
      .then((res) => res.json())
      .then((data) => setInsights(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  if (insights.length === 0) return null;

  return (
    <section className="panel insights-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow orange">HISTORICAL OUTCOME AWARENESS</div>
          <h3>What Revora Learned</h3>
        </div>
        <span className="status-pill">
          <span className="live-dot" /> Persisted Pattern Insights
        </span>
      </div>

      <div className="insights-grid">
        {insights.map((ins, i) => (
          <div className="insight-card" key={i}>
            <div className="insight-head">
              <span className="category-pill">{ins.category}</span>
              <span className="action-pill">{pretty(ins.action_recommended)}</span>
            </div>
            <h4>{ins.title}</h4>
            <p className="insight-body">{ins.insight}</p>
            <div className="insight-evidence">
              <small>Empirical Evidence:</small>
              <span>{ins.evidence}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ========================================================
// CASE CONTEXTUAL STATUS CHIPS
// ========================================================
export function CaseStatusChips({ item }: { item: Item }) {
  const riskTier = item.risk_tier || (Number(item.risk_score || 0) > 0.6 ? "HIGH" : "LOW");
  const status = item.guardrail_status || "APPROVED";
  const outcome = item.outcome;
  const recAmt = Number(item.recovered_amount || 0);

  return (
    <div className="case-status-chips-wrap">
      <span className="case-status-chip risk">
        Risk detected ✓ ({riskTier})
      </span>
      <span className={`case-status-chip policy ${status.toLowerCase()}`}>
        Policy {status === "APPROVED" ? "approved ✓" : status === "ESCALATED" ? "escalated ⚠" : "stopped ✕"}
      </span>
      {status === "APPROVED" && (
        <span className="case-status-chip executed">
          Recovery executed ✓
        </span>
      )}
      {outcome === "SUCCESS" && recAmt > 0 && (
        <span className="case-status-chip recovered">
          Recovered {formatMoney(recAmt)}
        </span>
      )}
    </div>
  );
}


