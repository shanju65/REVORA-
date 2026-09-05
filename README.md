# REVORA — AI Revenue Recovery 
┃ https://revora-woad-tau.vercel.app/ ┃ [![YouTube](https://img.shields.io/badge/YouTube-Demo-red?style=flat-square&logo=youtube)](https://youtu.be/2OND6ntDwFE) https://youtu.be/2OND6ntDwFE ┃

> **Recover revenue before it becomes lost revenue.**

**Razorpay Buildathon 2026 · Track 03 — AI Revenue Recovery**

[![Track 03](https://img.shields.io/badge/Track-03%20AI%20Revenue%20Recovery-ff6b35?style=flat-square)](#)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square)](#)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js-111827?style=flat-square)](#)
[![Gemini](https://img.shields.io/badge/LLM-Google%20Gemini-6366f1?style=flat-square)](#)
[![Razorpay](https://img.shields.io/badge/Payments-Razorpay%20Test%20Sandbox-0ea5e9?style=flat-square)](#)

---

## ✦ What is Revora?

Revora is an **AI revenue-recovery platform for failed payments**.

It detects payment revenue at risk, understands why a payment failed, considers customer and transaction context, recommends the next recovery intervention, and sends that recommendation through a **deterministic Policy Gateway** before anything can execute.

The result is a controlled recovery loop:

```text
DETECT
  ↓
UNDERSTAND
  ↓
DECIDE
  ↓
AUTHORIZE
  ↓
ACT
  ↓
MEASURE
  ↓
LEARN
```

### The principle behind Revora

> **The intelligence is probabilistic. The financial authority is deterministic.**

The Recovery Agent can recommend an action. It cannot authorize financial execution. The Policy/Guardrail layer independently determines whether the proposed action is allowed, and only approved actions reach the executor. fileciteturn3file0L4-L7

---

# Problem

Payment failure recovery is often stuck between two extremes:

| Approach | Problem |
|---|---|
| **Blind retries** | Same action, regardless of customer context, failure reason, retry history, or payment state |
| **Unbounded AI agents** | Intelligent recommendations with potentially unsafe financial execution authority |

Revora sits between them:

**context-aware enough to make better recovery decisions, but bounded enough to keep financial actions under deterministic control.**

---

# Solution

Revora uses contextual recovery intelligence built around five ideas:

### Context-aware
Uses signals such as failure reason, retry history, customer payment reliability, transaction age, payment method, and amount.

### Deterministically governed
Every proposed action is independently evaluated by the Policy Gateway before execution.

### Provider-aware
Approved actions can flow through the execution layer and a Razorpay Test Sandbox integration.

### Fully auditable
Important decisions and outcomes are written to an append-only audit trail.

### Measurable
Revora measures recovered revenue rather than treating recommendations or attempted actions as successful recovery.

---

# Architecture

```text
                                  ┌──────────────────────┐
                                  │        REVORA        │
                                  │   AI REVENUE         │
                                  │      RECOVERY        │
                                  └──────────┬───────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       │           EXPERIENCE LAYER               │
                       │                                           │
                       │ Home                                      │
                       │ Recovery Engine                           │
                       │ Customer 360                              │
                       │ Revora Pulse AI                           │
                       │ Recovery Intelligence                     │
                       └─────────────────────┬─────────────────────┘
                                             │
                                             ▼
                                  ┌──────────────────┐
                                  │    INGESTION     │
                                  │ Payment Events   │
                                  │ Validation       │
                                  └────────┬─────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │    RISK ENGINE   │
                                  │ 0–100 Risk Score │
                                  │ Risk Tier        │
                                  └────────┬─────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │   ROOT CAUSE     │
                                  │ Rules + Gemini   │
                                  └────────┬─────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │  RECOVERY AGENT  │
                                  │ Context +        │
                                  │ Customer History │
                                  │ Recommendation   │
                                  └────────┬─────────┘
                                           ▼
                       ╔══════════════════════════════════════╗
                       ║       DETERMINISTIC POLICY          ║
                       ║              GATEWAY                ║
                       ║          FINAL AUTHORITY            ║
                       ╚════════════════════╤═════════════════╝
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                           APPROVED      ESCALATED      STOPPED
                              │             │             │
                              ▼             ▼             ▼
                        VALIDATION      REVIEW QUEUE    TERMINAL
                              │
                              ▼
                         EXECUTION
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
               RAZORPAY TEST       SIMULATOR
                SANDBOX
                     │
                     └────────┬────────┘
                              ▼
                           OUTCOME
                              │
                              ▼
                    ┌────────────────────┐
                    │  AUDIT + ANALYTICS │
                    └─────────┬──────────┘
                              ▼
                    RECOVERY INTELLIGENCE
                              │
                              ▼
                   HISTORICAL OUTCOMES
                              │
                              └──────► future contextual decisions
```

The core service separation is explicit: Risk Detector identifies revenue at risk, Recovery Agent recommends what should happen, Guardrail Engine decides what is allowed, Recovery Executor performs approved actions, and Audit Service records what happened. fileciteturn3file0L73-L79

---

# Agentic Recovery Loop

```text
DETECT → REASON → DECIDE → GUARDRAIL → ACT → MEASURE
```

### 01 · Detect
Identify failed payment events and the revenue associated with them.

### 02 · Reason
Evaluate payment telemetry and customer context.

### 03 · Decide
Choose one of the bounded recovery interventions:

- `RETRY_NOW`
- `RETRY_LATER`
- `CONTACT_CUSTOMER`
- `ESCALATE_TO_HUMAN`
- `STOP_RECOVERY`

### 04 · Guardrail
Independently evaluate whether the proposed intervention is allowed.

### 05 · Act
Execute only approved actions.

### 06 · Measure
Record the actual outcome and recovered amount.

These six stages are implemented as discrete, auditable steps. fileciteturn3file0L83-L96

---

# Deterministic Policy Gateway

The Policy Gateway is the **financial safety boundary**.

| Policy | Default | Result when violated |
|---|---:|---|
| Maximum retries | 2 prior attempts | `STOPPED` |
| Automatic action amount | ₹10,000 | `ESCALATED` |
| Recovery window | 24 hours | `STOPPED` |
| Minimum confidence | 60% | `BLOCKED` |
| Supported actions | Vetted enum | `BLOCKED` |

Additional safety conditions can stop or escalate activity for cases such as do-not-contact, revoked mandates, stolen/blocked payment states, and unsupported execution states.

The guardrails are deliberately deterministic and cannot be overridden by the AI agent. fileciteturn3file0L100-L110

---

# Revora Pulse AI

**Revora Pulse** is the conversational layer of the product.

It is designed to answer questions about:

- payments
- transactions
- customers
- recovery cases
- batches
- payment failures
- provider results
- recovery policies
- recovery performance

### Conversation flow

```text
USER
  ↓
INTENT + SCOPE
  ↓
RETRIEVAL
  ↓
CONTEXT
  ↓
GEMINI
  ↓
GROUNDED RESPONSE
```

For action requests:

```text
USER REQUEST
     ↓
PULSE
     ↓
RECOVERY DECISION
     ↓
POLICY GATEWAY
     ↓
EXECUTION
```

Pulse can use payment/customer/case context while keeping financial authority outside the LLM.

---

# Customer 360

Customer 360 turns customer history into recovery context.

For each customer, Revora can surface:

- payment history
- successful and failed payments
- recovered revenue
- amount at risk
- open recovery cases
- recovery history
- customer health

Possible operational states:

`HEALTHY` · `AT_RISK` · `RECOVERING` · `ESCALATED`

This makes recovery decisions explainable at the customer level instead of treating every failed payment as an isolated event.

---

# Razorpay Test Sandbox

Revora can use Razorpay's **Test/Sandbox environment** as its payment-provider execution layer.

```text
Recovery Case
     ↓
Policy Gateway
     ↓
APPROVED
     ↓
Execution Layer
     ↓
Razorpay TEST
     ↓
Provider Result
     ↓
Revora Outcome
```

The Test Sandbox is used to validate the provider integration without moving real customer money.

Provider responses are recorded as execution/outcome data. A failed provider response is not counted as recovered revenue.

> **Important:** Razorpay TEST is an integration/demo environment. Revora does not claim unauthorized live-money payment retries.

---

# Recovery Actions

Revora supports five bounded interventions:

| Action | Purpose |
|---|---|
| `RETRY_NOW` | Attempt an immediate retry for suitable transient failures |
| `RETRY_LATER` | Schedule a delayed retry when waiting is safer |
| `CONTACT_CUSTOMER` | Prompt the customer to resolve an issue before retrying |
| `ESCALATE_TO_HUMAN` | Route higher-risk/high-value cases to operations |
| `STOP_RECOVERY` | End automated recovery when policy says to stop |

These actions are constrained by the Policy Gateway. fileciteturn3file0L114-L123

---

# Recovery Intelligence

Revora separates operational recovery metrics from offline model evaluation.

## Operational metrics

### Revenue at Risk

```text
SUM(failed transaction amounts)
```

### Recovered Revenue

```text
SUM(successful recovered amounts)
```

### Financial Recovery Rate

```text
Recovered Revenue
----------------- × 100
Revenue at Risk
```

### Additional metrics

- approved action value
- successful recoveries
- failed executions
- escalations
- blocked actions
- stopped recoveries
- action success rate
- provider outcomes

The recovery funnel is designed to measure actual recovered revenue, not merely attempted actions. fileciteturn3file0L135-L145

---

# Recovery Intelligence Report

A completed batch can be summarized into one recovery report:

```text
EXECUTIVE SUMMARY
        ↓
RECOVERY FUNNEL
        ↓
ROOT CAUSE BREAKDOWN
        ↓
ACTION PERFORMANCE
        ↓
CUSTOMER INSIGHTS
        ↓
POLICY IMPACT
        ↓
SAFETY
        ↓
PROVIDER OUTCOMES
```

This provides a single view of what the recovery engine actually accomplished.

---

# Baseline vs Revora

Revora can compare:

```text
BASELINE POLICY
      vs
REVORA POLICY
```

under the same safety constraints.

The comparison can include:

- recovered revenue
- recovery rate
- successful recoveries
- failed actions
- escalations
- guardrail stops
- incremental recovery

Historical and policy comparisons should be based on persisted outcomes rather than fabricated metrics.

---

# Auditability

Every major decision is traceable through the audit trail.

Typical events include:

```text
INGESTED
RISK_SCORED
ROOT_CAUSE_IDENTIFIED
AGENT_DECISION
LLM_REQUEST
LLM_RESPONSE
LLM_VALIDATION
GUARDRAIL_APPROVED
GUARDRAIL_BLOCKED
GUARDRAIL_ESCALATED
EXECUTION_REQUESTED
EXECUTION_SKIPPED
EXECUTION_SUCCESS
EXECUTION_FAILED
OUTCOME_RECORDED
HUMAN_ESCALATION
```

Each event can capture:

- timestamp
- transaction ID
- case ID
- event type
- actor
- description
- structured metadata

The system keeps batch history append-only and supports replay of recorded decision stages. fileciteturn3file0L126-L131

---

# Evaluation Integrity

Revora deliberately separates **production decisioning** from **offline benchmark labels**.

The production pipeline must not use `ground_truth_recoverable` to determine an action.

Offline evaluation measures:

- Precision
- Recall
- F1
- True/False Positives and Negatives
- False-positive revenue cost

During development, an evaluation leakage issue was found and fixed by separating benchmark label generation from production inference and adding an isolation test. The post-audit benchmark was intentionally reported at **Precision 0.645, Recall 0.746, F1 0.692** rather than preserving inflated leaked results. fileciteturn3file0L156-L169

---

# Data Flow

```text
Payment Event
     ↓
Risk
     ↓
Root Cause
     ↓
Recovery Decision
     ↓
Policy
     ↓
Execution
     ↓
Outcome
     ↓
Audit
     ↓
Analytics
     ↓
Historical Evidence
```

Historical outcomes can then be used as contextual evidence for future recovery decisions without overriding hard safety rules.

---

# Product Experience

Revora is organized around a small set of connected product areas:

| Area | Purpose |
|---|---|
| **Home** | Introduces Revora and surfaces the most important recovery state |
| **Recovery Engine** | Operate recovery cases and batches |
| **Customer 360** | Understand customer payment and recovery history |
| **Revora Pulse AI** | Ask grounded payment/recovery questions using text or voice |
| **Recovery Intelligence** | Analyze recovery performance and generate reports |

The goal is to make the experience feel like one recovery operating system rather than a collection of isolated AI features.

---

# Repository Structure

```text
revora/
│
├── backend/
│   ├── main.py
│   ├── services/
│   │   ├── risk_detector.py
│   │   ├── recovery_agent.py
│   │   ├── guardrail_engine.py
│   │   ├── recovery_executor.py
│   │   ├── audit_service.py
│   │   ├── batch_service.py
│   │   ├── recovery_analytics.py
│   │   ├── llm_service.py
│   │   ├── rag_service.py
│   │   └── razorpay_service.py
│   ├── data/
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── data/
│   └── revora.db
│
├── README.md
└── .env
```

---

# Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Backend | FastAPI |
| Language | Python / TypeScript |
| Database | SQLite |
| LLM | Google Gemini |
| Retrieval | Structured + semantic RAG |
| Validation | Pydantic |
| Provider | Razorpay Test Sandbox |
| API | REST |
| Evaluation | Offline benchmark pipeline |

---

# Getting Started

## Prerequisites

- Python 3.x
- Node.js
- npm
- Gemini API key for LLM features
- Razorpay Test credentials for provider integration

## Backend

```powershell
cd backend

python -m venv .venv

.\.venv\Scripts\pip install -r requirements.txt
```

Configure `.env`:

```env
GEMINI_API_KEY=your_gemini_key

RAZORPAY_KEY_ID=your_razorpay_test_key
RAZORPAY_KEY_SECRET=your_razorpay_test_secret
RAZORPAY_MODE=test

DATABASE_URL=sqlite:///data/revora.db
```

Never commit `.env`.

Start the backend:

```powershell
.\.venv\Scripts\python main.py
```

Backend:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

## Frontend

```powershell
cd frontend

npm install

$env:NEXT_PUBLIC_API_URL="http://localhost:8000"

npm run dev
```

Frontend:

```text
http://localhost:3000
```

---

# Testing

## Backend

```powershell
backend\.venv\Scripts\python.exe backend/test_services.py
```

The existing test suite covers contextual decisioning, safety thresholds, execution rejection, auditing, ground-truth isolation, deterministic explanations, guardrail evaluation, and historical batch persistence. fileciteturn3file0L235-L254

## Frontend

```powershell
cd frontend
npm run build
```

---

# Demo Scenarios

## Scenario A — Successful Recovery

```text
Temporary failure
      ↓
High recovery probability
      ↓
Recovery recommendation
      ↓
Policy APPROVED
      ↓
Execution
      ↓
SUCCESS
```

## Scenario B — High-Value Escalation

```text
Amount > ₹10,000
      ↓
Agent recommends recovery
      ↓
Policy ESCALATED
      ↓
Review Queue
      ↓
No automatic execution
```

## Scenario C — Maximum Retries

```text
Retry Count = 2
      ↓
Policy STOPPED
      ↓
No further automated recovery
```

## Scenario D — Pulse

```text
"Why did this payment fail?"
             ↓
Retrieve transaction + case + policy context
             ↓
Grounded answer
```

## Scenario E — Razorpay Test

```text
Approved case
     ↓
Execution Layer
     ↓
Razorpay TEST
     ↓
Provider response
     ↓
Case + Audit + Outcome
```

---

# Engineering Challenges

## Evaluation leakage

An early benchmark appeared unrealistically strong because the synthetic benchmark labels were generated using logic too similar to the production agent.

The system was changed to:

- generate benchmark labels independently
- isolate ground truth from production decisions
- automatically verify that removing ground truth does not change production decisions
- report the post-audit benchmark honestly

This was one of the key engineering integrity fixes in the project. fileciteturn3file0L158-L169

## Legacy database migration

Historical SQLite instances required schema changes for batch and case persistence.

The migration strategy preserved historical records while moving to append-only batch/case behavior.

## Metric separation

Guardrail blocks, escalations, stopped recoveries, and successful actions are tracked independently rather than conflated into one status count. fileciteturn3file0L173-L178

---

# Security Principles

Revora must never:

- expose API secrets
- collect CVV
- collect OTP
- collect PIN
- store full card numbers
- allow AI to bypass the Policy Gateway
- mark failed provider actions as recovered revenue
- treat benchmark ground truth as a production decision signal

---

# Limitations

Revora is a buildathon prototype.

- Payment datasets are primarily synthetic.
- Razorpay integration is demonstrated through the Test/Sandbox environment.
- The current persistence layer uses SQLite.
- Higher-scale production deployment would require production-grade database and worker infrastructure.
- Benchmark performance is measured on synthetic data and should not be interpreted as a guarantee of real-world payment-network performance.
- Live financial execution would require appropriate merchant authorization, security controls, provider agreements, and compliance review.

The original project documentation explicitly distinguishes simulated/test recovery from real-money movement and avoids claiming unauthorized live Razorpay execution. fileciteturn3file0L182-L188

---

# Demo Script

### 1. Identify the problem
Open Revora and show a failed payment with revenue at risk.

### 2. Open the case
Show:

**Risk → Root Cause → Customer Context → Recovery Recommendation**

### 3. Show the safety boundary
Use a high-value case:

**AI recommendation → Policy Gateway → Escalation**

> "The AI suggested the action. The deterministic policy decided that it was not allowed to execute automatically."

### 4. Show successful recovery
Use an approved case and demonstrate the execution/outcome path.

### 5. Show provider integration
Show Razorpay Test Sandbox and the actual provider response.

### 6. Ask Pulse
Ask:

> "Why did this payment fail?"

Then:

> "What happened after the retry?"

### 7. Show the result
End on:

**Recovered Revenue + Audit Trail + Recovery Intelligence**

---

# What Makes Revora Different?

Most payment-recovery systems answer:

> **"Should I retry this payment?"**

Revora asks a broader question:

> **"What is the safest intervention that is most likely to recover this revenue, and can I prove what happened afterward?"**

That leads to the central loop:

```text
SEE THE RISK
     ↓
UNDERSTAND THE PAYMENT
     ↓
CHOOSE THE INTERVENTION
     ↓
CHECK THE POLICY
     ↓
TAKE THE ACTION
     ↓
MEASURE THE RESULT
```

---


## Built For

**Razorpay Buildathon 2026**  
**Track 03 — AI Revenue Recovery**
