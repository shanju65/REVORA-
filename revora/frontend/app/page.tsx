"use client";

import { useEffect, useState } from "react";
import Evaluation from "./evaluation";
import { RevoraLogo, RevoraOrbitalDiagram } from "./branding";
import { CustomerDirectoryView, CustomerDetailView } from "./customer-components";
import { RecoveryReportView } from "./report-components";
import {
  CaseReplay,
  LiveRecoveryFeed,
  ReasoningTimeline,
  RecoveryFunnel,
  WhyRevora,
  Workflow,
  PolicyComparisonCard,
  AgentInsightsSection,
  CaseStatusChips,
  formatMoney,
  pretty,
} from "./agent-components";
import {
  HumanQueuePanel,
  ReviewQueuePanel,
  RazorpayTestPanel,
  ConversationsPanel,
  RevoraPulseWorkspace,
  BatchHistoryPanel,
  CaseDetailDrawer,
  FloatingAssistantWidget,
  RevoraPulseDrawer,
  IngestionModal,
} from "./enterprise-components";
import {
  VisualRecoveryFunnel,
  OutcomeDonutChart,
  FailureReasonBarChart,
  BatchPerformanceTrendChart,
  ActionDistributionCard,
} from "./intelligence-components";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Item = Record<string, any>;

const actions = ["RETRY_NOW", "RETRY_LATER", "CONTACT_CUSTOMER", "ESCALATE_TO_HUMAN", "STOP_RECOVERY"];
const statuses = ["APPROVED", "BLOCKED", "ESCALATED", "STOPPED"];
const outcomes = ["SUCCESS", "FAILED", "ESCALATED", "STOPPED"];
// Smooth Animated Number Counter for Financial Metrics (800-1200ms easing)
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = Number(value || 0);
    if (isNaN(end) || end === 0) {
      setDisplayValue(0);
      return;
    }
    const duration = 1000;
    const startTime = performance.now();

    const updateCounter = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        setDisplayValue(end);
      }
    };

    const animId = requestAnimationFrame(updateCounter);
    return () => cancelAnimationFrame(animId);
  }, [value]);

  return (
    <span>
      {prefix}
      {displayValue.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

export default function Home() {
  // Primary Navigation State
  const [view, setView] = useState<"home" | "recovery" | "customers" | "conversations" | "insights" | "operations" | "settings">("home");

  // Sub-Navigation States
  const [recoveryTab, setRecoveryTab] = useState<"cases" | "batches">("cases");
  const [insightsTab, setInsightsTab] = useState<"performance" | "policy_impact" | "reports">("performance");
  const [operationsTab, setOperationsTab] = useState<"review" | "audit">("review");
  const [settingsTab, setSettingsTab] = useState<"provider" | "policies" | "import" | "system">("provider");

  // Global Navigation & Motion State
  const [isScrolled, setIsScrolled] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeStoryStep, setActiveStoryStep] = useState(1);
  const [heroCycleStage, setHeroCycleStage] = useState(0);

  // Mobile Navigation State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Topbar Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);

  // Home Quick Pulse State
  const [homePulseQuery, setHomePulseQuery] = useState("");

  // Selected Entity State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerStatus, setSelectedCustomerStatus] = useState<string>("ALL");
  const [ingestOpen, setIngestOpen] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [cases, setCases] = useState<Item[]>([]);
  const [logs, setLogs] = useState<Item[]>([]);
  const [charts, setCharts] = useState<Record<string, Item[]>>({});
  const [batches, setBatches] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<Item[]>([]);
  const [activeReplayStep, setActiveReplayStep] = useState<number | null>(null);

  // Drawer & Copilot State
  const [drawerTxId, setDrawerTxId] = useState<string | null>(null);
  const [copilotTx, setCopilotTx] = useState<string | null>(null);
  const [copilotCustomer, setCopilotCustomer] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("");
  const [status, setStatus] = useState("");
  const [outcome, setOutcome] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready");

  async function loadCases() {
    const params = new URLSearchParams({ limit: "500" });
    [
      ["search", query],
      ["failure_reason", reason],
      ["action", action],
      ["guardrail_status", status],
      ["outcome", outcome],
      ["batch_id", batchId],
    ].forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    try {
      const rows = await fetch(`${API}/recovery-cases?${params}`).then((res) => res.json());
      setCases(rows);
    } catch {
      setMessage("Could not load recovery cases");
    }
  }

  async function refresh() {
    try {
      const [metricData, logData, chartData, batchData] = await Promise.all([
        fetch(`${API}/dashboard/metrics`).then((res) => res.json()),
        fetch(`${API}/audit-logs?limit=40`).then((res) => res.json()),
        fetch(`${API}/dashboard/charts`).then((res) => res.json()),
        fetch(`${API}/batches`).then((res) => res.json()),
      ]);
      setMetrics(metricData);
      setLogs(logData);
      setCharts(chartData);
      setBatches(batchData);
      if (batchData[0]) setBatch(batchData[0]);
      await loadCases();
    } catch {
      setMessage("Backend unavailable - ensure FastAPI is running on port 8000");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (view === "recovery" && recoveryTab === "cases") {
      loadCases();
    }
  }, [query, reason, action, status, outcome, batchId, view, recoveryTab]);

  // Real-time polling for logs on Home view
  useEffect(() => {
    if (view !== "home") return;
    const timer = window.setInterval(() => {
      fetch(`${API}/audit-logs?limit=40`)
        .then((res) => res.json())
        .then(setLogs)
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [view]);

  // Navbar sticky scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cycle the hero abstract product visual
  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroCycleStage((prev) => (prev + 1) % 4);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);



  // Global topbar search debounce effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await fetch(`${API}/api/search?q=${encodeURIComponent(searchQuery.trim())}`).then((r) => r.json());
        setSearchResults(res.results || []);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  async function runBatch(datasetId?: string) {
    setBusy(true);
    setMessage(datasetId ? `Running recovery on dataset ${datasetId}...` : "Recovery engine batch started");
    try {
      const endpoint = datasetId ? `${API}/api/datasets/${datasetId}/run-recovery` : `${API}/batches/run`;
      const started = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_version: "agentic_optimized_v2" }),
      }).then((res) => res.json());

      setBatch(started);
      setView("recovery");
      setRecoveryTab("batches");

      const timer = window.setInterval(async () => {
        try {
          const current: Item = await fetch(`${API}/batches/${started.id}`).then((res) => res.json());
          if (current && current.id) {
            setBatch(current);
            if (current.status === "COMPLETED" || current.status === "FAILED") {
              window.clearInterval(timer);
              setBusy(false);
              setMessage(`Batch #${current.id} completed: ${current.events_processed || 0} events evaluated`);
              await refresh();
            }
          }
        } catch {
          const rows: Item[] = await fetch(`${API}/batches`).then((res) => res.json());
          const current = rows.find((item) => item.id === started.id);
          if (current) setBatch(current);
          if (current?.status === "COMPLETED" || current?.status === "FAILED") {
            window.clearInterval(timer);
            setBusy(false);
            setMessage(`Batch #${current.id} completed: ${current.events_processed || 0} events evaluated`);
            await refresh();
          }
        }
      }, 500);
    } catch {
      setBusy(false);
      setMessage("Batch run failed - check backend connection");
    }
  }

  async function openCase(id: string) {
    setDrawerTxId(id);
    try {
      setActiveReplayStep(null);
      const detail = await fetch(`${API}/recovery-cases/${id}`).then((res) => res.json());
      setSelected(detail.transaction);
      setSelectedAudit(detail.audit || []);
    } catch {
      setMessage(`Failed to load case detail for ${id}`);
    }
  }

  const clearFilters = () => {
    setQuery("");
    setReason("");
    setAction("");
    setStatus("");
    setOutcome("");
    setBatchId("");
  };

  const hasFilters = Boolean(query || reason || action || status || outcome || batchId);

  const selectDemoScenario = async (scenario: "A" | "B" | "C") => {
    clearFilters();
    if (scenario === "A") {
      let target =
        cases.find(
          (c) =>
            c.outcome === "SUCCESS" &&
            c.guardrail_status === "APPROVED" &&
            (c.recommendation === "RETRY_NOW" || c.final_action === "RETRY_NOW")
        ) || cases.find((c) => c.outcome === "SUCCESS" && c.guardrail_status === "APPROVED");

      if (!target) {
        try {
          const rows = await fetch(`${API}/recovery-cases?limit=10&outcome=SUCCESS&guardrail_status=APPROVED`).then((r) => r.json());
          if (rows && rows.length > 0) target = rows[0];
        } catch {}
      }

      if (target) {
        openCase(String(target.case_id || target.transaction_id));
      } else {
        setStatus("APPROVED");
        setOutcome("SUCCESS");
      }
    } else if (scenario === "B") {
      let target =
        cases.find((c) => c.guardrail_status === "ESCALATED" && Number(c.amount) > 10000) ||
        cases.find((c) => c.guardrail_status === "ESCALATED");

      if (!target) {
        try {
          const rows = await fetch(`${API}/recovery-cases?limit=10&guardrail_status=ESCALATED`).then((r) => r.json());
          if (rows && rows.length > 0) target = rows[0];
        } catch {}
      }

      if (target) {
        openCase(String(target.case_id || target.transaction_id));
      } else {
        setStatus("ESCALATED");
      }
    } else if (scenario === "C") {
      let target =
        cases.find((c) => c.guardrail_status === "STOPPED" && Number(c.retry_count) >= 2) ||
        cases.find((c) => c.guardrail_status === "STOPPED");

      if (!target) {
        try {
          const rows = await fetch(`${API}/recovery-cases?limit=10&guardrail_status=STOPPED`).then((r) => r.json());
          if (rows && rows.length > 0) target = rows[0];
        } catch {}
      }

      if (target) {
        openCase(String(target.case_id || target.transaction_id));
      } else {
        setStatus("STOPPED");
      }
    }
  };

  const navItems = [
    { id: "home", label: "Home", badge: null },
    { id: "recovery", label: "Recovery Engine", badge: batch?.status === "RUNNING" ? "RUNNING" : null },
    { id: "customers", label: "Customer 360", badge: null },
    { id: "conversations", label: "Revora Pulse AI", badge: "AI" },
    { id: "insights", label: "Recovery Intelligence", badge: null },
  ];

  const cards = [
    ["Revenue at risk", formatMoney(metrics.revenue_at_risk)],
    ["Recovered", formatMoney(metrics.revenue_recovered)],
    ["Financial Recovery Rate", `${metrics.financial_recovery_rate || 0}%`],
    ["Case Success Rate", `${metrics.intervention_success_rate || 0}%`],
    ["Actions ready", `${metrics.recovery_candidates || 0}`],
    ["Escalations", `${metrics.escalated_cases || 0}`],
    ["Guardrail stops", `${metrics.stopped_cases || metrics.guardrail_blocked_cases || 0}`],
  ];

  return (
    <main className="shell">
      {/* Top Navigation Bar */}
      <header className={`top-navbar ${isScrolled ? "scrolled" : ""}`}>
        <div className="top-navbar-inner">
          <div
            className="navbar-brand-wrap"
            onClick={() => setView("home")}
            title="Revora Home"
          >
            <RevoraLogo size={36} subtext="AI REVENUE RECOVERY" />
          </div>

          <nav className="navbar-nav">
            {navItems.map((item) => {
              const badgeClass =
                item.badge === "RUNNING"
                  ? "nav-link-badge running"
                  : item.badge === "AI"
                  ? "nav-link-badge ai"
                  : "nav-link-badge count";

              return (
                <button
                  key={item.id}
                  className={`nav-link ${view === item.id ? "active" : ""}`}
                  onClick={() => {
                    setView(item.id as any);
                    if (item.id === "customers") setSelectedCustomerId(null);
                  }}
                >
                  <span>{item.label}</span>
                  {item.badge && <span className={badgeClass}>{item.badge}</span>}
                </button>
              );
            })}
          </nav>

          <div className="navbar-actions">
            {/* Global Search with Autocomplete Dropdown */}
            <div className="navbar-search-wrap">
              <span className="navbar-search-icon">🔍</span>
              <input
                className="navbar-search-input"
                placeholder="Search transactions, customers, cases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchOpen(true);
                }}
              />
              {searchOpen && (
                <div className="navbar-search-dropdown">
                  <div className="search-dropdown-head">
                    <span>SEARCH RESULTS ({searchResults.length})</span>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#94a3b8",
                        font: "inherit",
                      }}
                      onClick={() => setSearchOpen(false)}
                    >
                      ✕ CLOSE
                    </button>
                  </div>
                  {searchResults.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 11 }}>
                      {searchBusy ? "Searching..." : "No matching entities found."}
                    </div>
                  ) : (
                    searchResults.map((r, idx) => (
                      <div
                        key={idx}
                        className="search-result-item"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                          if (r.target === "case") {
                            openCase(r.id);
                          } else if (r.target === "customer") {
                            setSelectedCustomerId(r.id);
                            setView("customers");
                          }
                        }}
                      >
                        <div className="search-item-left">
                          <b>{r.title}</b>
                          <small>{r.subtitle}</small>
                        </div>
                        <span className={`search-item-tag ${r.type}`}>
                          {r.type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Prominent Run Recovery Button (Solid Accent Coral) */}
            <button
              className={`btn-run-recovery ${busy ? "running" : ""}`}
              onClick={() => runBatch()}
              disabled={busy}
            >
              {busy ? "RUNNING…" : "RUN RECOVERY"}
            </button>

            {/* Profile Avatar with Dropdown for Operations & Settings */}
            <div className="profile-wrap">
              <div
                className="profile-avatar"
                title="Revora Operator Profile"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              >
                RO
              </div>

              {profileMenuOpen && (
                <div className="profile-dropdown-menu">
                  <div className="dropdown-header">
                    <div className="dropdown-user-name">Revora Operator</div>
                    <div className="dropdown-user-role">Revenue Operations Lead</div>
                  </div>

                  <div className="dropdown-section-title">Operations Desk</div>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("operations");
                      setOperationsTab("review");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>Review Queue</b></span>
                    {metrics.escalated_cases > 0 && (
                      <span className="dropdown-badge accent">{metrics.escalated_cases} PENDING</span>
                    )}
                  </button>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("operations");
                      setOperationsTab("audit");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>Audit Ledger</b></span>
                    <span className="dropdown-badge">VERIFIED</span>
                  </button>

                  <div className="dropdown-section-title">Platform Settings</div>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("settings");
                      setSettingsTab("provider");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>Payment Provider</b></span>
                    <span className="dropdown-badge">RAZORPAY</span>
                  </button>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("settings");
                      setSettingsTab("policies");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>Recovery Policies</b></span>
                    <span className="dropdown-badge">GUARDRAILS</span>
                  </button>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("settings");
                      setSettingsTab("import");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>Data Import</b></span>
                    <span className="dropdown-badge">CSV / DATASET</span>
                  </button>
                  <button
                    className="dropdown-item-btn"
                    onClick={() => {
                      setView("settings");
                      setSettingsTab("system");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <span><b>System & Invariants</b></span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-nav-menu">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${view === item.id ? "active" : ""}`}
              onClick={() => {
                setView(item.id as any);
                setMobileMenuOpen(false);
                if (item.id === "customers") setSelectedCustomerId(null);
              }}
            >
              <span>{item.label}</span>
              {item.badge && <span className="nav-link-badge">{item.badge}</span>}
            </button>
          ))}
          <button
            className="nav-link"
            onClick={() => {
              setView("operations");
              setMobileMenuOpen(false);
            }}
          >
            <span>Operations Desk</span>
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setView("settings");
              setMobileMenuOpen(false);
            }}
          >
            <span>Settings</span>
          </button>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="content-container">
        {message !== "Ready" && <div className="toast">{message}</div>}

        {/* ========================================================
            1. HOME: PRODUCT ENTRY & RECOVERY WORKSPACE
            ======================================================== */}
        {view === "home" && (
          <>
            {/* 1. Hero Viewport (60-70% of first viewport, Staggered Load) */}
            <section className="hero-viewport-section">
              <div className="hero-left-copy">
                <div className="hero-brand-eyebrow stagger-0">
                  <span className="eyebrow-dot" /> REVORA · AI REVENUE RECOVERY
                </div>
                <h1 className="hero-headline stagger-1">
                  Recover revenue before it becomes lost revenue.
                </h1>
                <p className="hero-subhead stagger-2">
                  Revora identifies at-risk payments, understands why they failed, chooses the safest recovery intervention, and measures what actually comes back.
                </p>
                <div className="hero-cta-row stagger-3">
                  <button
                    className="btn-hero-primary"
                    onClick={() => {
                      setView("recovery");
                      setRecoveryTab("cases");
                    }}
                  >
                    OPEN RECOVERY ENGINE →
                  </button>
                  <button
                    className="btn-hero-secondary"
                    onClick={() => {
                      const el = document.getElementById("how-it-works");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    SEE HOW IT WORKS ↓
                  </button>
                </div>
              </div>

              {/* Right: Animated Revora Orbital Recovery Diagram (Rotates around) */}
              <div className="hero-orbital-diagram-wrap stagger-4">
                <RevoraOrbitalDiagram
                  onSelectStage={(stageId) => {
                    if (stageId === "ingest" || stageId === "action") {
                      setView("recovery");
                      setRecoveryTab("cases");
                    } else if (stageId === "diagnose") {
                      setView("insights");
                      setInsightsTab("performance");
                    } else if (stageId === "guardrail") {
                      setView("settings");
                      setSettingsTab("policies");
                    } else if (stageId === "settle") {
                      setView("operations");
                      setOperationsTab("audit");
                    }
                  }}
                />
              </div>
            </section>

            {/* 2. The Problem: Why Revenue Gets Lost (Connected Cascade) */}
            <section className="section-wrapper revenue-leak-section">
              <div className="section-head-center">
                <span className="section-eyebrow">THE REVENUE LEAK</span>
                <h2 className="section-title">Why Revenue Gets Lost</h2>
                <p className="section-subtitle">
                  Standard payment infrastructure treats every failure as terminal, resulting in unrecovered millions.
                </p>
              </div>

              <div className="problem-flow-connected-grid">
                {/* Step 1 */}
                <div className="leak-flow-card">
                  <div className="leak-card-top">
                    <span className="leak-badge warning">
                      <span className="leak-dot red" /> 504 TIMEOUT
                    </span>
                    <span className="leak-step-label">01 / DROP</span>
                  </div>
                  <h3>Payment Fails</h3>
                  <p>Bank network dips, transient timeouts, or daily card limits trigger immediate gateway rejection.</p>
                  <div className="leak-metric-pill red">
                    <span>Capital At Risk</span>
                    <b>₹12.4M / mo</b>
                  </div>
                </div>

                <div className="flow-connector-node" aria-hidden="true">
                  <div className="connector-line" />
                  <span className="connector-arrow">➔</span>
                </div>

                {/* Step 2 */}
                <div className="leak-flow-card">
                  <div className="leak-card-top">
                    <span className="leak-badge decay">
                      <span className="leak-dot amber" /> -60% ODDS
                    </span>
                    <span className="leak-step-label">02 / DECAY</span>
                  </div>
                  <h3>Recovery Window Shrinks</h3>
                  <p>Without immediate customer and root-cause intelligence, recovery likelihood plunges 60% within 4 hours.</p>
                  <div className="leak-metric-pill amber">
                    <span>Critical Half-Life</span>
                    <b>4h 00m</b>
                  </div>
                </div>

                <div className="flow-connector-node" aria-hidden="true">
                  <div className="connector-line" />
                  <span className="connector-arrow">➔</span>
                </div>

                {/* Step 3 */}
                <div className="leak-flow-card">
                  <div className="leak-card-top">
                    <span className="leak-badge danger">
                      <span className="leak-dot red" /> NETWORK ALARM
                    </span>
                    <span className="leak-step-label">03 / FRICTION</span>
                  </div>
                  <h3>Revenue At Risk Grows</h3>
                  <p>Blind retries trigger card network fraud warnings, merchant processor penalties, and subscriber churn.</p>
                  <div className="leak-metric-pill red">
                    <span>Processor Alarm</span>
                    <b>High Velocity Flag</b>
                  </div>
                </div>

                <div className="flow-connector-node rescue" aria-hidden="true">
                  <div className="connector-line rescue" />
                  <span className="connector-arrow rescue">➔</span>
                </div>

                {/* Step 4: The Rescue Card */}
                <div className="leak-flow-card rescue-card">
                  <div className="rescue-glow-ring" />
                  <div className="leak-card-top">
                    <span className="leak-badge emerald">
                      <span className="pulse-heartbeat" /> AI RESCUE ACTIVE
                    </span>
                    <span className="leak-step-label emerald">04 / INTERVENTION</span>
                  </div>
                  <h3>Revora Intervenes</h3>
                  <p>Autonomous agents diagnose failure causes, enforce deterministic guardrails, and execute the optimal intervention.</p>
                  <div className="leak-metric-pill emerald">
                    <span>Capital Preserved</span>
                    <b>+₹1.28 Cr Recovered</b>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. How Revora Works: Synchronized Split-Screen Interactive Stage */}
            <section className="section-wrapper" id="how-it-works">
              <div className="section-head-left-row">
                <div>
                  <span className="section-eyebrow">AUTONOMOUS CONTROL ARCHITECTURE</span>
                  <h2 className="section-title">How Revora Works</h2>
                  <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
                    A strict separation between AI reasoning and deterministic execution authority ensures compliant, safe recovery. Select any stage to inspect simulated pipeline telemetry.
                  </p>
                </div>
                <span className="sync-indicator-pill">
                  <span className="sync-pulse-dot" /> Stage 0{activeStoryStep} / 04
                </span>
              </div>

              <div className="how-interactive-stage-grid">
                {/* Left Column: Interactive Step Cards */}
                <div className="how-steps-column">
                  {[
                    {
                      step: 1,
                      num: "01",
                      stage: "FIND",
                      title: "Find payments worth recovering",
                      desc: "Ingests failed transaction webhooks in real time, filters out terminal declines, and flags payments with actionable recoverability signals.",
                      telemetryTag: "Signal: 94.8% (Recoverable)",
                      metric: "Latency: 38ms",
                    },
                    {
                      step: 2,
                      num: "02",
                      stage: "UNDERSTAND",
                      title: "Understand payment and customer context",
                      desc: "Correlates transaction history, historical customer LTV, dispute rates, and card issuer codes to pinpoint optimal retry windows.",
                      telemetryTag: "LTV: ₹54,000 · VIP Tier",
                      metric: "Disputes: 0.0%",
                    },
                    {
                      step: 3,
                      num: "03",
                      stage: "RECOVER",
                      title: "Choose the safest recovery action",
                      desc: "Autonomous agents select an intervention (smart retry, interactive customer outreach, or ops review) strictly bounded by deterministic policy guardrails.",
                      telemetryTag: "Policy: APPROVED",
                      metric: "Action: RETRY_LATER (4h)",
                    },
                    {
                      step: 4,
                      num: "04",
                      stage: "MEASURE",
                      title: "Track what was actually recovered",
                      desc: "Executes approved interventions, verifies bank settlement confirmation, records tamper-evident cryptographic hashes, and updates live ROI metrics.",
                      telemetryTag: "Settled: ₹14,999.00",
                      metric: "Ledger: SHA-256 Verified",
                    },
                  ].map((item) => {
                    const isActive = activeStoryStep === item.step;
                    return (
                      <div
                        key={item.step}
                        className={`showcase-step-card ${isActive ? "active" : ""}`}
                        onClick={() => {
                          setActiveStoryStep(item.step);
                        }}
                      >
                        <div className="showcase-card-header">
                          <span className="step-badge-pill">
                            <span className={`step-dot ${isActive ? "active" : ""}`} />
                            {item.num} / {item.stage}
                          </span>
                          <span className="step-metric-tag">{item.metric}</span>
                        </div>
                        <h3 className="showcase-step-title">{item.title}</h3>
                        <p className="showcase-step-desc">{item.desc}</p>
                        <div className="showcase-card-footer">
                          <span className="showcase-telemetry-pill">{item.telemetryTag}</span>
                          <span className="showcase-click-hint">{isActive ? "Current Active Stage" : "Click to view stage →"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Column: Dynamic Interactive Simulation Console */}
                <div className="how-console-column">
                  <div className="how-console-window">
                    <div className="console-window-topbar">
                      <div className="console-window-dots">
                        <span className="dot red" />
                        <span className="dot yellow" />
                        <span className="dot green" />
                      </div>
                      <span className="console-window-title">REVORA ENGINE · SIMULATED PIPELINE TELEMETRY</span>
                      <span className="console-stage-pill">STAGE 0{activeStoryStep} / 04</span>
                    </div>

                    <div className="console-window-body">
                      {/* Stage 1: FIND Console Telemetry */}
                      {activeStoryStep === 1 && (
                        <div className="console-stage-content animate-fade-in">
                          <div className="console-section-header">
                            <span className="console-eyebrow">STEP 01 // REAL-TIME INGESTION & FILTERING</span>
                            <h4>Webhook Stream & Signal Extraction</h4>
                          </div>

                          <div className="console-terminal-block">
                            <div className="terminal-line">
                              <span className="t-timestamp">02:14:08.142</span>
                              <span className="t-event">webhook.received</span>
                              <span className="t-source">razorpay_gateway</span>
                            </div>
                            <div className="terminal-json-card">
                              <div className="t-row"><span className="t-key">event:</span> <span className="t-str">&quot;payment.failed&quot;</span></div>
                              <div className="t-row"><span className="t-key">payment_id:</span> <span className="t-str">&quot;pay_N8s9d72K9a&quot;</span></div>
                              <div className="t-row"><span className="t-key">amount:</span> <span className="t-num">₹14,999.00</span></div>
                              <div className="t-row"><span className="t-key">error_code:</span> <span className="t-badge-error">&quot;GATEWAY_TIMEOUT (504)&quot;</span></div>
                              <div className="t-row"><span className="t-key">bank:</span> <span className="t-str">&quot;HDFC Bank Limited&quot;</span></div>
                            </div>
                          </div>

                          <div className="console-analysis-box">
                            <div className="analysis-indicator-row">
                              <span className="analysis-status-pill success">
                                <span className="pulse-dot green" /> NON-TERMINAL FAILURE
                              </span>
                              <span className="analysis-score-pill">Recoverability Signal: <b>94.8%</b></span>
                            </div>
                            <p className="analysis-text">
                              Revora detected transient bank downtime. Payment bypassed hard decline blacklist and queued for subscriber context analysis.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Stage 2: UNDERSTAND Console Telemetry */}
                      {activeStoryStep === 2 && (
                        <div className="console-stage-content animate-fade-in">
                          <div className="console-section-header">
                            <span className="console-eyebrow">STEP 02 // 360° SUBSCRIBER RECOVERY INTELLIGENCE</span>
                            <h4>Customer Context & Liquidity Profile</h4>
                          </div>

                          <div className="console-subscriber-matrix">
                            <div className="subscriber-head-row">
                              <div className="subscriber-avatar">AM</div>
                              <div>
                                <b>Aarav Mehta</b> · <span className="mono">CUS-8821</span>
                                <div className="subscriber-tier">Diamond VIP Subscriber · 18 Months Tenure</div>
                              </div>
                              <span className="health-score-pill">Health Score: 92/100</span>
                            </div>

                            <div className="subscriber-stats-grid">
                              <div className="sub-stat-box">
                                <span className="sub-label">Customer LTV</span>
                                <span className="sub-value">₹54,000</span>
                              </div>
                              <div className="sub-stat-box">
                                <span className="sub-label">Prior Recovery</span>
                                <span className="sub-value text-emerald">100% (3/3)</span>
                              </div>
                              <div className="sub-stat-box">
                                <span className="sub-label">Dispute Risk</span>
                                <span className="sub-value text-emerald">0.00%</span>
                              </div>
                              <div className="sub-stat-box">
                                <span className="sub-label">Daily Retry Used</span>
                                <span className="sub-value">0 of 3 Max</span>
                              </div>
                            </div>

                            <div className="console-analysis-box">
                              <div className="analysis-indicator-row">
                                <span className="analysis-status-pill info">
                                  <span className="pulse-dot blue" /> OPTIMAL TIMING WINDOW
                                </span>
                                <span className="analysis-score-pill">Clearing Window: <b>+4h 15m</b></span>
                              </div>
                              <p className="analysis-text">
                                Cardholder exhibits strong liquidity. HDFC historical downtime clears in ~3.5 hours. Recommended strategy: delayed retry at 06:30 IST.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Stage 3: RECOVER Console Telemetry */}
                      {activeStoryStep === 3 && (
                        <div className="console-stage-content animate-fade-in">
                          <div className="console-section-header">
                            <span className="console-eyebrow">STEP 03 // DETERMINISTIC POLICY GATEWAY</span>
                            <h4>Safe Intervention Selection & Guardrails</h4>
                          </div>

                          <div className="console-policy-checklist">
                            <div className="policy-decision-banner">
                              <div>
                                <span className="banner-sub">PROPOSED AGENT ACTION</span>
                                <b>RETRY_LATER (Delay: 4 Hours)</b>
                              </div>
                              <span className="policy-verdict-pill approved">GATEWAY: APPROVED</span>
                            </div>

                            <div className="policy-rule-rows">
                              <div className="policy-rule-item passed">
                                <span className="check-icon">✓</span>
                                <div className="rule-info">
                                  <b>Rule: Max Daily Retry Threshold</b>
                                  <small>Configured limit: 3 attempts · Current customer count: 0</small>
                                </div>
                                <span className="rule-status">PASS</span>
                              </div>

                              <div className="policy-rule-item passed">
                                <span className="check-icon">✓</span>
                                <div className="rule-info">
                                  <b>Rule: Cooling-Off Interval</b>
                                  <small>Minimum required: 120 mins · Proposed delay: 240 mins</small>
                                </div>
                                <span className="rule-status">PASS</span>
                              </div>

                              <div className="policy-rule-item passed">
                                <span className="check-icon">✓</span>
                                <div className="rule-info">
                                  <b>Rule: Fraud & Dispute Gate</b>
                                  <small>Threshold: &lt; 1.0% · Account risk score: 0.00%</small>
                                </div>
                                <span className="rule-status">PASS</span>
                              </div>
                            </div>

                            <div className="console-analysis-box">
                              <div className="analysis-indicator-row">
                                <span className="analysis-status-pill success">
                                  <span className="pulse-dot green" /> DISPATCH SCHEDULED
                                </span>
                                <span className="analysis-score-pill">Policy: <b>v2 Strict Guardrails</b></span>
                              </div>
                              <p className="analysis-text">
                                Intervention fully authorized under merchant compliance rules. Queued for tokenized execution via Razorpay Smart Router.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Stage 4: MEASURE Console Telemetry */}
                      {activeStoryStep === 4 && (
                        <div className="console-stage-content animate-fade-in">
                          <div className="console-section-header">
                            <span className="console-eyebrow">STEP 04 // SETTLEMENT & CRYPTOGRAPHIC PROOF</span>
                            <h4>Bank Confirmation & Audit Ledger</h4>
                          </div>

                          <div className="console-settlement-receipt">
                            <div className="settlement-status-banner">
                              <div className="settle-badge-icon">✓</div>
                              <div>
                                <span className="banner-sub">ISSUING BANK SETTLEMENT</span>
                                <b>₹14,999.00 Recovered Successfully</b>
                              </div>
                              <span className="settle-badge-pill">SETTLED</span>
                            </div>

                            <div className="settlement-ledger-fields">
                              <div className="ledger-field-row">
                                <span className="field-label">Transaction ID</span>
                                <span className="field-val mono">TX10988-REV</span>
                              </div>
                              <div className="ledger-field-row">
                                <span className="field-label">Settlement Batch</span>
                                <span className="field-val mono">BATCH-43</span>
                              </div>
                              <div className="ledger-field-row">
                                <span className="field-label">Customer Friction</span>
                                <span className="field-val text-emerald">Zero (Invisible Auto-Recovery)</span>
                              </div>
                              <div className="ledger-field-row">
                                <span className="field-label">Cryptographic Hash</span>
                                <span className="field-val mono hash-truncate">7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</span>
                              </div>
                            </div>

                            <div className="console-analysis-box">
                              <div className="analysis-indicator-row">
                                <span className="analysis-status-pill success">
                                  <span className="pulse-dot green" /> LEDGER SEALED
                                </span>
                                <span className="analysis-score-pill">ROI: <b>+₹14,999 Net Lift</b></span>
                              </div>
                              <p className="analysis-text">
                                Full audit trail verified and appended to Revora Operations Governance Ledger. Financial metrics automatically updated.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Console Interactive Footer Navigation */}
                    <div className="console-window-footer">
                      <div className="console-step-dots">
                        {[1, 2, 3, 4].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`console-dot-nav ${activeStoryStep === s ? "active" : ""}`}
                            onClick={() => setActiveStoryStep(s)}
                            title={`Jump to step ${s}`}
                          />
                        ))}
                      </div>
                      <div className="console-btn-row">
                        <button
                          type="button"
                          className="console-nav-btn"
                          disabled={activeStoryStep === 1}
                          onClick={() => setActiveStoryStep((prev) => Math.max(prev - 1, 1))}
                        >
                          ← Previous
                        </button>
                        <button
                          type="button"
                          className="console-nav-btn primary"
                          onClick={() => setActiveStoryStep((prev) => (prev % 4) + 1)}
                        >
                          {activeStoryStep === 4 ? "Restart Walkthrough ↺" : "Next Stage →"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. The Revora Platform: Enterprise Workspace Suite */}
            <section className="section-wrapper">
              <div className="section-head-center">
                <span className="section-eyebrow">PLATFORM WORKSPACE SUITE</span>
                <h2 className="section-title">The Revora Platform</h2>
                <p className="section-subtitle">
                  Four purpose-built operational workspaces engineered for modern revenue recovery.
                </p>
              </div>

              <div className="platform-suite-grid">
                {/* 1. Recovery Engine */}
                <div
                  className="platform-suite-card"
                  onClick={() => {
                    setView("recovery");
                    setRecoveryTab("cases");
                  }}
                >
                  <div className="suite-card-topbar">
                    <div className="suite-icon-box">⚙️</div>
                    <span className="suite-workspace-tag">WORKSPACE 01</span>
                    <span className="suite-status-pill active">● Active Engine</span>
                  </div>
                  <h3 className="suite-card-title">Recovery Engine</h3>
                  <p className="suite-card-desc">
                    Manage payment recovery, monitor batch executions, and orchestrate compliant interventions across your payment stack.
                  </p>

                  {/* Micro-Preview UI Widget */}
                  <div className="suite-preview-widget">
                    <div className="preview-widget-head">
                      <span className="mono">BATCH #43 · 500 CASES</span>
                      <span className="preview-badge emerald">84% Processed</span>
                    </div>
                    <div className="preview-progress-track">
                      <div className="preview-progress-fill" style={{ width: "84%" }} />
                    </div>
                    <div className="preview-stats-sub">
                      <span>420 / 500 cases</span>
                      <span className="text-emerald"><b>+₹4.12L</b> Recovered</span>
                    </div>
                  </div>

                  <div className="suite-card-footer">
                    <span className="suite-cta-action">Launch Recovery Engine ➔</span>
                  </div>
                </div>

                {/* 2. Customer 360 */}
                <div
                  className="platform-suite-card"
                  onClick={() => {
                    setView("customers");
                    setSelectedCustomerId(null);
                  }}
                >
                  <div className="suite-card-topbar">
                    <div className="suite-icon-box">👤</div>
                    <span className="suite-workspace-tag">WORKSPACE 02</span>
                    <span className="suite-status-pill active">● 1,000 Subscribers</span>
                  </div>
                  <h3 className="suite-card-title">Customer 360</h3>
                  <p className="suite-card-desc">
                    Understand subscriber payment behaviour, customer health scores, and historical recovery outcomes across every subscriber.
                  </p>

                  {/* Micro-Preview UI Widget */}
                  <div className="suite-preview-widget">
                    <div className="preview-customer-row">
                      <div className="preview-avatar">AM</div>
                      <div className="preview-cust-info">
                        <b>Aarav Mehta</b> · <span className="mono">CUS-8821</span>
                        <div className="preview-sub-text">LTV: ₹68,500 · VIP Tier</div>
                      </div>
                      <span className="preview-badge orange">RECOVERING</span>
                    </div>
                    <div className="preview-stats-sub" style={{ marginTop: 8 }}>
                      <span>Health Score: 92/100</span>
                      <span className="text-emerald">Optimal Window: 4h</span>
                    </div>
                  </div>

                  <div className="suite-card-footer">
                    <span className="suite-cta-action">View Customer Profiles ➔</span>
                  </div>
                </div>

                {/* 3. Revora Pulse AI */}
                <div
                  className="platform-suite-card"
                  onClick={() => {
                    setView("conversations");
                    setCopilotTx(null);
                  }}
                >
                  <div className="suite-card-topbar">
                    <div className="suite-icon-box">⚡</div>
                    <span className="suite-workspace-tag">WORKSPACE 03</span>
                    <span className="suite-status-pill active">● Gemini 2.0 Flash</span>
                  </div>
                  <h3 className="suite-card-title">Revora Pulse AI</h3>
                  <p className="suite-card-desc">
                    Investigate payment anomalies, interrogate failure root causes, and query your recovery audit trail in natural language.
                  </p>

                  {/* Micro-Preview UI Widget */}
                  <div className="suite-preview-widget chat-preview">
                    <div className="preview-chat-bubble user">
                      <span>&quot;Why did HDFC batch fail at 2 AM?&quot;</span>
                    </div>
                    <div className="preview-chat-bubble ai">
                      <span className="ai-dot" />
                      <span>Bank maintenance downtime detected (02:00-03:30). <b>RETRY_LATER</b> recommended (98.2% conf).</span>
                    </div>
                  </div>

                  <div className="suite-card-footer">
                    <span className="suite-cta-action">Launch Pulse AI ➔</span>
                  </div>
                </div>

                {/* 4. Recovery Intelligence */}
                <div
                  className="platform-suite-card"
                  onClick={() => {
                    setView("insights");
                    setInsightsTab("performance");
                  }}
                >
                  <div className="suite-card-topbar">
                    <div className="suite-icon-box">📊</div>
                    <span className="suite-workspace-tag">WORKSPACE 04</span>
                    <span className="suite-status-pill active">● Live Financial Ledger</span>
                  </div>
                  <h3 className="suite-card-title">Recovery Intelligence</h3>
                  <p className="suite-card-desc">
                    Executive reporting, financial recovery rates, policy impact comparisons, and cryptographic compliance ledgers.
                  </p>

                  {/* Micro-Preview UI Widget */}
                  <div className="suite-preview-widget">
                    <div className="preview-funnel-row">
                      <div className="funnel-stat">
                        <small>SIGNAL RATE</small>
                        <b>95.0%</b>
                      </div>
                      <span className="funnel-arrow">➔</span>
                      <div className="funnel-stat">
                        <small>CONVERTED</small>
                        <b className="text-emerald">61.8%</b>
                      </div>
                      <span className="preview-badge emerald" style={{ marginLeft: "auto" }}>SHA-256</span>
                    </div>
                    <div className="preview-stats-sub" style={{ marginTop: 8 }}>
                      <span>Total Realized Lift</span>
                      <span className="text-emerald"><b>+₹1.28 Cr</b> Preserved</span>
                    </div>
                  </div>

                  <div className="suite-card-footer">
                    <span className="suite-cta-action">Explore Intelligence ➔</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Revenue Impact: Live Animated Numbers */}
            <section className="revenue-impact-section">
              <div className="impact-header-block">
                <div className="impact-title-left">
                  <span className="eyebrow">FINANCIAL OUTCOMES</span>
                  <h2>Recovered Revenue Impact</h2>
                </div>
                <span className="impact-live-tag">● Live Database Metrics</span>
              </div>

              <div className="impact-metrics-grid">
                <div className="impact-metric-card accent">
                  <span className="card-lbl">Recovered Capital</span>
                  <span className="card-val">
                    <AnimatedNumber value={metrics.revenue_recovered || 0} prefix="₹" />
                  </span>
                  <p className="card-sub">Successfully rescued by engine interventions</p>
                </div>
                <div className="impact-metric-card">
                  <span className="card-lbl">Revenue at Risk</span>
                  <span className="card-val">
                    <AnimatedNumber value={metrics.revenue_at_risk || 0} prefix="₹" />
                  </span>
                  <p className="card-sub">Total failed payment volume evaluated</p>
                </div>
                <div className="impact-metric-card highlight">
                  <span className="card-lbl">Recovery Rate</span>
                  <span className="card-val">
                    <AnimatedNumber value={Number(metrics.financial_recovery_rate || 0)} suffix="%" decimals={1} />
                  </span>
                  <p className="card-sub">Recovered revenue / Total at-risk volume</p>
                </div>
                <div className="impact-metric-card">
                  <span className="card-lbl">Payments Evaluated</span>
                  <span className="card-val">
                    <AnimatedNumber value={metrics.evaluated_cases || metrics.total_events || 500} />
                  </span>
                  <p className="card-sub">Analyzed transactions across all batch runs</p>
                </div>
              </div>
            </section>

            {/* 6. Live Recovery Preview: Actual Opportunities */}
            <section className="live-preview-section">
              <div className="live-preview-head">
                <div>
                  <span className="section-eyebrow">RECOVERY CANDIDATES</span>
                  <h3>Recovery Opportunities</h3>
                </div>
                <span
                  className="preview-link-all"
                  onClick={() => {
                    setView("recovery");
                    setRecoveryTab("cases");
                  }}
                >
                  Open Recovery Engine ({cases.length} cases) →
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Transaction</th>
                      <th>Amount</th>
                      <th>Issue</th>
                      <th>Risk</th>
                      <th>Recommended Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.slice(0, 5).map((item) => (
                      <tr
                        key={`${item.case_id || item.transaction_id}-${item.batch_id || "opp"}`}
                        onClick={() => openCase(String(item.case_id || item.transaction_id))}
                      >
                        <td>
                          <button
                            className="customer-360-link"
                            style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", color: "#4f46e5", fontWeight: 600 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerId(item.customer_id);
                              setView("customers");
                            }}
                          >
                            {item.customer_id} ↗
                          </button>
                        </td>
                        <td>
                          <b>{item.transaction_id}</b>
                        </td>
                        <td>
                          <b>{formatMoney(item.amount)}</b>
                        </td>
                        <td>
                          <span className="reason">{pretty(item.failure_reason)}</span>
                        </td>
                        <td>
                          <span className={`badge ${Number(item.risk_score || 0.3) > 0.6 ? "red" : "gray"}`}>
                            {item.risk_tier || (Number(item.risk_score || 0.3) > 0.6 ? "HIGH" : "LOW")}
                          </span>
                        </td>
                        <td>
                          <b>{pretty(item.recommendation || item.final_action)}</b>
                        </td>
                        <td>
                          <span className={`tag ${String(item.guardrail_status).toLowerCase()}`}>
                            {pretty(item.guardrail_status || "APPROVED")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 7. Live Activity Strip */}
            <div className="live-activity-strip">
              <span className="activity-strip-tag">● LIVE AUDIT ACTIVITY</span>
              <div className="activity-strip-items">
                {logs.slice(0, 4).map((log, idx) => (
                  <span className="activity-strip-pill" key={String(log.id || idx)}>
                    <time>{new Date(String(log.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    <b>{log.transaction_id}:</b>
                    <span>{log.description}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* 8. Home Call to Action Banner */}
            <section className="home-cta-banner">
              <span className="section-eyebrow" style={{ color: "#ff8a70" }}>AUTONOMOUS REVENUE RECOVERY</span>
              <h2>Turn failed payments into recoverable revenue.</h2>
              <p>
                Deploy deterministic policy guardrails and autonomous recovery agents to protect your business cash flow.
              </p>
              <div className="cta-btn-group">
                <button
                  className="btn-hero-primary"
                  onClick={() => {
                    setView("recovery");
                    setRecoveryTab("cases");
                  }}
                >
                  OPEN RECOVERY ENGINE →
                </button>
                <button
                  className="btn-hero-secondary"
                  onClick={() => {
                    setCopilotTx(null);
                    setView("conversations");
                  }}
                >
                  ASK PULSE ⚡
                </button>
              </div>
            </section>

            {/* 9. Professional Footer */}
            <footer className="site-footer">
              <div className="footer-inner">
                <div>
                  <RevoraLogo size={32} subtext="AI REVENUE RECOVERY" />
                </div>
                <div className="footer-links">
                  <button className="footer-link-btn" onClick={() => setView("recovery")}>Recovery Engine</button>
                  <button className="footer-link-btn" onClick={() => setView("customers")}>Customer 360</button>
                  <button className="footer-link-btn" onClick={() => setView("conversations")}>Revora Pulse AI</button>
                  <button className="footer-link-btn" onClick={() => setView("insights")}>Recovery Intelligence</button>
                  <button className="footer-link-btn" onClick={() => { setView("operations"); setOperationsTab("review"); }}>Operations</button>
                  <button className="footer-link-btn" onClick={() => { setView("settings"); setSettingsTab("provider"); }}>Settings</button>
                </div>
              </div>
              <div className="footer-bottom">
                <span>© 2026 Revora Inc. All rights reserved.</span>
                <span>Deterministic Separation of AI Reasoning & Authority</span>
              </div>
            </footer>
          </>
        )}

        {/* ========================================================
            2. RECOVERY ENGINE
            ======================================================== */}
        {view === "recovery" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Recovery Engine</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">{recoveryTab === "cases" ? "Cases" : "Batches"}</span>
            </div>

            <div className="view-sub-header">
              <div className="eyebrow">RECOVERY ENGINE</div>
              <h1>Recovery Engine</h1>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13.5 }}>Find and act on payments that may still be recoverable.</p>
            </div>

            {/* Top Area Compact Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
              <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Revenue at Risk</span>
                <b style={{ fontSize: 18, color: "var(--ink)" }}>{formatMoney(metrics.revenue_at_risk)}</b>
              </div>
              <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#10b981", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Recovered</span>
                <b style={{ fontSize: 18, color: "#10b981" }}>{formatMoney(metrics.revenue_recovered)}</b>
              </div>
              <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6366f1", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Recovery Rate</span>
                <b style={{ fontSize: 18, color: "var(--ink)" }}>{metrics.financial_recovery_rate || 0}%</b>
              </div>
              <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Open Cases</span>
                <b style={{ fontSize: 18, color: "var(--ink)" }}>{cases.length}</b>
              </div>
              <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#f59e0b", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Needs Review</span>
                <b style={{ fontSize: 18, color: metrics.escalated_cases > 0 ? "#b45309" : "var(--ink)" }}>{metrics.escalated_cases || 0}</b>
              </div>
            </div>

            {/* Sub-nav */}
            <div className="sub-nav-bar">
              <button
                className={`sub-nav-btn ${recoveryTab === "cases" ? "active" : ""}`}
                onClick={() => setRecoveryTab("cases")}
              >
                Cases <b>{cases.length}</b>
              </button>
              <button
                className={`sub-nav-btn ${recoveryTab === "batches" ? "active" : ""}`}
                onClick={() => setRecoveryTab("batches")}
              >
                Batches {batch?.status === "RUNNING" && <b>RUNNING</b>}
              </button>
            </div>

            {/* Sub-tab 1: Cases */}
            {recoveryTab === "cases" && (
              <section className="panel full-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow orange">RECOVERY OPPORTUNITIES</div>
                    <h3>Recovery Opportunities</h3>
                  </div>

                  <div className="filters">
                    <input
                      className="search"
                      placeholder="Search transaction ID or customer"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <select value={reason} onChange={(event) => setReason(event.target.value)}>
                      <option value="">All failure reasons</option>
                      {[...new Set(cases.map((item) => String(item.failure_reason)))].filter(Boolean).map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <select value={action} onChange={(event) => setAction(event.target.value)}>
                      <option value="">All AI actions</option>
                      {actions.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="">All guardrails</option>
                      {statuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                      <option value="">All outcomes</option>
                      {outcomes.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
                      <option value="">All batches</option>
                      {batches.map((item) => (
                        <option key={String(item.id)} value={String(item.id)}>
                          Batch #{item.id}
                        </option>
                      ))}
                    </select>
                    {hasFilters && (
                      <button className="quiet-button clear-button" onClick={clearFilters}>
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Demo Scenario Quick-Picks */}
                <div className="demo-shortcuts-bar">
                  <span className="demo-shortcuts-label">Interactive Cases:</span>
                  <button className="demo-shortcut-btn case-a" onClick={() => selectDemoScenario("A")}>
                    ★ Case A: Success (₹4,999 · Approved · Recovered)
                  </button>
                  <button className="demo-shortcut-btn case-b" onClick={() => selectDemoScenario("B")}>
                    ★ Case B: High Value (&gt; ₹10k · Escalated to Ops)
                  </button>
                  <button className="demo-shortcut-btn case-c" onClick={() => selectDemoScenario("C")}>
                    ★ Case C: Max Retries (2/2 Attempts · Stopped)
                  </button>
                </div>

                {cases.length === 0 ? (
                  <Empty text="No recovery cases match the current criteria." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Payment</th>
                          <th>Amount</th>
                          <th>Issue</th>
                          <th>Risk</th>
                          <th>Action</th>
                          <th>Status</th>
                          <th>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cases.map((item) => (
                          <tr
                            key={`${item.case_id || item.transaction_id}-${item.batch_id || "legacy"}`}
                            onClick={() => openCase(String(item.case_id || item.transaction_id))}
                            className="clickable-row"
                          >
                            <td>
                              <button
                                className="quiet-button"
                                style={{ textAlign: "left", padding: 0, fontWeight: 700, color: "var(--ink)", cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.customer_id) {
                                    setSelectedCustomerId(item.customer_id);
                                    setView("customers");
                                  }
                                }}
                              >
                                <b>{item.customer_id || "Customer"}</b>
                              </button>
                              <small style={{ display: "block", color: "var(--muted)", fontSize: "10px" }}>
                                {item.customer_profile?.email || "verified_buyer"}
                              </small>
                            </td>
                            <td>
                              <b style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>{item.transaction_id}</b>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <small style={{ color: "var(--muted)", fontSize: "10px" }}>#{item.batch_id || "legacy"}</small>
                                <span className={`badge-policy ${item.policy_version === "agentic_optimized_v2" ? "opt" : "base"}`}>
                                  {item.policy_version === "agentic_optimized_v2" ? "v2" : "v1"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <b style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "var(--ink)" }}>{formatMoney(item.amount)}</b>
                              <small style={{ display: "block", color: "var(--muted)", fontSize: "10px" }}>INR</small>
                            </td>
                            <td>
                              <span className="reason" style={{ fontWeight: 600 }}>{pretty(item.failure_reason)}</span>
                            </td>
                            <td>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <strong className="probability" style={{
                                  color: Number(item.recovery_probability || 0) >= 0.7 ? "#059669" : Number(item.recovery_probability || 0) >= 0.4 ? "#d97706" : "#e11d48",
                                  fontSize: "12px"
                                }}>
                                  {item.recovery_probability ? `${Math.round(Number(item.recovery_probability) * 100)}%` : "--"}
                                </strong>
                                <span style={{
                                  fontSize: "8.5px",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  fontFamily: "'DM Mono', monospace",
                                  padding: "2px 5px",
                                  borderRadius: "3px",
                                  background: Number(item.recovery_probability || 0) >= 0.7 ? "#d1fae5" : Number(item.recovery_probability || 0) >= 0.4 ? "#fef3c7" : "#ffe4e6",
                                  color: Number(item.recovery_probability || 0) >= 0.7 ? "#065f46" : Number(item.recovery_probability || 0) >= 0.4 ? "#92400e" : "#9f1239"
                                }}>
                                  {Number(item.recovery_probability || 0) >= 0.7 ? "Low Risk" : Number(item.recovery_probability || 0) >= 0.4 ? "Med Risk" : "High Risk"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, fontSize: "11.5px", color: "var(--ink)" }}>{pretty(item.recommendation)}</span>
                              {item.recommendation === "CONTACT_CUSTOMER" && (
                                <small style={{ display: "block", color: "#237351", fontSize: "9px" }}>
                                  Simulated outreach
                                </small>
                              )}
                            </td>
                            <td>
                              <span className={`tag ${String(item.guardrail_status).toLowerCase()}`}>
                                {pretty(item.guardrail_status)}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                fontSize: "11px",
                                color: item.outcome === "SUCCESS" ? "var(--green)" : item.outcome === "ESCALATED" ? "#d97706" : "#a34a4a"
                              }}>
                                {pretty(item.outcome || item.status || "PENDING")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Sub-tab 2: Batches */}
            {recoveryTab === "batches" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "white", cursor: "pointer", font: "700 11px 'DM Mono', monospace" }}
                    onClick={() => setIngestOpen(true)}
                  >
                    + Import Dataset (CSV)
                  </button>
                </div>
                <BatchHistoryPanel onSelectCase={(txId) => openCase(txId)} />
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            3. CUSTOMERS
            ======================================================== */}
        {view === "customers" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Customers</span>
              {selectedCustomerId && (
                <>
                  <span className="breadcrumb-sep">/</span>
                  <span className="breadcrumb-item active">{selectedCustomerId}</span>
                </>
              )}
            </div>

            <div className="view-sub-header">
              <div className="eyebrow">PORTFOLIO REVENUE HEALTH</div>
              <h1>Customers</h1>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Understand payment behaviour and recovery history.</p>
            </div>

            {selectedCustomerId ? (
              <CustomerDetailView
                customerId={selectedCustomerId}
                initialStatusFilter={selectedCustomerStatus}
                onBack={() => setSelectedCustomerId(null)}
                onOpenCase={(txId) => openCase(txId)}
                onOpenCopilot={(cid) => {
                  setCopilotCustomer(cid);
                  setView("conversations");
                }}
              />
            ) : (
              <CustomerDirectoryView
                onSelectCustomer={(cid, st) => {
                  setSelectedCustomerId(cid);
                  if (st) setSelectedCustomerStatus(st);
                }}
                onOpenCopilot={(cid) => {
                  setCopilotCustomer(cid);
                  setView("conversations");
                }}
              />
            )}
          </div>
        )}

        {/* ========================================================
            4. PULSE
            ======================================================== */}
        {view === "conversations" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Pulse</span>
            </div>

            <ConversationsPanel
              activeTxId={copilotTx || undefined}
              activeCustomerId={copilotCustomer || undefined}
            />
          </div>
        )}

        {/* ========================================================
            5. INSIGHTS
            ======================================================== */}
        {view === "insights" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Insights</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">
                {insightsTab === "performance" ? "Recovery Performance" : insightsTab === "policy_impact" ? "Policy Impact" : "Reports"}
              </span>
            </div>

            <div className="view-sub-header">
              <div className="eyebrow">REVENUE RECOVERY INTELLIGENCE</div>
              <h1>Insights</h1>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>See what Revora recovered and why.</p>
            </div>

            {/* Sub-nav */}
            <div className="sub-nav-bar">
              <button
                className={`sub-nav-btn ${insightsTab === "performance" ? "active" : ""}`}
                onClick={() => setInsightsTab("performance")}
              >
                Recovery Performance
              </button>
              <button
                className={`sub-nav-btn ${insightsTab === "policy_impact" ? "active" : ""}`}
                onClick={() => setInsightsTab("policy_impact")}
              >
                Policy Impact
              </button>
              <button
                className={`sub-nav-btn ${insightsTab === "reports" ? "active" : ""}`}
                onClick={() => setInsightsTab("reports")}
              >
                Reports
              </button>
            </div>

            {insightsTab === "performance" && (
              <section className="insights-performance-suite">
                <VisualRecoveryFunnel metrics={metrics} />
                <div className="intelligence-charts-grid">
                  <OutcomeDonutChart outcomes={charts.outcomes || []} />
                  <FailureReasonBarChart failureTypes={charts.failure_types || []} />
                  <div className="action-distribution-center-wrap">
                    <ActionDistributionCard actions={charts.actions || []} />
                  </div>
                  <BatchPerformanceTrendChart batches={batches || []} />
                </div>
              </section>
            )}

            {insightsTab === "policy_impact" && (
              <div>
                <PolicyComparisonCard />
                <AgentInsightsSection />
              </div>
            )}

            {insightsTab === "reports" && (
              <RecoveryReportView selectedBatchId={batch?.id || null} />
            )}
          </div>
        )}

        {/* ========================================================
            6. OPERATIONS
            ======================================================== */}
        {view === "operations" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Operations</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">{operationsTab === "review" ? "Review" : "Audit"}</span>
            </div>

            <div className="view-sub-header">
              <div className="eyebrow">OPERATIONS DESK & GOVERNANCE</div>
              <h1>Operations</h1>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Review the cases that need attention.</p>
            </div>

            {/* Sub-nav */}
            <div className="sub-nav-bar">
              <button
                className={`sub-nav-btn ${operationsTab === "review" ? "active" : ""}`}
                onClick={() => setOperationsTab("review")}
              >
                Review {metrics.escalated_cases ? <b>{metrics.escalated_cases}</b> : null}
              </button>
              <button
                className={`sub-nav-btn ${operationsTab === "audit" ? "active" : ""}`}
                onClick={() => setOperationsTab("audit")}
              >
                Audit
              </button>
            </div>

            {operationsTab === "review" && <ReviewQueuePanel />}

            {operationsTab === "audit" && (
              <section className="panel full-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">APPEND-ONLY LEDGER</div>
                    <h3>Immutable Audit Trail</h3>
                    <p className="panel-copy">
                      Every gateway observation, risk classification, AI recommendation, policy check, and provider execution is cryptographically preserved.
                    </p>
                  </div>
                </div>

                <div className="log-list">
                  <input
                    className="search log-search"
                    placeholder="Search audit transaction or description"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {logs
                    .filter((log) => Object.values(log).join(" ").toLowerCase().includes(query.toLowerCase()))
                    .map((log) => (
                      <div className="log-entry" key={String(log.id)}>
                        <span className="log-time">{new Date(String(log.timestamp)).toLocaleString()}</span>
                        <span className="event-icon">●</span>
                        <div>
                          <b>{pretty(log.event_type)}</b>
                          <p>
                            {log.transaction_id} · {log.description}
                          </p>
                        </div>
                        <span className="actor">{log.actor}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ========================================================
            7. SETTINGS
            ======================================================== */}
        {view === "settings" && (
          <div>
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item" onClick={() => setView("home")}>Home</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">Settings</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-item active">
                {settingsTab === "provider"
                  ? "Payment Provider"
                  : settingsTab === "policies"
                  ? "Recovery Policies"
                  : settingsTab === "import"
                  ? "Data Import"
                  : "System & Invariants"}
              </span>
            </div>

            <div className="view-sub-header">
              <div className="eyebrow">SYSTEM & GOVERNANCE</div>
              <h1>Settings</h1>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Control your payment provider, policies and system.</p>
            </div>

            {/* Sub-nav */}
            <div className="sub-nav-bar">
              <button
                className={`sub-nav-btn ${settingsTab === "provider" ? "active" : ""}`}
                onClick={() => setSettingsTab("provider")}
              >
                Payment Provider
              </button>
              <button
                className={`sub-nav-btn ${settingsTab === "policies" ? "active" : ""}`}
                onClick={() => setSettingsTab("policies")}
              >
                Recovery Policies
              </button>
              <button
                className={`sub-nav-btn ${settingsTab === "import" ? "active" : ""}`}
                onClick={() => setSettingsTab("import")}
              >
                Data Import
              </button>
              <button
                className={`sub-nav-btn ${settingsTab === "system" ? "active" : ""}`}
                onClick={() => setSettingsTab("system")}
              >
                System & Invariants
              </button>
            </div>

            {settingsTab === "provider" && <RazorpayTestPanel />}

            {settingsTab === "policies" && (
              <div className="panel full-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow orange">BOUNDED RECOVERY POLICY</div>
                    <h3>Automatic Recovery Policy</h3>
                    <p className="panel-copy">
                      The core deterministic policy rules enforcing safety, preventing customer fatigue, and bounding money movement.
                    </p>
                  </div>
                </div>

                <table className="policy-config-table">
                  <thead>
                    <tr>
                      <th>Rule Name</th>
                      <th>Enforced Bound</th>
                      <th>Operational Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="policy-rule-name">MAX_RETRIES</td>
                      <td className="policy-rule-limit">2 attempts</td>
                      <td className="policy-rule-desc">Ceiling on automatic retries to prevent customer fatigue and card network penalties.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">MAX_AUTO_ACTION_AMOUNT</td>
                      <td className="policy-rule-limit">₹10,000</td>
                      <td className="policy-rule-desc">Transactions exceeding this limit are escalated to human review before execution.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">MIN_RECOVERY_CONFIDENCE</td>
                      <td className="policy-rule-limit">60%</td>
                      <td className="policy-rule-desc">Minimum statistical confidence required for automated recovery intervention.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">MAX_RECOVERY_WINDOW</td>
                      <td className="policy-rule-limit">24 hours</td>
                      <td className="policy-rule-desc">Recovery actions halt after 1,440 minutes from initial payment failure.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">DO_NOT_CONTACT</td>
                      <td className="policy-rule-limit">Strict Exclusion</td>
                      <td className="policy-rule-desc">Zero communication sent to customers who have opted out of notifications.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">MANDATE_REVOKED</td>
                      <td className="policy-rule-limit">Immediate Halt</td>
                      <td className="policy-rule-desc">Automatic block on subscriptions where recurring mandate was cancelled by customer.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                    <tr>
                      <td className="policy-rule-name">STOLEN_CARD / PERMANENT_DECLINE</td>
                      <td className="policy-rule-limit">Hard Block</td>
                      <td className="policy-rule-desc">Strict block on hard bank declines to maintain merchant reputation and health.</td>
                      <td><span className="tag approved">ACTIVE</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {settingsTab === "import" && (
              <div className="panel full-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow orange">DATASET INGESTION</div>
                    <h3>Custom Datasets & Merchant CSV Import</h3>
                    <p className="panel-copy">
                      Upload custom historical payment transaction exports or sandbox datasets for evaluation.
                    </p>
                  </div>
                  <button className="btn-primary" onClick={() => setIngestOpen(true)}>
                    + Upload CSV Dataset
                  </button>
                </div>
                <div style={{ background: "#f8fbf8", border: "1px dashed var(--line)", borderRadius: 8, padding: 36, textAlign: "center", margin: "20px 0" }}>
                  <span style={{ fontSize: 32, display: "block", marginBottom: 8, color: "#64748b" }}>📁</span>
                  <h4 style={{ margin: "0 0 6px", fontSize: 15 }}>Upload Payment Records</h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#64748b", maxWidth: 480, marginInline: "auto", lineHeight: 1.5 }}>
                    Ingest payment logs, failure events, and customer transaction records.
                    Revora automatically validates schemas, detects root causes, and registers actionable recovery cases.
                  </p>
                  <button
                    className="btn-primary"
                    style={{ marginTop: 18 }}
                    onClick={() => setIngestOpen(true)}
                  >
                    Open Ingestion Assistant
                  </button>
                </div>
              </div>
            )}

            {settingsTab === "system" && (
              <div className="panel full-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow orange">SAFETY INVARIANTS & BENCHMARKS</div>
                    <h3>Deterministic Policy Gateway Specifications</h3>
                    <p className="panel-copy">
                      The core safety guarantees and test suite enforced across all recovery actions and conversations.
                    </p>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ background: "#f8fbf8", border: "1px solid var(--line)", borderRadius: 6, padding: 20 }}>
                    <div className="eyebrow">DETERMINISTIC GUARDRAILS</div>
                    <h4 style={{ margin: "6px 0 12px", fontSize: 16 }}>Hard Safety Limits</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                      <li><b>MAX_RETRIES &lt;= 2</b>: Halts diminishing returns after 2 attempts.</li>
                      <li><b>MAX_AUTO_ACTION_AMOUNT &lt;= ₹10,000</b>: High values escalated to human operators.</li>
                      <li><b>MAX_RECOVERY_WINDOW &lt;= 24h</b>: Stale failures are stopped.</li>
                      <li><b>MIN_RECOVERY_CONFIDENCE &gt;= 60%</b>: Low confidence recommendations halted.</li>
                      <li><b>DO_NOT_CONTACT</b>: Zero customer outreach if opted out.</li>
                      <li><b>MANDATE_REVOKED</b>: Automated retries disabled.</li>
                    </ul>
                  </div>

                  <div style={{ background: "#f8fbf8", border: "1px solid var(--line)", borderRadius: 6, padding: 20 }}>
                    <div className="eyebrow orange">ZERO-TRUST SECURITY DEFENSE</div>
                    <h4 style={{ margin: "6px 0 12px", fontSize: 16 }}>Payment Credential Invariants</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
                      <li><b>Never Accepts CVVs or OTPs</b>: Zero-trust regex filter triggers SECURITY_VIOLATION.</li>
                      <li><b>No Live Real-Money Moves</b>: Isolated to Razorpay Test Sandbox (`rzp_test_...`).</li>
                      <li><b>Immutable Audit Logging</b>: Every single action logged to SQLite WAL.</li>
                      <li><b>AI Authorization Boundary</b>: AI is strictly advisory; only Gateway authorizes.</li>
                    </ul>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <Evaluation />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enterprise Case Detail Drawer */}
      {drawerTxId && (
        <CaseDetailDrawer
          txId={drawerTxId}
          onClose={() => setDrawerTxId(null)}
          onAskCopilot={(txId) => {
            setCopilotTx(txId);
            setView("conversations");
          }}
          onOpenCustomer={(cid) => {
            setSelectedCustomerId(cid);
            setView("customers");
          }}
        />
      )}

      {/* Persistent Floating Assistant Copilot (hidden on conversations view to prevent button overlap) */}
      {view !== "conversations" && (
        <FloatingAssistantWidget onOpenFullChat={() => setView("conversations")} />
      )}

      {/* Enterprise Ingestion Modal */}
      <IngestionModal
        isOpen={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onRefresh={refresh}
        onRunBatch={(dsId) => runBatch(dsId)}
      />
    </main>
  );
}

function Chart({ title, values, label }: { title: string; values: Item[]; label: string }) {
  const max = Math.max(1, ...values.map((item) => Number(item.count)));
  return (
    <section className="panel chart">
      <div className="eyebrow">DISTRIBUTION</div>
      <h3>{title}</h3>
      {values.map((item) => (
        <div className="bar-row" key={String(item[label])}>
          <span>{pretty(item[label])}</span>
          <i>
            <b style={{ width: `${(Number(item.count) / max) * 100}%` }} />
          </i>
          <strong>{item.count}</strong>
        </div>
      ))}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◌</span>
      <p>{text}</p>
    </div>
  );
}