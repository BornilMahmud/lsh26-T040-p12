/**
 * FORECAST ENGINE — PRD §19, §20, §21, §22, §74.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOCUMENTED FORMULA (per category c)
 *
 *   elapsedDays    = day-of-month of `today`      (>= 1 inside current month)
 *   remainingDays  = daysInMonth - elapsedDays
 *
 *   currentDailyRate(c)  = currentMonthSpend(c) / elapsedDays
 *   previousDailyRate(c) = previousMonthSpend(c) / daysInPreviousMonth
 *
 *   forecastDailyRate(c) = W_CURRENT * currentDailyRate(c)
 *                        + W_PREVIOUS * previousDailyRate(c)
 *
 *      with W_CURRENT = 0.65, W_PREVIOUS = 0.35   (PRD §20)
 *
 *   Weights are RENORMALIZED when one side has no data, so a first-ever month
 *   is not silently forecast at 65% of its true pace:
 *      - no previous month  -> W_CURRENT = 1.0
 *      - no current spend in c but previous exists -> W_PREVIOUS = 1.0
 *
 *   pacedRemaining(c) = forecastDailyRate(c) * remainingDays
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HYBRID RECURRING ADJUSTMENT (PRD §20 — "known recurring obligations
 * adjusted to prevent double-counting")
 *
 * A pace model systematically UNDER-forecasts a large, lumpy, once-a-month
 * obligation (rent) that has not landed yet, because it contributes 0 to the
 * current pace. So for each pending recurring obligation in category c:
 *
 *   recurringRemaining(c) = sum(expectedAmount of pending obligations in c)
 *
 * Double-counting is prevented by taking, per category, the MAXIMUM of the two
 * signals rather than their sum, plus the paced portion of any NON-recurring
 * baseline:
 *
 *   remainingForecast(c) = max(pacedRemaining(c), recurringRemaining(c))
 *                          when recurringRemaining(c) > 0
 *                        = pacedRemaining(c)  otherwise
 *
 * Rationale: within one category the paced estimate already anticipates *some*
 * spend for the rest of the month; the recurring obligation is a hard floor for
 * it. Taking max() keeps the forecast >= the known obligation without adding
 * the same money twice.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *   forecastMonthTotal = currentMonthSpend + Σ remainingForecast(c)
 *   forecastMoneyLeft  = salary - forecastMonthTotal      (negative = shortfall)
 *
 * For a PAST month remainingDays = 0, so the forecast equals actual spending
 * (a closed month is not "forecast").
 */

import type { Category, Expense, Paisa } from '@/types'
import { CATEGORIES } from '@/types'
import {
  categoryTotalsMap,
  expensesForMonth,
  totalOf
} from './summary'
import {
  DEFAULT_AMOUNT_TOLERANCE,
  pendingRecurringObligations,
  type PendingObligation
} from './recurringEngine'
import { daysInMonthKey, monthProgress, previousMonthKey, type MonthKey } from '@/lib/dates'

export const W_CURRENT = 0.65
export const W_PREVIOUS = 0.35

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface CategoryForecast {
  category: Category
  currentSpend: Paisa
  previousSpend: Paisa
  currentDailyRate: number
  previousDailyRate: number
  forecastDailyRate: number
  pacedRemaining: Paisa
  recurringRemaining: Paisa
  /** Final remaining estimate after the hybrid max() adjustment. */
  remainingForecast: Paisa
  forecastTotal: Paisa
  usedRecurringFloor: boolean
}

/** PRD §74 — the verified facts object. Insights may ONLY use this. */
export interface ForecastFacts {
  monthKey: MonthKey
  previousMonthKey: MonthKey
  salary: Paisa
  currentSpend: Paisa
  previousSpend: Paisa
  daysInMonth: number
  elapsedDays: number
  remainingDays: number
  currentDailyRate: number
  previousDailyRate: number
  blendedDailyRate: number
  forecastRemaining: Paisa
  forecastTotal: Paisa
  /** salary - forecastTotal, clamped at >= 0 */
  forecastSurplus: Paisa
  /** max(0, forecastTotal - salary) */
  forecastDeficit: Paisa
  /** Signed: salary - forecastTotal */
  forecastMoneyLeft: Paisa
  confidence: ForecastConfidence
  confidenceReason: string
  categories: CategoryForecast[]
  pendingObligations: PendingObligation[]
  recurringRemainingTotal: Paisa
  isClosedMonth: boolean
  weights: { current: number; previous: number }
}

export interface ForecastInput {
  expenses: Expense[]
  salary: Paisa
  monthKey: MonthKey
  today: Date
  /** Optional category override used by the what-if simulator (paisa deltas). */
  categoryOverrides?: Partial<Record<Category, Paisa>>
  amountTolerance?: number
}

/**
 * calculateForecast — pure, deterministic, independently testable (PRD §46).
 */
export function calculateForecast(input: ForecastInput): ForecastFacts {
  const monthKey = input.monthKey
  const prevKey = previousMonthKey(monthKey)
  const progress = monthProgress(monthKey, input.today)
  const daysInMonth = progress.daysInMonth
  const elapsedDays = progress.elapsedDays
  const remainingDays = progress.remainingDays
  const daysInPrevMonth = daysInMonthKey(prevKey)

  const curExpenses = expensesForMonth(input.expenses, monthKey)
  const prevExpenses = expensesForMonth(input.expenses, prevKey)

  // Category totals, with what-if overrides applied (overrides are absolute
  // simulated totals per category, never negative).
  const curMapRaw = categoryTotalsMap(curExpenses)
  const curMap = { ...curMapRaw }
  if (input.categoryOverrides) {
    for (const [cat, val] of Object.entries(input.categoryOverrides)) {
      if (val !== undefined) curMap[cat as Category] = Math.max(0, Math.round(val))
    }
  }
  const prevMap = categoryTotalsMap(prevExpenses)

  const currentSpend = CATEGORIES.reduce((t, c) => t + curMap[c], 0)
  const previousSpend = totalOf(prevExpenses)

  const obligations = remainingDays > 0
    ? pendingRecurringObligations({
        expenses: input.expenses,
        monthKey,
        tolerance: input.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE
      })
    : []
  const obligationByCategory = new Map<Category, Paisa>()
  for (const o of obligations) {
    obligationByCategory.set(o.category, (obligationByCategory.get(o.category) ?? 0) + o.expectedAmount)
  }

  const safeElapsed = Math.max(1, elapsedDays)
  const categories: CategoryForecast[] = []
  let forecastRemaining = 0
  let recurringRemainingTotal = 0

  for (const c of CATEGORIES) {
    const cur = curMap[c]
    const prev = prevMap[c]
    const recurringRemaining = obligationByCategory.get(c) ?? 0
    if (cur === 0 && prev === 0 && recurringRemaining === 0) continue

    const currentDailyRate = elapsedDays > 0 ? cur / safeElapsed : 0
    const previousDailyRate = prev / daysInPrevMonth

    // Renormalize weights against available signals (documented above).
    let wCur = W_CURRENT
    let wPrev = W_PREVIOUS
    const hasCur = cur > 0 && elapsedDays > 0
    const hasPrev = prev > 0
    if (hasCur && !hasPrev) {
      wCur = 1
      wPrev = 0
    } else if (!hasCur && hasPrev) {
      wCur = 0
      wPrev = 1
    }

    const forecastDailyRate = wCur * currentDailyRate + wPrev * previousDailyRate
    const pacedRemaining = Math.round(forecastDailyRate * remainingDays)
    const usedRecurringFloor = recurringRemaining > pacedRemaining && recurringRemaining > 0
    const remainingForecast =
      recurringRemaining > 0 ? Math.max(pacedRemaining, recurringRemaining) : pacedRemaining

    forecastRemaining += remainingForecast
    recurringRemainingTotal += recurringRemaining

    categories.push({
      category: c,
      currentSpend: cur,
      previousSpend: prev,
      currentDailyRate,
      previousDailyRate,
      forecastDailyRate,
      pacedRemaining,
      recurringRemaining,
      remainingForecast,
      forecastTotal: cur + remainingForecast,
      usedRecurringFloor
    })
  }

  categories.sort((a, b) => b.forecastTotal - a.forecastTotal)

  const forecastTotal = currentSpend + forecastRemaining
  const forecastMoneyLeft = input.salary - forecastTotal

  const { confidence, reason } = assessConfidence({
    currentExpenseCount: curExpenses.length,
    previousExpenseCount: prevExpenses.length,
    elapsedDays,
    daysInMonth,
    isClosedMonth: remainingDays === 0
  })

  return {
    monthKey,
    previousMonthKey: prevKey,
    salary: input.salary,
    currentSpend,
    previousSpend,
    daysInMonth,
    elapsedDays,
    remainingDays,
    currentDailyRate: elapsedDays > 0 ? currentSpend / safeElapsed : 0,
    previousDailyRate: previousSpend / daysInPrevMonth,
    blendedDailyRate: remainingDays > 0 ? forecastRemaining / remainingDays : 0,
    forecastRemaining,
    forecastTotal,
    forecastSurplus: Math.max(0, forecastMoneyLeft),
    forecastDeficit: Math.max(0, -forecastMoneyLeft),
    forecastMoneyLeft,
    confidence,
    confidenceReason: reason,
    categories,
    pendingObligations: obligations,
    recurringRemainingTotal,
    isClosedMonth: remainingDays === 0,
    weights: { current: W_CURRENT, previous: W_PREVIOUS }
  }
}

/** PRD §21 — forecast confidence based on data availability. */
function assessConfidence(args: {
  currentExpenseCount: number
  previousExpenseCount: number
  elapsedDays: number
  daysInMonth: number
  isClosedMonth: boolean
}): { confidence: ForecastConfidence; reason: string } {
  if (args.isClosedMonth) {
    return {
      confidence: 'HIGH',
      reason: 'This month is complete, so the total is actual recorded spending rather than a projection.'
    }
  }
  if (args.currentExpenseCount === 0) {
    return {
      confidence: 'LOW',
      reason: 'No expenses recorded yet this month, so the projection relies entirely on last month’s pattern.'
    }
  }
  const elapsedShare = args.elapsedDays / args.daysInMonth
  if (args.currentExpenseCount >= 5 && args.previousExpenseCount >= 5 && elapsedShare >= 0.25) {
    return {
      confidence: 'HIGH',
      reason: `Both this month (${args.currentExpenseCount} expenses) and last month (${args.previousExpenseCount} expenses) have meaningful data, and ${Math.round(elapsedShare * 100)}% of the month has elapsed.`
    }
  }
  if (args.currentExpenseCount >= 3 || args.previousExpenseCount >= 5) {
    return {
      confidence: 'MEDIUM',
      reason: `Limited data so far — ${args.currentExpenseCount} expense${args.currentExpenseCount === 1 ? '' : 's'} this month and ${args.previousExpenseCount} last month. The projection will sharpen as more are recorded.`
    }
  }
  return {
    confidence: 'LOW',
    reason: `Very little current-month data (${args.currentExpenseCount} expense${args.currentExpenseCount === 1 ? '' : 's'}); treat this projection as indicative only.`
  }
}

/**
 * Forecast chart series: actual cumulative spend up to today, then the
 * projected path to month end. PRD §44 — actual and forecast must be visually
 * distinguishable, so the two series are returned separately (they share the
 * value at `elapsedDays` to make the line continuous).
 */
export function forecastSeries(
  facts: ForecastFacts,
  expenses: Expense[]
): { day: number; actual: Paisa | null; projected: Paisa | null; salary: Paisa }[] {
  const perDay = new Array<number>(facts.daysInMonth + 1).fill(0)
  for (const e of expensesForMonth(expenses, facts.monthKey)) {
    const d = Number(e.date.slice(8, 10))
    if (d >= 1 && d <= facts.daysInMonth) perDay[d] += e.amount
  }
  const out: { day: number; actual: Paisa | null; projected: Paisa | null; salary: Paisa }[] = []
  let running = 0
  const perRemainingDay =
    facts.remainingDays > 0 ? facts.forecastRemaining / facts.remainingDays : 0

  for (let d = 1; d <= facts.daysInMonth; d++) {
    const isActualRange = d <= Math.max(1, facts.elapsedDays)
    if (isActualRange) running += perDay[d]
    const projected =
      d < facts.elapsedDays
        ? null
        : Math.round(running + perRemainingDay * Math.max(0, d - facts.elapsedDays))
    out.push({
      day: d,
      actual: isActualRange ? running : null,
      projected: facts.remainingDays > 0 ? projected : null,
      salary: facts.salary
    })
  }
  return out
}
