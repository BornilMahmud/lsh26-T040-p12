/**
 * Dashboard / Overview — PRD §9, §16, §17, §18, §44.
 * Every number comes from the central ledger store (useLedger), which derives
 * it from the pure engines. Nothing is computed locally here.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Minus,
  PiggyBank,
  Receipt as ReceiptIcon,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  BarChart,
  Line,
  LineChart
} from 'recharts'
import { useLedger } from '@/hooks/useLedger'
import { formatBdt, formatBdtCompact, formatPercent } from '@/lib/money'
import { formatDayKey, formatMonthKey } from '@/lib/dates'
import { forecastSeries } from '@/analytics/forecastEngine'
import { Badge, EmptyState, Money, ProgressBar, SectionHeader, SkeletonCard, cx } from '@/components/ui'
import { MonthSelector } from '@/components/AppShell'
import type { Category } from '@/types'

/** Category palette — restrained, distinguishable, colour-blind aware. */
const CATEGORY_COLORS: Record<Category, string> = {
  Rent: '#4f46e5',
  Food: '#f59e0b',
  Groceries: '#10b981',
  Transport: '#06b6d4',
  Utilities: '#8b5cf6',
  Health: '#ef4444',
  Education: '#3b82f6',
  Mobile: '#14b8a6',
  Entertainment: '#ec4899',
  Clothing: '#f97316',
  Shopping: '#a855f7',
  Other: '#94a3b8'
}

function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  label?: string | number
  labelPrefix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-white/97 px-3 py-2 shadow-lg backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-[11px] font-medium text-ink-500">
          {labelPrefix}
          {label}
        </p>
      )}
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p, i) => (
          <p key={i} className="flex items-center gap-2 text-xs font-medium text-ink-900">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
            <span className="text-ink-500">{p.name}</span>
            <span className="tnum ml-auto">{formatBdt(p.value as number)}</span>
          </p>
        ))}
    </div>
  )
}

export default function Dashboard({ onAddExpense }: { onAddExpense: () => void }) {
  const {
    summary,
    comparison,
    forecast,
    insights,
    savings,
    trend,
    monthExpenses,
    expenses,
    selectedMonth,
    settings,
    loading,
    recurringGroups
  } = useLedger()

  const series = useMemo(() => forecastSeries(forecast, expenses), [forecast, expenses])

  const trendData = useMemo(
    () =>
      trend.slice(-6).map((t) => ({
        label: formatMonthKey(t.monthKey, true),
        total: t.total,
        isSelected: t.monthKey === selectedMonth
      })),
    [trend, selectedMonth]
  )

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2 h-72" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    )
  }

  const hasExpenses = expenses.length > 0
  const monthLabel = formatMonthKey(selectedMonth)
  const outlookPositive = forecast.forecastMoneyLeft >= 0

  if (!hasExpenses) {
    return (
      <div>
        <PageHeading title="Overview" subtitle="Your money, understood." />
        <div className="card mt-5">
          <EmptyState
            icon={<ReceiptIcon className="h-6 w-6" />}
            title="You haven’t recorded any expenses yet."
            message="Add your first expense — manually or by scanning a receipt — and your dashboard, forecast and insights will come alive instantly."
            action={
              <button onClick={onAddExpense} className="btn-accent">
                <ReceiptIcon className="h-4 w-4" aria-hidden="true" />
                Add your first expense
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Overview"
        subtitle="Your money, understood."
        action={<MonthSelector />}
      />

      {/* ── Top metric cards (PRD §9) ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Monthly salary"
          value={<Money value={summary.salary} className="text-2xl font-semibold" />}
          footer={
            settings.monthlySalary === 0 ? (
              <Link to="/settings" className="text-brand-600 hover:underline">
                Set your salary →
              </Link>
            ) : (
              `${monthLabel} · ${forecast.daysInMonth} days`
            )
          }
          Icon={Wallet}
          tone="neutral"
        />

        <MetricCard
          label="Spent so far"
          value={<Money value={summary.totalSpent} className="text-2xl font-semibold" animate />}
          footer={
            summary.spentPercentage !== null
              ? `${summary.spentPercentage.toFixed(1)}% of salary · ${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'}`
              : `${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'} recorded`
          }
          Icon={ReceiptIcon}
          tone="neutral"
          progress={summary.spentPercentage ?? undefined}
          progressMarker={(forecast.elapsedDays / forecast.daysInMonth) * 100}
        />

        <MetricCard
          label="Remaining now"
          value={
            <Money
              value={summary.remaining}
              className={cx(
                'text-2xl font-semibold',
                summary.remaining < 0 ? 'text-negative-600' : 'text-positive-600'
              )}
              animate
            />
          }
          footer={
            summary.remaining < 0
              ? `Over salary by ${formatBdt(Math.abs(summary.remaining))}`
              : `${forecast.remainingDays} day${forecast.remainingDays === 1 ? '' : 's'} left in ${formatMonthKey(selectedMonth, true)}`
          }
          Icon={summary.remaining < 0 ? TrendingDown : TrendingUp}
          tone={summary.remaining < 0 ? 'negative' : 'positive'}
        />

        <MetricCard
          label="Forecast month-end"
          value={<Money value={forecast.forecastTotal} className="text-2xl font-semibold" animate />}
          footer={
            <span className={outlookPositive ? 'text-positive-700' : 'text-negative-700'}>
              {forecast.isClosedMonth
                ? 'Month complete — actual total'
                : outlookPositive
                  ? `${formatBdt(forecast.forecastSurplus)} expected left`
                  : `${formatBdt(forecast.forecastDeficit)} expected short`}
            </span>
          }
          Icon={CalendarDays}
          tone={outlookPositive ? 'brand' : 'negative'}
          badge={
            <Badge
              tone={
                forecast.confidence === 'HIGH'
                  ? 'positive'
                  : forecast.confidence === 'MEDIUM'
                    ? 'warning'
                    : 'neutral'
              }
              title={forecast.confidenceReason}
            >
              {forecast.confidence} confidence
            </Badge>
          }
        />
      </div>

      {/* ── Month-end outlook banner ─────────────────────────────────────── */}
      <div
        className={cx(
          'card flex flex-wrap items-center gap-4 p-5',
          outlookPositive ? 'border-positive-500/25 bg-positive-50/40' : 'border-negative-500/25 bg-negative-50/40'
        )}
      >
        <div
          className={cx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            outlookPositive ? 'bg-positive-100 text-positive-700' : 'bg-negative-100 text-negative-700'
          )}
        >
          {outlookPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Month-end outlook</p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">
            {forecast.isClosedMonth ? (
              <>
                {monthLabel} finished at {formatBdt(forecast.forecastTotal)}
                {settings.monthlySalary > 0 && (
                  <> — {formatBdt(Math.abs(forecast.forecastMoneyLeft))} {outlookPositive ? 'left over' : 'over salary'}</>
                )}
              </>
            ) : outlookPositive ? (
              <>{formatBdt(forecast.forecastSurplus)} expected left</>
            ) : (
              <>{formatBdt(forecast.forecastDeficit)} expected short</>
            )}
          </p>
        </div>
        <Link to="/forecast" className="btn-secondary shrink-0">
          See the forecast
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* ── Forecast chart + category donut (PRD §44) ────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <SectionHeader
            title="Spending path"
            subtitle={
              forecast.isClosedMonth
                ? `Actual cumulative spending across ${monthLabel}`
                : `Actual to day ${forecast.elapsedDays}, then projected to month end`
            }
          />
          <div className="h-64" aria-label="Cumulative spending chart with forecast">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(forecast.daysInMonth / 8)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatBdtCompact(v)}
                />
                <Tooltip content={<ChartTooltip labelPrefix="Day " />} />
                {settings.monthlySalary > 0 && (
                  <Line
                    type="monotone"
                    dataKey="salary"
                    name="Salary"
                    stroke="#94a3b8"
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={false}
                  />
                )}
                {/* Projected drawn first so Actual sits on top */}
                <Area
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fill="none"
                  dot={false}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="#4f46e5"
                  strokeWidth={2.4}
                  fill="url(#actualFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-500">
            <LegendDot color="#4f46e5" label="Actual spending" />
            <LegendDot color="#f59e0b" label="Projected" dashed />
            {settings.monthlySalary > 0 && <LegendDot color="#94a3b8" label="Salary" dashed />}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="Where it went" subtitle={`${monthLabel} by category`} />
          {summary.categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">
              No expenses recorded for {monthLabel}.
            </p>
          ) : (
            <>
              <div className="h-44" aria-label="Category breakdown donut chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.categories}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {summary.categories.map((c) => (
                        <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 space-y-2.5">
                {summary.categories.slice(0, 6).map((c) => (
                  <li key={c.category}>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: CATEGORY_COLORS[c.category] }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-ink-700">{c.category}</span>
                      <span className="tnum ml-auto font-semibold text-ink-900">
                        {formatBdt(c.amount)}
                      </span>
                      <span className="tnum w-10 text-right text-ink-400">
                        {c.percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${c.percentage}%`,
                          background: CATEGORY_COLORS[c.category]
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {summary.categories.length > 6 && (
                <p className="mt-3 text-xs text-ink-400">
                  +{summary.categories.length - 6} more categories
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Largest expenses + month comparison ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <SectionHeader title="Largest expenses" subtitle={`Top ${Math.min(5, summary.largestExpenses.length)} in ${monthLabel}`} />
          {summary.largestExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">Nothing recorded this month.</p>
          ) : (
            <ol className="space-y-1">
              {summary.largestExpenses.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-50"
                >
                  <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-[11px] font-semibold text-ink-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {e.shop || e.category}
                      {e.recurring && (
                        <Repeat className="ml-1.5 inline h-3 w-3 text-brand-600" aria-label="Recurring" />
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {e.category} · {formatDayKey(e.date, { withYear: false })}
                    </p>
                  </div>
                  <Money value={e.amount} className="shrink-0 text-sm font-semibold text-ink-900" />
                </li>
              ))}
            </ol>
          )}
          <Link
            to="/expenses"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 py-2 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-50"
          >
            View all expenses
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        <div className="card p-5">
          <SectionHeader
            title="Versus last month"
            subtitle={`${monthLabel} compared with ${formatMonthKey(comparison.previousMonth)}`}
          />

          {!comparison.hasPreviousData ? (
            <div className="rounded-xl bg-ink-50 px-4 py-6 text-center">
              <p className="text-sm text-ink-500">
                No expenses recorded in {formatMonthKey(comparison.previousMonth)}, so there is
                nothing to compare against yet.
              </p>
              <p className="mt-1.5 text-xs text-ink-400">
                This month so far: {formatBdt(comparison.currentTotal)}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <Money value={comparison.currentTotal} className="text-2xl font-semibold text-ink-900" />
                <ChangeIndicator
                  percent={comparison.percentageChange}
                  difference={comparison.difference}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-500">
                {comparison.percentageChange === null
                  ? 'No comparable spending last month.'
                  : `Spending is ${formatPercent(Math.abs(comparison.percentageChange))} ${comparison.percentageChange > 0 ? 'higher' : 'lower'} than ${formatMonthKey(comparison.previousMonth, true)} (${formatBdt(comparison.previousTotal)}).`}
              </p>

              <div className="mt-4 h-24" aria-label="Monthly spending trend">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#7d8798' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>
                      {trendData.map((d, i) => (
                        <Cell key={i} fill={d.isSelected ? '#4f46e5' : '#d5d9e2'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-4 space-y-2 border-t border-[var(--border-soft)] pt-3.5">
                {comparison.categories.slice(0, 4).map((c) => (
                  <li key={c.category} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 truncate font-medium text-ink-700">{c.category}</span>
                    <span className="tnum text-ink-400">{formatBdt(c.previous)}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-ink-300" aria-hidden="true" />
                    <span className="tnum font-semibold text-ink-900">{formatBdt(c.current)}</span>
                    <span className="ml-auto shrink-0">
                      <ChangeIndicator percent={c.percentageChange} compact isNew={c.isNew} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── Insights preview + savings preview ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <SectionHeader
            title="Top insights"
            subtitle="Generated from your actual numbers"
            action={
              <Link to="/insights" className="btn-ghost btn-sm">
                All {insights.length}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          <ul className="space-y-2.5">
            {insights.slice(0, 3).map((i) => (
              <li key={i.id} className="rounded-xl border border-[var(--border-soft)] bg-ink-50/50 p-3.5">
                <p className="text-sm font-medium text-ink-900">{i.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{i.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <SectionHeader
            title="Savings pockets"
            subtitle="Turn intentions into dates."
            action={
              <Link to="/savings" className="btn-ghost btn-sm">
                Manage
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          {savings.pockets.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="h-5 w-5" />}
              title="Give your money a destination."
              message="Create a savings pocket and we’ll date it from your forecasted surplus."
              action={
                <Link to="/savings" className="btn-accent btn-sm">
                  Create savings pocket
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {savings.pockets.slice(0, 3).map((p) => (
                <li key={p.pocketId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                    <p
                      className={cx(
                        'shrink-0 text-xs font-medium',
                        p.completionMonth ? 'text-ink-600' : 'text-negative-600'
                      )}
                    >
                      {p.completionLabel}
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      percent={p.progressPercent}
                      tone={p.isComplete ? 'positive' : p.wasScaled ? 'warning' : 'brand'}
                      label={`${p.name} progress`}
                    />
                  </div>
                  <p className="tnum mt-1.5 text-xs text-ink-400">
                    {formatBdt(p.currentBalance)} of {formatBdt(p.target)} ·{' '}
                    {formatBdt(p.sustainableContribution)}/mo
                    {p.wasScaled && (
                      <span className="text-warn-700"> (scaled from {formatBdt(p.requestedContribution)})</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Recurring detection summary (Bonus 2) ────────────────────────── */}
      {recurringGroups.length > 0 && (
        <div className="card p-5">
          <SectionHeader
            title="Recurring expenses detected"
            subtitle="Found automatically from consecutive-month merchant patterns"
          />
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {recurringGroups.slice(0, 4).map((g) => (
              <li key={g.merchantKey} className="rounded-xl border border-[var(--border-soft)] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{g.displayName}</p>
                  <Badge tone="brand">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    Recurring
                  </Badge>
                </div>
                <p className="tnum mt-1 text-xs text-ink-500">
                  ~{formatBdt(g.typicalAmount)}/month · {g.category}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{g.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── local presentational helpers ───────────────────────────────────────── */

export function PageHeading({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="hidden lg:block">{action}</div>}
    </div>
  )
}

function MetricCard({
  label,
  value,
  footer,
  Icon,
  tone,
  progress,
  progressMarker,
  badge
}: {
  label: string
  value: React.ReactNode
  footer: React.ReactNode
  Icon: typeof Wallet
  tone: 'neutral' | 'positive' | 'negative' | 'brand'
  progress?: number
  progressMarker?: number
  badge?: React.ReactNode
}) {
  const iconTone = {
    neutral: 'bg-ink-100 text-ink-500',
    positive: 'bg-positive-50 text-positive-600',
    negative: 'bg-negative-50 text-negative-600',
    brand: 'bg-brand-50 text-brand-600'
  }[tone]

  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</p>
        <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconTone)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-2.5">{value}</div>
      {progress !== undefined && (
        <div className="mt-3">
          <ProgressBar
            percent={progress}
            tone={progress > 100 ? 'negative' : progress > 85 ? 'warning' : 'brand'}
            showMarker={progressMarker}
            label={label}
          />
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span>{footer}</span>
        {badge}
      </div>
    </div>
  )
}

function ChangeIndicator({
  percent,
  difference,
  compact,
  isNew
}: {
  percent: number | null
  difference?: number
  compact?: boolean
  isNew?: boolean
}) {
  if (isNew) {
    return <Badge tone="brand">New</Badge>
  }
  if (percent === null) {
    return (
      <Badge tone="neutral">
        <Minus className="h-3 w-3" aria-hidden="true" />
        n/a
      </Badge>
    )
  }
  const up = percent > 0.05
  const down = percent < -0.05
  const tone = up ? 'negative' : down ? 'positive' : 'neutral'
  const Arrow = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  return (
    <Badge tone={tone}>
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {formatPercent(Math.abs(percent))}
      {!compact && difference !== undefined && (
        <span className="tnum ml-0.5 font-normal opacity-70">({formatBdt(Math.abs(difference))})</span>
      )}
    </Badge>
  )
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4 rounded"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color
        }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

export { CATEGORY_COLORS, ChartTooltip }
