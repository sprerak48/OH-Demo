# Health Insights | Payer Operations

A production-quality demo web app for healthcare payer operations. Users can explore synthetic Oscar Health–style data, apply filters, view real-time computed metrics, and run what-if simulations.

## Quick Start

```bash
npm install
npm run generate-data   # ~10K members, ~100K claims (run once)
npm run dev            # Backend (3001) + Frontend (5173)
```

Open [http://localhost:5173](http://localhost:5173). The API runs at [http://localhost:3001](http://localhost:3001).

**One command (after initial setup):** `npm run dev` — ensure `data/` exists (run `generate-data` once).

## Features

### Risk Adjustment (CMS-HCC inspired)
- **RAF** = demographic factor + Σ(HCC weights), normalized 0.3–3.0
- **HCC categories**: Diabetes (0.32), CHF (0.45), COPD (0.29), CKD (0.38), Hypertension (0.14)
- **Risk Adj. Revenue** = RAF × $900 PMPM × Member Months
- **Suspect HCCs**: "Suspected but uncoded" based on claims patterns (e.g., high RX + no Diabetes HCC)
- **Risk-Adjusted MLR** = Claims / (Premium + Risk Adj. Revenue)
- All logic is deterministic and documented in `server/risk-adjustment.js`

### Dashboard
- **KPIs:** Total Members, Active Claims, Raw MLR, High-Risk Members (%), Avg Cost per Member
- **Risk Adj. KPIs:** Avg RAF, % RAF &gt; 1.2, Risk Adj. Revenue, Suspect RAF Uplift, Risk-Adjusted MLR
- **Charts:** Claims over time, Cost by plan type, RAF by plan type, Risk distribution

### Member Explorer
- **Filters:** State, Plan type, Risk score range, Chronic condition flag
- **Member profile:** Demographics, recent claims, **RAF breakdown** (demographic + HCC), HCC list with weights, **Suspected HCCs** (highlighted), member-level risk adj. revenue

### Claims Analyzer
- **Filters:** Date range, Claim type (IP/OP/RX), Cost threshold, State
- **Computed metrics:** Total allowed amount, PMPM, Outlier count (P95), P95 threshold

### Risk Adjustment Explorer (new)
- **Filters:** State, Plan, RAF range, HCC category
- **Visuals:** RAF distribution histogram, HCC prevalence bar chart, Revenue concentration (top 10% RAF share)
- **Table:** Members with RAF, suspect count, risk adj. revenue

### Multi-Agent Intelligence System
Three specialized agents coordinated by an Orchestrator:

- **Risk Agent** — Identifies suspect HCCs with evidence (min 2 signals), confidence scores, no diagnoses
- **Finance Agent** — Translates risk into revenue uplift, MLR impact, plan-level impact
- **Compliance Agent** — Validates language, evidence thresholds; APPROVED / REVIEW_REQUIRED
- **Orchestrator** — Risk → Finance (if suspects) → Compliance → synthesized output

**APIs:** `GET /api/orchestrator/member/:id`, `GET /api/orchestrator/summary`  
**Member View:** Tabbed (Overview | Risk | Finance | Compliance)  
**Executive Dashboard:** Total Suspect RAF Leakage, Revenue at Risk, Compliance-Cleared %, Top 10 Risk Leakage States

### Risk Adjustment Agent
- Surfaces evidence-backed suspect HCCs for human review (no diagnosis assignment)
- **Rules:** At least 2 independent signals per suspect; confidence ∈ [0, 1); compliance-safe language
- **APIs:** `GET /api/agent/member/:id`, `GET /api/agent/batch`, `GET /api/agent/summary`
- **Member profile:** “Suspected Conditions” panel with confidence bar, evidence bullets, RAF & revenue uplift estimates
- **Dashboard:** Agent-derived totals (suspect count, potential RAF/revenue uplift)

### What-If Simulation
- **Inputs:** Risk score threshold, Plan mix (% Bronze/Silver/Gold), **Close X% of Suspect HCCs**, **Coding completeness +X%**
- **Outputs:** Expected MLR, Risk-Adjusted MLR, Total projected cost, Total risk revenue, Avg RAF
- **Before vs After:** $ impact and bps improvement clearly labeled

### Executive Chat (with optional LLM)
- **Pattern-based (no key):** Answers structured questions (e.g. “Why is Texas Bronze leaking RAF?”, “Which plans have the worst adjusted MLR?”) using the query interpreter and risk/finance/compliance agents.
- **With LLM:** Set `OPENAI_API_KEY` to enable natural-language answers about members and claims. The LLM receives a summary of the dataset (counts, by state/plan, RAF, HCC prevalence) and any pre-computed analysis, then returns a short answer, evidence bullets, and follow-ups. Supports any question about the data (e.g. “How many high-risk members in California?”, “What’s our total RX spend?”).
- **Env (optional):** `OPENAI_API_KEY`, `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_MODEL` (default `gpt-4o-mini`). Copy `.env.example` to `.env` and set your key locally; on Vercel add `OPENAI_API_KEY` in Project → Settings → Environment Variables.

## Data

Synthetic data is generated with `npm run generate-data` and written to `data/`:

- **members.json** – ~10,000 members (member_id, age, gender, state, plan_type, risk_score, chronic_condition_flag, hcc_codes, member_months)
- **claims.json** – ~100,000 claims (claim_id, member_id, service_date, claim_type, allowed_amount)

No PHI, no real identifiers. Deterministic seeding for reproducibility.

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Recharts
- **Backend:** Node.js, Express
- **Data:** JSON (in-memory for fast queries)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend (concurrently) |
| `npm run server` | Start API only (port 3001) |
| `npm run client` | Start Vite dev server (port 5173) |
| `npm run generate-data` | Generate synthetic data |
| `npm run build` | Build frontend for production |

## Architecture

- **API proxy:** Vite proxies `/api` to the backend during development
- **Separation of concerns:** All aggregations, filters, and simulations run on the server
- **Extensible:** Code structured for future agentic workflows

## Deploying to Vercel

- Connect the repo to Vercel; the project uses **vercel.json** with a custom build and API.
- **Build command** must run data generation and the frontend build: `npm run generate-data && npm run build` (set in vercel.json).
- **Output directory:** `dist` (static frontend). All `/api/*` requests are handled by the serverless function in **api/[...path].js**, which runs the Express app.
- **Environment variables (optional):** `OPENAI_API_KEY` for Executive Chat LLM; add in Vercel project Settings → Environment Variables.
- After deploy, check **https://your-app.vercel.app/api/health** — it should return `{ ok: true, dataLoaded: true, members, claims }`. If `dataLoaded` is false, the build did not create `data/` (ensure build command includes `generate-data`).
