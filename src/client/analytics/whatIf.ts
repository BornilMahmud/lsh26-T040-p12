/**
 * WHAT-IF SIMULATOR — PRD §33, §63, Bonus 3.
 *
 * Reduces one or more categories by a percentage and RE-RUNS the real engines
 * (forecast -> savings capacity -> pocket completion -> DPS) on the simulated
 * numbers. Nothing is mutated: actual expenses are never touched and Firestore
 * is never written (PRD §33 "Do not mutate Firestore", §63).
 *
 * Edge cases (PRD §63):
 *   0%   -> scenario identical to actual
 *   100% -> category becomes exactly 0
 *   Reduction is clamped to [0, 100] so spending can never go negative.
 */

import type { Category, Expense, Paisa } from '@/types'
import { calculateForecast, type ForecastFacts } from './forecastEngine'
import { calculatePocketProjections, type SavingsFacts } from './pocketCalculator'
import { categoryTotalsMap, expensesForMonth } from './summary'
import type { Pocket } from '@/types'
import type { MonthKey } from '@/lib/dates'
import { monthKeyDiff } from '@/lib/dates'

export interface ScenarioAdjustment {
  category: Category
  /** 0–100 */
  reductionPercent: number
}

export interface PocketDelta {
  pocketId: string
  name: string
  baselineCompletionMonth: MonthKey | null
  scenarioCompletionMonth: MonthKey | null
  baselineLabel: string
  scenarioLabel: string
  /** Positive = scenario completes N months earlier. */
  monthsEarlier: number | null
  baselineMonthsRequired: number | null
  scenarioMonthsRequired: number | null
  baselineSustainable: Paisa
  scenarioSustainable: Paisa
  baselineDpsFinalValue: Paisa | null
  scenarioDpsFinalValue: Paisa | null
  improvementLabel: string
}

export interface WhatIfResult {
  adjustments: ScenarioAdjustment[]
  /** Simulated absolute category totals fed into the forecast. */
  overrides: Partial<Record<Category, Paisa>>
  actualCategoryTotals: Partial<Record<Category, Paisa>>
  /** Immediate cash freed this month by the reduction. */
  monthlySaving: Paisa
  baselineForecast: ForecastFacts
  scenarioForecast: ForecastFacts
  baselineSavings: SavingsFacts
  scenarioSavings: SavingsFacts
  surplusImprovement: Paisa
  pocketDeltas: PocketDelta[]
}

export function calculateWhatIfScenario(args: {
  expenses: Expense[]
  pockets: Pocket[]
  salary: Paisa
  monthKey: MonthKey
  today: Date
  dpsAnnualRatePercent: number
  adjustments: ScenarioAdjustment[]
}): WhatIfResult {
  const monthExpenses = expensesForMonth(args.expenses, args.monthKey)
  const actualTotals = categoryTotalsMap(monthExpenses)

  const overrides: Partial<Record<Category, Paisa>> = {}
  const actualSubset: Partial<Record<Category, Paisa>> = {}
  let monthlySaving = 0

  for (const adj of args.adjustments) {
    const pct = Math.min(100, Math.max(0, adj.reductionPercent))
    const actual = actualTotals[adj.category] ?? 0
    // Round the retained amount so the scenario total stays an integer paisa
    // and can never go below zero.
    const scenario = Math.max(0, Math.round((actual * (100 - pct)) / 100))
    overrides[adj.category] = scenario
    actualSubset[adj.category] = actual
    monthlySaving += actual - scenario
  }

  const baselineForecast = calculateForecast({
    expenses: args.expenses,
    salary: args.salary,
    monthKey: args.monthKey,
    today: args.today
  })

  const scenarioForecast = calculateForecast({
    expenses: args.expenses,
    salary: args.salary,
    monthKey: args.monthKey,
    today: args.today,
    categoryOverrides: overrides
  })

  const baselineSavings = calculatePocketProjections({
    pockets: args.pockets,
    forecastSurplus: baselineForecast.forecastSurplus,
    dpsAnnualRatePercent: args.dpsAnnualRatePercent,
    today: args.today
  })

  const scenarioSavings = calculatePocketProjections({
    pockets: args.pockets,
    forecastSurplus: scenarioForecast.forecastSurplus,
    dpsAnnualRatePercent: args.dpsAnnualRatePercent,
    today: args.today
  })

  const pocketDeltas: PocketDelta[] = baselineSavings.pockets.map((b) => {
    const s = scenarioSavings.pockets.find((p) => p.pocketId === b.pocketId)!
    let monthsEarlier: number | null = null
    if (b.completionMonth && s.completionMonth) {
      monthsEarlier = monthKeyDiff(s.completionMonth, b.completionMonth)
    }
    let improvementLabel: string
    if (b.isComplete) improvementLabel = 'Already complete'
    else if (!b.completionMonth && s.completionMonth) improvementLabel = 'Becomes reachable'
    else if (b.completionMonth && !s.completionMonth) improvementLabel = 'No longer reachable'
    else if (monthsEarlier === null) improvementLabel = 'Not reachable either way'
    else if (monthsEarlier > 0) improvementLabel = `${monthsEarlier} month${monthsEarlier === 1 ? '' : 's'} earlier`
    else if (monthsEarlier < 0) improvementLabel = `${Math.abs(monthsEarlier)} month${Math.abs(monthsEarlier) === 1 ? '' : 's'} later`
    else improvementLabel = 'No change'

    return {
      pocketId: b.pocketId,
      name: b.name,
      baselineCompletionMonth: b.completionMonth,
      scenarioCompletionMonth: s.completionMonth,
      baselineLabel: b.completionLabel,
      scenarioLabel: s.completionLabel,
      monthsEarlier,
      baselineMonthsRequired: b.monthsRequired,
      scenarioMonthsRequired: s.monthsRequired,
      baselineSustainable: b.sustainableContribution,
      scenarioSustainable: s.sustainableContribution,
      baselineDpsFinalValue: b.dpsFinalValue,
      scenarioDpsFinalValue: s.dpsFinalValue,
      improvementLabel
    }
  })

  return {
    adjustments: args.adjustments,
    overrides,
    actualCategoryTotals: actualSubset,
    monthlySaving,
    baselineForecast,
    scenarioForecast,
    baselineSavings,
    scenarioSavings,
    surplusImprovement: scenarioForecast.forecastSurplus - baselineForecast.forecastSurplus,
    pocketDeltas
  }
}
