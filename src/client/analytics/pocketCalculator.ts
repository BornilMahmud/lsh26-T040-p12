/**
 * SAVINGS POCKET CALCULATOR — PRD §26–§30, §62, §75.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL RULE (PRD §28)
 *   The completion date is NEVER `target / monthlyContribution`.
 *   It is derived from the FORECAST: the forecast determines how much money is
 *   actually available for saving each month, and the pocket can only be filled
 *   out of that sustainable amount.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ALGORITHM
 *
 * 1. forecastSurplus = salary - forecastMonthTotal   (from the forecast engine;
 *    0 when the forecast projects a deficit)
 *
 * 2. requestedContributions = Σ pocket.monthlyContribution
 *
 * 3. If requestedContributions <= forecastSurplus
 *        -> every pocket saves at its requested rate (plan is sustainable)
 *    Else  (PRD §29 — proportional scaling)
 *        sustainable(p) = requested(p) * forecastSurplus / requestedContributions
 *        and a contributionGap is reported to the user.
 *
 * 4. Completion is then simulated MONTH BY MONTH (PRD §30):
 *        balance = currentBalance
 *        each month: balance += sustainableContribution
 *                    until balance >= target
 *    If the sustainable contribution is 0 -> completionDate = null and the UI
 *    shows "Not currently reachable with this contribution."
 *
 * 5. The DPS projection over the same horizon is computed separately by
 *    dpsCalculator (deposit -> interest -> compound), for comparison only.
 */

import type { Paisa, Pocket } from '@/types'
import { calculateDPS, dpsMonthsToTarget, type DpsResult } from './dpsCalculator'
import { addMonthsToKey, formatMonthKey, lastDayOfMonth, monthKeyOf, toDayKey, type MonthKey } from '@/lib/dates'

/** Hard cap so an absurd target yields "not reachable" instead of year 3500. */
export const MAX_PROJECTION_MONTHS = 600 // 50 years

export interface PocketProjection {
  pocketId: string
  name: string
  item: string
  target: Paisa
  currentBalance: Paisa
  /** What the user asked to contribute per month. */
  requestedContribution: Paisa
  /** What the forecast says is actually affordable per month. */
  sustainableContribution: Paisa
  /** True when the plan had to be scaled down to fit the forecast surplus. */
  wasScaled: boolean
  /** Already funded. */
  isComplete: boolean
  monthsRequired: number | null
  /** "YYYY-MM" of completion, null when unreachable. */
  completionMonth: MonthKey | null
  /** "YYYY-MM-DD" (last day of the completing month), null when unreachable. */
  completionDate: string | null
  completionLabel: string
  /** Remaining amount still to save. */
  remainingToTarget: Paisa
  progressPercent: number
  /** DPS comparison over the months required (or 12 months if unreachable). */
  dps: DpsResult | null
  dpsFinalValue: Paisa | null
  dpsInterest: Paisa | null
  /** Months saved purely by DPS interest vs a plain cash pile, if any. */
  dpsMonthsRequired: number | null
  reason: string
}

/** PRD §75 — savings facts object. */
export interface SavingsFacts {
  forecastSurplus: Paisa
  requestedContributions: Paisa
  /** > 0 when the plan exceeds the forecast surplus. */
  contributionGap: Paisa
  sustainableContributions: Paisa
  isPlanSustainable: boolean
  /** Ratio applied to each contribution when scaling (1 when sustainable). */
  scalingRatio: number
  dpsAnnualRatePercent: number
  pockets: PocketProjection[]
  /** Total that will be saved per month across all pockets. */
  totalMonthlySaving: Paisa
}

export interface PocketCalculationInput {
  pockets: Pocket[]
  /** From ForecastFacts.forecastSurplus — the money the forecast frees up. */
  forecastSurplus: Paisa
  dpsAnnualRatePercent: number
  /** "Now" — the month from which contributions start accruing. */
  today: Date
  /**
   * When true, contributions are NOT scaled down to the forecast surplus.
   * Used only if a user explicitly opts out of proportional allocation
   * (PRD §29 "unless user explicitly chooses another allocation").
   */
  ignoreSurplusConstraint?: boolean
}

/**
 * Simulate month-by-month accumulation until the target is reached (PRD §30).
 * Returns null when the target can never be reached with this contribution.
 */
export function simulateCompletionMonths(args: {
  currentBalance: Paisa
  target: Paisa
  monthlyContribution: Paisa
  maxMonths?: number
}): number | null {
  const target = Math.round(args.target)
  let balance = Math.round(args.currentBalance)
  if (balance >= target) return 0
  const contribution = Math.round(args.monthlyContribution)
  if (contribution <= 0) return null
  const cap = args.maxMonths ?? MAX_PROJECTION_MONTHS
  for (let m = 1; m <= cap; m++) {
    balance += contribution
    if (balance >= target) return m
  }
  return null
}

export function calculatePocketProjections(input: PocketCalculationInput): SavingsFacts {
  const surplus = Math.max(0, Math.round(input.forecastSurplus))
  const requested = input.pockets.reduce((t, p) => t + Math.max(0, p.monthlyContribution), 0)
  const constrained = !input.ignoreSurplusConstraint
  const needsScaling = constrained && requested > surplus && requested > 0
  const scalingRatio = needsScaling ? (requested === 0 ? 0 : surplus / requested) : 1
  const thisMonth: MonthKey = monthKeyOf(toDayKey(input.today))

  const projections: PocketProjection[] = input.pockets.map((p) => {
    const requestedContribution = Math.max(0, Math.round(p.monthlyContribution))
    const sustainableContribution = needsScaling
      ? Math.floor(requestedContribution * scalingRatio)
      : requestedContribution

    const remainingToTarget = Math.max(0, p.target - p.currentBalance)
    const isComplete = p.target > 0 && p.currentBalance >= p.target

    const monthsRequired = isComplete
      ? 0
      : simulateCompletionMonths({
          currentBalance: p.currentBalance,
          target: p.target,
          monthlyContribution: sustainableContribution
        })

    // Completion month: contributions land at month end, so N months from the
    // current month means the target is met at the end of thisMonth + (N-1).
    const completionMonth =
      monthsRequired === null
        ? null
        : monthsRequired === 0
          ? thisMonth
          : addMonthsToKey(thisMonth, monthsRequired - 1)
    const completionDate = completionMonth ? lastDayOfMonth(completionMonth) : null

    const dpsMonths = monthsRequired && monthsRequired > 0 ? monthsRequired : 12
    const dps =
      sustainableContribution > 0 || p.currentBalance > 0
        ? calculateDPS({
            monthlyDeposit: sustainableContribution,
            annualRatePercent: input.dpsAnnualRatePercent,
            months: dpsMonths,
            openingBalance: p.currentBalance
          })
        : null

    const dpsMonthsRequired =
      isComplete || remainingToTarget === 0
        ? 0
        : dpsMonthsToTarget({
            monthlyDeposit: sustainableContribution,
            annualRatePercent: input.dpsAnnualRatePercent,
            target: p.target,
            openingBalance: p.currentBalance,
            maxMonths: MAX_PROJECTION_MONTHS
          })

    const completionLabel = isComplete
      ? 'Target reached'
      : completionMonth
        ? formatMonthKey(completionMonth)
        : 'Not currently reachable'

    let reason: string
    if (isComplete) {
      reason = 'This pocket has already reached its target.'
    } else if (sustainableContribution <= 0) {
      reason =
        requestedContribution > 0
          ? `Your forecast leaves ${surplus === 0 ? 'no' : 'too little'} monthly surplus, so no money can be allocated to this pocket right now.`
          : 'No monthly contribution is set for this pocket.'
    } else if (needsScaling) {
      reason =
        `Planned contributions exceed your forecasted monthly surplus, so this pocket is funded at ` +
        `${(scalingRatio * 100).toFixed(0)}% of the requested amount — the forecast-sustainable rate.`
    } else {
      reason =
        `Funded at the full requested contribution because it fits inside your forecasted monthly surplus.`
    }

    return {
      pocketId: p.id,
      name: p.name,
      item: p.item,
      target: p.target,
      currentBalance: p.currentBalance,
      requestedContribution,
      sustainableContribution,
      wasScaled: needsScaling && sustainableContribution !== requestedContribution,
      isComplete,
      monthsRequired,
      completionMonth,
      completionDate,
      completionLabel,
      remainingToTarget,
      progressPercent: p.target > 0 ? Math.min(100, (p.currentBalance / p.target) * 100) : 0,
      dps,
      dpsFinalValue: dps?.finalValue ?? null,
      dpsInterest: dps?.totalInterest ?? null,
      dpsMonthsRequired,
      reason
    }
  })

  const sustainableContributions = projections.reduce((t, p) => t + p.sustainableContribution, 0)

  return {
    forecastSurplus: surplus,
    requestedContributions: requested,
    contributionGap: Math.max(0, requested - surplus),
    sustainableContributions,
    isPlanSustainable: !needsScaling,
    scalingRatio,
    dpsAnnualRatePercent: input.dpsAnnualRatePercent,
    pockets: projections,
    totalMonthlySaving: sustainableContributions
  }
}
