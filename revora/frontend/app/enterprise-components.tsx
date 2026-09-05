"use client";

import { useEffect, useState, useRef } from "react";
import { formatMoney, pretty } from "./agent-components";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ========================================================
// 1. HUMAN REVIEW QUEUE COMPONENT
// ========================================================
export function HumanQueuePanel() {
  const [data, setData] = useState<{ stats: Record<string, number>; items: any[] }>({
    stats: { total_escalated: 0, open: 0, in_review: 0, resolved: 0 },
    items: [],
  });
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [notes, setNotes] = useState("");

  const loadQueue = async () => {
    try {
      const res = await fetch(`${API}/api/human-queue?status=${filter}`);
      const json = await res.json();
      setData(json);
    } catch {
      // Backend offline or error
    }
  };

  useEffect(() => {
    loadQueue();
  }, [filter]);

  const handleAction = async (queueId: number, action: string) => {
    setBusy(true);
    try {
      await fetch(`${API}/api/human-queue/${queueId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewed_by: "Senior Finance Officer", notes: notes || "Approved via Human Queue Governance" }),
      });
      setNotes("");
      setSelectedItem(null);
      await loadQueue();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel human-queue-panel">
      <div className="queue-head">
        <div>
          <div className="eyebrow orange">OPERATIONS DESK</div>
          <h2>Operations Review Queue</h2>
          <p className="panel-copy">
            High-value transactions (&gt;₹10,000) and policy escalations requiring manual authorization.
            Any operator decision is re-validated through the Deterministic Policy Gateway.
          </p>
        </div>
        <div className="queue-stats-badges">
          <div className="badge-stat">
            <span>OPEN</span>
            <b>{data.stats.open || 0}</b>
          </div>
          <div className="badge-stat in-review">
            <span>IN REVIEW</span>
            <b>{data.stats.in_review || 0}</b>
          </div>
          <div className="badge-stat resolved">
            <span>RESOLVED</span>
            <b>{data.stats.resolved || 0}</b>
          </div>
          <div className="badge-stat total">
            <span>TOTAL ESCALATED</span>
            <b>{data.stats.total_escalated || 0}</b>
          </div>
        </div>
      </div>

      <div className="queue-filter-bar">
        {["ALL", "OPEN", "IN_REVIEW", "RESOLVED"].map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.replace("_", " ")}
          </button>
        ))}
        <button className="refresh-btn" onClick={loadQueue}>
          ↻ Refresh
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>TRANSACTION</th>
              <th>CUSTOMER</th>
              <th>AMOUNT</th>
              <th>RISK TIER</th>
              <th>DIAGNOSED ROOT CAUSE</th>
              <th>ESCALATION TRIGGER</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  No cases currently pending in the human review queue.
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <tr key={item.queue_id}>
                  <td>#{item.queue_id}</td>
                  <td>
                    <b>{item.transaction_id}</b>
                  </td>
                  <td>{item.customer_id}</td>
                  <td>
                    <b>{formatMoney(item.amount)}</b>
                  </td>
                  <td>
                    <span className="badge red">CRITICAL</span>
                  </td>
                  <td>{pretty(item.root_cause || "HIGH_VALUE_REVIEW")}</td>
                  <td>
                    <span className="badge amber">{item.guardrail_trigger || "AMOUNT_LIMIT"}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-btn-group">
                      {item.status === "OPEN" && (
                        <button
                          className="btn-tiny btn-action"
                          onClick={() => handleAction(item.queue_id, "REVIEW")}
                          disabled={busy}
                        >
                          Review
                        </button>
                      )}
                      {item.status !== "RESOLVED" && (
                        <button
                          className="btn-tiny btn-resolve"
                          onClick={() => setSelectedItem(item)}
                        >
                          Authorize
                        </button>
                      )}
                      {item.status === "RESOLVED" && (
                        <span className="text-muted">Resolved</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <div className="queue-modal-overlay">
          <div className="queue-modal">
            <h3>Authorize Recovery Execution</h3>
            <p>
              Transaction <b>{selectedItem.transaction_id}</b> · Amount: <b>{formatMoney(selectedItem.amount)}</b>
            </p>
            <div className="modal-field">
              <label>Resolution Notes & Operational Justification:</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Confirm customer balance verified or approved by senior officer..."
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSelectedItem(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => handleAction(selectedItem.queue_id, "RESOLVE")}
              >
                {busy ? "Authorizing..." : "Confirm & Authorize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ========================================================
// 2. PAYMENT PROVIDER / RAZORPAY TEST SANDBOX
// ========================================================
export function RazorpayTestPanel() {
  const [status, setStatus] = useState<Record<string, any>>({});
  const [txId, setTxId] = useState("TX10988");
  const [result, setResult] = useState<any | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/razorpay/status`)
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const runTest = async (targetId?: string) => {
    const id = targetId || txId;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/razorpay/test-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: id }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, execution: { message: "Provider communication error." } });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel razorpay-panel">
      <div className="razorpay-head">
        <div>
          <div className="eyebrow orange">PAYMENT PROVIDER GATEWAY</div>
          <h2>Razorpay Test Sandbox Connectivity</h2>
          <p className="panel-copy">
            Authentic Razorpay API connectivity against Sandbox (<code>api.razorpay.com/v1</code>).
            Real-money fund transfers are strictly disabled. All recovery orders are processed in Test Mode.
          </p>
        </div>
        <div className="rzp-status-box">
          <div className="rzp-badge">
            <span className="live-dot" style={{ background: status.is_configured ? "#237351" : "#f49342" }} />
            <b>{status.provider || "RAZORPAY_TEST"}</b> · {status.environment || "TEST_SANDBOX"}
          </div>
          <small>Status: {status.connection_status || "CONNECTED"} · API Key: {status.key_id_masked || "rzp_test_..."}</small>
        </div>
      </div>

      <div className="test-runner-box">
        <label>Execute Test Recovery Intervention:</label>
        <div className="test-input-row">
          <input
            type="text"
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder="e.g. TX10988"
          />
          <button
            className="btn-primary"
            disabled={running}
            onClick={() => runTest()}
          >
            {running ? "EXECUTING RECOVERY..." : "EXECUTE VIA PROVIDER"}
          </button>
        </div>

        <div className="demo-shortcuts">
          <span className="demo-label">Operational Scenarios:</span>
          <button className="shortcut-chip" onClick={() => { setTxId("TX10988"); runTest("TX10988"); }}>
            Scenario A: Permitted Retry (TX10988 · ₹2,411)
          </button>
          <button className="shortcut-chip" onClick={() => { setTxId("TX11000"); runTest("TX11000"); }}>
            Scenario B: High Value Escalation (TX11000 · &gt;₹10k)
          </button>
          <button className="shortcut-chip" onClick={() => { setTxId("TX10995"); runTest("TX10995"); }}>
            Scenario C: Retry Ceiling Reached (TX10995 · Stopped)
          </button>
        </div>
      </div>

      {result && (
        <div className="rzp-result-card">
          <div className="rzp-result-head">
            <h4>End-to-End Execution Trace</h4>
            <span className={`result-tag ${result.success ? "success" : "blocked"}`}>
              {result.guardrail?.guardrail_status || (result.success ? "SUCCESS" : "HALTED")}
            </span>
          </div>

          <div className="pipeline-trace-grid">
            <div className="trace-node">
              <label>1. RISK ASSESSMENT</label>
              <b>Tier: {result.risk?.risk_tier || "UNKNOWN"}</b>
              <small>Score: {result.risk?.risk_score?.toFixed(0)}/100</small>
            </div>
            <div className="trace-node">
              <label>2. ROOT CAUSE</label>
              <b>{pretty(result.root_cause?.root_cause || "UNKNOWN")}</b>
              <small>Source: {result.root_cause?.source || "RULE"}</small>
            </div>
            <div className="trace-node">
              <label>3. RECOVERY AGENT</label>
              <b>{pretty(result.recommendation?.recommendation || "STOP")}</b>
              <small>Conf: {Math.round((result.recommendation?.confidence || 0) * 100)}%</small>
            </div>
            <div className="trace-node highlight">
              <label>4. POLICY GATEWAY</label>
              <b>{result.guardrail?.guardrail_status}</b>
              <small>{result.guardrail?.blocked_reason || "Approved for execution"}</small>
            </div>
            <div className="trace-node">
              <label>5. RAZORPAY PROVIDER</label>
              <b>{result.execution?.provider || "RAZORPAY_TEST"}</b>
              <small>Recovered: {formatMoney(result.execution?.recovered_amount || 0)}</small>
            </div>
          </div>

          <div className="rzp-detail-log">
            <b>PROVIDER EXECUTION RESPONSE:</b>
            <p>{result.execution?.message || result.execution?.details || "Intervention evaluated through governance boundary."}</p>
            {result.execution?.provider_payment_id && (
              <small>Order / Payment ID: <code>{result.execution.provider_payment_id}</code></small>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ========================================================
// 3. REVORA PULSE: PAYMENT RECOVERY ASSISTANT
// ========================================================
export function ConversationsPanel({
  activeTxId,
  activeCustomerId,
}: {
  activeTxId?: string;
  activeCustomerId?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [inputQuery, setInputQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState(activeTxId || "");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    sources?: string[];
    decision?: string;
    intent?: string;
    time: string;
  }>>([
    {
      role: "assistant",
      content: "Hello! I am Revora Pulse, your payment recovery assistant. You can ask me about failed transactions, root cause diagnoses, batch recovery metrics, guardrail policies, customer histories, or safe retry evaluations.",
      sources: ["Revora Knowledge Base", "Operational Database"],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [busy, setBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTxId) {
      setSelectedTx(activeTxId);
    }
  }, [activeTxId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const handleResetSession = () => {
    setConversationId("");
    setSelectedTx("");
    setMessages([
      {
        role: "assistant",
        content: "Hello! I am Revora Pulse, your payment recovery assistant. You can ask me about failed transactions, root cause diagnoses, batch recovery metrics, guardrail policies, customer histories, or safe retry evaluations.",
        sources: ["Revora Knowledge Base", "Operational Database"],
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const speak = (text: string, force = false) => {
    if (!force && !audioEnabled) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*_#`]/g, "").replace(/INR /g, "rupees ");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (textToSend?: string, isVoiceInput = false) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || busy) return;

    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { role: "user", content: query, time: userTime }]);
    setInputQuery("");
    setBusy(true);

    try {
      const res = await fetch(`${API}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId || undefined,
          message: query,
          active_transaction_id: selectedTx.trim() || undefined,
          active_customer_id: activeCustomerId || undefined,
        }),
      });
      const data = await res.json();
      if (data.conversation_id) setConversationId(data.conversation_id);

      const botTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "Request processed.",
          sources: data.sources_used || [],
          decision: data.policy_decision,
          intent: data.intent,
          time: botTime,
        },
      ]);
      if (isVoiceInput || audioEnabled) {
        speak(data.answer, true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Revora Pulse is temporarily unreachable. Please check backend connection.",
          sources: ["System Error Handler"],
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const startVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition is not supported in this browser. Please type your query.");
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      handleSend(text, true);
    };
    recognition.start();
  };

  return (
    <div className="pulse-workbench-card">
      {/* Top Header Console */}
      <div className="pulse-top-header">
        <div className="pulse-header-left">
          <div className="pulse-badges-strip">
            <span className="eyebrow orange" style={{ margin: 0 }}>PAYMENT RECOVERY COPILOT</span>
            <span className="pulse-live-badge" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 9,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 700,
              background: "#ecfdf5",
              color: "#047857",
              border: "1px solid #a7f3d0",
              padding: "2px 7px",
              borderRadius: 4
            }}>
              <span className="live-dot" style={{ background: "#10b981" }} /> Gemini 2.5 Flash Grounded
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 9,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 700,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              padding: "2px 7px",
              borderRadius: 4
            }}>
              <span className="live-dot" style={{ background: "#3b82f6" }} /> Policy Gateway Active
            </span>
          </div>
          <h2>Revora Pulse — Payment Recovery Assistant</h2>
          <p>Conversational intelligence grounded in live transactions, customer profiles, and deterministic policy rules.</p>
        </div>

        <div className="pulse-header-right">
          <button
            className={`audio-toggle-btn ${audioEnabled ? "active" : ""}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title="Toggle voice playback"
          >
            {audioEnabled ? "🔊 Voice Output ON" : "🔇 Voice Output OFF"}
          </button>
          <button
            type="button"
            className="pulse-reset-btn"
            onClick={handleResetSession}
            title="Clear chat and start a new session"
          >
            ↻ Reset Session
          </button>
        </div>
      </div>

      {/* 2-Column Workbench Body */}
      <div className="pulse-workbench-grid">
        {/* Left Sidebar Rail */}
        <aside className="pulse-sidebar-rail">
          {/* Active Case Context */}
          <div className="pulse-rail-section">
            <label className="pulse-rail-title">Active Case Context</label>
            <div className="pulse-context-input-wrap">
              <input
                type="text"
                className="pulse-context-input"
                value={selectedTx}
                onChange={(e) => setSelectedTx(e.target.value)}
                placeholder="e.g. TX10988"
              />
              {selectedTx && (
                <button
                  type="button"
                  className="pulse-context-clear"
                  onClick={() => setSelectedTx("")}
                  title="Clear context"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick Scenario Selector */}
          <div className="pulse-rail-section">
            <label className="pulse-rail-title">Quick Test Scenarios</label>
            <div className="pulse-quick-chips-wrap">
              <button
                type="button"
                className={`pulse-quick-chip-item ${selectedTx === "TX10988" ? "active" : ""}`}
                onClick={() => setSelectedTx("TX10988")}
              >
                <div>
                  <b>TX10988</b>
                  <div className="pulse-chip-sub">₹3,499 • Insufficient Funds</div>
                </div>
                <span className="tier-tag" style={{ color: "#06b6d4", background: "#06b6d415" }}>MOD</span>
              </button>

              <button
                type="button"
                className={`pulse-quick-chip-item ${selectedTx === "TX11000" ? "active" : ""}`}
                onClick={() => setSelectedTx("TX11000")}
              >
                <div>
                  <b>TX11000</b>
                  <div className="pulse-chip-sub">₹15,000 • High Value (Escalated)</div>
                </div>
                <span className="tier-tag" style={{ color: "#f59e0b", background: "#f59e0b15" }}>OPS</span>
              </button>

              <button
                type="button"
                className={`pulse-quick-chip-item ${selectedTx === "TX10995" ? "active" : ""}`}
                onClick={() => setSelectedTx("TX10995")}
              >
                <div>
                  <b>TX10995</b>
                  <div className="pulse-chip-sub">₹2,850 • Blocked Fraud</div>
                </div>
                <span className="tier-tag" style={{ color: "#f43f5e", background: "#f43f5e15" }}>HALT</span>
              </button>

              <button
                type="button"
                className={`pulse-quick-chip-item ${selectedTx === "TX10991" ? "active" : ""}`}
                onClick={() => setSelectedTx("TX10991")}
              >
                <div>
                  <b>TX10991</b>
                  <div className="pulse-chip-sub">₹1,200 • Gateway Timeout</div>
                </div>
                <span className="tier-tag" style={{ color: "#10b981", background: "#10b98115" }}>SAFE</span>
              </button>
            </div>
          </div>

          {/* Telemetry Status */}
          <div className="pulse-rail-section">
            <label className="pulse-rail-title">Grounding Telemetry</label>
            <div className="pulse-telemetry-list">
              <div className="pulse-telemetry-item">
                <span className="pulse-telemetry-label">
                  <span className="pulse-status-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Database
                </span>
                <span className="pulse-telemetry-val">Live (PostgreSQL)</span>
              </div>
              <div className="pulse-telemetry-item">
                <span className="pulse-telemetry-label">
                  <span className="pulse-status-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Policy Gateway
                </span>
                <span className="pulse-telemetry-val">Enforcing</span>
              </div>
              <div className="pulse-telemetry-item">
                <span className="pulse-telemetry-label">
                  <span className="pulse-status-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Razorpay Sandbox
                </span>
                <span className="pulse-telemetry-val">Verified</span>
              </div>
            </div>
          </div>

          {/* Scope notice */}
          <div className="pulse-guardrail-notice">
            <b>🛡️ Domain Guardrail Active</b>
            <p style={{ margin: "4px 0 0", fontSize: 10.5 }}>
              Pulse answers transaction, root cause, policy &amp; recovery queries. Unrelated or general math queries are strictly filtered out of scope.
            </p>
          </div>
        </aside>

        {/* Right Main Chat Area */}
        <main className="pulse-main-chat">
          <div className="pulse-chat-feed">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble-row ${m.role}`}>
                <div className="chat-bubble">
                  <div className="bubble-meta">
                    <span className="bubble-sender">
                      {m.role === "user" ? "You" : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span className="pulse-sparkle">✦</span> REVORA PULSE
                        </span>
                      )}
                    </span>
                    {m.decision && (
                      <span className={`decision-pill ${m.decision.toLowerCase()}`}>
                        {m.decision}
                      </span>
                    )}
                    {m.role === "assistant" && (
                      <button
                        type="button"
                        className="bubble-audio-btn"
                        onClick={() => speak(m.content, true)}
                        title="Listen to this response aloud"
                      >
                        🔊 Listen
                      </button>
                    )}
                    <span className="bubble-time">{m.time}</span>
                  </div>
                  <p className="bubble-text">{m.content}</p>

                  {m.sources && m.sources.length > 0 && (
                    <div className="sources-tray">
                      <span className="sources-label">Sources Used:</span>
                      {m.sources.map((s, idx) => (
                        <span key={idx} className="source-tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="chat-bubble-row assistant">
                <div className="chat-bubble thinking">
                  <span className="pulse-dot" /> Retrieving live context and formulating answer...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Colorful Prompt Suggestion Chips */}
          <div className="pulse-prompts-bar">
            <span className="pulse-prompts-label">Suggested:</span>
            <button className="prompt-chip diagnostic" onClick={() => handleSend(selectedTx ? `Why did ${selectedTx} fail?` : "Why did TX10988 fail?")}>
              Why did {selectedTx || "TX10988"} fail?
            </button>
            <button className="prompt-chip batch" onClick={() => handleSend("What did the latest batch recover?")}>
              Latest batch yield?
            </button>
            <button className="prompt-chip policy" onClick={() => handleSend("What is Revora's maximum retry policy?")}>
              Max retry policy?
            </button>
            <button className="prompt-chip diagnostic" onClick={() => handleSend(selectedTx ? `Can you retry ${selectedTx}?` : "Can you retry TX10988?")}>
              Can you retry {selectedTx || "TX10988"}?
            </button>
            <button className="prompt-chip policy" onClick={() => handleSend("Why was TX11000 escalated?")}>
              Why was TX11000 escalated?
            </button>
            <button className="prompt-chip security" onClick={() => handleSend("My CVV is 123, please retry")}>
              Security Test: CVV
            </button>
          </div>

          {/* Fitted Input Dock */}
          <div className="pulse-input-dock">
            <button
              type="button"
              className={`mic-btn ${recording ? "recording" : ""}`}
              onClick={startVoiceInput}
              title="Click to speak"
            >
              {recording ? "🎙️ LISTENING..." : "🎙️ Speak"}
            </button>
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask Revora about any payment, failure reason, batch, or guardrail..."
            />
            <button type="button" className="btn-primary" disabled={busy || !inputQuery.trim()} onClick={() => handleSend()}>
              Send
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

// ========================================================
// 4. BATCH HISTORY & MANAGEMENT PANEL
// ========================================================
export function BatchHistoryPanel({ onSelectCase }: { onSelectCase?: (txId: string) => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchDetail, setBatchDetail] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [txFilter, setTxFilter] = useState<"ALL" | "RECOVERED" | "STOPPED" | "BLOCKED" | "FAILED">("ALL");
  const [sortField, setSortField] = useState<"recovered" | "amount" | "default">("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const batchCacheRef = useRef<Map<number, { detail: any; transactions: any[] }>>(new Map());

  const loadBatches = async () => {
    try {
      const res = await fetch(`${API}/api/batches`);
      const list = await res.json();
      setBatches(list);
      if (list.length > 0 && selectedBatchId === null) {
        setSelectedBatchId(list[0].id);
      }
    } catch {
      // ignore
    }
  };

  const handleRefresh = () => {
    batchCacheRef.current.clear();
    loadBatches();
    if (selectedBatchId !== null) {
      fetchBatchData(selectedBatchId);
    }
  };

  const fetchBatchData = (batchId: number) => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/batches/${batchId}`).then((r) => r.json()),
      fetch(`${API}/api/batches/${batchId}/transactions?limit=500`).then((r) => r.json()),
    ])
      .then(([bData, txData]) => {
        const txs = Array.isArray(txData) ? txData : [];
        batchCacheRef.current.set(batchId, { detail: bData, transactions: txs });
        if (selectedBatchId === batchId) {
          setBatchDetail(bData);
          setTransactions(txs);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatchId === null) return;

    // Fast-path: Check in-memory cache for instant 0ms switch
    const cached = batchCacheRef.current.get(selectedBatchId);
    if (cached) {
      setBatchDetail(cached.detail);
      setTransactions(cached.transactions);
      setLoading(false);
      return;
    }

    let isCurrent = true;
    setLoading(true);

    Promise.all([
      fetch(`${API}/api/batches/${selectedBatchId}`).then((r) => r.json()),
      fetch(`${API}/api/batches/${selectedBatchId}/transactions?limit=500`).then((r) => r.json()),
    ])
      .then(([bData, txData]) => {
        if (!isCurrent) return;
        const txs = Array.isArray(txData) ? txData : [];
        batchCacheRef.current.set(selectedBatchId, { detail: bData, transactions: txs });
        setBatchDetail(bData);
        setTransactions(txs);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedBatchId]);

  const filteredBatches = batches.filter((b) => {
    if (!batchSearch.trim()) return true;
    const term = batchSearch.toLowerCase().trim();
    return (
      String(b.id).includes(term) ||
      String(b.status || "").toLowerCase().includes(term) ||
      String(b.policy_version || "").toLowerCase().includes(term)
    );
  });

  const recoveredCount = transactions.filter((tx) => tx.outcome === "SUCCESS" || Number(tx.recovered_amount || 0) > 0).length;
  const totalRecoveredSum = transactions.reduce((acc, tx) => acc + Number(tx.recovered_amount || 0), 0);
  const stoppedCount = transactions.filter((tx) => tx.outcome === "STOPPED" || tx.guardrail_status === "STOPPED").length;
  const blockedCount = transactions.filter((tx) => tx.outcome === "BLOCKED" || tx.guardrail_status === "BLOCKED").length;
  const failedCount = transactions.filter((tx) => tx.outcome === "FAILED").length;

  const filteredTransactions = transactions
    .filter((tx) => {
      if (txFilter === "RECOVERED") {
        return tx.outcome === "SUCCESS" || Number(tx.recovered_amount || 0) > 0;
      }
      if (txFilter === "STOPPED") {
        return tx.outcome === "STOPPED" || tx.guardrail_status === "STOPPED";
      }
      if (txFilter === "BLOCKED") {
        return tx.outcome === "BLOCKED" || tx.guardrail_status === "BLOCKED";
      }
      if (txFilter === "FAILED") {
        return tx.outcome === "FAILED";
      }
      return true;
    })
    .filter((tx) => {
      if (!txSearch.trim()) return true;
      const term = txSearch.toLowerCase().trim();
      return (
        String(tx.transaction_id || "").toLowerCase().includes(term) ||
        String(tx.customer_id || "").toLowerCase().includes(term) ||
        String(tx.failure_reason || "").toLowerCase().includes(term) ||
        String(tx.outcome || "").toLowerCase().includes(term) ||
        String(tx.final_action || tx.recommendation || "").toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (sortField === "recovered") {
        const diff = Number(a.recovered_amount || 0) - Number(b.recovered_amount || 0);
        return sortDir === "desc" ? -diff : diff;
      }
      if (sortField === "amount") {
        const diff = Number(a.amount || 0) - Number(b.amount || 0);
        return sortDir === "desc" ? -diff : diff;
      }
      return 0; // maintain backend order (SUCCESS recoveries at top)
    });

  const toggleSort = (field: "recovered" | "amount") => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  return (
    <section className="panel batch-history-panel">
      <div className="batch-head">
        <div>
          <div className="eyebrow orange">BATCH MANAGEMENT & AUDIT</div>
          <h2>Batch History & Run Records</h2>
          <p className="panel-copy">
            Every batch evaluates a distinct, reproducible slice of failed payments.
            Metrics are computed strictly from that batch's actual processed transactions.
          </p>
        </div>
        <button className="refresh-btn" onClick={handleRefresh}>
          ↻ Refresh Batches
        </button>
      </div>

      <div className="batch-layout-split">
        <div className="batch-sidebar-list">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4>Execution Runs ({filteredBatches.length})</h4>
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="text"
              className="search"
              placeholder="Filter batch ID or status..."
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
            />
          </div>
          <div className="batch-cards-container">
            {filteredBatches.length === 0 ? (
              <div className="empty-state" style={{ padding: 18, fontSize: 12 }}>
                No batches match filter.
              </div>
            ) : (
              filteredBatches.map((b) => (
                <div
                  key={b.id}
                  className={`batch-card-item ${selectedBatchId === b.id ? "active" : ""}`}
                  onClick={() => setSelectedBatchId(Number(b.id))}
                >
                  <div className="batch-card-top">
                    <b>Batch #{b.id}</b>
                    <span className={`batch-status-badge ${b.status?.toLowerCase()}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="batch-card-stats">
                    <span>Events: {b.events_processed || b.total_events || 0}</span>
                    <span>Recovered: <b>{formatMoney(b.revenue_recovered || 0)}</b></span>
                  </div>
                  <div className="batch-card-date">
                    {b.started_at ? new Date(b.started_at).toLocaleString() : "Recently executed"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="batch-detail-main" style={{ position: "relative" }}>
          {loading && batchDetail && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.92)",
                padding: "3px 10px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                fontSize: 11,
                color: "var(--muted)",
                zIndex: 10,
              }}
            >
              <span className="pulse-dot" /> Loading...
            </div>
          )}
          {loading && !batchDetail ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <span className="pulse-dot" style={{ display: "inline-block", marginRight: 8 }} />
              Loading metrics and transactions for Batch #{selectedBatchId}...
            </div>
          ) : batchDetail ? (
            <div style={{ opacity: loading ? 0.75 : 1, transition: "opacity 0.15s ease" }}>
              <div className="batch-meta-summary-card">
                <div className="meta-item">
                  <label>BATCH ID</label>
                  <b>#{batchDetail.id}</b>
                </div>
                <div className="meta-item">
                  <label>STATUS</label>
                  <span className={`status-pill ${batchDetail.status?.toLowerCase()}`}>
                    {batchDetail.status}
                  </span>
                </div>
                <div className="meta-item">
                  <label>REVENUE AT RISK</label>
                  <b>{formatMoney(batchDetail.revenue_at_risk || 0)}</b>
                </div>
                <div className="meta-item highlight">
                  <label>REVENUE RECOVERED</label>
                  <b className="c-safe">{formatMoney(batchDetail.revenue_recovered || 0)}</b>
                </div>
                <div className="meta-item">
                  <label>FINANCIAL RECOVERY RATE</label>
                  <b>
                    {batchDetail.revenue_at_risk > 0
                      ? ((batchDetail.revenue_recovered / batchDetail.revenue_at_risk) * 100).toFixed(1)
                      : "0.0"}%
                  </b>
                </div>
                <div className="meta-item">
                  <label>ACTIONS EXECUTED</label>
                  <b>{batchDetail.actions_executed || 0}</b>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", margin: "18px 0 12px", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <h4 style={{ margin: "0 0 8px" }}>
                    Transactions Processed in Batch #{batchDetail.id} ({filteredTransactions.length} of {transactions.length})
                  </h4>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      className={`sub-nav-btn ${txFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setTxFilter("ALL")}
                      style={{ fontSize: 11, padding: "4px 10px", height: "auto" }}
                    >
                      All ({transactions.length})
                    </button>
                    <button
                      type="button"
                      className={`sub-nav-btn ${txFilter === "RECOVERED" ? "active" : ""}`}
                      onClick={() => setTxFilter("RECOVERED")}
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        height: "auto",
                        borderColor: txFilter === "RECOVERED" ? "#10b981" : undefined,
                        color: txFilter === "RECOVERED" ? "#059669" : undefined,
                        background: txFilter === "RECOVERED" ? "#ecfdf5" : undefined,
                        fontWeight: 700,
                      }}
                    >
                      ★ Recovered ({recoveredCount}) · {formatMoney(totalRecoveredSum)}
                    </button>
                    <button
                      type="button"
                      className={`sub-nav-btn ${txFilter === "STOPPED" ? "active" : ""}`}
                      onClick={() => setTxFilter("STOPPED")}
                      style={{ fontSize: 11, padding: "4px 10px", height: "auto" }}
                    >
                      Stopped ({stoppedCount})
                    </button>
                    <button
                      type="button"
                      className={`sub-nav-btn ${txFilter === "BLOCKED" ? "active" : ""}`}
                      onClick={() => setTxFilter("BLOCKED")}
                      style={{ fontSize: 11, padding: "4px 10px", height: "auto" }}
                    >
                      Blocked ({blockedCount})
                    </button>
                    <button
                      type="button"
                      className={`sub-nav-btn ${txFilter === "FAILED" ? "active" : ""}`}
                      onClick={() => setTxFilter("FAILED")}
                      style={{ fontSize: 11, padding: "4px 10px", height: "auto" }}
                    >
                      Failed ({failedCount})
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    className="search"
                    placeholder="Filter transactions by ID, customer, cause..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    style={{ width: 260, fontSize: 11.5, padding: "5px 10px" }}
                  />
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TRANSACTION</th>
                      <th>CUSTOMER</th>
                      <th
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => toggleSort("amount")}
                        title="Click to sort by Amount"
                      >
                        AMOUNT {sortField === "amount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </th>
                      <th>FAILURE REASON</th>
                      <th>RISK TIER</th>
                      <th>RECOMMENDATION</th>
                      <th>GATEWAY STATUS</th>
                      <th>OUTCOME</th>
                      <th
                        style={{ cursor: "pointer", userSelect: "none", color: "#059669" }}
                        onClick={() => toggleSort("recovered")}
                        title="Click to sort by Recovered Amount"
                      >
                        RECOVERED {sortField === "recovered" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-state">
                          {transactions.length === 0 ? "No transactions recorded for this batch." : "No transactions match your search filter."}
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => (
                        <tr
                          key={tx.transaction_id}
                          className="clickable-row"
                          onClick={() => onSelectCase && onSelectCase(tx.transaction_id)}
                        >
                          <td><b>{tx.transaction_id}</b></td>
                          <td>{tx.customer_id}</td>
                          <td><b>{formatMoney(tx.amount)}</b></td>
                          <td>{pretty(tx.failure_reason || "UNKNOWN")}</td>
                          <td>
                            <span className={`badge ${tx.risk_tier === "CRITICAL" ? "red" : tx.risk_tier === "HIGH" ? "amber" : "gray"}`}>
                              {tx.risk_tier || "LOW"}
                            </span>
                          </td>
                          <td>{pretty(tx.recommendation || tx.final_action || "STOP")}</td>
                          <td>
                            <span className={`status-pill ${tx.guardrail_status?.toLowerCase() || "approved"}`}>
                              {tx.guardrail_status || "APPROVED"}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill ${tx.outcome === "SUCCESS" ? "approved" : tx.outcome?.toLowerCase() || "pending"}`}>
                              {tx.outcome || "PENDING"}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block",
                              fontFamily: "'DM Mono', monospace",
                              fontWeight: 700,
                              fontSize: 12,
                              padding: Number(tx.recovered_amount || 0) > 0 ? "2px 8px" : "0",
                              borderRadius: 4,
                              background: Number(tx.recovered_amount || 0) > 0 ? "#ecfdf5" : "transparent",
                              color: Number(tx.recovered_amount || 0) > 0 ? "#059669" : "var(--muted)",
                              border: Number(tx.recovered_amount || 0) > 0 ? "1px solid #a7f3d0" : "none",
                            }}>
                              {formatMoney(tx.recovered_amount || 0)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a batch from the left to view metrics and transactions.</div>
          )}
        </div>
      </div>
    </section>
  );
}

// ========================================================
// 5. UNIFIED 10-SECTION RECOVERY CASE SCREEN & DRAWER
// ========================================================
export function CaseDetailDrawer({
  txId,
  onClose,
  onAskCopilot,
  onOpenCustomer,
}: {
  txId: string;
  onClose: () => void;
  onAskCopilot?: (txId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Embedded Pulse state inside Case
  const [pulseQuery, setPulseQuery] = useState("");
  const [pulseMessages, setPulseMessages] = useState<Array<{ role: string; content: string; decision?: string }>>([]);
  const [pulseBusy, setPulseBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    fetch(`${API}/recovery-cases/${txId}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data);
        if (data && data.why_revora) {
          setPulseMessages([
            {
              role: "assistant",
              content: `Revora Pulse initialized for case ${data.transaction?.transaction_id || txId}. Causal diagnosis: ${data.why_revora.reason || "Under evaluation"}. How can I assist you with this recovery?`,
              decision: data.transaction?.guardrail_status,
            },
          ]);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [txId]);

  const handlePulseAsk = async (queryText?: string) => {
    const q = (queryText || pulseQuery).trim();
    if (!q || pulseBusy) return;
    setPulseMessages((prev) => [...prev, { role: "user", content: q }]);
    setPulseQuery("");
    setPulseBusy(true);

    try {
      const res = await fetch(`${API}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          active_transaction_id: txId,
        }),
      });
      const data = await res.json();
      setPulseMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "Processed case inquiry.",
          decision: data.policy_decision,
        },
      ]);
    } catch {
      setPulseMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Pulse service is momentarily unreachable." },
      ]);
    } finally {
      setPulseBusy(false);
    }
  };

  const startVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const recognition = new SpeechRec();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      handlePulseAsk(text);
    };
    recognition.start();
  };

  if (loading || !detail) {
    return (
      <div className="drawer-overlay">
        <div className="drawer-panel case-10-drawer">
          <div className="drawer-header">
            <h3>Loading Case {txId}...</h3>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  const tx = detail.transaction || {};
  const why = detail.why_revora || {};
  const rules = detail.guardrail_rules || [];
  const logs = detail.audit || [];
  const customer = detail.customer_summary || {};
  const priority = tx.priority || (Number(tx.amount) > 10000 ? "P1_URGENT" : Number(tx.amount) > 3000 ? "P2_HIGH" : "P3_STANDARD");

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel case-10-drawer" onClick={(e) => e.stopPropagation()}>
        {/* ========================================================
            SECTION 1: HEADER
            ======================================================== */}
        <div className="case-10-head-banner">
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span className={`priority-pill ${priority.toLowerCase().replace('_', '')}`}>
                {priority.replace('_', ' ')}
              </span>
              <span className="section-num">SECTION 01: HEADER</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#a9c1ba" }}>
                CASE #{tx.case_id || tx.transaction_id}
              </span>
            </div>
            <h2 style={{ margin: "4px 0", fontSize: 24, letterSpacing: "-0.03em" }}>
              {tx.transaction_id}
            </h2>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8, fontSize: 12 }}>
              <span>
                Customer:{" "}
                <button
                  className="customer-360-link"
                  style={{ background: "none", border: "none", padding: 0, font: "inherit" }}
                  onClick={() => {
                    onClose();
                    if (onOpenCustomer) onOpenCustomer(tx.customer_id);
                  }}
                  title="View Customer 360 Profile"
                >
                  {tx.customer_id} ↗
                </button>
              </span>
              <span>·</span>
              <span style={{ color: "#a9c1ba" }}>Merchant: {tx.merchant_id || "MER001"}</span>
              <span>·</span>
              <span style={{ background: "#28555a", color: "#55c593", padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                ⚡ RAZORPAY TEST SANDBOX
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "var(--orange)" }}>
              {formatMoney(tx.amount)}
            </div>
            <div style={{ fontSize: 10, color: "#a9c1ba", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
              Failure: <b style={{ color: "#fca5a5" }}>{pretty(tx.failure_reason || "FAILURE")}</b>
            </div>
            <button className="close-btn" onClick={onClose} style={{ marginTop: 8 }}>✕</button>
          </div>
        </div>

        <div className="case-10-body">
          {/* ========================================================
              SECTION 2: PAYMENT DETAILS
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">02</span>
                Payment Details
              </h4>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
                Source Ingestion Data
              </span>
            </div>
            <div className="grid-4col">
              <div className="case-field-unit">
                <label>Payment Method</label>
                <b>{tx.payment_method || "CARD"}</b>
              </div>
              <div className="case-field-unit">
                <label>Currency & Total</label>
                <b>{tx.currency || "INR"} {Number(tx.amount).toLocaleString()}</b>
              </div>
              <div className="case-field-unit">
                <label>Failure Timestamp</label>
                <b>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "Recently"}</b>
              </div>
              <div className="case-field-unit">
                <label>Gateway Error Code</label>
                <code>{tx.gateway_error_code || "GATEWAY_TIMEOUT"}</code>
              </div>
            </div>
          </div>

          {/* ========================================================
              SECTION 3: RISK DETAILS
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">03</span>
                Risk Details
              </h4>
              <span className={`badge ${why.risk_tier === "CRITICAL" ? "red" : why.risk_tier === "HIGH" ? "amber" : "gray"}`}>
                {why.risk_tier || "MEDIUM"} ({Math.round(Number(tx.risk_score || why.risk_score || 0.25) * 100)}/100)
              </span>
            </div>
            <div className="grid-3col">
              <div className="case-field-unit">
                <label>Risk Score (0-100)</label>
                <b style={{ color: Number(tx.risk_score || 0.25) > 0.6 ? "#b26049" : "var(--green)" }}>
                  {Math.round(Number(tx.risk_score || why.risk_score || 0.25) * 100)} / 100
                </b>
              </div>
              <div className="case-field-unit">
                <label>Retry Velocity Factor</label>
                <b>{tx.retry_count || 0} previous attempts ({tx.retry_count >= 2 ? "High Risk" : "Low Risk"})</b>
              </div>
              <div className="case-field-unit">
                <label>Customer Spend Health</label>
                <b>{customer.status || "HEALTHY"} ({(customer.success_rate || 88)}% rate)</b>
              </div>
            </div>
          </div>

          {/* ========================================================
              SECTION 4: WHY REVORA? (CONTEXTUAL PRIORS)
              ======================================================== */}
          <div className="case-section-box" style={{ borderLeft: "4px solid var(--orange)", background: "#fbfdfc" }}>
            <div className="case-section-head">
              <h4>
                <span className="section-num">04</span>
                Why Revora? Contextual Prior Diagnosis
              </h4>
              <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                Context Informed Decision
              </span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              <b>Hypothesis:</b> {why.reason || "Contextual parameters and customer payment history indicate a high probability of recovery via bounded automated intervention."}
            </p>
            <div className="grid-3col">
              <div className="case-field-unit">
                <label>Historical Success Rate</label>
                <b>{Math.round((tx.customer_success_rate || 0.85) * 100)}%</b>
              </div>
              <div className="case-field-unit">
                <label>Previous Transactions</label>
                <b>{tx.customer_previous_transactions || 12} transactions</b>
              </div>
              <div className="case-field-unit">
                <label>Failure Classification</label>
                <b>{["NETWORK_ERROR", "TIMEOUT", "TEMPORARY_BANK_ERROR"].includes(tx.failure_reason) ? "Transient (Recoverable)" : "Systemic / Account"}</b>
              </div>
            </div>
          </div>

          {/* ========================================================
              SECTION 5: REVORA DECISION
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">05</span>
                Revora Decision
              </h4>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "var(--green)" }}>
                Confidence: {Math.round((why.confidence || tx.confidence || 0.85) * 100)}%
              </span>
            </div>
            <div className="grid-3col">
              <div className="case-field-unit">
                <label>Recommended Action</label>
                <b style={{ color: "var(--navy)", fontSize: 13 }}>
                  {pretty(tx.recommendation || tx.final_action || why.recommended_action || "RETRY_NOW")}
                </b>
              </div>
              <div className="case-field-unit">
                <label>Decision Confidence</label>
                <b>{Math.round((why.confidence || tx.confidence || 0.85) * 100)}%</b>
              </div>
              <div className="case-field-unit">
                <label>Expected Outcome</label>
                <b>{tx.outcome === "SUCCESS" ? "SUCCESS (Recoverable)" : pretty(tx.outcome || "PENDING")}</b>
              </div>
            </div>
            <div style={{ marginTop: 10, background: "#f8fbf8", padding: 10, borderRadius: 5, fontSize: 11, color: "var(--muted)" }}>
              <b>Causal Justification:</b> {why.observation || why.reason || "Evaluated by Revora recovery agent based on transaction telemetry and failure reason."}
            </div>
          </div>

          {/* ========================================================
              SECTION 6: DETERMINISTIC POLICY GATEWAY
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">06</span>
                Deterministic Policy Gateway
              </h4>
              <span className={`status-pill ${tx.guardrail_status?.toLowerCase() || "approved"}`}>
                {tx.guardrail_status || "APPROVED"}
              </span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--muted)" }}>
              The Deterministic Policy Gateway is the sole financial authority. Every rule must evaluate to PASSED for automated execution.
            </p>
            <div className="rules-grid">
              {rules.map((r: any, idx: number) => (
                <div key={idx} className={`rule-card ${r.status.toLowerCase()}`}>
                  <div className="rule-title">
                    <span>{r.name}</span>
                    <span className={`badge ${r.status === "PASSED" ? "green" : "red"}`}>{r.status}</span>
                  </div>
                  <small>{r.rule} · Current: {r.current}</small>
                </div>
              ))}
            </div>
          </div>

          {/* ========================================================
              SECTION 7: EMBEDDED PULSE CONVERSATION
              ======================================================== */}
          <div className="case-section-box" style={{ background: "#fbfdfc", border: "1px solid #cbdcd1" }}>
            <div className="case-section-head">
              <h4>
                <span className="section-num">07</span>
                Revora Pulse — Payment Recovery Assistant
              </h4>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="status-pill"><span className="live-dot" /> Case Bound</span>
                {onAskCopilot && (
                  <button
                    className="btn-link"
                    style={{ fontSize: 10 }}
                    onClick={() => {
                      onClose();
                      onAskCopilot(tx.transaction_id);
                    }}
                  >
                    Open Full Workspace ↗
                  </button>
                )}
              </div>
            </div>

            <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: 8, background: "#f4f7f4", borderRadius: 6 }}>
              {pulseMessages.map((pm, pidx) => (
                <div key={pidx} style={{ alignSelf: pm.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                  <div style={{ background: pm.role === "user" ? "var(--navy)" : "white", color: pm.role === "user" ? "white" : "var(--ink)", padding: "8px 12px", borderRadius: 6, fontSize: 11, border: "1px solid #dce5e0" }}>
                    <b>{pm.role === "user" ? "You" : "Pulse"}</b>: {pm.content}
                    {pm.decision && (
                      <span className={`decision-pill ${pm.decision.toLowerCase()}`} style={{ marginLeft: 6, fontSize: 8 }}>
                        {pm.decision}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {pulseBusy && (
                <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
                  Pulse is analyzing case context...
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
              {["Why did this payment fail?", "Is it safe to retry?", "Show customer payment health"].map((quick) => (
                <button
                  key={quick}
                  className="prompt-chip"
                  style={{ fontSize: 9, padding: "3px 8px" }}
                  onClick={() => handlePulseAsk(quick)}
                >
                  {quick}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={pulseQuery}
                onChange={(e) => setPulseQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePulseAsk()}
                placeholder="Ask Pulse about this payment..."
                style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", fontSize: 11 }}
              />
              <button
                className={`pulse-mic-btn ${recording ? "recording" : ""}`}
                onClick={startVoiceInput}
                title="Speak to Revora Pulse"
              >
                🎤
              </button>
              <button
                className="btn-primary"
                style={{ padding: "8px 14px", fontSize: 11 }}
                onClick={() => handlePulseAsk()}
                disabled={pulseBusy}
              >
                Send
              </button>
            </div>
          </div>

          {/* ========================================================
              SECTION 8: EXECUTION (PROVIDER: RAZORPAY TEST SANDBOX)
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">08</span>
                Execution Infrastructure
              </h4>
              <span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                Isolated Test Sandbox
              </span>
            </div>
            <div className="grid-3col">
              <div className="case-field-unit">
                <label>Execution Provider</label>
                <b>{tx.provider || "RAZORPAY_TEST"} (Test Mode)</b>
              </div>
              <div className="case-field-unit">
                <label>Provider Order / Ref ID</label>
                <code>{tx.provider_payment_id || `order_test_${tx.transaction_id}`}</code>
              </div>
              <div className="case-field-unit">
                <label>Idempotency Key</label>
                <code>{tx.idempotency_key || `revora_idem_${tx.transaction_id}`}</code>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
              ✓ All API calls strictly target `https://api.razorpay.com/v1` in Test Mode. Zero live funds are touched.
            </div>
          </div>

          {/* ========================================================
              SECTION 9: OUTCOME
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">09</span>
                Outcome & Capital Recovered
              </h4>
              <span style={{ fontWeight: 800, color: tx.outcome === "SUCCESS" ? "var(--green)" : "#b26049", fontSize: 14 }}>
                {pretty(tx.outcome || "PENDING")}
              </span>
            </div>
            <div className="grid-3col">
              <div className="case-field-unit highlight">
                <label>Recovered Amount</label>
                <b style={{ fontSize: 16, color: "var(--green)" }}>{formatMoney(tx.recovered_amount || 0)}</b>
              </div>
              <div className="case-field-unit">
                <label>Next Operational Step</label>
                <b>{why.next_step || "No further automated retry"}</b>
              </div>
              <div className="case-field-unit">
                <label>Execution Status</label>
                <b>{tx.execution_mode || "SIMULATED RECOVERY"}</b>
              </div>
            </div>
          </div>

          {/* ========================================================
              SECTION 10: TIMELINE (CHRONOLOGICAL AUDIT TRAIL)
              ======================================================== */}
          <div className="case-section-box">
            <div className="case-section-head">
              <h4>
                <span className="section-num">10</span>
                Immutable Timeline & Audit Trail ({logs.length} events)
              </h4>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--muted)" }}>
                Cryptographically Preserved
              </span>
            </div>
            <div className="audit-timeline-compact">
              {logs.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--muted)", padding: 12 }}>
                  No audit logs recorded yet for this case.
                </div>
              ) : (
                logs.map((log: any, idx: number) => (
                  <div key={idx} className="timeline-entry">
                    <div className="entry-head">
                      <span className="entry-time">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}</span>
                      <b style={{ color: "var(--navy)" }}>{pretty(log.event_type)}</b>
                      <span className="entry-actor">{log.actor}</span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "#4b5e58" }}>{log.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="drawer-footer" style={{ display: "flex", justifyContent: "space-between", padding: "14px 24px", background: "#f8fbf8", borderTop: "1px solid var(--line)" }}>
          <button className="btn-secondary" onClick={onClose}>Close Case</button>
          <div style={{ display: "flex", gap: 10 }}>
            {onOpenCustomer && (
              <button
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  onOpenCustomer(tx.customer_id);
                }}
              >
                View Customer 360 Profile
              </button>
            )}
            {onAskCopilot && (
              <button
                className="btn-primary"
                onClick={() => {
                  onClose();
                  onAskCopilot(tx.transaction_id);
                }}
              >
                Open Full Pulse Workspace ➔
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================================
// 6. REVORA PULSE DRAWER & QUICK ASSISTANT
// ========================================================
export function RevoraPulseDrawer({
  onOpenFullChat,
  initialTxId,
  initialCustomerId,
}: {
  onOpenFullChat: () => void;
  initialTxId?: string;
  initialCustomerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string; decision?: string }>>([
    {
      role: "assistant",
      content: "Hello! I am Revora Pulse, your payment recovery assistant. How can I help you recover revenue today?",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const askPulse = async (queryText?: string) => {
    const q = (queryText || quickQuery).trim();
    if (!q || busy) return;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuickQuery("");
    setBusy(true);

    try {
      const res = await fetch(`${API}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          active_transaction_id: initialTxId || undefined,
          active_customer_id: initialCustomerId || undefined,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "Query processed.",
          decision: data.policy_decision,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Revora Pulse is temporarily unreachable." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition not supported in browser.");
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onstart = () => setRecording(true);
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      askPulse(text);
    };
    rec.start();
  };

  return (
    <div className="floating-assistant-wrap">
      {open ? (
        <div className="floating-copilot-card" style={{ width: 420 }}>
          <div className="copilot-head">
            <div>
              <b>Revora Pulse</b>
              <small style={{ display: "block", fontSize: 9, color: "#a9c1ba", fontWeight: 400 }}>
                Your payment recovery assistant
              </small>
            </div>
            <button className="copilot-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="copilot-body" style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: m.role === "user" ? "var(--navy)" : "#f3f7f4",
                  color: m.role === "user" ? "white" : "var(--ink)",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.5,
                  border: "1px solid #dce5e0",
                }}
              >
                <b>{m.role === "user" ? "You" : "Pulse"}</b>: {m.content}
                {m.decision && (
                  <span className={`decision-pill ${m.decision.toLowerCase()}`} style={{ marginLeft: 6, fontSize: 8 }}>
                    {m.decision}
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
                Pulse is retrieving context...
              </div>
            )}
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", background: "#f8fbf8", display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askPulse()}
              placeholder="Ask Pulse..."
              style={{ flex: 1, border: "1px solid #cbdcd1", borderRadius: 6, padding: "7px 10px", fontSize: 11 }}
            />
            <button
              className={`pulse-mic-btn ${recording ? "recording" : ""}`}
              style={{ width: 32, height: 32, fontSize: 14 }}
              onClick={startVoice}
              title="Speak to Revora Pulse"
            >
              🎤
            </button>
            <button className="btn-primary" style={{ padding: "7px 12px", fontSize: 11 }} disabled={busy} onClick={() => askPulse()}>
              Send
            </button>
          </div>
          <div className="copilot-footer" style={{ padding: "8px 12px", background: "white", borderTop: "1px solid #edf1ee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>Zero Live Funds Touched</span>
            <button className="btn-link" style={{ fontSize: 10 }} onClick={onOpenFullChat}>
              Open Full Workspace ➔
            </button>
          </div>
        </div>
      ) : (
        <button className="floating-trigger-btn" onClick={() => setOpen(true)}>
          ⚡ Ask Revora Pulse
        </button>
      )}
    </div>
  );
}

export const FloatingAssistantWidget = RevoraPulseDrawer;


// ========================================================
// 7. INGESTION MODAL
// ========================================================
export function IngestionModal({
  isOpen,
  onClose,
  onRefresh,
  onRunBatch,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onRunBatch?: (datasetId?: string) => void;
}) {
  const [csvContent, setCsvContent] = useState("");
  const [datasetName, setDatasetName] = useState("Enterprise Failure Batch");
  const [filename, setFilename] = useState("events.csv");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileRead = (file: File) => {
    setFilename(file.name);
    setDatasetName(file.name.replace(/\.[^/.]+$/, "") || "Uploaded Dataset");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) setCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileRead(e.dataTransfer.files[0]);
    }
  };

  const handleIngest = async () => {
    if (!csvContent.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/datasets/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: datasetName || "Enterprise Batch",
          filename: filename || "events.csv",
          csv_content: csvContent,
        }),
      });
      const data = await res.json();
      setStats(data);
      if (onRefresh) onRefresh();
    } catch {
      alert("Ingestion failed - verify API connection.");
    } finally {
      setBusy(false);
    }
  };

  const sampleCsv = `transaction_id,customer_id,amount,currency,payment_method,failure_reason,retry_count
TX_LIVE_001,CUST_881,1850.00,INR,CARD,TIMEOUT,0
TX_LIVE_002,CUST_882,14500.00,INR,CARD,INSUFFICIENT_FUNDS,0
TX_LIVE_003,CUST_883,899.00,INR,UPI,NETWORK_ERROR,1
TX_LIVE_004,CUST_884,4500.00,INR,CARD,TEMPORARY_BANK_ERROR,0
TX_LIVE_005,CUST_885,2200.00,INR,NETBANKING,BANK_DECLINED,2`;

  return (
    <div className="queue-modal-overlay">
      <div className="queue-modal ingestion-modal" style={{ maxWidth: 620 }}>
        <div className="eyebrow orange">INGESTION & DATASET REGISTRATION</div>
        <h3 style={{ margin: "4px 0 6px" }}>Import Payment Failure Dataset</h3>
        <p className="panel-copy" style={{ margin: "0 0 16px" }}>
          Upload or paste payment gateway transaction failure events. Records are validated against Pydantic schema, normalized, and mapped to a distinct recovery dataset.
        </p>

        {/* Drag and Drop Zone */}
        <div
          className={`dropzone-box ${isDragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input-hidden")?.click()}
        >
          <input
            type="file"
            id="file-input-hidden"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileRead(e.target.files[0]);
              }
            }}
          />
          <span className="dropzone-icon">📁</span>
          <b>{filename !== "events.csv" ? filename : "Drag and drop CSV file here, or click to browse"}</b>
          <p>Supports .csv UTF-8 formatted exports from payment gateways</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "12px 0" }}>
          <div>
            <label style={{ font: "700 9px 'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase" }}>
              Dataset Name
            </label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4, border: "1px solid var(--line)", borderRadius: 5, font: "11px inherit" }}
            />
          </div>
          <div>
            <label style={{ font: "700 9px 'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase" }}>
              File Reference
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4, border: "1px solid var(--line)", borderRadius: 5, font: "11px inherit" }}
            />
          </div>
        </div>

        <div className="modal-field">
          <div className="field-header">
            <label>Or Paste CSV Raw Text:</label>
            <button className="sample-btn" onClick={() => setCsvContent(sampleCsv)}>
              Load Sample CSV
            </button>
          </div>
          <textarea
            rows={5}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="transaction_id,customer_id,amount,currency,payment_method,failure_reason,retry_count..."
            style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}
          />
        </div>

        {stats && (
          <div className="ingest-stats-result" style={{ margin: "14px 0", padding: 12, background: "#edf4ee", borderRadius: 6 }}>
            <b style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--green)" }}>
              DATASET REGISTERED: {stats.dataset_id}
            </b>
            <div className="stats-row" style={{ marginTop: 6, display: "flex", gap: 14, fontSize: 11, flexWrap: "wrap" }}>
              <span>Total Received: <b>{stats.total_rows || 0}</b></span>
              <span>Valid: <b className="c-safe">{stats.valid_rows || 0}</b></span>
              <span>Errors: <b className="c-warn">{stats.invalid_rows || 0}</b></span>
              <span>Volume: <b>₹{Number(stats.total_amount_inr || 0).toLocaleString()}</b></span>
            </div>

            {onRunBatch && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #cbdcd1" }}>
                <button
                  className="batch-button"
                  style={{ width: "100%", padding: 10, fontSize: 11 }}
                  onClick={() => {
                    onClose();
                    onRunBatch(stats.dataset_id);
                  }}
                >
                  🚀 Run Autonomous Recovery on This Dataset Now
                </button>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            disabled={busy || !csvContent.trim()}
            onClick={handleIngest}
          >
            {busy ? "VALIDATING & PERSISTING..." : "VALIDATE & REGISTER DATASET"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ReviewQueuePanel = HumanQueuePanel;
export const RevoraPulseWorkspace = ConversationsPanel;

