/**
 * P12 PUBLIC TEST DATA — importer, validator and normalizer.
 * PRD §50, §51, §52, §53, §79.
 *
 * The importer accepts the supplied P12 JSON shape (single case or an array /
 * { cases: [...] } wrapper) and normalizes it into the app's domain model:
 *
 *   salary_bdt / amount_bdt / target_bdt / monthly_contribution_bdt
 *        -> integer paisa
 *   dps_annual_rate_percent -> decimal number, READ PER CASE (never assumed 8%)
 *   date strings            -> validated "YYYY-MM-DD"
 *
 * No case is hard-coded: whatever cases the JSON contains become selectable.
 */

import type { Category, ExpenseDraft, PocketDraft } from '@/types'
import { coerceCategory, CATEGORIES } from '@/types'
import { parseBdtToPaisa } from '@/lib/money'
import { isValidDayKey, monthKeyOf, toDayKey } from '@/lib/dates'

export interface RawTestCase {
  case_id?: string
  today?: string
  months?: { last?: string; this?: string }
  salary_bdt?: string | number
  expenses?: {
    id?: string
    date?: string
    category?: string
    shop?: string
    amount_bdt?: string | number
  }[]
  pockets?: {
    id?: string
    name?: string
    item?: string
    target_bdt?: string | number
    monthly_contribution_bdt?: string | number
  }[]
  dps_annual_rate_percent?: string | number
  dps_rule?: string
}

export interface NormalizedTestCase {
  caseId: string
  today: string | null
  monthsLast: string | null
  monthsThis: string | null
  salary: number
  dpsAnnualRatePercent: number
  dpsRule: string | null
  expenses: ExpenseDraft[]
  pockets: PocketDraft[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

export interface ParseResult {
  cases: NormalizedTestCase[]
  issues: ValidationIssue[]
  ok: boolean
}

/** Extract an array of raw cases from any of the accepted wrappers. */
function extractRawCases(input: unknown): { raw: RawTestCase[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  if (Array.isArray(input)) return { raw: input as RawTestCase[], issues }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    for (const key of ['cases', 'public_cases', 'test_cases', 'data']) {
      if (Array.isArray(obj[key])) return { raw: obj[key] as RawTestCase[], issues }
    }
    // A single case object
    if ('expenses' in obj || 'case_id' in obj || 'salary_bdt' in obj) {
      return { raw: [obj as RawTestCase], issues }
    }
  }
  issues.push({
    severity: 'error',
    path: 'root',
    message: 'Could not find any test cases. Expected an array of cases, a { "cases": [...] } object, or a single case object.'
  })
  return { raw: [], issues }
}

/**
 * Parse + validate + normalize P12 JSON. Returns every case it could read plus
 * a list of human-readable issues (PRD §53).
 */
export function parseP12Json(text: string): ParseResult {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch (err) {
    return {
      cases: [],
      ok: false,
      issues: [
        {
          severity: 'error',
          path: 'root',
          message: `The file is not valid JSON: ${(err as Error).message}`
        }
      ]
    }
  }

  const { raw, issues } = extractRawCases(parsedJson)
  const cases: NormalizedTestCase[] = []

  raw.forEach((rc, index) => {
    const caseId = String(rc.case_id ?? `CASE-${index + 1}`)
    const path = `${caseId}`

    // ── today ─────────────────────────────────────────────────────────────
    let today: string | null = null
    if (typeof rc.today === 'string' && isValidDayKey(rc.today)) {
      today = rc.today
    } else if (rc.today !== undefined) {
      issues.push({
        severity: 'warning',
        path: `${path}.today`,
        message: `"${String(rc.today)}" is not a valid YYYY-MM-DD date; the app's current date will be used instead.`
      })
    }

    // ── salary ────────────────────────────────────────────────────────────
    const salary = parseBdtToPaisa(rc.salary_bdt ?? null)
    if (salary === null) {
      issues.push({
        severity: 'error',
        path: `${path}.salary_bdt`,
        message: `Missing or invalid salary_bdt ("${String(rc.salary_bdt)}").`
      })
    }

    // ── DPS rate (read per case, never assumed) ───────────────────────────
    const rateRaw = rc.dps_annual_rate_percent
    const rate =
      typeof rateRaw === 'number'
        ? rateRaw
        : typeof rateRaw === 'string'
          ? Number(rateRaw.replace(/[%\s]/g, ''))
          : NaN
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      issues.push({
        severity: 'error',
        path: `${path}.dps_annual_rate_percent`,
        message: `Missing or invalid dps_annual_rate_percent ("${String(rateRaw)}"). Each case must supply its own rate.`
      })
    }

    // ── expenses ──────────────────────────────────────────────────────────
    const expenses: ExpenseDraft[] = []
    const todayKey = today ?? toDayKey(new Date())
    ;(rc.expenses ?? []).forEach((re, i) => {
      const ePath = `${path}.expenses[${i}]`
      const amount = parseBdtToPaisa(re.amount_bdt ?? null)
      if (amount === null || amount <= 0) {
        issues.push({
          severity: 'error',
          path: `${ePath}.amount_bdt`,
          message: `Invalid amount "${String(re.amount_bdt)}" — must be a positive number.`
        })
        return
      }
      if (typeof re.date !== 'string' || !isValidDayKey(re.date)) {
        issues.push({
          severity: 'error',
          path: `${ePath}.date`,
          message: `Invalid date "${String(re.date)}" — expected YYYY-MM-DD.`
        })
        return
      }
      // PRD §53: no expenses after today
      if (re.date > todayKey) {
        issues.push({
          severity: 'warning',
          path: `${ePath}.date`,
          message: `Expense dated ${re.date} is after the case's "today" (${todayKey}); it will still be imported but will not affect the current month's elapsed-day pace.`
        })
      }
      const rawCat = typeof re.category === 'string' ? re.category : ''
      const category: Category = coerceCategory(rawCat)
      if (rawCat && !CATEGORIES.includes(category) ) {
        issues.push({
          severity: 'warning',
          path: `${ePath}.category`,
          message: `Unknown category "${rawCat}" mapped to "Other".`
        })
      } else if (rawCat && category === 'Other' && rawCat.toLowerCase() !== 'other') {
        issues.push({
          severity: 'warning',
          path: `${ePath}.category`,
          message: `Unknown category "${rawCat}" mapped to "Other".`
        })
      }

      expenses.push({
        amount,
        date: re.date,
        category,
        shop: typeof re.shop === 'string' ? re.shop.trim() : '',
        notes: re.id ? `Imported from ${caseId} (${re.id})` : `Imported from ${caseId}`,
        source: 'import',
        receiptUrl: null,
        receiptId: null,
        ocrConfidence: null
      })
    })

    // ── pockets ───────────────────────────────────────────────────────────
    const pockets: PocketDraft[] = []
    ;(rc.pockets ?? []).forEach((rp, i) => {
      const pPath = `${path}.pockets[${i}]`
      const target = parseBdtToPaisa(rp.target_bdt ?? null)
      const contribution = parseBdtToPaisa(rp.monthly_contribution_bdt ?? null)
      if (target === null || target <= 0) {
        issues.push({
          severity: 'error',
          path: `${pPath}.target_bdt`,
          message: `Invalid target "${String(rp.target_bdt)}" — must be greater than zero.`
        })
        return
      }
      if (contribution === null) {
        issues.push({
          severity: 'error',
          path: `${pPath}.monthly_contribution_bdt`,
          message: `Invalid monthly contribution "${String(rp.monthly_contribution_bdt)}".`
        })
        return
      }
      const name = typeof rp.name === 'string' && rp.name.trim() ? rp.name.trim() : ''
      if (!name) {
        issues.push({ severity: 'error', path: `${pPath}.name`, message: 'Pocket name is required.' })
        return
      }
      pockets.push({
        name,
        item: typeof rp.item === 'string' ? rp.item.trim() : '',
        target,
        monthlyContribution: contribution,
        currentBalance: 0
      })
    })

    const monthsThis =
      typeof rc.months?.this === 'string' && /^\d{4}-\d{2}$/.test(rc.months.this)
        ? rc.months.this
        : today
          ? monthKeyOf(today)
          : null
    const monthsLast =
      typeof rc.months?.last === 'string' && /^\d{4}-\d{2}$/.test(rc.months.last) ? rc.months.last : null

    if (salary !== null && Number.isFinite(rate)) {
      cases.push({
        caseId,
        today,
        monthsLast,
        monthsThis,
        salary,
        dpsAnnualRatePercent: rate,
        dpsRule: typeof rc.dps_rule === 'string' ? rc.dps_rule : null,
        expenses,
        pockets
      })
    }
  })

  if (cases.length === 0 && !issues.some((i) => i.severity === 'error')) {
    issues.push({ severity: 'error', path: 'root', message: 'No importable cases were found in the file.' })
  }

  return { cases, issues, ok: cases.length > 0 }
}
