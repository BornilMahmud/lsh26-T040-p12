# Personal Ledger Manager

> **Know where your money goes. Know where it's going.**

A production-quality personal finance application for salaried users in Dhaka: record expenses,
scan receipts, forecast the rest of the month, and get **forecast-derived** completion dates for
savings goals. Built against the P12 hackathon PRD.

- **Live (sandbox)**: https://3000-i835z2b5myerljj1auyuk-3844e1b6.sandbox.novita.ai
- **Tech**: React 19 · TypeScript · Vite · Tailwind v4 · Recharts · Firebase (Auth/Firestore/Storage) · Hono on Cloudflare Pages

---

## Status

| Area | State |
|---|---|
| TypeScript | ✅ 0 errors (`npm run typecheck`) |
| Automated tests | ✅ **94 passing** (`npm test`) |
| Production build | ✅ clean (client SPA + `_worker.js`) |
| Browser console | ✅ no errors on load |

---

## Design principle: nothing is faked

Every displayed number is computed from stored data by a **pure, independently tested engine**.
No financial formula lives inside a React component.

```
Firebase / localStorage
        ↓  live subscription
   normalized expenses  (integer paisa)
        ↓
 PURE ENGINES  summary · forecastEngine · recurringEngine
               insightEngine · pocketCalculator · dpsCalculator · whatIf
        ↓  verified facts objects
 dashboard · expenses · forecast · insights · savings · what-if
```

Because all pages read one memoized store (`useLedger`), a metric can never be computed two
different ways, and changing an expense/salary/contribution invalidates the whole chain with no
page refresh.

### Money is never a float
All amounts are **integer paisa** (`৳100.50` → `10050`). Formatting to `৳` happens only at the
display boundary. `parseBdtToPaisa('1.005') === 101` — the classic `1.005 * 100 = 100.4999…`
float bug is tested against explicitly.

---

## Core requirements

### A — Expense recording + receipt OCR
- Manual entry with validation; receipt entry via **camera capture**, gallery, or drag-and-drop.
- Extraction runs **server-side** (`/api/ocr`, Hono worker) so the vision API key never reaches the browser.
- Two-panel review screen (image left, fields right) with **per-field confidence** — nothing saves until confirmed.
- **OCR safety rule (PRD §13):** an unreadable amount becomes `null`, *never* `0`, an estimate, or stray numeric text. Save stays disabled until a human enters it. **21 dedicated tests** enforce this.
- Pluggable `ReceiptParser` abstraction; with no provider configured the app degrades to manual review and stays fully functional.

### B — Monthly dashboard
Salary · spent · remaining · forecast · month-end outlook · category donut with ranking · top-5
largest expenses · month-over-month with per-category deltas · dynamic month selector (months
derived from expense dates, nothing hard-coded).

### C — Forecast + insights
**Weighted-pace model with a recurring-obligation floor**, documented in code and exposed in a
"How this forecast works" panel:

```
forecastDailyRate(c) = 0.65 × currentDailyRate(c) + 0.35 × previousDailyRate(c)
remainingForecast(c) = max(pacedRemaining(c), recurringRemaining(c))   ← prevents double-counting
forecastMonthTotal   = currentSpend + Σ remainingForecast(c)
```

- Weights **renormalize** when a signal is missing, so a first-ever month isn't forecast at 65% of its true pace.
- A large unpaid bill (rent) contributes nothing to daily pace, so detected-but-unpaid recurring bills act as a **floor** — taking `max`, not `sum`, avoids counting the same money twice.
- Confidence (HIGH/MEDIUM/LOW) with a written reason; a closed month reports actuals, not a projection.
- **14 insight rules**, each carrying category + actual amount + comparison, plus an auditable evidence table. Explicitly labelled deterministic — no false generative-AI claim.

### D — Savings pockets + DPS
- Completion dates are **never** `target ÷ contribution`. The forecast surplus decides what's affordable; over-allocation triggers **proportional scaling** with a clear warning, then month-by-month simulation until `balance ≥ target`.
- Unreachable targets show **"Not currently reachable"** instead of an absurd date.
- DPS follows the supplied rule exactly: deposit → interest → **round half-up to paisa** → add to balance → compound. Full month-by-month schedule is displayed; rate is read from settings/test case (never assumed 8%).

### Bonus features
1. **Dynamic contribution adjustment** — live slider per pocket; date and DPS recalculate on release.
2. **Recurring detection** — normalized merchant matching (`GP Recharge` ≡ `gp-recharge`), 20% amount tolerance widened to 35% when the category also matches (handles the PRD's ৳422 → ৳535.50 case). Every classification shows **why**.
3. **What-if simulator** — reduce categories, re-run the real engines, see every pocket's date move. Never mutates Firestore.

---

## Routes

| Path | Purpose |
|---|---|
| `/` | Overview dashboard |
| `/expenses` | Full history: filters (month/category/shop/amount/source), sort, edit, delete, view receipt |
| `/forecast` | Forecast output, per-category maths table, transparency panel |
| `/insights` | Insight cards with evidence |
| `/savings` | Pockets, forecast-based dates, DPS schedules |
| `/what-if` | Scenario simulator |
| `/settings` | Salary, DPS rate, profile, data tools, **P12 test-data importer** |
| `GET /api/ocr/status` | Whether a vision provider is configured |
| `POST /api/ocr` | Server-side receipt extraction |

---

## Data model (Firestore, user-scoped)

```
users/{uid}
users/{uid}/expenses/{id}   amount(paisa) date category shop notes receiptUrl
                            source ocrConfidence recurring recurringReason
users/{uid}/pockets/{id}    name item target monthlyContribution currentBalance
users/{uid}/receipts/{id}   storagePath downloadUrl ocr{…confidence, rawText}
users/{uid}/settings/profile
```

Security (`firestore.rules`, `storage.rules`): every read/write requires
`request.auth.uid == userId`, verified server-side — a client-supplied uid can never widen access.
Receipts live at `receipts/{uid}/…`, images only, under 10 MB.

---

## Running it

```bash
npm install
cp .env.example .env          # Firebase web config
cp .dev.vars.example .dev.vars # OCR key (server-side only, optional)

npm run check                 # typecheck + 94 tests
npm run build                 # client + worker
pm2 start ecosystem.config.cjs
```

Deploy: `npx wrangler pages deploy dist` then
`npx wrangler pages secret put OPENAI_API_KEY`.

---

## Judging paths

- **Demo Mode** — "Explore Demo" on the login screen. Three months of realistic Dhaka data generated *relative to today*, so the forecast is always live mid-month with rent deliberately unpaid (exercising the recurring floor) and Education rising (exercising insight rules). Demo runs the **identical** engines via the same repository interface; only the storage backend differs.
- **P12 test-data importer** — Settings → *Developer & judging tools*. Accepts an array, `{ "cases": [...] }`, or a single case; validates required fields, dates, amounts, categories, post-dated expenses; normalizes to integer paisa; reads the DPS rate **per case**.

---

## Known limitations

1. **Google Sign-In needs domain authorization.** The sandbox domain isn't in Firebase's authorized list, so live Google auth returns `auth/unauthorized-domain` there (handled with a clear message). Add the deployment domain under *Authentication → Settings → Authorized domains*. **Demo Mode exercises every feature without this.**
2. **Sandbox LLM credentials are expired** (both `~/.genspark_llm.yaml` and the env key return `401 Invalid or expired token`), so live receipt extraction can't be demonstrated in this sandbox. The pipeline is complete and correct: it degraded exactly as designed — returning `null` with a manual-entry prompt rather than inventing an amount. Set a valid `OPENAI_API_KEY` in `.dev.vars` (local) or as a Pages secret (production) to enable it.
3. Firestore rules/indexes are written but must be deployed via `firebase deploy --only firestore:rules,storage`.
4. Pocket balances don't yet auto-increment monthly; `currentBalance` is user-maintained.

---

## Deployment

- **Platform**: Cloudflare Pages (static SPA + `_worker.js` edge function)
- **Last updated**: 2026-08-30
