# REVORA — Autonomous Revenue Recovery Platform
## Architecture & Technical Specification · Razorpay Buildathon 2026 — Track 03

---

## 1. Executive Summary

**REVORA** is an enterprise-grade Autonomous AI Revenue Recovery platform built for **Track 03: AI Revenue Recovery** of the Razorpay Buildathon 2026. 

When digital transactions fail due to network timeouts, bank downtime, insufficient customer balance, expired cards, or revoked mandates, merchants lose significant revenue to unnecessary churn and abandoned checkouts. Revora solves this by providing an end-to-end, context-aware recovery loop that detects revenue at risk, diagnoses root causes, recommends bounded interventions, and executes compliant recoveries while adhering to strict deterministic safety guardrails.

### The Non-Negotiable Core Principle
> **"AI Can Recommend. Only the Deterministic Policy Gateway Can Authorize Financial Action."**

No machine learning model, LLM, prompt, or conversational interface possesses the authority to independently initiate or execute a financial action. Every recommendation is bounded by hard mathematical constraints, compliance rules, and enterprise safety invariants.

---

## 2. End-to-End System Architecture
<img width="1408" height="768" alt="Gemini_Generated_Image_hxirt6hxirt6hxir" src="https://github.com/user-attachments/assets/d7c44608-0ea3-4313-a77e-4370125c7750" />


```
                                  PAYMENT EVENT STREAM
                 [Webhooks / CSV Ingest / Merchant API / Voice Call]
                                           │
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │        INGESTION & NORMALIZATION LAYER           │
                 │   • Pydantic Schema Validation (RawEvent)        │
                 │   • Deduplication & Field Normalization          │
                 │   • Malformed Record Isolation (raw_events)      │
                 └─────────────────────────┬────────────────────────┘
                                           │ Valid Event
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │               0-100 RISK ENGINE                  │
                 │   • Explicit 0-100 Risk Score & Risk Tiers       │
                 │   • Financial Exposure, Velocity, Fatigue        │
                 │   • Hard-Stop Flags (DNC, Mandate Revoked)       │
                 └─────────────────────────┬────────────────────────┘
                                           │ Contextual Signals
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │           HYBRID ROOT CAUSE ANALYZER             │
                 │   • Rule-First Deterministic Classification      │
                 │   • Gemini LLM Fallback for Ambiguous Codes      │
                 │   • Recoverability & Channel Attribution         │
                 └─────────────────────────┬────────────────────────┘
                                           │ Diagnosis & Evidence
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │             CONTEXT-AWARE RECOVERY AGENT         │
                 │   • Intervention Selection (Retry/Outreach/Stop) │
                 │   • Historical Empirical Learning Loop           │
                 │   • Recovery Probability & Confidence Scoring    │
                 └─────────────────────────┬────────────────────────┘
                                           │ Action Recommendation
                                           ▼
                 ┌──────────────────────────────────────────────────┐
                 │       DETERMINISTIC POLICY GATEWAY (AUTHORITY)   │
                 │   1. Only Failed Payments (FAILED_PAYMENT_ONLY)  │
                 │   2. Hard Stops (DNC, Mandate, Stolen/Expired)   │
                 │   3. Max Retry Ceiling (<= 2 Attempts)           │
                 │   4. Amount Threshold (<= ₹10,000 Auto-Action)   │
                 │   5. Max Recovery Window (<= 24 Hours / 1440m)   │
                 │   6. Confidence Floor (Confidence >= 60%)        │
                 │   7. Intervention Budget (<= 1 Customer Outreach)│
                 └──────┬──────────────┬──────────────┬─────────────┘
                        │              │              │
             APPROVED   │   ESCALATED  │      BLOCKED │   STOPPED
             ┌──────────┘   ┌──────────┘      ┌───────┴──────┐
             │              │                 │              │
             ▼              ▼                 ▼              ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  AI OUTPUT   │ │ HUMAN REVIEW │ │ AUDIT RECORD │ │ RECOVERY     │
     │  VALIDATOR   │ │    QUEUE     │ │ (Risk/Policy │ │ PERMANENTLY  │
     │ (Bounds,     │ │ (Ops Desk /  │ │  Violation)  │ │ HALTED       │
     │  Forbidden   │ │  Manual Auth)│ └──────────────┘ └──────────────┘
     │  Terms,      │ └──────┬───────┘
     │  Security)   │        │ Approved
     └──────┬───────┘        │
            │                ▼
            │        [Policy Gateway]
            │          (Re-verifies)
            ▼                │
     ┌──────────────┐        │
     │   RECOVERY   │◄───────┘
     │   EXECUTOR   │
     │ (Idempotency │
     │  Key Engine) │
     └──────┬───────┘
            │
            ▼
     ┌────────────────────────────────────────────────┐
     │             PAYMENT PROVIDER ROUTER            │
     │  • Razorpay Test Sandbox (api.razorpay.com/v1) │
     │  • Deterministic Simulation Engine             │
     │  • Zero Real-Money Moving Automation           │
     └──────────────────────┬─────────────────────────┘
                            │
                            ▼
     ┌────────────────────────────────────────────────┐
     │       OUTCOME, AUDIT & HISTORICAL LEARNING     │
     │  • Immutable Audit Log (SHA / Action Trail)    │
     │  • Human Review Queue Resolution               │
     │  • Empirical Feedback Matrix for Next Cycle    │
     │  • Real-Time WebSocket / Polling Control Center│
     └────────────────────────────────────────────────┘
```

---

## 3. Mermaid Structural Architecture

```mermaid
graph TD
    classDef safety fill:#fff2f0,stroke:#d9363e,stroke-width:2px,color:#d9363e;
    classDef core fill:#e6f7ff,stroke:#1890ff,stroke-width:2px,color:#1890ff;
    classDef verified fill:#f6ffed,stroke:#52c41a,stroke-width:2px,color:#52c41a;

    A[Payment Failure Event] --> B[Ingestion & Normalization Layer]
    B -->|Schema Validated| C[0-100 Risk Engine]
    B -->|Malformed / Invalid| B1[Raw Events Error Ledger]
    
    C -->|Risk Score & Tiers| D[Hybrid Root Cause Analyzer]
    D -->|Deterministic Rule First| D1[Rule Diagnosis]
    D -->|Ambiguous Decline Code| D2[Gemini LLM Diagnostic Fallback]
    
    D1 --> E[Context-Aware Recovery Agent]
    D2 --> E
    
    E -->|Recommended Action| F[Deterministic Policy Gateway]:::safety
    
    F -->|Approved| G[AI Output Validator]
    F -->|Escalated > 10k| H[Human Review Queue]:::safety
    F -->|Blocked Low Conf| I[Audit Log: Blocked]
    F -->|Stopped Max Retries / DNC| J[Audit Log: Stopped]
    
    H -->|Ops Review & Approval| F
    
    G -->|Content & Security Validated| K[Recovery Executor + Idempotency Engine]:::verified
    G -->|Security / Term Violation| I
    
    K --> L[Payment Provider Router]
    L -->|Test Orders / Simulation| M[(Razorpay Test Sandbox)]
    
    K --> N[(Revora SQLite Persistence)]
    N --> O[Historical Learning Loop]
    O -->|Empirical Success Rates| E
```

---

## 4. Pipeline Stages & Detailed Implementation

### Stage 1: Ingestion & Normalization Layer (`services/ingestion_service.py`)
- **Pydantic Validation (`RawEvent`)**: Validates transaction ID, positive amounts (`amount > 0`), valid currency (`INR`), canonical payment methods (`CARD`, `UPI`, `NETBANKING`, `WALLET`), and error metadata.
- **Normalization**: Standardizes timestamps to ISO-8601 UTC and parses retry attempts and failure codes.
- **Fault-Tolerant Error Ledger**: Malformed rows are logged to `raw_events` table with exact validation errors (`ingestion_status='REJECTED'`) without crashing batch execution.

### Stage 2: Explicit 0–100 Risk Engine (`services/risk_detector.py`)
- Separates *"How risky is this transaction?"* from *"Why did it fail?"*.
- Generates continuous `risk_score` (0.0 to 100.0) mapped into 4 distinct risk tiers:
  - **LOW (0–25)**: Low amount, zero retries, high customer historical success rate (>85%).
  - **MEDIUM (26–50)**: Standard transaction, transient failure, recoverable window open.
  - **HIGH (51–75)**: High retry count, aged failure (>12 hours), lower customer score.
  - **CRITICAL (76–100)**: Amount > ₹10,000, revoked mandate, card reported stolen, or opted out.

### Stage 3: Hybrid Root Cause Analyzer (`services/root_cause_analyzer.py`)
- **Rule-First Priority**: Deterministically maps standard error codes:
  - `NETWORK_ERROR`, `TIMEOUT` ➔ `NETWORK_ERROR` (Transient, high recoverability).
  - `INSUFFICIENT_FUNDS`, `LOW_BALANCE` ➔ `INSUFFICIENT_FUNDS` (Customer-assisted recovery).
  - `EXPIRED`, `CARD_EXPIRED` ➔ `EXPIRED_CARD` (Payment instrument update required).
  - `MANDATE_REVOKED` ➔ `MANDATE_FAILURE` (Non-recoverable compliance stop).
  - `STOLEN`, `FRAUD` ➔ `PERMANENT_BANK_DECLINE` (Immediate halt).
- **Gemini LLM Fallback**: Only invoked when failure code is ambiguous (`UNKNOWN_ERROR`, `GENERIC_DECLINE`), strictly enforcing a 5-second timeout and falling back to deterministic classification if offline.

### Stage 4: Context-Aware Recovery Agent (`services/recovery_agent.py`)
- Selects from 4 bounded recovery actions:
  - `RETRY_NOW`: For immediate network or switch timeouts.
  - `RETRY_LATER`: For temporary bank system downtime or maintenance windows.
  - `CONTACT_CUSTOMER`: For soft failures (insufficient funds, auth drop-off).
  - `ESCALATE_TO_HUMAN`: For VIP accounts, high amounts, or recurring anomalies.
  - `STOP_RECOVERY`: For permanent declines or exhausted limits.
- **Historical Learning Loop**: Injects empirical outcome distributions (`historical_success_rate`) from previous batches into confidence calculation.

### Stage 5: Deterministic Policy Gateway (`services/guardrail_engine.py`)
The supreme authority in Revora. Evaluates 7 invariant rules:
1. `FAILED_PAYMENT_ONLY`: Prevents actions on already settled or success records.
2. `DO_NOT_CONTACT`: Blocks customer communication if customer has opted out.
3. `MANDATE_REVOKED`: Halts recovery if recurring authorization was withdrawn.
4. `INVALID_CARD_STATUS`: Halts recovery if instrument is stolen, expired, or blocked.
5. `MAX_RETRIES`: Hard ceiling of at most 2 retry attempts.
6. `MAX_AUTO_ACTION_AMOUNT`: Any amount > ₹10,000 is automatically escalated to human review.
7. `MAX_RECOVERY_WINDOW`: Stops recovery after 24 hours (1,440 minutes) from initial failure.
8. `MIN_RECOVERY_CONFIDENCE`: Blocks automatic execution if confidence < 60%.
9. `INTERVENTION_BUDGET`: Limits customer-facing outreach to at most 1 intervention.

### Stage 6: AI Output Validator (`services/ai_output_validator.py`)
- Validates all generated LLM responses against strict JSON schemas.
- Rejects forbidden words (`bypass`, `override`, `guaranteed`, `loophole`).
- **Security Check**: Immediately flags and drops any customer message or voice utterance attempting to collect `CVV`, `OTP`, `PIN`, or full card numbers.

### Stage 7: Recovery Executor & Idempotency Engine (`services/recovery_executor.py`)
- Executes approved interventions via configured provider.
- **Cryptographic Idempotency Key**: `{transaction_id}:{action}:{attempt_number}`. Guarantees that duplicate webhooks, re-transmitted batch events, or network retries never trigger double-recovery.

### Stage 8: Payment Provider Router (`services/razorpay_service.py`)
- Supports **Razorpay Test / Sandbox Mode** (`https://api.razorpay.com/v1`) using `rzp_test_*` credentials.
- Strictly isolated from live funds (`supports_real_money = False`).
- Creates sandbox test orders, performs test verification, and falls back to deterministic simulation provider when test API keys are unconfigured.

### Stage 9: Voice AI Recovery Interface ("Talk to Revora") (`services/voice_service.py`)
- Integrates browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) with Text-to-Speech playback.
- Recognizes user intent: `EXPLAIN_FAILURE`, `RETRY_PAYMENT`, `REQUEST_HUMAN`, `SCHEDULE_LATER`.
- **Enforces Zero-Trust Voice Policy**:
  - Utterances with sensitive data (`CVV`, `OTP`) receive `SECURITY_VIOLATION` and are dropped.
  - Confirmation from the user still routes through the Deterministic Policy Gateway. If policy rejects or escalates, voice cannot override it.

### Stage 10: Human Review Queue (`services/human_queue_service.py`)
- Captures all `ESCALATED` transactions for operational governance.
- Manages lifecycle transitions: `OPEN` ➔ `IN_REVIEW` ➔ `RESOLVED`.
- Any resolution action approved by a human is re-validated through the Policy Gateway before execution.






