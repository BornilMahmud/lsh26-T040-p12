/**
 * Forecast page — PRD §19, §20, §21, §22, §74.
 * Shows the forecast output, its confidence, a per-category breakdown of how
 * the projection was built, and a "How this forecast works" panel that exposes
 * the exact formula and every input value (transparency for judges).
 */

import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Repeat,
  Sigma,
  TrendingDown,
  TrendingUp
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useLedger } from '@/hooks/useLedger'
import { forecastSeries, W_CURRENT, W_PREVIOUS } from '@/analytics/forecastEngine'
import { formatBdt, formatBdtCompact } from '@/lib/money'
import { daysInMonthKey, formatMonthKey } from '@/lib/dates'
import { Badge, Disclosure, Money, ProgressBar, SectionHeader, cx } from '@/components/ui'
import { MonthSelector } from '@/components/AppShell'
import { PageHeading, ChartTooltip, CATEGORY_COLORS } from './Dashboard'

export default function Forecast() {
  const { forecast, settings, selectedMonth, expenses } = useLedger()
  const f = forecast

  const categoryData = useMemo(
    () =>
      f.categories
        .filter((c) => c.forecastTotal > 0)
        .slice(0, 8)
        .map((c) => ({
          category: c.category,
          Spent: c.currentSpend,
          Projected: c.remainingForecast,
          total: c.forecastTotal,
          usedRecurringFloor: c.usedRecurringFloor
        })),
    [f.categories]
  )

  const positive = f.forecastMoneyLeft >= 0
  const daysInPrev = daysInMonthKey(f.previousMonthKey)

  return (
    <div className="space-y-6">
      <PageHeading
        title="Forecast"
        subtitle="See the rest of the month before it happens."
        action={<MonthSelector />}
      />

      {f.isClosedMonth && (
        <div className="flex gap-2.5 rounded-xl border border-brand-500/25 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-brand-700">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {formatMonthKey(selectedMonth)} is complete, so these are <strong>actual</strong> totals
            rather than a projection. Switch to the current month to see a live forecast.
          </span>
        </div>
      )}

      {/* ── Headline forecast ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Expected month-end spending
          </p>
          <Money value={f.forecastTotal} className="mt-2 block text-3xl font-semibold text-ink-900" animate />
          <p className="mt-2 text-xs text-ink-500">
            {formatBdt(f.currentSpend)} spent + {formatBdt(f.forecastRemaining)} projected
          </p>
          <div className="mt-3.5">
            <ProgressBar
              percent={settings.monthlySalary > 0 ? (f.forecastTotal / settings.monthlySalary) * 100 : 0}
              tone={positive ? 'brand' : 'negative'}
              label="Forecast versus salary"
            />
            <p className="mt-1.5 text-xs text-ink-400">
              {settings.monthlySalary > 0
                ? `${((f.forecastTotal / settings.monthlySalary) * 100).toFixed(0)}% of your ${formatBdt(settings.monthlySalary)} salary`
                : 'Set a salary in Settings to see this against your income.'}
            </p>
          </div>
        </div>

        <div
          className={cx(
            'card p-5',
            positive ? 'border-positive-500/25 bg-positive-50/40' : 'border-negative-500/25 bg-negative-50/40'
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            {positive ? 'Expected money left' : 'Expected shortfall'}
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            {positive ? (
              <TrendingUp className="h-6 w-6 shrink-0 text-positive-600" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-6 w-6 shrink-0 text-negative-600" aria-hidden="true" />
            )}
            <Money
              value={positive ? f.forecastSurplus : f.forecastDeficit}
              className={cx(
                'text-3xl font-semibold',
                positive ? 'text-positive-700' : 'text-negative-700'
              )}
              animate
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {settings.monthlySalary === 0
              ? 'No salary is set, so a surplus cannot be calculated.'
              : positive
                ? `Salary ${formatBdt(settings.monthlySalary)} − forecast ${formatBdt(f.forecastTotal)}. This is the amount your savings pockets are dated from.`
                : `Forecast ${formatBdt(f.forecastTotal)} exceeds your salary of ${formatBdt(settings.monthlySalary)}, so there is no surplus available for savings.`}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
              Forecast confidence
            </p>
            <Badge
              tone={f.confidence === 'HIGH' ? 'positive' : f.confidence === 'MEDIUM' ? 'warning' : 'neutral'}
            >
              {f.confidence}
            </Badge>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-600">{f.confidenceReason}</p>
          <dl className="mt-4 space-y-2 border-t border-[var(--border-soft)] pt-3.5 text-xs">
            <Row label="Days elapsed" value={`${f.elapsedDays} of ${f.daysInMonth}`} />
            <Row label="Days remaining" value={String(f.remainingDays)} />
            <Row label="Current daily pace" value={formatBdt(Math.round(f.currentDailyRate))} />
            <Row
              label={`${formatMonthKey(f.previousMonthKey, true)} daily pace`}
              value={formatBdt(Math.round(f.previousDailyRate))}
            />
          </dl>
        </div>
      </div>

      {/* ── Pending recurring obligations ────────────────────────────────── */}
      {f.pendingObligations.length > 0 && (
        <div className="card border-warn-500/25 bg-warn-50/40 p-5">
          <SectionHeader
            title="Recurring bills still expected this month"
            subtitle="Added to the forecast so a large unpaid bill doesn’t under-project your month"
          />
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {f.pendingObligations.map((o) => (
              <li
                key={o.merchantKey}
                className="flex items-start gap-3 rounded-xl border border-warn-500/25 bg-white p-3.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn-50">
                  <Repeat className="h-4 w-4 text-warn-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{o.displayName}</p>
                  <p className="tnum text-xs text-ink-500">
                    ~{formatBdt(o.expectedAmount)} · {o.category} · usually around day {o.typicalDay}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{o.reason}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="tnum mt-3 text-xs font-medium text-warn-700">
            Total added as a forecast floor: {formatBdt(f.recurringRemainingTotal)}
          </p>
        </div>
      )}

      {/* ── Category forecast chart ──────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader
          title="Category projection"
          subtitle="Actual spend so far versus what the model projects for the rest of the month"
        />
        {categoryData.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">
            No spending recorded for {formatMonthKey(selectedMonth)} yet.
          </p>
        ) : (
          <div className="h-72" aria-label="Category forecast bar chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 10, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatBdtCompact(v)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={7}
                />
                <Bar dataKey="Spent" stackId="a" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Projected" stackId="a" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Per-category maths table ─────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="p-5 pb-4">
          <SectionHeader
            title="How each category was projected"
            subtitle="Every input and output of the weighted model, per category"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Per-category forecast calculation</caption>
            <thead>
              <tr className="border-y border-[var(--border-soft)] bg-ink-50/60 text-left font-medium uppercase tracking-wider text-ink-500">
                <th scope="col" className="px-4 py-2.5">Category</th>
                <th scope="col" className="px-4 py-2.5 text-right">This month</th>
                <th scope="col" className="px-4 py-2.5 text-right">Last month</th>
                <th scope="col" className="px-4 py-2.5 text-right">Daily rate now</th>
                <th scope="col" className="px-4 py-2.5 text-right">Daily rate last</th>
                <th scope="col" className="px-4 py-2.5 text-right">Blended rate</th>
                <th scope="col" className="px-4 py-2.5 text-right">Paced rest</th>
                <th scope="col" className="px-4 py-2.5 text-right">Recurring floor</th>
                <th scope="col" className="px-4 py-2.5 text-right">Projected total</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {f.categories.map((c) => (
                <tr
                  key={c.category}
                  className="border-b border-[var(--border-soft)] last:border-0 hover:bg-ink-50/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: CATEGORY_COLORS[c.category] }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-ink-900">{c.category}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-700">{formatBdt(c.currentSpend)}</td>
                  <td className="px-4 py-2.5 text-right text-ink-500">{formatBdt(c.previousSpend)}</td>
                  <td className="px-4 py-2.5 text-right text-ink-500">
                    {formatBdt(Math.round(c.currentDailyRate))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-500">
                    {formatBdt(Math.round(c.previousDailyRate))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-700">
                    {formatBdt(Math.round(c.forecastDailyRate))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-500">
                    {formatBdt(c.pacedRemaining)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.recurringRemaining > 0 ? (
                      <span className={c.usedRecurringFloor ? 'font-medium text-warn-700' : 'text-ink-400'}>
                        {formatBdt(c.recurringRemaining)}
                        {c.usedRecurringFloor && ' ✓'}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ink-900">
                    {formatBdt(c.forecastTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="tnum border-t-2 border-ink-200 bg-ink-50/60 font-semibold text-ink-900">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatBdt(f.currentSpend)}</td>
                <td className="px-4 py-3 text-right">{formatBdt(f.previousSpend)}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right">{formatBdt(f.forecastRemaining)}</td>
                <td className="px-4 py-3 text-right">{formatBdt(f.recurringRemainingTotal)}</td>
                <td className="px-4 py-3 text-right">{formatBdt(f.forecastTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-ink-400">
          ✓ marks a category where the known recurring obligation exceeded the paced estimate and was
          therefore used as the floor.
        </p>
      </div>

      {/* ── Transparency panel (PRD §22) ─────────────────────────────────── */}
      <Disclosure
        label="How this forecast works"
        icon={<Sigma className="h-4 w-4 text-ink-400" aria-hidden="true" />}
        defaultOpen
      >
        <div className="space-y-4 text-xs leading-relaxed">
          <p>
            The forecast is a <strong>weighted-pace model with a recurring-obligation floor</strong>.
            It is computed per category and then summed, so a single unusual category cannot distort
            the whole month.
          </p>

          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
            <p className="mb-2 font-semibold text-ink-900">Step 1 — daily rates per category</p>
            <pre className="tnum overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-600">
{`currentDailyRate  = thisMonthSpend(category) / elapsedDays
                  = spend / ${f.elapsedDays} day${f.elapsedDays === 1 ? '' : 's'}

previousDailyRate = lastMonthSpend(category) / daysInLastMonth
                  = spend / ${daysInPrev} days`}
            </pre>
          </div>

          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
            <p className="mb-2 font-semibold text-ink-900">Step 2 — blend the two signals</p>
            <pre className="tnum overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-600">
{`forecastDailyRate = ${W_CURRENT} × currentDailyRate
                  + ${W_PREVIOUS} × previousDailyRate

pacedRemaining    = forecastDailyRate × remainingDays
                  = forecastDailyRate × ${f.remainingDays}`}
            </pre>
            <p className="mt-2 text-ink-500">
              Current pace carries more weight ({W_CURRENT * 100}%) because it reflects what you are
              doing now; last month ({W_PREVIOUS * 100}%) stabilises the estimate early in the month
              when a couple of days would otherwise dominate. If one of the two signals is missing
              (a brand-new category, or a category you haven’t touched yet this month), the weights
              are renormalised to the available signal so the projection is never artificially
              deflated.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
            <p className="mb-2 font-semibold text-ink-900">
              Step 3 — recurring obligations (avoiding under-forecasting)
            </p>
            <pre className="tnum overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-600">
{`remainingForecast(category) =
     max(pacedRemaining, recurringRemaining)   when a recurring bill is unpaid
     pacedRemaining                            otherwise`}
            </pre>
            <p className="mt-2 text-ink-500">
              A once-a-month bill such as rent contributes nothing to the daily pace until it is
              paid, so a pure pace model would badly under-forecast the month. Detected recurring
              bills that have not yet appeared are therefore treated as a <strong>floor</strong>.
              Taking the maximum rather than the sum prevents the same money from being counted
              twice.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
            <p className="mb-2 font-semibold text-ink-900">Step 4 — month totals</p>
            <pre className="tnum overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-600">
{`forecastMonthTotal = thisMonthSpend + Σ remainingForecast
                   = ${formatBdt(f.currentSpend)} + ${formatBdt(f.forecastRemaining)}
                   = ${formatBdt(f.forecastTotal)}

forecastMoneyLeft  = salary − forecastMonthTotal
                   = ${formatBdt(f.salary)} − ${formatBdt(f.forecastTotal)}
                   = ${formatBdt(f.forecastMoneyLeft)}`}
            </pre>
          </div>

          <div className="flex gap-2.5 rounded-xl bg-ink-100 px-3.5 py-3">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <p className="text-ink-600">
              This same <code className="rounded bg-white px-1 py-0.5">forecastMoneyLeft</code> value
              is what the Savings page uses as your monthly surplus, and what the What-if simulator
              recalculates — so a completion date can never disagree with the forecast shown here.
            </p>
          </div>

          {f.confidence !== 'HIGH' && (
            <div className="flex gap-2.5 rounded-xl bg-warn-50 px-3.5 py-3 text-warn-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{f.confidenceReason}</p>
            </div>
          )}
        </div>
      </Disclosure>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tnum font-medium text-ink-900">{value}</dd>
    </div>
  )
}
