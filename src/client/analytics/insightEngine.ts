/**
 * DYNAMIC INSIGHTS ENGINE — PRD §23, §24, §25, §72, §73.
 *
 * Rules generate insights from VERIFIED, already-computed facts only
 * (ForecastFacts, MonthComparison, SavingsFacts, recurring groups). No advice
 * is hard-coded, and no number in an insight string is produced anywhere except
 * from those facts — this is the "raw data -> deterministic analytics ->
 * verified facts -> wording" pipeline of PRD §73, with the wording step done
 * deterministically (so we never claim generative AI, per PRD §72).
 *
 * Every insight embeds: a category (or subject), an actual amount, and a
 * comparison/meaning (PRD §2 Requirement C).
 */

import type { Expense, Paisa } from '@/types'
import { formatBdt, formatPercent } from '@/lib/money'
import { formatDayKey, formatMonthKey } from '@/lib/dates'
import type { ForecastFacts } from './forecastEngine'
import type { MonthComparison } from './summary'
import type { SavingsFacts } from './pocketCalculator'
import type { RecurringGroup } from './recurringEngine'
import { largestExpenses } from './summary'

export type InsightTone = 'positive' | 'warning' | 'critical' | 'neutral'

export type InsightKind =
  | 'category-dominance'
  | 'category-increase'
  | 'category-decrease'
  | 'largest-expense'
  | 'forecast-risk'
  | 'forecast-headroom'
  | 'savings-capacity'
  | 'recurring'
  | 'pace'
  | 'month-comparison'
  | 'new-category'
  | 'salary-usage'
  | 'pocket-feasibility'
  | 'insufficient-data'

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  /** Full sentence(s) containing concrete numbers. */
  body: string
  tone: InsightTone
  /** Higher = more important; used for ordering and the top-3 guarantee. */
  priority: number
  /** Machine-readable facts behind the sentence — auditable by judges. */
  evidence: Record<string, string | number | null>
}

export interface InsightInput {
  expenses: Expense[]
  monthExpenses: Expense[]
  forecast: ForecastFacts
  comparison: MonthComparison
  savings?: SavingsFacts | null
  recurringGroups?: RecurringGroup[]
  /** Label for scenario-derived insights. */
  scenarioLabel?: string
}

/** PRD §24 thresholds — configurable in one place. */
const DOMINANCE_SHARE = 20 // %
const INCREASE_THRESHOLD = 15 // %
const DECREASE_THRESHOLD = 15 // %

export function generateInsights(input: InsightInput): Insight[] {
  const f = input.forecast
  const cmp = input.comparison
  const out: Insight[] = []
  const monthLabel = formatMonthKey(f.monthKey, true)
  const prevLabel = formatMonthKey(f.previousMonthKey, true)

  // ── Rule: category dominance (PRD §24) ────────────────────────────────────
  const topCategories = [...cmp.categories]
    .filter((c) => c.current > 0)
    .sort((a, b) => b.current - a.current)
  if (topCategories.length > 0 && cmp.currentTotal > 0) {
    const top = topCategories[0]
    const share = (top.current / cmp.currentTotal) * 100
    if (share >= DOMINANCE_SHARE) {
      out.push({
        id: `dominance-${top.category}`,
        kind: 'category-dominance',
        title: `${top.category} dominates your ${monthLabel} spending`,
        body: `${top.category} is your largest expense at ${formatBdt(top.current)}, accounting for ${share.toFixed(0)}% of the ${formatBdt(cmp.currentTotal)} you have spent this month.`,
        tone: share >= 45 ? 'warning' : 'neutral',
        priority: 70 + Math.min(20, share / 3),
        evidence: { category: top.category, amount: top.current, sharePercent: Number(share.toFixed(2)), monthTotal: cmp.currentTotal }
      })
    }
    // Second-largest category context, e.g. the PRD's "Education" example.
    if (topCategories.length > 1) {
      const second = topCategories[1]
      const secondShare = (second.current / cmp.currentTotal) * 100
      const chg = second.percentageChange
      if (chg !== null && Math.abs(chg) >= INCREASE_THRESHOLD) {
        out.push({
          id: `second-${second.category}`,
          kind: 'category-dominance',
          title: `${second.category} is your second-largest category`,
          body: `${second.category} is currently ${formatBdt(second.current)}, making it your second-largest category and ${formatPercent(Math.abs(chg))} ${chg > 0 ? 'higher' : 'lower'} than ${prevLabel} (${formatBdt(second.previous)}).`,
          tone: chg > 0 ? 'warning' : 'positive',
          priority: 58 + Math.min(15, Math.abs(chg) / 4),
          evidence: { category: second.category, amount: second.current, previous: second.previous, sharePercent: Number(secondShare.toFixed(2)), changePercent: Number(chg.toFixed(2)) }
        })
      }
    }
  }

  // ── Rule: category increase / decrease (PRD §24) ──────────────────────────
  if (cmp.hasPreviousData) {
    const risers = cmp.categories
      .filter((c) => c.percentageChange !== null && c.percentageChange >= INCREASE_THRESHOLD && c.current > 0)
      .sort((a, b) => b.difference - a.difference)
    if (risers.length > 0) {
      const r = risers[0]
      out.push({
        id: `increase-${r.category}`,
        kind: 'category-increase',
        title: `${r.category} is accelerating`,
        body: `${r.category} spending increased from ${formatBdt(r.previous)} in ${prevLabel} to ${formatBdt(r.current)} this month — up ${formatBdt(r.difference)} (${formatPercent(r.percentageChange!)}).`,
        tone: 'warning',
        priority: 66 + Math.min(18, (r.percentageChange as number) / 6),
        evidence: { category: r.category, current: r.current, previous: r.previous, difference: r.difference, changePercent: Number((r.percentageChange as number).toFixed(2)) }
      })
    }

    const fallers = cmp.categories
      .filter((c) => c.percentageChange !== null && c.percentageChange <= -DECREASE_THRESHOLD && c.previous > 0)
      .sort((a, b) => a.difference - b.difference)
    if (fallers.length > 0) {
      const d = fallers[0]
      out.push({
        id: `decrease-${d.category}`,
        kind: 'category-decrease',
        title: `${d.category} is down this month`,
        body: `${d.category} dropped by ${formatBdt(Math.abs(d.difference))} compared with ${prevLabel}, from ${formatBdt(d.previous)} to ${formatBdt(d.current)} (${formatPercent(d.percentageChange!)}).`,
        tone: 'positive',
        priority: 54,
        evidence: { category: d.category, current: d.current, previous: d.previous, difference: d.difference, changePercent: Number((d.percentageChange as number).toFixed(2)) }
      })
    }

    // New category this month
    const newCats = cmp.categories.filter((c) => c.isNew).sort((a, b) => b.current - a.current)
    if (newCats.length > 0) {
      const n = newCats[0]
      out.push({
        id: `new-${n.category}`,
        kind: 'new-category',
        title: `${n.category} is new this month`,
        body: `You spent ${formatBdt(n.current)} on ${n.category} this month, a category with no recorded spending in ${prevLabel}.`,
        tone: 'neutral',
        priority: 44,
        evidence: { category: n.category, amount: n.current, previous: 0 }
      })
    }

    // Overall month comparison
    if (cmp.percentageChange !== null) {
      const higher = cmp.percentageChange > 0
      out.push({
        id: 'month-comparison',
        kind: 'month-comparison',
        title: higher ? `Spending is up versus ${prevLabel}` : `Spending is down versus ${prevLabel}`,
        body: `You have spent ${formatBdt(cmp.currentTotal)} so far this month against ${formatBdt(cmp.previousTotal)} in all of ${prevLabel} — ${formatPercent(Math.abs(cmp.percentageChange))} ${higher ? 'higher' : 'lower'} (${formatBdt(Math.abs(cmp.difference))} difference).`,
        tone: higher ? 'warning' : 'positive',
        priority: 50 + Math.min(12, Math.abs(cmp.percentageChange) / 5),
        evidence: { current: cmp.currentTotal, previous: cmp.previousTotal, difference: cmp.difference, changePercent: Number(cmp.percentageChange.toFixed(2)) }
      })
    }
  }

  // ── Rule: largest single expense (PRD §24) ────────────────────────────────
  const top5 = largestExpenses(input.monthExpenses, 1)
  if (top5.length > 0) {
    const e = top5[0]
    const share = cmp.currentTotal > 0 ? (e.amount / cmp.currentTotal) * 100 : 0
    out.push({
      id: `largest-${e.id}`,
      kind: 'largest-expense',
      title: 'Your largest single expense',
      body: `Your largest single expense this month is ${formatBdt(e.amount)}${e.shop ? ` at ${e.shop}` : ''} (${e.category}, ${formatDayKey(e.date, { withYear: false })}), which is ${share.toFixed(0)}% of the month's total spending.`,
      tone: share >= 40 ? 'warning' : 'neutral',
      priority: 56,
      evidence: { amount: e.amount, shop: e.shop || null, category: e.category, date: e.date, sharePercent: Number(share.toFixed(2)) }
    })
  }

  // ── Rule: forecast risk / headroom (PRD §24) ──────────────────────────────
  if (f.salary > 0 && !f.isClosedMonth) {
    if (f.forecastDeficit > 0) {
      out.push({
        id: 'forecast-risk',
        kind: 'forecast-risk',
        title: 'Projected to finish over salary',
        body: `If current spending continues, you are projected to finish ${formatMonthKey(f.monthKey, true)} at ${formatBdt(f.forecastTotal)} against a salary of ${formatBdt(f.salary)} — ${formatBdt(f.forecastDeficit)} over, with ${f.remainingDays} day${f.remainingDays === 1 ? '' : 's'} still to go.`,
        tone: 'critical',
        priority: 96,
        evidence: { forecastTotal: f.forecastTotal, salary: f.salary, deficit: f.forecastDeficit, remainingDays: f.remainingDays, confidence: f.confidence }
      })
    } else {
      out.push({
        id: 'forecast-headroom',
        kind: 'forecast-headroom',
        title: 'On track to stay within salary',
        body: `Your projected month-end spending is ${formatBdt(f.forecastTotal)} against a salary of ${formatBdt(f.salary)}, leaving about ${formatBdt(f.forecastSurplus)} — based on ${formatBdt(f.currentSpend)} spent over ${f.elapsedDays} day${f.elapsedDays === 1 ? '' : 's'} plus ${formatBdt(f.forecastRemaining)} projected for the remaining ${f.remainingDays}.`,
        tone: 'positive',
        priority: 88,
        evidence: { forecastTotal: f.forecastTotal, salary: f.salary, surplus: f.forecastSurplus, currentSpend: f.currentSpend, forecastRemaining: f.forecastRemaining, confidence: f.confidence }
      })
    }

    // Daily pace insight
    if (f.elapsedDays > 0 && f.currentSpend > 0) {
      const dailyBudget = f.salary / f.daysInMonth
      const pace = f.currentDailyRate
      const pacePct = dailyBudget > 0 ? ((pace - dailyBudget) / dailyBudget) * 100 : null
      out.push({
        id: 'pace',
        kind: 'pace',
        title: pacePct !== null && pacePct > 0 ? 'Spending faster than your salary allows' : 'Daily pace is within budget',
        body:
          `You are averaging ${formatBdt(Math.round(pace))} per day over ${f.elapsedDays} day${f.elapsedDays === 1 ? '' : 's'}` +
          (pacePct !== null
            ? `, against a break-even pace of ${formatBdt(Math.round(dailyBudget))} per day — ${formatPercent(Math.abs(pacePct), 0)} ${pacePct > 0 ? 'above' : 'below'} it.`
            : '.'),
        tone: pacePct !== null && pacePct > 0 ? 'warning' : 'positive',
        priority: 62,
        evidence: { dailyRate: Math.round(pace), breakEvenDaily: Math.round(dailyBudget), pacePercent: pacePct === null ? null : Number(pacePct.toFixed(2)), elapsedDays: f.elapsedDays }
      })
    }
  }

  // ── Rule: savings capacity (PRD §24) ──────────────────────────────────────
  if (f.salary > 0 && f.forecastSurplus > 0) {
    out.push({
      id: 'savings-capacity',
      kind: 'savings-capacity',
      title: 'Money available for savings',
      body: `Your forecast suggests approximately ${formatBdt(f.forecastSurplus)} may remain available at month-end, which is what the app uses as your sustainable monthly savings capacity.`,
      tone: 'positive',
      priority: 74,
      evidence: { forecastSurplus: f.forecastSurplus, forecastTotal: f.forecastTotal, salary: f.salary }
    })
  }

  // ── Rule: pocket feasibility (PRD §29) ────────────────────────────────────
  if (input.savings && input.savings.pockets.length > 0) {
    const s = input.savings
    if (s.contributionGap > 0) {
      out.push({
        id: 'pocket-feasibility',
        kind: 'pocket-feasibility',
        title: 'Savings plan exceeds forecast capacity',
        body: `Your ${s.pockets.length} pocket${s.pockets.length === 1 ? '' : 's'} plan ${formatBdt(s.requestedContributions)} per month, but the forecast only frees ${formatBdt(s.forecastSurplus)} — a gap of ${formatBdt(s.contributionGap)}/month. Contributions are scaled to ${(s.scalingRatio * 100).toFixed(0)}% for the projected completion dates.`,
        tone: 'warning',
        priority: 84,
        evidence: { requested: s.requestedContributions, surplus: s.forecastSurplus, gap: s.contributionGap, scalingRatio: Number(s.scalingRatio.toFixed(4)) }
      })
    } else {
      const soonest = [...s.pockets]
        .filter((p) => p.completionMonth && !p.isComplete)
        .sort((a, b) => (a.completionMonth! < b.completionMonth! ? -1 : 1))[0]
      if (soonest) {
        out.push({
          id: 'pocket-feasibility',
          kind: 'pocket-feasibility',
          title: 'Savings plan fits your forecast',
          body: `Your planned contributions of ${formatBdt(s.requestedContributions)}/month fit inside the forecasted surplus of ${formatBdt(s.forecastSurplus)}. "${soonest.name}" is projected to complete in ${formatMonthKey(soonest.completionMonth!)} — ${soonest.monthsRequired} month${soonest.monthsRequired === 1 ? '' : 's'} away.`,
          tone: 'positive',
          priority: 72,
          evidence: { requested: s.requestedContributions, surplus: s.forecastSurplus, pocket: soonest.name, completionMonth: soonest.completionMonth, monthsRequired: soonest.monthsRequired }
        })
      }
    }
  }

  // ── Rule: recurring spending (PRD §24) ────────────────────────────────────
  const groups = input.recurringGroups ?? []
  if (groups.length > 0) {
    const g = groups[0]
    out.push({
      id: `recurring-${g.merchantKey}`,
      kind: 'recurring',
      title: `${g.displayName} looks recurring`,
      body: `${g.displayName} appears recurring at approximately ${formatBdt(g.typicalAmount)} per month (${g.category}), based on activity in ${g.months.map((m) => formatMonthKey(m, true)).join(', ')}.`,
      tone: 'neutral',
      priority: 60,
      evidence: { merchant: g.displayName, typicalAmount: g.typicalAmount, category: g.category, months: g.months.join(','), occurrences: g.occurrences }
    })
  }
  if (f.pendingObligations.length > 0 && !f.isClosedMonth) {
    const totalPending = f.pendingObligations.reduce((t, o) => t + o.expectedAmount, 0)
    out.push({
      id: 'recurring-pending',
      kind: 'recurring',
      title: 'Recurring bills still expected',
      body: `${f.pendingObligations.length} recurring ${f.pendingObligations.length === 1 ? 'bill' : 'bills'} totalling about ${formatBdt(totalPending)} (${f.pendingObligations.map((o) => o.displayName).join(', ')}) have not appeared yet this month and are included in the forecast.`,
      tone: 'warning',
      priority: 80,
      evidence: { count: f.pendingObligations.length, totalPending, merchants: f.pendingObligations.map((o) => o.displayName).join(', ') }
    })
  }

  // ── Rule: salary usage ────────────────────────────────────────────────────
  if (f.salary > 0 && f.currentSpend > 0) {
    const used = (f.currentSpend / f.salary) * 100
    const monthShare = (f.elapsedDays / f.daysInMonth) * 100
    if (Math.abs(used - monthShare) >= 10) {
      out.push({
        id: 'salary-usage',
        kind: 'salary-usage',
        title: used > monthShare ? 'Budget is being used faster than the month' : 'Budget use is behind the calendar',
        body: `You have used ${used.toFixed(0)}% of your ${formatBdt(f.salary)} salary (${formatBdt(f.currentSpend)}) while ${monthShare.toFixed(0)}% of the month has elapsed.`,
        tone: used > monthShare ? 'warning' : 'positive',
        priority: 64,
        evidence: { usedPercent: Number(used.toFixed(2)), monthElapsedPercent: Number(monthShare.toFixed(2)), currentSpend: f.currentSpend, salary: f.salary }
      })
    }
  }

  // ── Insufficient data fallback (PRD §41) ──────────────────────────────────
  if (out.length === 0) {
    out.push({
      id: 'insufficient-data',
      kind: 'insufficient-data',
      title: 'Not enough data yet',
      body:
        input.monthExpenses.length === 0
          ? `No expenses are recorded for ${formatMonthKey(f.monthKey)} yet. Add a few expenses to unlock forecasts and insights.`
          : `Only ${input.monthExpenses.length} expense${input.monthExpenses.length === 1 ? '' : 's'} totalling ${formatBdt(f.currentSpend)} is recorded for ${formatMonthKey(f.monthKey)}. Add a few more to unlock stronger insights.`,
      tone: 'neutral',
      priority: 10,
      evidence: { expenseCount: input.monthExpenses.length, currentSpend: f.currentSpend }
    })
  }

  const sorted = out.sort((a, b) => b.priority - a.priority)
  if (input.scenarioLabel) {
    return sorted.map((i) => ({ ...i, title: `${input.scenarioLabel}: ${i.title}` }))
  }
  return sorted
}
