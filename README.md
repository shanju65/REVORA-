# REVORA — Autonomous AI Revenue Recovery
**Razorpay Buildathon 2026 — Track 03: AI Revenue Recovery**

Revora is an autonomous revenue recovery platform that detects payment failures, diagnoses root causes, recommends context-aware interventions, verifies actions against deterministic guardrails, executes bounded recoveries, and maintains an immutable audit trail.

> **Core Architectural Principle:**
> *"Revora separates intelligence from authority. The Recovery Agent recommends an action, but a deterministic Guardrail Engine independently determines whether that action is allowed. Only approved actions reach the Recovery Executor."*

---

## Table of Contents
1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [Architecture](#3-architecture)
4. [Agentic Workflow](#4-agentic-workflow)
5. [Guardrail Design](#5-guardrail-design)
6. [Recovery Actions](#6-recovery-actions)
7. [Auditability](#7-auditability)
8. [Evaluation](#8-evaluation)
9. [Engineering Challenges](#9-engineering-challenges)
10. [What Broke and How We Fixed It](#10-what-broke-and-how-we-fixed-it)
11. [Limitations](#11-limitations)
12. [Demo Flow](#12-demo-flow)
13. [Testing](#13-testing)

---

## 1. Problem
Payment failures are among the largest sources of avoidable revenue churn for subscription and e-commerce platforms. Industry benchmarks show that up to 30% of failed payments are recoverable. However, existing recovery solutions suffer from two opposite extremes:
- **Dumb naive retries:** Rigid cron scripts retry failed payments indiscriminately, exhausting customer retries, triggering provider rate limits, increasing interchange penalty fees, and alienating customers.
- **Unbounded AI agents:** Autonomous agents given unrestricted execution privileges over financial APIs pose critical risks of compliance violations, unintended double-charges, and runaway autonomous actions.

---

## 2. Solution
Revora introduces **Bounded Autonomous Recovery**. It pairs contextual decision intelligence with strict, deterministic policy guardrails.
- **Context-Aware:** Analyzes failure reason, retry history, customer lifetime payment success, transaction age, payment rail, and amount.
- **Strictly Bounded:** An independent Guardrail Engine with veto authority deterministically checks hard limits before any execution can occur.
- **Fully Auditable:** Every observation, analysis hypothesis, policy decision, and execution outcome is permanently written to an immutable append-only ledger.

---

## 3. Architecture

Revora’s design strictly enforces the separation of concerns:

```
                  PAYMENT EVENT
                        ↓
            ┌───────────────────────┐
            │     RISK DETECTOR     │  ──► Detects genuine revenue at risk
            └───────────────────────┘
                        ↓
            ┌───────────────────────┐
            │    RECOVERY AGENT     │  ──► Decides WHAT SHOULD HAPPEN
            └───────────────────────┘
                        ↓  (Recommended Action + Confidence)
            ┌───────────────────────┐
            │   GUARDRAIL ENGINE    │  ──► Decides WHAT IS ALLOWED TO HAPPEN
            └───────────────────────┘
                        ↓  (APPROVED only)
            ┌───────────────────────┐
            │   RECOVERY EXECUTOR   │  ──► Executes ONLY approved actions
            └───────────────────────┘
                        ↓
            ┌───────────────────────┐
            │     AUDIT SERVICE     │  ──► Records WHAT HAPPENED
            └───────────────────────┘
                        ↓
             METRICS & IMPACT FUNNEL
```

### Core Services:
- `RiskDetector` (`backend/services/risk_detector.py`): Scans payment events to isolate failed transactions representing recoverable revenue from successful or untracked transactions.
- `RecoveryAgent` (`backend/services/recovery_agent.py`): Analyzes 7 contextual signals to formulate a diagnosis and recommend an optimal recovery intervention. Has **zero execution authority**.
- `GuardrailEngine` (`backend/services/guardrail_engine.py`): Enforces deterministic compliance and risk boundaries. Independently validates every recommendation. Can approve, block, escalate, or stop actions.
- `RecoveryExecutor` (`backend/services/recovery_executor.py`): Bounded execution layer. Refuses any action with `guardrail_status != "APPROVED"`. In unapproved states, returns `0.0` recovered amount.
- `AuditService` (`backend/services/audit_service.py`): Records immutable, structured audit entries for every lifecycle event.
- `BatchService` (`backend/services/batch_service.py`): Coordinates the lifecycle for batch runs or single transactions with append-only persistence.

---

## 4. Agentic Workflow

The recovery lifecycle follows six discrete, auditable stages:

```
DETECT ──► REASON ──► DECIDE ──► GUARDRAIL ──► ACT ──► MEASURE
```

1. **DETECT:** Risk Detector identifies failed payment events and classifies revenue at risk.
2. **REASON:** Recovery Agent evaluates payment telemetry (failure reason prior, customer success rate, previous transaction volume, transaction age decay, payment method).
3. **DECIDE:** Selects the most appropriate recovery intervention (`RETRY_NOW`, `RETRY_LATER`, `CONTACT_CUSTOMER`, `ESCALATE_TO_HUMAN`, `STOP_RECOVERY`).
4. **GUARDRAIL:** Guardrail Engine independently checks all deterministic rules before any execution is permitted.
5. **ACT:** Recovery Executor acts only on `APPROVED` interventions; skips and records non-approved cases.
6. **MEASURE:** Records final recovery outcome, settles recovered revenue in the database, and publishes event to the audit trail.

---

## 5. Guardrail Design

Guardrails are hard-coded deterministic invariants that **cannot be overridden by the AI agent**:

| Guardrail Rule | Parameter | Limit | Failure Consequence |
|---|---|---|---|
| **Max Retries** | `MAX_RETRIES` | 2 prior attempts | Status: `STOPPED`, Action: `STOP_RECOVERY` |
| **Max Auto Amount** | `MAX_AUTO_ACTION_AMOUNT` | ₹10,000 INR | Status: `ESCALATED`, Action: `ESCALATE_TO_HUMAN` |
| **Recovery Window** | `MAX_RECOVERY_WINDOW` | 24 hours (1440 mins) | Status: `STOPPED`, Action: `STOP_RECOVERY` |
| **Confidence Threshold** | `MIN_RECOVERY_CONFIDENCE` | 60% probability & confidence | Status: `BLOCKED`, Action: `STOP_RECOVERY` |
| **Supported Actions** | `SUPPORTED_ACTION` | Vetted enum | Status: `BLOCKED`, Action: `STOP_RECOVERY` |

---

## 6. Recovery Actions

Revora supports five bounded recovery actions:

1. `RETRY_NOW`: Immediate simulated retry. Recommended for temporary network errors, timeouts, or transient bank dips with zero prior retries and strong customer history.
2. `RETRY_LATER`: Scheduled retry after a cooling window. Recommended for intermittent bank outages to avoid cascading failures.
3. `CONTACT_CUSTOMER`: Recommends proactive cardholder notification (SMS/email/WhatsApp) to authorize 3D Secure or top up funds before re-attempting.
4. `ESCALATE_TO_HUMAN`: Flags high-value payments (> ₹10,000) or persistent bank declines for manual review by the merchant's operations team.
5. `STOP_RECOVERY`: Halts all recovery activities when retry limits are reached or the 24-hour window expires, preventing compliance violations.

---

## 7. Auditability

Every decision is permanently preserved:
- **Append-Only Ledger:** The `audit_logs` table stores sequential events with ISO timestamps, transaction ID, event type, actor (`GATEWAY_MONITOR`, `RISK_DETECTOR`, `AI_AGENT`, `GUARDRAIL_ENGINE`, `RECOVERY_EXECUTOR`, `SYSTEM`), human-readable descriptions, and structured JSON metadata.
- **Batch Isolation:** Each run produces a unique `batch_id`. Rerunning batches appends new records without destroying prior historical data.
- **Decision Replay:** The UI includes an interactive visual replay component (`CaseReplay`) that steps through the 7 actual recorded stages of any case for live demonstration.

---

## 8. Evaluation

Revora separates **operational metrics** from **offline model benchmark metrics**:

### Operational Metrics (`/dashboard/metrics`):
- **Revenue at Risk:** Total sum of all failed transactions detected.
- **Recovery Actions (Eligible / Approved):** Total amount approved by guardrails for autonomous intervention.
- **Successful Recoveries:** Total amount successfully collected by simulated recovery.
- **Financial Recovery Rate:** Strictly calculated as:
  $$\text{Financial Recovery Rate} = \frac{\text{Revenue Recovered}}{\text{Revenue at Risk}} \times 100$$
- **Operational Breakdown:** Explicit counts of successful recoveries, human escalations, blocked actions, stopped recoveries, and failed retries.

### Offline Benchmark Metrics (`/evaluation/metrics`):
- Measures model performance against isolated benchmark labels:
  - **Precision:** True Positives / (True Positives + False Positives)
  - **Recall:** True Positives / (True Positives + False Negatives)
  - **F1 Score:** Harmonic mean of precision and recall
  - **False-Positive Revenue Cost:** Financial exposure of incorrect interventions

---

## 9. Engineering Challenges

### The Synthetic Evaluation Leakage Issue
During development and auditing of Revora, we encountered a critical engineering issue:

**The Problem:**
Initially, the benchmark evaluation metrics appeared suspiciously high (F1 > 0.95, recall near 1.0). When we inspected the synthetic ground-truth generation logic, we discovered that the synthetic generator used the exact same combination of heuristics (e.g., matching failure reason priors and customer success thresholds) as the production `RecoveryAgent`.
This created an **evaluation leakage**: the model was being tested against labels generated by its own decision boundaries.

**The Fix:**
1. **Isolated Benchmark Generation:** We separated ground-truth generation entirely from production reasoning logic. Benchmark labels are determined by independent probabilistic processes.
2. **Production Isolation:** Production services (`RiskDetector`, `RecoveryAgent`, `GuardrailEngine`, `RecoveryExecutor`, `BatchService`) were audited and strictly forbidden from accessing `ground_truth_recoverable`.
3. **Automated Verification:** Added unit test `test_ground_truth_isolation()` that verifies that stripping or modifying ground truth yields 100% identical decisions and executor outputs.
4. **Realistic Benchmark Results:** With the leakage eliminated, the post-audit benchmark produced honest, realistic metrics: Precision 0.645, Recall 0.746, and F1 0.692. The benchmark is intentionally less optimistic, but completely trustworthy.

---

## 10. What Broke and How We Fixed It

1. **Evaluation Label Leakage:** Fixed by decoupling synthetic dataset label generation from production inference and verifying with automated isolation tests.
2. **Schema Migration on Legacy Databases:** When adding `batch_id` and auto-incrementing `case_id` to `recovery_cases`, older SQLite instances failed on primary key collisions. Fixed by writing dynamic table migration logic in `initialise()` that renames legacy tables, copies existing records, and recreates the schema safely.
3. **Guardrails Rules Tracking:** `rules_checked` was previously initialized as an empty list and returned empty. Fixed by recording each check (`PAYMENT_STATUS_CHECK`, `MAX_RETRIES_CHECK`, `MAX_AUTO_ACTION_AMOUNT_CHECK`, `MAX_RECOVERY_WINDOW_CHECK`, `MIN_RECOVERY_CONFIDENCE_CHECK`) to provide full transparency in audit trails.
4. **Metric Conflation:** Previously, `guardrail_blocked_cases` was computed as `len(cases) - approved`, which conflated blocked cases with escalations and stopped cases. Fixed by separating `guardrail_blocked_cases`, `escalated_cases`, and `stopped_cases` into distinct database queries.

---

## 11. Limitations

We believe in complete technical honesty:
- **Simulated Recovery:** Revora interacts with a simulated recovery provider. No real customer bank accounts or credit cards are debited, and no real money is moved.
- **Synthetic Data:** The dataset of 10,000 payment events is synthetically generated with a fixed reproducible random seed (42).
- **Prototype Storage:** The current implementation uses SQLite and in-memory background threads. A production deployment would replace this with PostgreSQL, Redis-backed job queues (Celery/BullMQ), and distributed worker pools.
- **Evaluation Disclaimer:** The benchmark metrics reflect performance on a synthetic distribution and should not be construed as a guarantee of identical real-world payment network performance.
- **No Direct Razorpay Recovery Claim:** Revora demonstrates the architecture, control plane, and decision algorithms for autonomous revenue recovery; it does not claim to execute unauthorized live payment retries against Razorpay's production infrastructure.

---

## 12. Demo Flow

For live judge demonstrations and video submissions, use this exact 3-minute sequence:

### Step 1: Command Center & Architecture (0:00 - 0:45)
- Open the Overview dashboard (`http://localhost:3000`).
- Point out the **Recovery Loop** banner and the **Autonomous Control Architecture** component (`DETECT -> REASON -> DECIDE -> GUARDRAIL -> ACT -> MEASURE`).
- Review the **Recovery Funnel**: Show Revenue at Risk (₹17.85M) → Recovery Actions → Successful Recoveries → Financial Recovery Rate (5.4%).
- Click **"RUN RECOVERY BATCH"** and watch the real-time progress bar and the **LIVE RECOVERY FEED** update with database audit events.

### Step 2: Showcase the Three Safety Scenarios (0:45 - 2:00)
Navigate to **Recovery cases** tab and use the **Demo Showcase** buttons:

- **CASE A — SUCCESS:**
  - Click **"★ Case A: Success"** (e.g., ₹4,999 network error).
  - Open the case modal:
    - Click **"▶ Replay Decision"** to watch the visual 7-step replay (`PAYMENT DETECTED` → `RISK IDENTIFIED` → `CONTEXT ANALYZED` → `AGENT RECOMMENDS ACTION` → `GUARDRAIL CHECK` → `EXECUTION` → `OUTCOME`).
    - Point out the **Agent Reasoning Timeline** showing real telemetry (retry count: 0, customer success: 94%, amount: ₹4,999).
    - Point out the **"WHY REVORA?"** explainability card with its deterministic reason and signals.
    - Outcome: **SUCCESS** (₹4,999 recovered).

- **CASE B — HIGH VALUE ESCALATION:**
  - Click **"★ Case B: High Value"** (e.g., ₹14,999 transaction).
  - Show that the Agent recommended an action, but the **Guardrail Engine marked it ESCALATED**.
  - Show the **"WHY REVORA?"** explanation: *"This recovery exceeds the autonomous action amount threshold (₹10,000). Revora therefore prevents automatic execution and requires human intervention."*
  - Show that the **Recovery Executor was NEVER called** and recovered amount is ₹0.
  - *Proof that AI cannot bypass safety thresholds.*

- **CASE C — MAXIMUM RETRIES STOP:**
  - Click **"★ Case C: Max Retries"** (e.g., retry count 2/2).
  - Show that Guardrail status is **STOPPED**.
  - Show the explanation: *"Maximum retry attempts have been reached. Continuing automated recovery would violate the recovery policy."*
  - Show that the Executor was not called.
  - *Proof that Revora knows when NOT to recover.*

### Step 3: Audit Trail & Evaluation (2:00 - 3:00)
- Click **Audit trail** tab: show the immutable chronological record of every decision.
- Click **Evaluation** tab: show the offline ground-truth benchmark metrics (Precision, Recall, F1, False-positive cost).
- Explain the engineering challenge and how ground-truth isolation was verified.

---

## 13. Testing

### Run Backend Unit Test Suite:
```powershell
backend\.venv\Scripts\python.exe backend/test_services.py
```
Executes 13 comprehensive tests covering:
1. Contextual agent decisions
2. High-value guardrail escalation (> ₹10k)
3. Maximum retry stop (>= 2 retries)
4. Low-confidence block (< 60%)
5. Recovery window expiration (> 24 hours)
6. Executor strict rejection of unapproved actions
7. Approved deterministic execution
8. Rules checked list population
9. Audit event creation and schema validation
10. Ground-truth isolation (production decision-making never reads ground truth)
11. Deterministic "Why Revora" structured explanations
12. Guardrail rules evaluation
13. Batch persistence and append-only database retention

### Run Frontend Build:
```powershell
cd revora/frontend
npm run build
```
Compiles with Turbopack and verifies TypeScript definitions across all pages and components with zero errors.

---

## Local Development Setup

### Backend:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python main.py
```
API runs at `http://localhost:8000` (FastAPI Swagger docs at `http://localhost:8000/docs`).

### Frontend:
```powershell
cd revora/frontend
npm install
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```
UI runs at `http://localhost:3000`.
