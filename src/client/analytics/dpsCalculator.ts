/**
 * DPS CALCULATOR — PRD §31, §32.
 *
 * The supplied DPS rule, reproduced EXACTLY in this order:
 *
 *   For each month:
 *     1. Add deposit                    balanceAfterDeposit = balance + deposit
 *     2. Calculate monthly interest     interest = balanceAfterDeposit * annualRate / 12 / 100
 *     3. Round interest HALF-UP to the nearest paisa
 *     4. Add interest to the balance    balance = balanceAfterDeposit + interest
 *     5. The next month earns interest on the new balance (compounding)
 *
 * All arithmetic is on integer paisa; only the interest computation goes
 * through a float, and it is immediately rounded half-up to an integer paisa,
 * which is precisely what the rule specifies.
 *
 * This is an ILLUSTRATIVE comparison projection, not a guaranteed bank return
 * — the UI must state the rate in use and that caveat (PRD §8, §31).
 */

import type { Paisa } from '@/types'
import { roundHalfUp } from '@/lib/money'

export interface DpsMonthRow {
  month: number
  openingBalance: Paisa
  deposit: Paisa
  balanceAfterDeposit: Paisa
  interest: Paisa
  closingBalance: Paisa
  cumulativeDeposits: Paisa
  cumulativeInterest: Paisa
}

export interface DpsResult {
  months: number
  annualRatePercent: number
  monthlyRatePercent: number
  monthlyDeposit: Paisa
  totalDeposits: Paisa
  totalInterest: Paisa
  finalValue: Paisa
  schedule: DpsMonthRow[]
}

/** One month of the DPS rule. Exposed for unit testing step order/rounding. */
export function dpsMonthStep(args: {
  openingBalance: Paisa
  deposit: Paisa
  annualRatePercent: number
}): { balanceAfterDeposit: Paisa; interest: Paisa; closingBalance: Paisa } {
  const balanceAfterDeposit = args.openingBalance + args.deposit
  // Step 2 + 3: interest on the post-deposit balance, rounded HALF UP to paisa.
  const rawInterest = (balanceAfterDeposit * args.annualRatePercent) / 12 / 100
  const interest = roundHalfUp(rawInterest)
  return {
    balanceAfterDeposit,
    interest,
    closingBalance: balanceAfterDeposit + interest
  }
}

/**
 * Run the DPS schedule for `months` months.
 * @param openingBalance existing savings that already earn interest (default 0)
 */
export function calculateDPS(args: {
  monthlyDeposit: Paisa
  annualRatePercent: number
  months: number
  openingBalance?: Paisa
}): DpsResult {
  const months = Math.max(0, Math.floor(args.months))
  const rate = Number.isFinite(args.annualRatePercent) ? args.annualRatePercent : 0
  const deposit = Math.max(0, Math.round(args.monthlyDeposit))
  let balance = Math.max(0, Math.round(args.openingBalance ?? 0))

  const schedule: DpsMonthRow[] = []
  let cumulativeDeposits = 0
  let cumulativeInterest = 0

  for (let m = 1; m <= months; m++) {
    const opening = balance
    const step = dpsMonthStep({ openingBalance: opening, deposit, annualRatePercent: rate })
    cumulativeDeposits += deposit
    cumulativeInterest += step.interest
    balance = step.closingBalance
    schedule.push({
      month: m,
      openingBalance: opening,
      deposit,
      balanceAfterDeposit: step.balanceAfterDeposit,
      interest: step.interest,
      closingBalance: balance,
      cumulativeDeposits,
      cumulativeInterest
    })
  }

  return {
    months,
    annualRatePercent: rate,
    monthlyRatePercent: rate / 12,
    monthlyDeposit: deposit,
    totalDeposits: cumulativeDeposits,
    totalInterest: cumulativeInterest,
    finalValue: balance,
    schedule
  }
}

/**
 * Months needed for a DPS (deposit + monthly compounding) to reach `target`.
 * Returns null when unreachable (deposit <= 0 and no interest growth, or the
 * cap is exceeded) so the UI can say "Not currently reachable" (PRD §62).
 */
export function dpsMonthsToTarget(args: {
  monthlyDeposit: Paisa
  annualRatePercent: number
  target: Paisa
  openingBalance?: Paisa
  maxMonths?: number
}): number | null {
  const maxMonths = args.maxMonths ?? 1200 // 100 years
  let balance = Math.max(0, Math.round(args.openingBalance ?? 0))
  const target = Math.round(args.target)
  if (balance >= target) return 0
  const deposit = Math.max(0, Math.round(args.monthlyDeposit))
  const rate = args.annualRatePercent
  if (deposit <= 0 && !(rate > 0 && balance > 0)) return null

  for (let m = 1; m <= maxMonths; m++) {
    const step = dpsMonthStep({ openingBalance: balance, deposit, annualRatePercent: rate })
    balance = step.closingBalance
    if (balance >= target) return m
  }
  return null
}
