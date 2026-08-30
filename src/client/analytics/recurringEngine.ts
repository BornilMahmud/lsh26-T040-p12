/**
 * Recurring expense detection — PRD §34, Bonus 2 (§3).
 *
 * RULE
 *   An expense is classified recurring when the SAME normalized merchant
 *   appears in two CONSECUTIVE months with SUFFICIENTLY SIMILAR amounts.
 *
 *   amount similarity:  abs(a - b) / max(a, b) <= threshold   (default 0.20)
 *
 * Exact amount equality is explicitly NOT required (PRD §3 Bonus 2).
 * Category consistency is also considered: matching categories strengthens the
 * classification; a merchant match with a different category still qualifies
 * but is reported with a weaker reason so the UI can be honest about it.
 *
 * Every classification carries a human-readable REASON (PRD §34
 * "Show why an expense was classified as recurring").
 */

import type { Category, Expense, Paisa } from '@/types'
import { formatBdt } from '@/lib/money'
import { areConsecutiveMonths, formatMonthKey, monthKeyOf, type MonthKey } from '@/lib/dates'

export const DEFAULT_AMOUNT_TOLERANCE = 0.2

/**
 * Wider tolerance applied ONLY when the merchant name AND the category both
 * match. This implements the PRD §3 Bonus-2 example directly:
 *
 *   GP recharge  Month 1 = ৳422,  Month 2 = ৳535.50   (26.9% apart)
 *     => "potentially recurring if merchant/category pattern qualifies"
 *
 * A variable top-up to the same operator in the same category is a genuine
 * recurring pattern even though the amount moved more than 20%. Cross-category
 * matches stay on the strict 20% threshold so unrelated spend is never merged.
 */
export const CATEGORY_MATCH_AMOUNT_TOLERANCE = 0.35

/**
 * Normalize a merchant/shop name so "GP Recharge", "GP recharge" and
 * "gp-recharge" collapse to the same key (PRD §34).
 */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .normalize('NFKD')
    // punctuation / separators -> space
    .replace(/[._\-/\\|,:;'"()\[\]{}&+*#@!?]/g, ' ')
    // drop common noise words that don't identify the merchant
    .replace(/\b(ltd|limited|pvt|private|inc|co|company|store|shop|bd|bangladesh|dhaka|branch)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Similarity of two positive amounts in [0,1] where 1 = identical. */
export function amountSimilarity(a: Paisa, b: Paisa): number {
  const max = Math.max(Math.abs(a), Math.abs(b))
  if (max === 0) return 1
  return 1 - Math.abs(a - b) / max
}

export function amountsAreSimilar(a: Paisa, b: Paisa, tolerance = DEFAULT_AMOUNT_TOLERANCE): boolean {
  const max = Math.max(Math.abs(a), Math.abs(b))
  if (max === 0) return true
  return Math.abs(a - b) / max <= tolerance
}

export interface RecurringClassification {
  expenseId: string
  recurring: boolean
  reason: string
  merchantKey: string
  /** The month this merchant was previously seen (the evidence). */
  matchedMonth: MonthKey
  matchedAmount: Paisa
  /** 0–1 */
  amountSimilarity: number
  sameCategory: boolean
}

export interface RecurringGroup {
  merchantKey: string
  displayName: string
  category: Category
  months: MonthKey[]
  /** Median-ish typical amount across occurrences. */
  typicalAmount: Paisa
  occurrences: number
  reason: string
}

interface MerchantMonthAgg {
  monthKey: MonthKey
  total: Paisa
  count: number
  categories: Map<Category, number>
  expenseIds: string[]
  displayName: string
}

function aggregate(expenses: Expense[]): Map<string, Map<MonthKey, MerchantMonthAgg>> {
  const byMerchant = new Map<string, Map<MonthKey, MerchantMonthAgg>>()
  for (const e of expenses) {
    const key = normalizeMerchant(e.shop)
    if (!key) continue // unnamed merchant cannot be matched reliably
    const monthKey = monthKeyOf(e.date)
    let months = byMerchant.get(key)
    if (!months) {
      months = new Map()
      byMerchant.set(key, months)
    }
    let agg = months.get(monthKey)
    if (!agg) {
      agg = {
        monthKey,
        total: 0,
        count: 0,
        categories: new Map(),
        expenseIds: [],
        displayName: e.shop.trim()
      }
      months.set(monthKey, agg)
    }
    agg.total += e.amount
    agg.count += 1
    agg.categories.set(e.category, (agg.categories.get(e.category) ?? 0) + 1)
    agg.expenseIds.push(e.id)
  }
  return byMerchant
}

function dominantCategory(agg: MerchantMonthAgg): Category {
  let best: Category = 'Other'
  let bestCount = -1
  for (const [cat, count] of agg.categories) {
    if (count > bestCount) {
      best = cat
      bestCount = count
    }
  }
  return best
}

/**
 * Detect recurring expenses across the whole expense history.
 * Returns a per-expense classification map plus merchant-level groups.
 */
export function detectRecurringExpenses(
  expenses: Expense[],
  tolerance = DEFAULT_AMOUNT_TOLERANCE
): {
  classifications: Map<string, RecurringClassification>
  groups: RecurringGroup[]
} {
  const byMerchant = aggregate(expenses)
  const classifications = new Map<string, RecurringClassification>()
  const groups: RecurringGroup[] = []

  for (const [merchantKey, monthsMap] of byMerchant) {
    const months = [...monthsMap.keys()].sort()
    if (months.length < 2) continue

    const qualifyingMonths = new Set<MonthKey>()
    const reasonsByMonth = new Map<MonthKey, RecurringClassification>()

    for (let i = 1; i < months.length; i++) {
      const prevKey = months[i - 1]
      const curKey = months[i]
      if (!areConsecutiveMonths(prevKey, curKey)) continue

      const prev = monthsMap.get(prevKey)!
      const cur = monthsMap.get(curKey)!
      // Compare the per-month representative amount (average per occurrence)
      // so 2 coffees in one month don't break a monthly-subscription match.
      const prevAmt = Math.round(prev.total / prev.count)
      const curAmt = Math.round(cur.total / cur.count)
      const sameCategory = dominantCategory(prev) === dominantCategory(cur)
      // Category consistency widens the amount tolerance (see the constant's
      // docs and PRD §34 "Also consider category consistency").
      const effectiveTolerance = sameCategory
        ? Math.max(tolerance, CATEGORY_MATCH_AMOUNT_TOLERANCE)
        : tolerance
      if (!amountsAreSimilar(prevAmt, curAmt, effectiveTolerance)) continue

      const sim = amountSimilarity(prevAmt, curAmt)
      const deltaPct = Math.abs(1 - sim) * 100

      const reason =
        `Seen at "${cur.displayName}" in ${formatMonthKey(prevKey, true)} (${formatBdt(prevAmt)}) and ` +
        `${formatMonthKey(curKey, true)} (${formatBdt(curAmt)}) — consecutive months, ` +
        `amounts within ${deltaPct.toFixed(1)}% (threshold ${(effectiveTolerance * 100).toFixed(0)}%)` +
        (sameCategory
          ? ` and the same category (${dominantCategory(cur)}).`
          : `, though the category changed.`)

      qualifyingMonths.add(prevKey)
      qualifyingMonths.add(curKey)

      const mk = (monthKey: MonthKey, matchedMonth: MonthKey, matchedAmount: Paisa) => ({
        expenseId: '',
        recurring: true,
        reason,
        merchantKey,
        matchedMonth,
        matchedAmount,
        amountSimilarity: sim,
        sameCategory
      })
      reasonsByMonth.set(curKey, mk(curKey, prevKey, prevAmt))
      if (!reasonsByMonth.has(prevKey)) reasonsByMonth.set(prevKey, mk(prevKey, curKey, curAmt))
    }

    if (qualifyingMonths.size === 0) continue

    for (const monthKey of qualifyingMonths) {
      const agg = monthsMap.get(monthKey)!
      const base = reasonsByMonth.get(monthKey)!
      for (const id of agg.expenseIds) {
        classifications.set(id, { ...base, expenseId: id })
      }
    }

    const amounts = [...qualifyingMonths]
      .map((m) => {
        const a = monthsMap.get(m)!
        return Math.round(a.total / a.count)
      })
      .sort((a, b) => a - b)
    const typicalAmount = amounts[Math.floor(amounts.length / 2)]
    const anyMonth = monthsMap.get([...qualifyingMonths][0])!
    const sortedMonths = [...qualifyingMonths].sort()

    groups.push({
      merchantKey,
      displayName: anyMonth.displayName,
      category: dominantCategory(anyMonth),
      months: sortedMonths,
      typicalAmount,
      occurrences: qualifyingMonths.size,
      reason: reasonsByMonth.get(sortedMonths[sortedMonths.length - 1])!.reason
    })
  }

  groups.sort((a, b) => b.typicalAmount - a.typicalAmount)
  return { classifications, groups }
}

/** Apply classifications onto expenses (returns new array, pure). */
export function applyRecurringFlags(expenses: Expense[], tolerance = DEFAULT_AMOUNT_TOLERANCE): Expense[] {
  const { classifications } = detectRecurringExpenses(expenses, tolerance)
  return expenses.map((e) => {
    const c = classifications.get(e.id)
    return c
      ? { ...e, recurring: true, recurringReason: c.reason }
      : e.recurring || e.recurringReason
        ? { ...e, recurring: false, recurringReason: null }
        : e
  })
}

/**
 * Recurring obligations expected in `monthKey` that have NOT yet been paid
 * this month — used by the forecast to avoid under-forecasting (PRD §20).
 */
export interface PendingObligation {
  merchantKey: string
  displayName: string
  category: Category
  expectedAmount: Paisa
  lastSeenMonth: MonthKey
  /** Typical day-of-month the charge lands on. */
  typicalDay: number
  reason: string
}

export function pendingRecurringObligations(args: {
  expenses: Expense[]
  monthKey: MonthKey
  /** day-of-month already elapsed; obligations due earlier are still counted */
  tolerance?: number
}): PendingObligation[] {
  const tolerance = args.tolerance ?? DEFAULT_AMOUNT_TOLERANCE
  const { groups } = detectRecurringExpenses(args.expenses, tolerance)
  const out: PendingObligation[] = []

  for (const g of groups) {
    // Only consider obligations whose pattern was active in a month adjacent to
    // the target month (i.e. still live).
    const latest = g.months[g.months.length - 1]
    if (latest >= args.monthKey) continue // already paid this month (or later)
    const gapMonths = monthGap(latest, args.monthKey)
    if (gapMonths !== 1) continue // pattern broke; don't invent an obligation

    const occurrences = args.expenses.filter(
      (e) => normalizeMerchant(e.shop) === g.merchantKey && g.months.includes(monthKeyOf(e.date))
    )
    const days = occurrences.map((e) => Number(e.date.slice(8, 10))).sort((a, b) => a - b)
    const typicalDay = days.length ? days[Math.floor(days.length / 2)] : 1

    out.push({
      merchantKey: g.merchantKey,
      displayName: g.displayName,
      category: g.category,
      expectedAmount: g.typicalAmount,
      lastSeenMonth: latest,
      typicalDay,
      reason: `${g.displayName} recurs at about ${formatBdt(g.typicalAmount)}/month and has not appeared yet this month.`
    })
  }
  return out
}

function monthGap(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return by * 12 + bm - (ay * 12 + am)
}
