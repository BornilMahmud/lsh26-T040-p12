# Personal Ledger Manager

Solution for **LofiStack Hackathon 2026 — P12**

## Project information

- **Team:** Team Nightmare
- **Team ID:** `LSH26-T040`
- **Problem:** `P12 — Personal Ledger Manager`
- **Live application:** <https://lsh26-t040-p12.vercel.app>
- **Demo video:** N/A

> Judges will evaluate only the exact commit SHA entered in the Final Submission Form.

## Solution summary

Personal Ledger Manager helps users record income and expenses, parse and capture receipt information, analyze monthly spending patterns, and generate actionable financial forecasts. It provides data-driven category insights and allows users to plan goal-oriented savings pockets featuring automated completion estimates and DPS return projections.

## Requirements

| Requirement | Status | Where to verify |
| --- | --- | --- |
| R1 — Salary, expenses, and receipt upload | Complete | `/expenses`, `/onboarding`, `src/services/receiptParser.ts` |
| R2 — Monthly financial dashboard | Complete | `/dashboard` (`src/pages/Dashboard.tsx`) |
| R3 — Forecast and written insights | Complete | `/forecast`, `/insights` (`src/analytics/forecastEngine.ts`, `src/analytics/insightEngine.ts`) |
| R4 — Savings pockets and DPS projection | Complete | `/savings` (`src/analytics/pocketCalculator.ts`, `src/analytics/dpsCalculator.ts`) |

## How to test the application

1. Open the live application.
2. Load the P12 sample data or setup your monthly salary in `/onboarding`.
3. Go to `/expenses` to add expenses manually or upload a receipt photo to verify automatic parsing of amount, date, and shop name with manual edit controls.
4. Visit `/dashboard` to inspect spending breakdowns, salary comparisons, category percentages, top expenses, and month-over-month trends.
5. Open `/forecast` and `/insights` to view projected month-end totals, remaining balance/shortfall, and localized data-driven statements.
6. Open `/savings` to create a new pocket with target amount and monthly contribution to verify target completion dates and DPS return calculations.

### Test or sample data

The application accepts the official P12 sample data fixture:
`https://live.hackathon.lofistack.com/api/fixtures/P12?teamId=LSH26-T040`

Sample data can be loaded directly from the demo data interface (`src/data/demoData.ts` and `src/data/testCases.ts`) to pre-populate expenses, recurring profiles, and savings pockets.

## Run locally

### Requirements

- Node.js (v18+ recommended)
- npm / yarn / pnpm
- Cloudflare Workers / Firebase configuration (optional for live backend)

### Setup

```bash
git clone [https://github.com/BornilMahmud/lsh26-t040-p12.git](https://github.com/BornilMahmud/lsh26-t040-p12.git)
cd lsh26-t040-p12
npm install
cp .env.example .env
npm run dev
```