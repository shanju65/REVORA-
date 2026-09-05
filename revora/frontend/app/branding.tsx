"use client";

import React, { useState, useEffect } from "react";

export function RevoraLogo({ size = 36, showWordmark = true, subtext = "AI REVENUE RECOVERY" }: { size?: number; showWordmark?: boolean; subtext?: string }) {
  return (
    <div className="revora-brand" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <rect width="36" height="36" rx="9" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
        {/* Subtle geometric grid accent */}
        <path d="M6 18H30M18 6V30" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
        {/* Vector Monogram 'R' in vibrant coral */}
        <path
          d="M11 27V9H19C22.3137 9 25 11.6863 25 15C25 17.8183 23.0569 20.1834 20.4042 20.8256L25.5 27H20.5L16 21H15V27H11Z"
          fill="#f95738"
        />
        <path
          d="M15 13H18.5C19.8807 13 21 14.1193 21 15.5C21 16.8807 19.8807 18 18.5 18H15V13Z"
          fill="#0f172a"
        />
        {/* Verification node dot in emerald green */}
        <circle cx="28" cy="8" r="2.5" fill="#10b981" />
      </svg>
      {showWordmark && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontWeight: 900,
              fontSize: 17,
              letterSpacing: "0.14em",
              color: "#ffffff",
            }}
          >
            REVORA
          </span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 8.5,
              letterSpacing: "0.14em",
              color: "#94a3b8",
              marginTop: 4,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {subtext}
          </span>
        </div>
      )}
    </div>
  );
}

export function StatusPill({
  status,
  size = "md",
}: {
  status: "HEALTHY" | "AT_RISK" | "RECOVERING" | "ESCALATED" | string;
  size?: "sm" | "md";
}) {
  const norm = (status || "HEALTHY").toUpperCase();
  let bg = "#e0f0e9";
  let color = "#1a7b60";
  let dotColor = "#55c593";

  if (norm === "AT_RISK" || norm === "BLOCKED") {
    bg = "#fef3c7";
    color = "#92400e";
    dotColor = "#d97706";
  } else if (norm === "RECOVERING" || norm === "RECOVERY" || norm === "IN_REVIEW") {
    bg = "#e0f2fe";
    color = "#0369a1";
    dotColor = "#0284c7";
  } else if (norm === "ESCALATED" || norm === "STOPPED" || norm === "FAILED") {
    bg = "#feebe8";
    color = "#a34a4a";
    dotColor = "#ef4444";
  }

  const pad = size === "sm" ? "3px 7px" : "5px 10px";
  const fontSize = size === "sm" ? 8.5 : 10;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        backgroundColor: bg,
        color: color,
        padding: pad,
        borderRadius: 4,
        fontFamily: "'DM Mono', monospace",
        fontSize: fontSize,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: dotColor,
          display: "inline-block",
        }}
      />
      {norm.replace("_", " ")}
    </span>
  );
}

export function RevoraOrbitalDiagram({ onSelectStage }: { onSelectStage?: (stageId: string) => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const currentIdx = hoveredIdx !== null ? hoveredIdx : activeIdx;

  useEffect(() => {
    if (hoveredIdx !== null) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % 5);
    }, 2800);
    return () => clearInterval(interval);
  }, [hoveredIdx]);

  const nodes = [
    {
      id: "ingest",
      step: "01",
      label: "Payment Ingest",
      sub: "Gateway Webhooks & Declines",
      metric: "TX10988 · Bank Timeout",
      icon: "⚡",
      color: "#6366f1",
      x: 240,
      y: 64,
    },
    {
      id: "diagnose",
      step: "02",
      label: "Causal ML Diagnosis",
      sub: "Transient Risk Scoring",
      metric: "91% Recoverability Signal",
      icon: "🧠",
      color: "#06b6d4",
      x: 402,
      y: 180,
    },
    {
      id: "guardrail",
      step: "03",
      label: "Deterministic Gateway",
      sub: "Policy & Safety Invariants",
      metric: "Rule 2 Checked · 0 Breaches",
      icon: "🛡️",
      color: "#f59e0b",
      x: 340,
      y: 374,
    },
    {
      id: "action",
      step: "04",
      label: "Action Orchestration",
      sub: "Safe Retries & Outreach",
      metric: "Executed via Sandbox",
      icon: "🎯",
      color: "#f95738",
      x: 140,
      y: 374,
    },
    {
      id: "settle",
      step: "05",
      label: "Ledger & Settle",
      sub: "Captured Funds & Proof",
      metric: "₹7,110 Settled ✓",
      icon: "💰",
      color: "#10b981",
      x: 78,
      y: 180,
    },
  ];

  const activeNode = nodes[currentIdx];

  return (
    <div className="revora-orbit-wrapper">
      <div className="revora-orbit-console">
        {/* Ambient background glow */}
        <div
          className="orbit-ambient-glow"
          style={{
            background: `radial-gradient(circle, ${activeNode.color}25 0%, transparent 70%)`,
          }}
        />

        {/* SVG Orbital Track & Connecting Ray Lines */}
        <svg
          className="orbit-svg-canvas"
          viewBox="0 0 480 480"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer dashed orbital ring */}
          <circle
            cx="240"
            cy="240"
            r="170"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            className="orbit-track-dashed"
          />
          {/* Inner concentric faint ring */}
          <circle
            cx="240"
            cy="240"
            r="115"
            stroke="rgba(99, 102, 241, 0.15)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          {/* Connector spokes from center to each node */}
          {nodes.map((node, i) => (
            <line
              key={node.id}
              x1="240"
              y1="240"
              x2={node.x}
              y2={node.y}
              stroke={i === currentIdx ? node.color : "rgba(255, 255, 255, 0.06)"}
              strokeWidth={i === currentIdx ? "1.5" : "1"}
              strokeDasharray={i === currentIdx ? "none" : "2 3"}
              style={{ transition: "stroke 0.3s ease, stroke-width 0.3s ease" }}
            />
          ))}
          {/* Active node highlight sector arc */}
          <circle
            cx="240"
            cy="240"
            r="170"
            stroke={activeNode.color}
            strokeWidth="2.5"
            strokeDasharray="60 1000"
            strokeDashoffset={-((currentIdx * 72) * (170 * 2 * Math.PI / 360)) + 30}
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s ease, stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>

        {/* Orbiting Photon Beacon (continuous circular orbit) */}
        <div className="orbit-beacon-container">
          <div className="orbit-beacon-rotor">
            <div className="orbit-beacon-head" />
            <div className="orbit-beacon-tail" />
          </div>
        </div>

        {/* Counter-rotating decorative inner ring */}
        <div className="orbit-inner-ring-anim" />

        {/* Central Hub: Revora Engine Core */}
        <div
          className="orbit-center-core"
          style={{ borderColor: activeNode.color }}
          onClick={() => onSelectStage && onSelectStage(activeNode.id)}
        >
          <div className="core-pulse-ring" style={{ borderColor: `${activeNode.color}60` }} />
          <div className="core-inner-content">
            <div className="core-brand-icon">
              <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                <path
                  d="M11 27V9H19C22.3137 9 25 11.6863 25 15C25 17.8183 23.0569 20.1834 20.4042 20.8256L25.5 27H20.5L16 21H15V27H11Z"
                  fill="#f95738"
                />
                <circle cx="28" cy="8" r="2.5" fill="#10b981" />
              </svg>
            </div>
            <span className="core-title">REVORA CORE</span>
            <div className="core-live-status">
              <span className="live-dot" style={{ background: "#10b981" }} />
              <span>ACTIVE</span>
            </div>
            <div className="core-metric-pill" style={{ color: activeNode.color }}>
              {activeNode.metric}
            </div>
          </div>
        </div>

        {/* 5 Orbiting Process Nodes */}
        {nodes.map((node, idx) => {
          const isActive = idx === currentIdx;
          return (
            <div
              key={node.id}
              className={`orbit-node-card ${isActive ? "active-orbit-node" : ""}`}
              style={{
                left: node.x,
                top: node.y,
                borderColor: isActive ? node.color : "rgba(255, 255, 255, 0.1)",
                boxShadow: isActive ? `0 0 24px ${node.color}45, 0 8px 20px rgba(0,0,0,0.45)` : "0 4px 14px rgba(0,0,0,0.3)",
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectStage && onSelectStage(node.id)}
            >
              <div className="orbit-node-topline">
                <span className="orbit-node-step" style={{ color: node.color }}>
                  {node.step}
                </span>
                <span className="orbit-node-icon">{node.icon}</span>
              </div>
              <div className="orbit-node-name">{node.label}</div>
              <div className="orbit-node-sub">{node.sub}</div>
              {isActive && (
                <div className="orbit-node-active-badge" style={{ color: node.color, background: `${node.color}18` }}>
                  ● {node.metric}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Orbit Control & Status Loop Ticker */}
      <div className="orbit-loop-ticker">
        <span className="ticker-cycle-label">
          <span className="live-dot" style={{ background: "#f95738" }} /> AUTONOMOUS RECOVERY LOOP
        </span>
        <div className="ticker-steps-flow">
          {nodes.map((n, i) => (
            <span
              key={n.id}
              className={`ticker-step-pill ${i === currentIdx ? "active" : ""}`}
              onClick={() => setHoveredIdx(i)}
              style={{
                color: i === currentIdx ? n.color : "#94a3b8",
                borderColor: i === currentIdx ? n.color : "transparent",
              }}
            >
              {n.step} {n.label.split(" ")[0]}
              {i < nodes.length - 1 && <span className="ticker-arrow">→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
