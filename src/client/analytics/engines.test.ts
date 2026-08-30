/**
 * Regression tests for every critical calculation — PRD §49.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import type { Expense, Pocket, Category } from '@/types'
import { parseBdtToPaisa, formatBdt, percentChange, roundHalfUp } from '@/lib/money'
import {
  monthProgress,
  previousMonthKey,
  addMonthsToKey,
  daysInMonthKey,
  areConsecutiveMonths,
  monthKeyDiff
} from '@/lib/dates'
import {
  totalOf,
  categoryTotal,
  calculateCategoryBreakdown,
  calculateMonthComparison,
  calculateMonthlySummary,
  largestExpenses,
  availableMonths
} from './summary'
import { calculateForecast, W_CURRENT, W_PREVIOUS } from './forecastEngine'
import { calculateDPS, dpsMonthStep, dpsMonthsToTarget } from './dpsCalculator'
import { calculatePocketProjections, simulateCompletionMonths } from './pocketCalculator'
import { generateInsights } from './insightEngine'
import {
  detectRecurringExpenses,
  normalizeMerchant,
  amountsAreSimilar,
  pendingRecurringObligations,
  CATEGORY_MATCH_AMOUNT_TOLERANCE
} from './recurringEngine'
import { calculateWhatIfScenario } from './whatIf'

// ── helpers ─────────────────────────────────────────────────────────────────
let seq = 0
function exp(date: string, amountBdt: number, category: Category, shop = 'Shop'): Expense {
  seq += 1
  return {
    id: `e${seq}`,
    userId: 'u1',
    amount: parseBdtToPaisa(amountBdt)!,
    date,
    category,
    shop,
    notes: '',
    source: 'manual',
    recurring: false,
    createdAt: 0,
    updatedAt: 0
  }
}
function pocket(over: Partial<Pocket> = {}): Pocket {
  return {
    id: over.id ?? 'p1',
    userId: 'u1',
    name: over.name ?? 'Laptop',
    item: over.item ?? 'MacBook Air M4',
    target: over.target ?? parseBdtToPaisa(145000)!,
    monthlyContribution: over.monthlyContribution ?? parseBdtToPaisa(12000)!,
    currentBalance: over.currentBalance ?? 0,
    createdAt: 0,
    updatedAt: 0
  }
}
const bdt = (n: number) => parseBdtToPaisa(n)!

// ════════════════════════════════════════════════════════════════════════════
describe('money: decimal safety', () => {
  it('parses BDT strings to integer paisa', () => {
    expect(parseBdtToPaisa('100.50')).toBe(10050)
    expect(parseBdtToPaisa('৳1,234.56')).toBe(123456)
    expect(parseBdtToPaisa('735')).toBe(73500)
    expect(parseBdtToPaisa(422)).toBe(42200)
    expect(parseBdtToPaisa('535.50')).toBe(53550)
    expect(parseBdtToPaisa('')).toBeNull()
    expect(parseBdtToPaisa('abc')).toBeNull()
    expect(parseBdtToPaisa(-5)).toBeNull()
  })

  it('avoids float artifacts that plague naive parsing', () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE754
    expect(parseBdtToPaisa('1.005')).toBe(101)
    expect(parseBdtToPaisa('0.1')).toBe(10)
    expect(parseBdtToPaisa('0.29')).toBe(29)
    // classic 0.1 + 0.2 problem never occurs because we add integers
    expect(parseBdtToPaisa('0.1')! + parseBdtToPaisa('0.2')!).toBe(30)
  })

  it('formats whole vs fractional amounts per PRD §60', () => {
    expect(formatBdt(2200000)).toBe('৳22,000')
    expect(formatBdt(10050)).toBe('৳100.50')
    expect(formatBdt(-325000)).toBe('-৳3,250')
  })

  it('rounds half-up deterministically', () => {
    expect(roundHalfUp(0.5)).toBe(1)
    expect(roundHalfUp(1.5)).toBe(2)
    expect(roundHalfUp(2.5)).toBe(3) // NOT banker's rounding
    expect(roundHalfUp(-0.5)).toBe(-1)
    expect(Math.round(-0.5)).toBe(-0)   // contrast: Math.round is asymmetric
  })

  it('handles percentChange with a zero base', () => {
    expect(percentChange(1200, 1000)).toBeCloseTo(20)
    expect(percentChange(0, 1000)).toBeCloseTo(-100)
    expect(percentChange(500, 0)).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('dates', () => {
  it('computes month progress inside the current month', () => {
    const p = monthProgress('2026-08', new Date(2026, 7, 17))
    expect(p.daysInMonth).toBe(31)
    expect(p.elapsedDays).toBe(17)
    expect(p.remainingDays).toBe(14)
    expect(p.isCurrentMonth).toBe(true)
  })

  it('first day of month has 1 elapsed day (never divides by zero)', () => {
    const p = monthProgress('2026-08', new Date(2026, 7, 1))
    expect(p.elapsedDays).toBe(1)
    expect(p.remainingDays).toBe(30)
  })

  it('last day of month has 0 remaining days', () => {
    const p = monthProgress('2026-08', new Date(2026, 7, 31))
    expect(p.elapsedDays).toBe(31)
    expect(p.remainingDays).toBe(0)
  })

  it('treats a past month as closed', () => {
    const p = monthProgress('2026-07', new Date(2026, 7, 17))
    expect(p.elapsedDays).toBe(31)
    expect(p.remainingDays).toBe(0)
    expect(p.isPast).toBe(true)
  })

  it('handles leap years and month arithmetic', () => {
    expect(daysInMonthKey('2024-02')).toBe(29)
    expect(daysInMonthKey('2026-02')).toBe(28)
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(addMonthsToKey('2026-08', 6)).toBe('2027-02')
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12')
    expect(areConsecutiveMonths('2025-12', '2026-01')).toBe(true)
    expect(areConsecutiveMonths('2026-01', '2026-03')).toBe(false)
    expect(monthKeyDiff('2027-01', '2027-03')).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('expense totals & category totals (PRD §49)', () => {
  const expenses = [
    exp('2026-08-01', 100, 'Food'),
    exp('2026-08-02', 200, 'Food'),
    exp('2026-08-03', 300, 'Transport')
  ]

  it('totals 100 + 200 + 300 = 600', () => {
    expect(totalOf(expenses)).toBe(bdt(600))
  })

  it('Food = 300, Transport = 300', () => {
    expect(categoryTotal(expenses, 'Food')).toBe(bdt(300))
    expect(categoryTotal(expenses, 'Transport')).toBe(bdt(300))
    expect(categoryTotal(expenses, 'Rent')).toBe(0)
  })

  it('sorts the breakdown descending with correct percentages', () => {
    const b = calculateCategoryBreakdown([
      exp('2026-08-01', 2200, 'Rent'),
      exp('2026-08-02', 845, 'Food'),
      exp('2026-08-03', 620, 'Education')
    ])
    expect(b.map((c) => c.category)).toEqual(['Rent', 'Food', 'Education'])
    expect(b[0].percentage).toBeCloseTo((2200 / 3665) * 100, 5)
    expect(b.reduce((t, c) => t + c.percentage, 0)).toBeCloseTo(100, 5)
  })

  it('ranks the largest expenses descending, top 5', () => {
    const many = [
      exp('2026-08-01', 22000, 'Rent', 'Landlord'),
      exp('2026-08-02', 500, 'Food'),
      exp('2026-08-03', 8450, 'Food'),
      exp('2026-08-04', 1200, 'Transport'),
      exp('2026-08-05', 6200, 'Education'),
      exp('2026-08-06', 300, 'Mobile')
    ]
    const top = largestExpenses(many, 5)
    expect(top).toHaveLength(5)
    expect(top[0].amount).toBe(bdt(22000))
    expect(top[0].shop).toBe('Landlord')
    expect(top.at(-1)!.amount).toBe(bdt(500))
  })

  it('derives available months dynamically, newest first (PRD §10)', () => {
    const e = [exp('2026-06-05', 10, 'Food'), exp('2026-08-05', 10, 'Food'), exp('2026-07-05', 10, 'Food')]
    expect(availableMonths(e)).toEqual(['2026-08', '2026-07', '2026-06'])
  })

  it('summary computes remaining and spent percentage safely', () => {
    const s = calculateMonthlySummary({
      expenses: [exp('2026-08-01', 20000, 'Rent')],
      monthKey: '2026-08',
      salary: bdt(50000),
      daysElapsed: 10
    })
    expect(s.totalSpent).toBe(bdt(20000))
    expect(s.remaining).toBe(bdt(30000))
    expect(s.spentPercentage).toBeCloseTo(40)
    expect(s.averagePerDay).toBe(bdt(2000))

    const zeroSalary = calculateMonthlySummary({
      expenses: [],
      monthKey: '2026-08',
      salary: 0,
      daysElapsed: 0
    })
    expect(zeroSalary.spentPercentage).toBeNull() // no division by zero
    expect(zeroSalary.averagePerDay).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('month comparison (PRD §18, §49)', () => {
  it('current 1200 vs previous 1000 = +20%', () => {
    const c = calculateMonthComparison({
      expenses: [exp('2026-08-05', 1200, 'Food'), exp('2026-07-05', 1000, 'Food')],
      currentMonth: '2026-08',
      previousMonth: '2026-07'
    })
    expect(c.currentTotal).toBe(bdt(1200))
    expect(c.previousTotal).toBe(bdt(1000))
    expect(c.difference).toBe(bdt(200))
    expect(c.percentageChange).toBeCloseTo(20)
  })

  it('handles previousTotal = 0 without Infinity', () => {
    const c = calculateMonthComparison({
      expenses: [exp('2026-08-05', 1200, 'Food')],
      currentMonth: '2026-08',
      previousMonth: '2026-07'
    })
    expect(c.percentageChange).toBeNull()
    expect(c.hasPreviousData).toBe(false)
  })

  it('compares category totals: Food 5900 -> 7200 = +22.0%', () => {
    const c = calculateMonthComparison({
      expenses: [exp('2026-04-05', 7200, 'Food'), exp('2026-03-05', 5900, 'Food')],
      currentMonth: '2026-04',
      previousMonth: '2026-03'
    })
    const food = c.categories.find((x) => x.category === 'Food')!
    expect(food.percentageChange).toBeCloseTo(22.03, 1)
    expect(food.difference).toBe(bdt(1300))
    expect(food.isNew).toBe(false)
  })

  it('flags a brand-new category', () => {
    const c = calculateMonthComparison({
      expenses: [exp('2026-08-05', 500, 'Health'), exp('2026-07-05', 1000, 'Food')],
      currentMonth: '2026-08',
      previousMonth: '2026-07'
    })
    expect(c.categories.find((x) => x.category === 'Health')!.isNew).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('forecast engine (PRD §19–§21, §49, §61)', () => {
  const today = new Date(2026, 7, 10) // 10 Aug 2026, 31-day month, 21 remaining

  it('applies the documented 0.65 / 0.35 weighted blend', () => {
    // Food: this month 1000 over 10 days = 100/day
    //       last month 3100 over 31 days = 100/day  -> blended 100/day
    const expenses = [exp('2026-08-05', 1000, 'Food'), exp('2026-07-15', 3100, 'Food')]
    const f = calculateForecast({ expenses, salary: bdt(50000), monthKey: '2026-08', today })
    const food = f.categories.find((c) => c.category === 'Food')!
    expect(food.currentDailyRate).toBeCloseTo(bdt(1000) / 10)
    expect(food.previousDailyRate).toBeCloseTo(bdt(3100) / 31)
    expect(food.forecastDailyRate).toBeCloseTo(
      W_CURRENT * (bdt(1000) / 10) + W_PREVIOUS * (bdt(3100) / 31)
    )
    expect(food.pacedRemaining).toBe(Math.round(food.forecastDailyRate * 21))
    expect(f.forecastTotal).toBe(f.currentSpend + f.forecastRemaining)
  })

  it('renormalizes weights when there is no previous month', () => {
    const expenses = [exp('2026-08-05', 1000, 'Food')]
    const f = calculateForecast({ expenses, salary: bdt(50000), monthKey: '2026-08', today })
    const food = f.categories.find((c) => c.category === 'Food')!
    // full weight on current pace: 100/day * 21 remaining days
    expect(food.forecastDailyRate).toBeCloseTo(bdt(1000) / 10)
    expect(food.pacedRemaining).toBe(bdt(2100))
    expect(f.forecastTotal).toBe(bdt(3100))
  })

  it('projects from last month alone when this month has no spend in a category', () => {
    const expenses = [exp('2026-07-15', 3100, 'Food'), exp('2026-08-02', 500, 'Transport')]
    const f = calculateForecast({ expenses, salary: bdt(50000), monthKey: '2026-08', today })
    const food = f.categories.find((c) => c.category === 'Food')!
    expect(food.currentSpend).toBe(0)
    expect(food.forecastDailyRate).toBeCloseTo(bdt(3100) / 31) // weight 1.0 on previous
  })

  it('computes remaining days and surplus / deficit correctly', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-01', 40000, 'Rent', 'Landlord')],
      salary: bdt(50000),
      monthKey: '2026-08',
      today
    })
    expect(f.elapsedDays).toBe(10)
    expect(f.remainingDays).toBe(21)
    // 40000/10 = 4000/day * 21 = 84000 projected extra -> heavy deficit
    expect(f.forecastTotal).toBeGreaterThan(bdt(50000))
    expect(f.forecastDeficit).toBe(f.forecastTotal - bdt(50000))
    expect(f.forecastSurplus).toBe(0)
    expect(f.forecastMoneyLeft).toBe(bdt(50000) - f.forecastTotal)
  })

  it('never forecasts beyond actuals for a closed month', () => {
    const f = calculateForecast({
      expenses: [exp('2026-07-05', 1000, 'Food')],
      salary: bdt(50000),
      monthKey: '2026-07',
      today
    })
    expect(f.remainingDays).toBe(0)
    expect(f.forecastRemaining).toBe(0)
    expect(f.forecastTotal).toBe(bdt(1000))
    expect(f.isClosedMonth).toBe(true)
    expect(f.confidence).toBe('HIGH')
  })

  it('adds unpaid recurring obligations as a floor (hybrid model, PRD §20)', () => {
    // Rent paid in June and July at 16,000 (recurring), not yet paid in August.
    const expenses = [
      exp('2026-06-03', 16000, 'Rent', 'Landlord'),
      exp('2026-07-03', 16000, 'Rent', 'Landlord'),
      exp('2026-08-05', 1000, 'Food', 'Madchef')
    ]
    const f = calculateForecast({ expenses, salary: bdt(50000), monthKey: '2026-08', today })
    expect(f.pendingObligations.map((o) => o.displayName)).toContain('Landlord')
    const rent = f.categories.find((c) => c.category === 'Rent')!
    expect(rent.recurringRemaining).toBe(bdt(16000))
    expect(rent.usedRecurringFloor).toBe(true)
    // Floor applied, not summed on top of the paced estimate (no double count)
    expect(rent.remainingForecast).toBe(bdt(16000))
    expect(f.forecastTotal).toBeGreaterThanOrEqual(bdt(17000))
  })

  it('does not invent an obligation once the bill is paid this month', () => {
    const expenses = [
      exp('2026-06-03', 16000, 'Rent', 'Landlord'),
      exp('2026-07-03', 16000, 'Rent', 'Landlord'),
      exp('2026-08-03', 16000, 'Rent', 'Landlord')
    ]
    const f = calculateForecast({ expenses, salary: bdt(50000), monthKey: '2026-08', today })
    expect(f.pendingObligations).toHaveLength(0)
  })

  // ── edge cases (PRD §61) ─────────────────────────────────────────────────
  it('handles no expenses at all', () => {
    const f = calculateForecast({ expenses: [], salary: bdt(50000), monthKey: '2026-08', today })
    expect(f.currentSpend).toBe(0)
    expect(f.forecastTotal).toBe(0)
    expect(f.forecastSurplus).toBe(bdt(50000))
    expect(f.confidence).toBe('LOW')
    expect(Number.isFinite(f.currentDailyRate)).toBe(true)
  })

  it('handles a single expense', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-10', 100, 'Food')],
      salary: bdt(50000),
      monthKey: '2026-08',
      today
    })
    expect(f.forecastTotal).toBe(bdt(310)) // 10/day * 31
  })

  it('handles salary = 0 without dividing by zero', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-05', 1000, 'Food')],
      salary: 0,
      monthKey: '2026-08',
      today
    })
    expect(f.forecastSurplus).toBe(0)
    expect(f.forecastDeficit).toBe(f.forecastTotal)
    expect(Number.isFinite(f.forecastDeficit)).toBe(true)
  })

  it('handles current spending exactly equal to salary', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-31', 50000, 'Rent')],
      salary: bdt(50000),
      monthKey: '2026-08',
      today: new Date(2026, 7, 31) // last day: nothing left to project
    })
    expect(f.forecastTotal).toBe(bdt(50000))
    expect(f.forecastMoneyLeft).toBe(0)
    expect(f.forecastSurplus).toBe(0)
    expect(f.forecastDeficit).toBe(0)
  })

  it('handles a first-day-of-month forecast', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-01', 500, 'Food')],
      salary: bdt(50000),
      monthKey: '2026-08',
      today: new Date(2026, 7, 1)
    })
    expect(f.elapsedDays).toBe(1)
    expect(f.forecastTotal).toBe(bdt(500 * 31))
  })

  it('handles a very large expense without overflow', () => {
    const f = calculateForecast({
      expenses: [exp('2026-08-05', 9_000_000, 'Shopping')],
      salary: bdt(50000),
      monthKey: '2026-08',
      today
    })
    expect(Number.isFinite(f.forecastTotal)).toBe(true)
    expect(f.forecastDeficit).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('DPS calculator (PRD §31, §49)', () => {
  it('follows deposit -> interest -> compound in the exact given order', () => {
    // 8% annual, deposit 1000.00 (100000 paisa)
    const step1 = dpsMonthStep({ openingBalance: 0, deposit: 100000, annualRatePercent: 8 })
    // interest = 100000 * 8 / 12 / 100 = 666.666… -> half-up 667 paisa
    expect(step1.balanceAfterDeposit).toBe(100000)
    expect(step1.interest).toBe(667)
    expect(step1.closingBalance).toBe(100667)

    // Month 2 earns on the *new* balance including month 1 interest
    const step2 = dpsMonthStep({ openingBalance: step1.closingBalance, deposit: 100000, annualRatePercent: 8 })
    expect(step2.balanceAfterDeposit).toBe(200667)
    // 200667 * 8 / 12 / 100 = 1337.78 -> 1338
    expect(step2.interest).toBe(1338)
    expect(step2.closingBalance).toBe(202005)
  })

  it('rounds interest HALF-UP to the nearest paisa', () => {
    // choose a balance whose interest lands exactly on .5 paisa:
    // b * 8 / 1200 = x.5  ->  b = 1200 * (x + 0.5) / 8
    const balance = (1200 * 0.5) / 8 // = 75 paisa -> interest exactly 0.5
    const s = dpsMonthStep({ openingBalance: 0, deposit: balance, annualRatePercent: 8 })
    expect(s.interest).toBe(1) // half-up, not 0
  })

  it('compounds a full schedule and reports deposits vs interest', () => {
    const r = calculateDPS({ monthlyDeposit: 100000, annualRatePercent: 8, months: 12 })
    expect(r.schedule).toHaveLength(12)
    expect(r.totalDeposits).toBe(1200000)
    expect(r.finalValue).toBe(r.totalDeposits + r.totalInterest)
    expect(r.totalInterest).toBeGreaterThan(0)
    // Every month's interest must exceed a simple non-compounding calculation
    expect(r.schedule[11].interest).toBeGreaterThan(r.schedule[0].interest)
    // Integer paisa throughout
    for (const row of r.schedule) expect(Number.isInteger(row.closingBalance)).toBe(true)
  })

  it('reads the rate from the case rather than assuming 8% (PRD §79)', () => {
    const a = calculateDPS({ monthlyDeposit: 100000, annualRatePercent: 7.5, months: 12 })
    const b = calculateDPS({ monthlyDeposit: 100000, annualRatePercent: 10, months: 12 })
    expect(b.totalInterest).toBeGreaterThan(a.totalInterest)
    expect(a.monthlyRatePercent).toBeCloseTo(0.625)
    expect(b.monthlyRatePercent).toBeCloseTo(0.8333, 3)
  })

  it('handles 0% rate and 0 deposit gracefully', () => {
    const zeroRate = calculateDPS({ monthlyDeposit: 100000, annualRatePercent: 0, months: 6 })
    expect(zeroRate.totalInterest).toBe(0)
    expect(zeroRate.finalValue).toBe(600000)

    const zeroDeposit = calculateDPS({ monthlyDeposit: 0, annualRatePercent: 8, months: 6 })
    expect(zeroDeposit.finalValue).toBe(0)
    expect(dpsMonthsToTarget({ monthlyDeposit: 0, annualRatePercent: 8, target: 1000 })).toBeNull()
  })

  it('reaches a target faster with interest than without', () => {
    const withInterest = dpsMonthsToTarget({ monthlyDeposit: bdt(12000), annualRatePercent: 8, target: bdt(145000) })!
    const plainCash = simulateCompletionMonths({ currentBalance: 0, target: bdt(145000), monthlyContribution: bdt(12000) })!
    expect(withInterest).toBeLessThanOrEqual(plainCash)
    expect(plainCash).toBe(13) // 12000 * 13 = 156000 >= 145000
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('pocket completion is forecast-based (PRD §28, §29, §30, §49)', () => {
  const today = new Date(2026, 7, 10)

  it('does NOT use target / contribution when the forecast cannot fund it', () => {
    // Requested 12,000/month would naively finish 145,000 in 13 months.
    // But the forecast only frees 6,000/month, so it must take far longer.
    const s = calculatePocketProjections({
      pockets: [pocket()],
      forecastSurplus: bdt(6000),
      dpsAnnualRatePercent: 8,
      today
    })
    const p = s.pockets[0]
    const naive = Math.ceil(145000 / 12000) // 13
    expect(p.requestedContribution).toBe(bdt(12000))
    expect(p.sustainableContribution).toBe(bdt(6000)) // scaled to the forecast
    expect(p.wasScaled).toBe(true)
    expect(p.monthsRequired).toBe(25) // 6000 * 25 = 150000 >= 145000
    expect(p.monthsRequired).not.toBe(naive)
    expect(s.contributionGap).toBe(bdt(6000))
    expect(s.isPlanSustainable).toBe(false)
  })

  it('uses the full requested contribution when the forecast affords it', () => {
    const s = calculatePocketProjections({
      pockets: [pocket()],
      forecastSurplus: bdt(20000),
      dpsAnnualRatePercent: 8,
      today
    })
    const p = s.pockets[0]
    expect(p.sustainableContribution).toBe(bdt(12000))
    expect(p.wasScaled).toBe(false)
    expect(p.monthsRequired).toBe(13)
    expect(s.isPlanSustainable).toBe(true)
    // completion month = thisMonth + (13-1) = 2027-08
    expect(p.completionMonth).toBe('2027-08')
    expect(p.completionDate).toBe('2027-08-31')
  })

  it('scales multiple pockets proportionally (PRD §29)', () => {
    const s = calculatePocketProjections({
      pockets: [
        pocket({ id: 'a', name: 'Laptop', monthlyContribution: bdt(12000), target: bdt(145000) }),
        pocket({ id: 'b', name: 'Wedding', monthlyContribution: bdt(8000), target: bdt(400000) })
      ],
      forecastSurplus: bdt(10000), // requested 20000 -> ratio 0.5
      dpsAnnualRatePercent: 8,
      today
    })
    expect(s.requestedContributions).toBe(bdt(20000))
    expect(s.scalingRatio).toBeCloseTo(0.5)
    expect(s.pockets[0].sustainableContribution).toBe(bdt(6000))
    expect(s.pockets[1].sustainableContribution).toBe(bdt(4000))
    expect(s.sustainableContributions).toBeLessThanOrEqual(bdt(10000))
    expect(s.contributionGap).toBe(bdt(10000))
  })

  it('returns "not reachable" instead of an absurd date (PRD §62)', () => {
    const s = calculatePocketProjections({
      pockets: [pocket()],
      forecastSurplus: 0, // forecast deficit -> nothing to allocate
      dpsAnnualRatePercent: 8,
      today
    })
    const p = s.pockets[0]
    expect(p.sustainableContribution).toBe(0)
    expect(p.monthsRequired).toBeNull()
    expect(p.completionDate).toBeNull()
    expect(p.completionLabel).toBe('Not currently reachable')
  })

  it('handles contribution = 0, target = 0 and an already-complete pocket', () => {
    const s = calculatePocketProjections({
      pockets: [
        pocket({ id: 'z', monthlyContribution: 0 }),
        pocket({ id: 'y', target: 0, monthlyContribution: bdt(1000) }),
        pocket({ id: 'x', target: bdt(1000), currentBalance: bdt(1200), monthlyContribution: bdt(500) })
      ],
      forecastSurplus: bdt(50000),
      dpsAnnualRatePercent: 8,
      today
    })
    expect(s.pockets[0].completionLabel).toBe('Not currently reachable')
    expect(s.pockets[1].monthsRequired).toBe(0) // target already satisfied
    expect(s.pockets[2].isComplete).toBe(true)
    expect(s.pockets[2].completionLabel).toBe('Target reached')
  })

  it('caps an impossible target rather than looping forever', () => {
    const s = calculatePocketProjections({
      pockets: [pocket({ target: bdt(999_000_000), monthlyContribution: bdt(100) })],
      forecastSurplus: bdt(100),
      dpsAnnualRatePercent: 8,
      today
    })
    expect(s.pockets[0].monthsRequired).toBeNull()
  })

  it('an existing balance shortens the projection', () => {
    const withBalance = calculatePocketProjections({
      pockets: [pocket({ currentBalance: bdt(100000) })],
      forecastSurplus: bdt(20000),
      dpsAnnualRatePercent: 8,
      today
    }).pockets[0]
    expect(withBalance.monthsRequired).toBe(4) // 100000 + 4*12000 = 148000
    expect(withBalance.progressPercent).toBeCloseTo((100000 / 145000) * 100, 5)
  })

  it('Bonus 1: raising the contribution immediately moves the date earlier', () => {
    const base = calculatePocketProjections({
      pockets: [pocket({ monthlyContribution: bdt(10000) })],
      forecastSurplus: bdt(30000),
      dpsAnnualRatePercent: 8,
      today
    }).pockets[0]
    const raised = calculatePocketProjections({
      pockets: [pocket({ monthlyContribution: bdt(20000) })],
      forecastSurplus: bdt(30000),
      dpsAnnualRatePercent: 8,
      today
    }).pockets[0]
    expect(raised.monthsRequired!).toBeLessThan(base.monthsRequired!)
    expect(raised.completionMonth! < base.completionMonth!).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('recurring detection (PRD §34, Bonus 2, §49)', () => {
  it('normalizes merchant name variations', () => {
    expect(normalizeMerchant('GP Recharge')).toBe('gp recharge')
    expect(normalizeMerchant('gp-recharge')).toBe('gp recharge')
    expect(normalizeMerchant('  GP   RECHARGE.  ')).toBe('gp recharge')
    expect(normalizeMerchant('Madchef Ltd.')).toBe('madchef')
  })

  it('does not require exact amount equality (20% tolerance)', () => {
    expect(amountsAreSimilar(bdt(16000), bdt(16000))).toBe(true)
    expect(amountsAreSimilar(bdt(500), bdt(560))).toBe(true) // 10.7% apart
    expect(amountsAreSimilar(bdt(100), bdt(500))).toBe(false)
    // ৳422 -> ৳535.50 is 21.2% apart: outside the strict threshold…
    expect(amountsAreSimilar(bdt(422), bdt(535.5))).toBe(false)
    // …but inside the wider threshold used when the category also matches
    expect(amountsAreSimilar(bdt(422), bdt(535.5), CATEGORY_MATCH_AMOUNT_TOLERANCE)).toBe(true)
  })

  it('marks the PRD GP-recharge example recurring via category consistency', () => {
    // PRD §3 Bonus 2: 422 -> 535.50, "potentially recurring if merchant/
    // category pattern qualifies". Same merchant + same category qualifies.
    const same = detectRecurringExpenses([
      exp('2026-03-11', 422, 'Mobile', 'GP Recharge'),
      exp('2026-04-11', 535.5, 'Mobile', 'gp-recharge')
    ])
    expect(same.classifications.size).toBe(2)
    expect(same.groups[0].reason).toContain('same category (Mobile)')

    // Same amounts but a category switch stays on the strict 20% threshold
    const different = detectRecurringExpenses([
      exp('2026-03-11', 422, 'Mobile', 'GP Recharge'),
      exp('2026-04-11', 535.5, 'Shopping', 'gp-recharge')
    ])
    expect(different.classifications.size).toBe(0)
  })

  it('marks landlord rent recurring across consecutive months', () => {
    const expenses = [
      exp('2026-03-03', 16000, 'Rent', 'Landlord'),
      exp('2026-04-03', 16000, 'Rent', 'Landlord')
    ]
    const { classifications, groups } = detectRecurringExpenses(expenses)
    expect(classifications.size).toBe(2)
    expect(groups[0].displayName).toBe('Landlord')
    expect(groups[0].typicalAmount).toBe(bdt(16000))
    expect(classifications.get(expenses[1].id)!.reason).toContain('consecutive months')
    expect(classifications.get(expenses[1].id)!.reason).toContain('Landlord')
  })

  it('matches GP recharge across merchant-name variants with differing amounts', () => {
    const expenses = [
      exp('2026-03-11', 500, 'Mobile', 'GP Recharge'),
      exp('2026-04-11', 560, 'Mobile', 'gp-recharge') // 10.7% apart
    ]
    const { classifications } = detectRecurringExpenses(expenses)
    expect(classifications.size).toBe(2)
  })

  it('does NOT mark unrelated merchants recurring', () => {
    const expenses = [
      exp('2026-03-05', 500, 'Food', 'Madchef'),
      exp('2026-04-05', 500, 'Food', 'Sultan Dine')
    ]
    expect(detectRecurringExpenses(expenses).classifications.size).toBe(0)
  })

  it('does NOT mark non-consecutive months recurring', () => {
    const expenses = [
      exp('2026-01-05', 500, 'Food', 'Madchef'),
      exp('2026-04-05', 500, 'Food', 'Madchef')
    ]
    expect(detectRecurringExpenses(expenses).classifications.size).toBe(0)
  })

  it('does NOT match the same merchant with wildly different amounts', () => {
    const expenses = [
      exp('2026-03-05', 100, 'Food', 'Madchef'),
      exp('2026-04-05', 900, 'Food', 'Madchef')
    ]
    expect(detectRecurringExpenses(expenses).classifications.size).toBe(0)
  })

  it('ignores blank merchant names (cannot match reliably)', () => {
    const expenses = [exp('2026-03-05', 500, 'Food', ''), exp('2026-04-05', 500, 'Food', '')]
    expect(detectRecurringExpenses(expenses).classifications.size).toBe(0)
  })

  it('finds obligations pending in the target month', () => {
    const pending = pendingRecurringObligations({
      expenses: [
        exp('2026-06-03', 16000, 'Rent', 'Landlord'),
        exp('2026-07-03', 16000, 'Rent', 'Landlord')
      ],
      monthKey: '2026-08'
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].expectedAmount).toBe(bdt(16000))
    expect(pending[0].typicalDay).toBe(3)
  })

  it('drops obligations whose pattern broke more than a month ago', () => {
    const pending = pendingRecurringObligations({
      expenses: [
        exp('2026-03-03', 16000, 'Rent', 'Landlord'),
        exp('2026-04-03', 16000, 'Rent', 'Landlord')
      ],
      monthKey: '2026-08'
    })
    expect(pending).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('insight engine (PRD §23–§25)', () => {
  const today = new Date(2026, 7, 17)
  const expenses = [
    exp('2026-08-01', 22000, 'Rent', 'Landlord'),
    exp('2026-08-04', 4200, 'Food', 'Madchef'),
    exp('2026-08-08', 4250, 'Food', 'Sultan Dine'),
    exp('2026-08-10', 8347, 'Education', 'Coaching Center'),
    exp('2026-08-12', 1500, 'Transport', 'Uber'),
    exp('2026-07-02', 22000, 'Rent', 'Landlord'),
    exp('2026-07-06', 5900, 'Food', 'Madchef'),
    exp('2026-07-09', 7073, 'Education', 'Coaching Center'),
    exp('2026-07-14', 2740, 'Transport', 'Uber')
  ]

  function build(salary = bdt(50000)) {
    const forecast = calculateForecast({ expenses, salary, monthKey: '2026-08', today })
    const comparison = calculateMonthComparison({
      expenses,
      currentMonth: '2026-08',
      previousMonth: '2026-07'
    })
    const { groups } = detectRecurringExpenses(expenses)
    const savings = calculatePocketProjections({
      pockets: [pocket()],
      forecastSurplus: forecast.forecastSurplus,
      dpsAnnualRatePercent: 8,
      today
    })
    return generateInsights({
      expenses,
      monthExpenses: expenses.filter((e) => e.date.startsWith('2026-08')),
      forecast,
      comparison,
      savings,
      recurringGroups: groups
    })
  }

  it('produces at least 3 insights', () => {
    expect(build().length).toBeGreaterThanOrEqual(3)
  })

  it('every insight contains a concrete BDT amount or percentage', () => {
    for (const i of build()) {
      expect(i.body).toMatch(/৳[\d,]+|\d+(\.\d+)?%/)
      expect(i.body.length).toBeGreaterThan(30)
      expect(Object.keys(i.evidence).length).toBeGreaterThan(0)
    }
  })

  it('names the dominant category with its real amount and share', () => {
    const dominance = build().find((i) => i.kind === 'category-dominance')!
    expect(dominance.body).toContain('Rent')
    expect(dominance.body).toContain('৳22,000')
    expect(dominance.evidence.amount).toBe(bdt(22000))
  })

  it('reports a category increase with both months’ amounts', () => {
    const inc = build().find((i) => i.kind === 'category-increase')
    expect(inc).toBeDefined()
    expect(inc!.body).toMatch(/from ৳[\d,.]+ in Jul 2026 to ৳[\d,.]+ this month/)
  })

  it('reports the largest single expense with merchant', () => {
    const largest = build().find((i) => i.kind === 'largest-expense')!
    expect(largest.body).toContain('Landlord')
    expect(largest.body).toContain('৳22,000')
  })

  it('recalculates when expense data changes (not hard-coded)', () => {
    const before = build()
    const extra = [...expenses, exp('2026-08-16', 30000, 'Shopping', 'Gadget Bazaar')]
    const forecast = calculateForecast({ expenses: extra, salary: bdt(50000), monthKey: '2026-08', today })
    const comparison = calculateMonthComparison({ expenses: extra, currentMonth: '2026-08', previousMonth: '2026-07' })
    const after = generateInsights({
      expenses: extra,
      monthExpenses: extra.filter((e) => e.date.startsWith('2026-08')),
      forecast,
      comparison
    })
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
    // The new 30,000 purchase must now be the largest single expense
    expect(after.find((i) => i.kind === 'largest-expense')!.body).toContain('Gadget Bazaar')
  })

  it('switches from headroom to deficit when salary drops', () => {
    const rich = build(bdt(200000))
    const poor = build(bdt(20000))
    expect(rich.some((i) => i.kind === 'forecast-headroom')).toBe(true)
    expect(poor.some((i) => i.kind === 'forecast-risk')).toBe(true)
    expect(poor.find((i) => i.kind === 'forecast-risk')!.tone).toBe('critical')
  })

  it('falls back to an honest message with no data', () => {
    const forecast = calculateForecast({ expenses: [], salary: bdt(50000), monthKey: '2026-08', today })
    const comparison = calculateMonthComparison({ expenses: [], currentMonth: '2026-08', previousMonth: '2026-07' })
    const insights = generateInsights({ expenses: [], monthExpenses: [], forecast, comparison })
    expect(insights.some((i) => i.kind === 'insufficient-data' || i.kind === 'savings-capacity')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('what-if simulator (PRD §33, §63, §49)', () => {
  const today = new Date(2026, 7, 10)
  const expenses = [
    exp('2026-08-02', 8000, 'Food', 'Madchef'),
    exp('2026-08-03', 20000, 'Rent', 'Landlord'),
    exp('2026-07-02', 8000, 'Food', 'Madchef'),
    exp('2026-07-03', 20000, 'Rent', 'Landlord')
  ]
  const pockets = [
    pocket({ id: 'a', name: 'Laptop', target: bdt(145000), monthlyContribution: bdt(12000) }),
    pocket({ id: 'b', name: 'Wedding', target: bdt(400000), monthlyContribution: bdt(8000) })
  ]

  it('reduces Food 8000 by 25% to a simulated 6000 and frees 2000', () => {
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(60000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 25 }]
    })
    expect(r.actualCategoryTotals.Food).toBe(bdt(8000))
    expect(r.overrides.Food).toBe(bdt(6000))
    expect(r.monthlySaving).toBe(bdt(2000))
  })

  it('improves the forecast surplus and moves pocket dates earlier', () => {
    // Salary chosen so the savings plan is SURPLUS-CONSTRAINED, which is the
    // regime in which freeing cash actually accelerates the pockets.
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(85000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 50 }]
    })
    expect(r.scenarioForecast.forecastTotal).toBeLessThan(r.baselineForecast.forecastTotal)
    expect(r.surplusImprovement).toBeGreaterThan(0)
    expect(r.pocketDeltas).toHaveLength(2)
    // every pocket must be reported on (PRD §33 "display every savings pocket")
    for (const d of r.pocketDeltas) {
      expect(typeof d.improvementLabel).toBe('string')
      expect(d.scenarioSustainable).toBeGreaterThanOrEqual(d.baselineSustainable)
    }
    expect(r.pocketDeltas.some((d) => (d.monthsEarlier ?? 0) > 0)).toBe(true)
  })

  it('0% reduction is identical to actual (PRD §63)', () => {
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(85000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 0 }]
    })
    expect(r.monthlySaving).toBe(0)
    expect(r.scenarioForecast.forecastTotal).toBe(r.baselineForecast.forecastTotal)
    expect(r.pocketDeltas.every((d) => d.monthsEarlier === 0)).toBe(true)
  })

  it('100% reduction zeroes the category and never goes negative', () => {
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(85000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 100 }]
    })
    expect(r.overrides.Food).toBe(0)
    expect(r.scenarioForecast.categories.find((c) => c.category === 'Food')!.currentSpend).toBe(0)
    expect(r.scenarioForecast.forecastTotal).toBeGreaterThanOrEqual(0)
  })

  it('clamps out-of-range reductions instead of producing negative spend', () => {
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(60000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 150 }]
    })
    expect(r.overrides.Food).toBe(0)
    expect(r.monthlySaving).toBe(bdt(8000))
  })

  it('never mutates the actual expense array', () => {
    const snapshot = JSON.stringify(expenses)
    calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(60000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [{ category: 'Food', reductionPercent: 75 }]
    })
    expect(JSON.stringify(expenses)).toBe(snapshot)
  })

  it('supports reducing multiple categories at once', () => {
    const r = calculateWhatIfScenario({
      expenses,
      pockets,
      salary: bdt(60000),
      monthKey: '2026-08',
      today,
      dpsAnnualRatePercent: 8,
      adjustments: [
        { category: 'Food', reductionPercent: 50 },
        { category: 'Rent', reductionPercent: 10 }
      ]
    })
    expect(r.monthlySaving).toBe(bdt(4000) + bdt(2000))
  })
})
