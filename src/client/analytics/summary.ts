/**
 * Monthly summary, category breakdown and month-over-month comparison.
 * PURE functions (PRD §46, §48) — no React, no Firebase, no Date.now() side
 * effects (today is always injected).
 */

import type { Category, Expense, Paisa } from '@/types'
import { CATEGORIES } from '@/types'
import { percentChange, sum } from '@/lib/money'
import { monthKeyOf, type MonthKey } from '@/lib/dates'

export interface CategoryTotal {
  category: Category
  amount: Paisa
  /** Share of the month's total spending, 0–100. */
  percentage: number
  count: number
}

export interface MonthlySummary {
  monthKey: MonthKey
  salary: Paisa
  totalSpent: Paisa
  /** salary - totalSpent. May be negative (overspend). */
  remaining: Paisa
  /** totalSpent / salary * 100. null when salary is 0 (undefined ratio). */
  spentPercentage: number | null
  expenseCount: number
  categories: CategoryTotal[]
  largestExpenses: Expense[]
  averagePerDay: Paisa
}

/** Group expenses by "YYYY-MM". */
export function groupExpensesByMonth(expenses: Expense[]): Map<MonthKey, Expense[]> {
  const map = new Map<MonthKey, Expense[]>()
  for (const e of expenses) {
    const key = monthKeyOf(e.date)
    const list = map.get(key)
    if (list) list.push(e)
    else map.set(key, [e])
  }
  return map
}

export function expensesForMonth(expenses: Expense[], monthKey: MonthKey): Expense[] {
  return expenses.filter((e) => monthKeyOf(e.date) === monthKey)
}

/** All month keys present in the data, newest first. */
export function availableMonths(expenses: Expense[]): MonthKey[] {
  const set = new Set<MonthKey>()
  for (const e of expenses) set.add(monthKeyOf(e.date))
  return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

export function totalOf(expenses: Expense[]): Paisa {
  return sum(expenses.map((e) => e.amount))
}

export function categoryTotal(expenses: Expense[], category: Category): Paisa {
  return sum(expenses.filter((e) => e.category === category).map((e) => e.amount))
}

/** Map of every category -> total (0 when unused). Useful for the forecast. */
export function categoryTotalsMap(expenses: Expense[]): Record<Category, Paisa> {
  const out = {} as Record<Category, Paisa>
  for (const c of CATEGORIES) out[c] = 0
  for (const e of expenses) out[e.category] = (out[e.category] ?? 0) + e.amount
  return out
}

/** Non-zero categories sorted descending by amount (PRD §16). */
export function calculateCategoryBreakdown(expenses: Expense[]): CategoryTotal[] {
  const totals = categoryTotalsMap(expenses)
  const counts = {} as Record<string, number>
  for (const e of expenses) counts[e.category] = (counts[e.category] ?? 0) + 1
  const grand = totalOf(expenses)
  return CATEGORIES.filter((c) => totals[c] > 0)
    .map((c) => ({
      category: c,
      amount: totals[c],
      percentage: grand === 0 ? 0 : (totals[c] / grand) * 100,
      count: counts[c] ?? 0
    }))
    .sort((a, b) => b.amount - a.amount)
}

/** Top N expenses by amount, descending (PRD §17). */
export function largestExpenses(expenses: Expense[], n = 5): Expense[] {
  return [...expenses].sort((a, b) => b.amount - a.amount || (a.date < b.date ? 1 : -1)).slice(0, n)
}

export function calculateMonthlySummary(args: {
  expenses: Expense[]
  monthKey: MonthKey
  salary: Paisa
  daysElapsed: number
}): MonthlySummary {
  const monthExpenses = expensesForMonth(args.expenses, args.monthKey)
  const totalSpent = totalOf(monthExpenses)
  const divisor = Math.max(1, args.daysElapsed)
  return {
    monthKey: args.monthKey,
    salary: args.salary,
    totalSpent,
    remaining: args.salary - totalSpent,
    spentPercentage: args.salary > 0 ? (totalSpent / args.salary) * 100 : null,
    expenseCount: monthExpenses.length,
    categories: calculateCategoryBreakdown(monthExpenses),
    largestExpenses: largestExpenses(monthExpenses, 5),
    averagePerDay: Math.round(totalSpent / divisor)
  }
}

export interface CategoryComparison {
  category: Category
  current: Paisa
  previous: Paisa
  difference: Paisa
  /** null when previous = 0 (new category this month). */
  percentageChange: number | null
  isNew: boolean
}

export interface MonthComparison {
  currentMonth: MonthKey
  previousMonth: MonthKey
  currentTotal: Paisa
  previousTotal: Paisa
  difference: Paisa
  /** null when previousTotal = 0 — PRD §18 "handle previousTotal = 0 safely". */
  percentageChange: number | null
  hasPreviousData: boolean
  categories: CategoryComparison[]
}

/** PRD §18 — month-over-month, including per-category deltas. */
export function calculateMonthComparison(args: {
  expenses: Expense[]
  currentMonth: MonthKey
  previousMonth: MonthKey
}): MonthComparison {
  const cur = expensesForMonth(args.expenses, args.currentMonth)
  const prev = expensesForMonth(args.expenses, args.previousMonth)
  const currentTotal = totalOf(cur)
  const previousTotal = totalOf(prev)
  const curMap = categoryTotalsMap(cur)
  const prevMap = categoryTotalsMap(prev)

  const categories: CategoryComparison[] = CATEGORIES.filter(
    (c) => curMap[c] > 0 || prevMap[c] > 0
  )
    .map((c) => ({
      category: c,
      current: curMap[c],
      previous: prevMap[c],
      difference: curMap[c] - prevMap[c],
      percentageChange: percentChange(curMap[c], prevMap[c]),
      isNew: prevMap[c] === 0 && curMap[c] > 0
    }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  return {
    currentMonth: args.currentMonth,
    previousMonth: args.previousMonth,
    currentTotal,
    previousTotal,
    difference: currentTotal - previousTotal,
    percentageChange: percentChange(currentTotal, previousTotal),
    hasPreviousData: prev.length > 0,
    categories
  }
}

/** Cumulative daily spend series for the month chart (PRD §44). */
export function dailyCumulativeSeries(
  expenses: Expense[],
  monthKey: MonthKey,
  daysInMonth: number
): { day: number; amount: Paisa; cumulative: Paisa }[] {
  const perDay = new Array<number>(daysInMonth + 1).fill(0)
  for (const e of expensesForMonth(expenses, monthKey)) {
    const d = Number(e.date.slice(8, 10))
    if (d >= 1 && d <= daysInMonth) perDay[d] += e.amount
  }
  const out: { day: number; amount: Paisa; cumulative: Paisa }[] = []
  let running = 0
  for (let d = 1; d <= daysInMonth; d++) {
    running += perDay[d]
    out.push({ day: d, amount: perDay[d], cumulative: running })
  }
  return out
}

/** Monthly totals trend across all months present, oldest first. */
export function monthlyTrend(expenses: Expense[]): { monthKey: MonthKey; total: Paisa }[] {
  const grouped = groupExpensesByMonth(expenses)
  return [...grouped.entries()]
    .map(([monthKey, list]) => ({ monthKey, total: totalOf(list) }))
    .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1))
}
