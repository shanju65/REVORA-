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

# REVORA

**Bounded-autonomy recovery engine for failed payments.**

An LLM-assisted agent proposes a recovery intervention. A deterministic policy gateway — not the model — decides whether that intervention is allowed to execute. Every stage is written to a SHA-256 hash-chained audit ledger.

Built for **Razorpay Buildathon 2026 · Track 03 — AI Revenue Recovery**.

[Live demo](https://revora-woad-tau.vercel.app/) · [Video walkthrough](https://youtu.be/2OND6ntDwFE) · [Architecture spec](./ARCHITECTURE.md) · [Deployment guide](./DEPLOYMENT.md)

---

## Why this exists

Failed-payment recovery usually collapses into one of two shapes:

| Shape | Failure mode |
|---|---|
| Fixed retry schedules | Same action regardless of decline reason, instrument state, retry history, or customer context |
| Unconstrained LLM agents | Good reasoning, but the model holds financial execution authority |

Revora keeps the reasoning probabilistic and the authority deterministic. The agent's output is a *recommendation object*. It reaches an executor only after passing a rule engine that the agent cannot see, influence, or override.

> **Invariant:** no model output is an authorization. Every financial action is gated by `GuardrailEngine.validate()`.

---

## Pipeline

```
Payment event
    │
    ▼
Ingestion ──────────► Pydantic validation; rejected rows land in `raw_events`
    │                 with their validation errors (batch never crashes)
    ▼
Risk engine ────────► Deterministic 0–100 score + tier (LOW/MEDIUM/HIGH/CRITICAL)
    │                 "How exposed is this?" — separate from "why did it fail?"
    ▼
Root cause ─────────► Rule-first classification; Gemini only for ambiguous
    │                 decline codes, with deterministic fallback on timeout
    ▼
Recovery agent ─────► Selects from a 5-action enum; emits recovery_probability,
    │                 confidence, and a reasoning trace. Zero execution authority.
    ▼
╔═══════════════════════════════════════════════╗
║  DETERMINISTIC POLICY GATEWAY                 ║
║  10 ordered rules, first match wins           ║
╚═══════════════════════════════════════════════╝
    │
    ├── APPROVED   ─► AI output validator ─► Executor (idempotency-keyed)
    │                                            │
    │                                            ├─► Razorpay Test Sandbox
    │                                            └─► Deterministic simulator
    ├── ESCALATED  ─► Human review queue (ops resolves; re-enters the gateway)
    ├── BLOCKED    ─► Audit record, no execution
    └── STOPPED    ─► Recovery terminated for this case
    │
    ▼
Outcome ──► Hash-chained audit ledger ──► Analytics ──► Historical evidence
                                                              │
                                              feeds confidence on later batches
```

Service boundaries map 1:1 onto files. `risk_detector` finds exposure, `recovery_agent` proposes, `guardrail_engine` authorizes, `recovery_executor` acts, `audit_service` records. None of them reach across.

---

## The policy gateway

Ten rules in `services/guardrail_engine.py`, evaluated in order, first match short-circuits. Thresholds are class constants, mirrored in `config.py`.

| # | Rule | Condition | Verdict |
|---|---|---|---|
| 1 | `FAILED_PAYMENT_ONLY` | `payment_status != FAILED` | `STOPPED` |
| 2 | `MANDATE_REVOKED` | Mandate withdrawn by customer | `STOPPED` |
| 3 | `INVALID_CARD_STATUS` | Instrument `STOLEN` / `BLOCKED` / `SUSPENDED` / `EXPIRED` | `STOPPED` |
| 4 | `MAX_RETRIES` | `retry_count >= 2` | `STOPPED` |
| 5 | `MAX_AUTO_ACTION_AMOUNT` | `amount > ₹10,000` | `ESCALATED` |
| 6 | `MAX_RECOVERY_WINDOW` | `time_since_failure > 1440 min` | `STOPPED` |
| 7 | `DO_NOT_CONTACT` | DNC flag set and action is `CONTACT_CUSTOMER` | `BLOCKED` |
| 8 | `INTERVENTION_BUDGET` | `CONTACT_CUSTOMER` with `retry_count >= 1` | `STOPPED` |
| 9 | `MIN_RECOVERY_CONFIDENCE` | `recovery_probability < 0.60` **or** `confidence < 0.60` | `BLOCKED` |
| 10 | `SUPPORTED_ACTION` | Action outside the vetted enum | `BLOCKED` |

Every verdict returns `rules_checked` — the ordered list of rules evaluated before the decision — so a case's outcome is explainable without replaying the pipeline.

**Action enum:** `RETRY_NOW` · `RETRY_LATER` · `CONTACT_CUSTOMER` · `ESCALATE_TO_HUMAN` · `STOP_RECOVERY`

---

## Risk scoring

`services/risk_detector.py` — pure function, no model in the path. Base 20 for any failed payment, then additive factors:

| Factor | Trigger | Weight |
|---|---|---|
| Financial exposure | `> ₹10,000` / `> ₹5,000` / `> ₹2,500` | +30 / +15 / +5 |
| Retry exhaustion | `retry_count >= 2` / `== 1` | +25 / +12 |
| Failure severity | Hard decline / customer-side / transient | +22 / +12 / +5 |
| Temporal decay | `> 24h` / `> 3h` since failure | +20 / +10 |
| Customer track record | Lifetime success `< 60%` / `< 75%` | +18 / +8 |
| Compliance triggers | DNC, revoked mandate, compromised instrument | +30 / +30 / +35 |

Clamped to `[5, 100]`, then binned: **LOW** 0–25 · **MEDIUM** 26–50 · **HIGH** 51–75 · **CRITICAL** 76–100. Scores carry `risk_factors` (human-readable drivers) and a `signals` dict (raw inputs) so the score is auditable rather than opaque.

---

## Audit integrity

`services/security_service.py` implements a tamper-evident ledger:

- **Canonical serialization** — audit payloads are serialized with `sort_keys=True`, compact separators, UTF-8, so identical content always hashes identically.
- **Chaining** — each event's SHA-256 covers its own fields plus `previous_event_hash`, linking the ledger head-to-tail.
- **Credential scrubbing** — keys matching CVV, OTP, PIN, PAN, card/account number, password, secret, API key, or auth token are dropped *before* hashing. Secrets never enter the digest or the row.
- **Verification** — `GET /api/audit/integrity` walks the chain chronologically, recomputes every hash, and reports the first broken link.

**Scope, stated honestly:** hash chaining makes retroactive edits and deletions *detectable*. It does not encrypt the ledger and does not prevent an attacker with write access to the database file from rewriting the chain wholesale. It is tamper-evidence, not tamper-proofing.

---

## Evaluation methodology

Production decisioning and benchmark scoring are deliberately separated. `ground_truth_recoverable` lives on the `transactions` table and is read **only** by the offline scorer — never by the risk engine, the agent, or the gateway.

`test_ground_truth_isolation` in `test_services.py` enforces this: it strips the label from a transaction, re-runs the pipeline, and asserts the decision is byte-identical. Leakage fails the build.

`GET /evaluation/metrics` scores the most recent completed batch, treating `guardrail_status == APPROVED` as the positive prediction:

```
precision = TP / (TP + FP)          # of the cases we acted on, how many were recoverable
recall    = TP / (TP + FN)          # of the recoverable cases, how many we acted on
false_positive_revenue_cost         # ₹ spent acting on unrecoverable payments
```

Numbers are a function of whatever batch you last ran and the policy version it used. Reproduce them rather than trusting a figure in a README:

```bash
python backend/generate_synthetic_data.py     # reset to the seeded 10k-event dataset (rng seed 42)
curl -X POST localhost:8000/api/batches/run
curl localhost:8000/evaluation/metrics
```

`GET /analytics/policy-comparison` runs the same cohort through `baseline_v1` and `agentic_optimized_v2` under identical guardrails, isolating the agent's contribution from the rule engine's.

---

## API surface

FastAPI, ~40 endpoints. Full interactive spec at `/docs`.

| Group | Endpoints |
|---|---|
| Health | `GET /`, `GET /health` |
| Transactions | `GET /transactions`, `GET /transactions/{id}` |
| Cases | `GET /recovery-cases`, `GET /recovery-cases/{tx_id}`, `POST /recovery/analyze/{tx_id}`, `POST /recovery/execute/{tx_id}` |
| Batches | `POST /api/batches/run`, `GET /api/batches`, `GET /api/batches/{id}`, `GET /api/batches/{id}/transactions` |
| Metrics | `GET /dashboard/metrics`, `GET /dashboard/charts`, `GET /evaluation/metrics` |
| Analytics | `GET /api/analytics/policy-comparison`, `GET /api/analytics/agent-insights` |
| Ingestion | `POST /api/ingest`, `GET /api/ingest/stats`, `POST /api/datasets/upload`, `POST /api/datasets/{id}/run-recovery` |
| Audit | `GET /audit-logs`, `GET /api/audit/integrity` |
| Human queue | `GET /api/human-queue`, `POST /api/human-queue/{id}/action` |
| Assistant | `POST /api/assistant/chat`, `GET /api/assistant/conversations`, `POST /api/voice/interact` |
| Customers | `GET /api/customers`, `GET /api/customers/{id}` |
| Provider | `GET /api/razorpay/status`, `POST /api/razorpay/test-recovery` |
| Reports | `POST /api/reports/generate`, `GET /api/reports/{batch_id}` |

Several routes are dual-registered under `/x` and `/api/x` for frontend compatibility.

---

## Conversational layer (Pulse)

`services/rag_service.py` — grounded retrieval over the operational database, not a general chatbot.

1. **Credential defense** — regex screen rejects CVV / OTP / PIN / card-number patterns before any retrieval runs.
2. **Domain boundary** — off-domain questions are declined rather than answered from model priors.
3. **Structured retrieval** — SQL against transactions, cases, audit logs, batches, the review queue, and provider results. Retrieval is deterministic; Gemini only synthesizes over retrieved rows.
4. **Action routing** — a request like *"retry this payment"* is not executed conversationally. It is converted into a recommendation and routed through the same policy gateway as every batch decision.
5. **Session memory** — active transaction, customer, case, and batch persist across turns in `conversations` / `conversation_messages`.

---

## Stack

| Layer | Choice | Note |
|---|---|---|
| Backend | FastAPI + Uvicorn | Python 3.11 |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind v4 | App Router |
| Persistence | SQLite | Schema + migrations in `backend/main.py` |
| LLM | Google Gemini (`gemini-flash-latest`, cascading fallbacks) | Called over `urllib`, 12s timeout |
| Provider | Razorpay REST, test mode pinned | Called over `urllib`, 5s timeout |
| Validation | Pydantic v2 | |
| Tests | `unittest` | 46 tests |

Backend dependencies are deliberately thin — FastAPI, Uvicorn, Pydantic, and stdlib. No LLM SDK, no HTTP client library, no ORM. HTTP is `urllib.request`; persistence is `sqlite3`. Fewer moving parts to audit and a faster cold start on free-tier hosting.

---

## Layout

```
REVORA/
├── main.py                       # deploy entrypoint; shims backend/ onto sys.path
├── requirements.txt
├── render.yaml · Procfile        # Render blueprint
│
├── backend/
│   ├── main.py                   # FastAPI app, schema + migrations, route layer
│   ├── config.py                 # env loading, DB path, policy constants
│   ├── generate_synthetic_data.py
│   ├── test_services.py          # 37 tests — pipeline, policy, analytics, RAG
│   ├── test_audit_security.py    # 9 tests  — hash chaining, tampering, scrubbing
│   └── services/
│       ├── ingestion_service.py      # Pydantic validation, error ledger
│       ├── risk_detector.py          # 0–100 scoring
│       ├── root_cause_analyzer.py    # rule-first, LLM fallback
│       ├── recovery_agent.py         # intervention selection
│       ├── guardrail_engine.py       # deterministic policy gateway
│       ├── ai_output_validator.py    # bounds + forbidden-term checks on LLM output
│       ├── recovery_executor.py      # idempotency-keyed execution
│       ├── razorpay_service.py       # test-mode-pinned provider client
│       ├── audit_service.py          # append-only event recording
│       ├── security_service.py       # SHA-256 chaining, credential scrubbing
│       ├── batch_service.py          # lifecycle orchestration
│       ├── recovery_analytics.py     # funnel + policy comparison
│       ├── report_service.py         # batch report generation
│       ├── rag_service.py            # grounded conversational retrieval
│       ├── voice_service.py          # voice intent → policy routing
│       ├── customer_service.py       # Customer 360
│       ├── human_queue_service.py    # escalation queue lifecycle
│       └── llm_service.py            # Gemini client + deterministic fallbacks
│
├── revora/frontend/              # Next.js app (App Router)
│   └── app/                      # page.tsx + feature component modules
│
├── data/                         # SQLite databases
├── ARCHITECTURE.md
└── DEPLOYMENT.md
```

---

## Running locally

**Requirements:** Python 3.11+, Node 20+.

### Backend

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # then fill in your keys
python main.py                       # → http://localhost:8000  ·  /docs for OpenAPI
```

```env
GEMINI_API_KEY=            # optional — LLM paths fall back deterministically without it
RAZORPAY_KEY_ID=           # optional — executor falls back to the simulator
RAZORPAY_KEY_SECRET=
REVORA_DB_PATH=            # optional — defaults to data/revora.db
CORS_ORIGINS=http://localhost:3000
```

Both integrations are optional. Without a Gemini key, root-cause analysis uses rule-based classification and Pulse degrades to structured retrieval. Without Razorpay credentials, execution routes to the deterministic simulator. The pipeline runs end-to-end either way.

### Frontend

```bash
cd revora/frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev     # → http://localhost:3000
```

### Tests

```bash
cd backend
python -m unittest test_services test_audit_security -v
```

46 tests covering contextual decisioning, every guardrail branch, executor rejection of unapproved actions, idempotency, ground-truth isolation, audit hash chaining and tamper detection, credential scrubbing, ingestion validation, risk tiering, RAG domain boundaries and action routing, funnel reconciliation, and batch persistence.

---

## Deployment

Backend runs on Render via the checked-in `render.yaml` blueprint (health check at `/health`). Frontend deploys to Vercel with `NEXT_PUBLIC_API_URL` pointed at the Render service. Full walkthrough in [DEPLOYMENT.md](./DEPLOYMENT.md).

SQLite on Render's free tier is ephemeral — mount a persistent disk and set `REVORA_DB_PATH` if you need batch history to survive restarts.

---

## Security posture

Enforced in code:

- Payment credentials (CVV, OTP, PIN, PAN, card/account numbers) are never collected, logged, or hashed — scrubbed in `security_service.sanitize_for_audit()` and screened at the RAG entry point.
- The Razorpay client pins `mode = "test"` in its constructor regardless of the value passed in.
- No model output can reach the executor without an `APPROVED` verdict from the policy gateway.
- Failed provider responses are recorded as failures and never counted toward recovered revenue.
- Benchmark labels are structurally excluded from production decisioning, with a regression test enforcing it.

---

## Known limitations

This is a buildathon prototype. Stated plainly:

- **Synthetic data.** The seeded 10k-event dataset is generated with a fixed RNG seed. Benchmark numbers describe this distribution and do not predict real payment-network behavior.
- **Sandbox only.** Razorpay runs in test mode. No real money moves. Live execution would require merchant authorization, compliance review, and a provider agreement.
- **SQLite.** Single-writer, file-backed. Fine for a demo; production needs Postgres and a real job queue.
- **In-process batches.** Batch runs execute in the web process. Long runs block a worker; there is no retry-on-crash or distributed scheduling.
- **Tamper-evidence, not tamper-proofing.** See the audit section above.
- **No authentication.** The API is unauthenticated. Anything public-facing needs auth and rate limiting first.
- **Frontend consolidation.** UI logic is concentrated in a handful of large component modules under `app/` rather than a normalized component tree.

---

## License

Not currently licensed. Add one before reuse.

## Contributors

**R B SHANJU VIKASHINI
ARJUN R K**

## Built For 

**Razorpay Buildathon 2026**  
**Track 03 — AI Revenue Recovery**
