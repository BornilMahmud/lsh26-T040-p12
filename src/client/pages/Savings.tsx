/**
 * Savings pockets — PRD §26–§32, §62, §75, Bonus 1.
 *
 * Each pocket shows: target, requested vs forecast-sustainable contribution,
 * a FORECAST-BASED completion date, the DPS projection at the user's rate, and
 * the reasoning behind the number. Editing a contribution recalculates
 * everything live with no page refresh (Bonus 1).
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BadgePercent,
  CalendarCheck,
  CheckCircle2,
  Info,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Sigma,
  Trash2,
  TrendingUp
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useLedger } from '@/hooks/useLedger'
import { useToast } from '@/hooks/useToast'
import type { Pocket } from '@/types'
import { formatBdt, formatBdtCompact, parseBdtToPaisa } from '@/lib/money'
import { formatMonthKey } from '@/lib/dates'
import type { PocketProjection } from '@/analytics/pocketCalculator'
import {
  Badge,
  ConfirmDialog,
  Disclosure,
  EmptyState,
  Modal,
  Money,
  ProgressBar,
  SectionHeader,
  cx
} from '@/components/ui'
import { PageHeading, ChartTooltip } from './Dashboard'

export default function Savings() {
  const { savings, pockets, settings, forecast, addPocket, updatePocket, deletePocket } = useLedger()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Pocket | null>(null)
  const [deleting, setDeleting] = useState<Pocket | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [dpsDetail, setDpsDetail] = useState<PocketProjection | null>(null)

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deletePocket(deleting.id)
      toast.success('Pocket deleted')
      setDeleting(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="Savings"
        subtitle="Turn intentions into dates."
        action={
          <button onClick={() => setFormOpen(true)} className="btn-accent">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create pocket
          </button>
        }
      />

      {/* ── Capacity summary (PRD §29, §75) ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CapacityCard
          label="Forecast monthly surplus"
          value={formatBdt(savings.forecastSurplus)}
          detail={
            settings.monthlySalary === 0
              ? 'Set a salary to compute this'
              : `Salary ${formatBdt(settings.monthlySalary)} − forecast ${formatBdt(forecast.forecastTotal)}`
          }
          tone={savings.forecastSurplus > 0 ? 'positive' : 'negative'}
          Icon={TrendingUp}
        />
        <CapacityCard
          label="Planned contributions"
          value={formatBdt(savings.requestedContributions)}
          detail={`Across ${savings.pockets.length} pocket${savings.pockets.length === 1 ? '' : 's'}`}
          tone="neutral"
          Icon={PiggyBank}
        />
        <CapacityCard
          label="Sustainable total"
          value={formatBdt(savings.sustainableContributions)}
          detail={
            savings.isPlanSustainable
              ? 'Your plan fits inside the forecast'
              : `Scaled to ${(savings.scalingRatio * 100).toFixed(0)}% of plan`
          }
          tone={savings.isPlanSustainable ? 'positive' : 'warning'}
          Icon={CalendarCheck}
        />
        <CapacityCard
          label="DPS comparison rate"
          value={`${settings.dpsAnnualRatePercent.toFixed(2)}%`}
          detail="Illustrative annual rate — not a bank guarantee"
          tone="brand"
          Icon={BadgePercent}
        />
      </div>

      {/* ── Over-allocation warning (PRD §28, §29) ──────────────────────── */}
      {savings.contributionGap > 0 && (
        <div
          role="status"
          className="card flex flex-wrap items-start gap-3.5 border-warn-500/30 bg-warn-50/50 p-5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-100">
            <AlertTriangle className="h-5 w-5 text-warn-700" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">
              Your current contribution plan exceeds the forecasted monthly surplus.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              You have planned <strong className="tnum">{formatBdt(savings.requestedContributions)}</strong>{' '}
              per month, but the forecast only frees{' '}
              <strong className="tnum">{formatBdt(savings.forecastSurplus)}</strong> — a gap of{' '}
              <strong className="tnum">{formatBdt(savings.contributionGap)}/month</strong>. Rather than
              show you dates you cannot hit, each pocket below is funded at{' '}
              <strong>{(savings.scalingRatio * 100).toFixed(0)}%</strong> of its requested
              contribution (proportional allocation), and the completion dates reflect that
              sustainable rate.
            </p>
            <p className="mt-2 text-xs text-ink-500">
              To close the gap: reduce a contribution, or use the{' '}
              <Link to="/what-if" className="font-medium text-brand-700 hover:underline">
                What-if simulator
              </Link>{' '}
              to see which spending cut would make the plan affordable.
            </p>
          </div>
        </div>
      )}

      {/* ── Pockets ─────────────────────────────────────────────────────── */}
      {savings.pockets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PiggyBank className="h-6 w-6" />}
            title="Give your money a destination."
            message="Create a savings pocket and we’ll date it from your real forecasted surplus — not from wishful division."
            action={
              <button onClick={() => setFormOpen(true)} className="btn-accent">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create savings pocket
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {savings.pockets.map((p) => {
            const pocket = pockets.find((x) => x.id === p.pocketId)!
            return (
              <PocketCard
                key={p.pocketId}
                projection={p}
                pocket={pocket}
                dpsRate={settings.dpsAnnualRatePercent}
                onEdit={() => setEditing(pocket)}
                onDelete={() => setDeleting(pocket)}
                onShowDps={() => setDpsDetail(p)}
                onQuickContribution={async (value) => {
                  try {
                    await updatePocket(pocket.id, { monthlyContribution: value })
                    toast.success('Contribution updated', 'Completion dates recalculated.')
                  } catch (err) {
                    toast.error((err as Error).message)
                  }
                }}
              />
            )
          })}
        </div>
      )}

      {/* ── Methodology (PRD §28, §30, §32) ─────────────────────────────── */}
      <Disclosure
        label="How completion dates are calculated"
        icon={<Sigma className="h-4 w-4 text-ink-400" aria-hidden="true" />}
      >
        <div className="space-y-3.5 text-xs leading-relaxed">
          <div className="flex gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-brand-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              A completion date is <strong>never</strong> simply{' '}
              <code className="rounded bg-white px-1 py-0.5">target ÷ contribution</code>. The
              forecast decides how much money actually exists to save each month, and the pocket can
              only fill out of that.
            </p>
          </div>

          <pre className="overflow-x-auto rounded-xl border border-[var(--border-soft)] bg-white p-3.5 text-[11px] text-ink-600">
{`1. forecastSurplus = salary − forecastMonthTotal
                   = ${formatBdt(settings.monthlySalary)} − ${formatBdt(forecast.forecastTotal)}
                   = ${formatBdt(savings.forecastSurplus)}

2. requestedContributions = Σ pocket.monthlyContribution
                          = ${formatBdt(savings.requestedContributions)}

3. if requested ≤ surplus → every pocket saves at its requested rate
   else                   → sustainable(p) = requested(p) × surplus / requested
                            (proportional allocation; ratio now ${savings.scalingRatio.toFixed(3)})

4. simulate month by month:
        balance = currentBalance
        repeat:  balance += sustainableContribution
        until    balance ≥ target
   → monthsRequired, completionMonth

5. if sustainableContribution = 0 → "Not currently reachable"
   (no fabricated date is ever shown)`}
          </pre>

          <p>
            Because step 1 reads the same forecast the Forecast page displays, a savings date can
            never contradict the forecast. Change an expense, your salary or a contribution and every
            date here recalculates immediately.
          </p>
        </div>
      </Disclosure>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <PocketForm
        open={formOpen || editing !== null}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={async (draft) => {
          if (editing) {
            await updatePocket(editing.id, draft)
            toast.success('Pocket updated', 'Completion date recalculated from your forecast.')
          } else {
            await addPocket(draft)
            toast.success('Pocket created', 'Dated from your forecasted monthly surplus.')
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this savings pocket?"
        message={
          deleting ? (
            <p>
              <strong>{deleting.name}</strong> ({formatBdt(deleting.target)} target) will be removed.
              Any remaining pockets will be re-allocated across your forecasted surplus.
            </p>
          ) : null
        }
        confirmLabel="Delete pocket"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <DpsDetailModal
        projection={dpsDetail}
        rate={settings.dpsAnnualRatePercent}
        onClose={() => setDpsDetail(null)}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */

function CapacityCard({
  label,
  value,
  detail,
  tone,
  Icon
}: {
  label: string
  value: string
  detail: string
  tone: 'positive' | 'negative' | 'warning' | 'neutral' | 'brand'
  Icon: typeof PiggyBank
}) {
  const iconTone = {
    positive: 'bg-positive-50 text-positive-600',
    negative: 'bg-negative-50 text-negative-600',
    warning: 'bg-warn-50 text-warn-600',
    neutral: 'bg-ink-100 text-ink-500',
    brand: 'bg-brand-50 text-brand-600'
  }[tone]
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</p>
        <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconTone)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="tnum mt-2 text-2xl font-semibold text-ink-900">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{detail}</p>
    </div>
  )
}

function PocketCard({
  projection: p,
  pocket,
  dpsRate,
  onEdit,
  onDelete,
  onShowDps,
  onQuickContribution
}: {
  projection: PocketProjection
  pocket: Pocket
  dpsRate: number
  onEdit: () => void
  onDelete: () => void
  onShowDps: () => void
  onQuickContribution: (value: number) => Promise<void>
}) {
  const [sliderValue, setSliderValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Bonus 1: a live slider that recalculates on release.
  const displayContribution = sliderValue ?? p.requestedContribution
  const sliderMax = Math.max(p.requestedContribution * 2, 2000000) // at least ৳20,000

  const commit = async (value: number) => {
    setSaving(true)
    try {
      await onQuickContribution(value)
      setSliderValue(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">{p.name}</h3>
            {p.isComplete && (
              <Badge tone="positive">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Complete
              </Badge>
            )}
            {p.wasScaled && !p.isComplete && <Badge tone="warning">Scaled to forecast</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-500">{p.item || 'No details added'}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            aria-label={`Edit ${p.name}`}
            title="Edit pocket"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-negative-50 hover:text-negative-600"
            aria-label={`Delete ${p.name}`}
            title="Delete pocket"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="tnum font-medium text-ink-700">
            {formatBdt(p.currentBalance)} <span className="text-ink-400">of {formatBdt(p.target)}</span>
          </span>
          <span className="tnum text-ink-400">{p.progressPercent.toFixed(0)}%</span>
        </div>
        <div className="mt-1.5">
          <ProgressBar
            percent={p.progressPercent}
            tone={p.isComplete ? 'positive' : p.wasScaled ? 'warning' : 'brand'}
            label={`${p.name} progress`}
          />
        </div>
      </div>

      {/* Key figures */}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-ink-50 px-3 py-2.5">
          <dt className="text-ink-500">Target</dt>
          <dd className="tnum mt-0.5 font-semibold text-ink-900">{formatBdt(p.target)}</dd>
        </div>
        <div className="rounded-xl bg-ink-50 px-3 py-2.5">
          <dt className="text-ink-500">Monthly contribution</dt>
          <dd className="tnum mt-0.5 font-semibold text-ink-900">
            {formatBdt(p.sustainableContribution)}
            {p.wasScaled && (
              <span className="ml-1 font-normal text-warn-700 line-through decoration-warn-500/50">
                {formatBdt(p.requestedContribution)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Forecast-based completion (the headline) */}
      <div
        className={cx(
          'mt-3 rounded-xl border px-3.5 py-3',
          p.completionMonth
            ? 'border-brand-500/25 bg-brand-50/60'
            : 'border-negative-500/25 bg-negative-50/50'
        )}
      >
        <div className="flex items-center gap-2">
          <CalendarCheck
            className={cx('h-4 w-4 shrink-0', p.completionMonth ? 'text-brand-600' : 'text-negative-600')}
            aria-hidden="true"
          />
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Forecast-based completion
          </p>
        </div>
        <p
          className={cx(
            'mt-1 text-lg font-semibold',
            p.completionMonth ? 'text-ink-900' : 'text-negative-700'
          )}
        >
          {p.isComplete
            ? 'Target reached'
            : p.completionMonth
              ? `Estimated: ${formatMonthKey(p.completionMonth)}`
              : 'Not currently reachable with this contribution.'}
        </p>
        {p.monthsRequired !== null && p.monthsRequired > 0 && (
          <p className="tnum mt-0.5 text-xs text-ink-500">
            {p.monthsRequired} month{p.monthsRequired === 1 ? '' : 's'} at{' '}
            {formatBdt(p.sustainableContribution)}/month · {formatBdt(p.remainingToTarget)} still to
            save
          </p>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{p.reason}</p>
      </div>

      {/* DPS comparison */}
      <div className="mt-3 rounded-xl border border-[var(--border-soft)] px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            DPS comparison @ {dpsRate.toFixed(2)}%
          </p>
          <button onClick={onShowDps} className="btn-ghost btn-sm text-[11px]">
            Full schedule
          </button>
        </div>
        {p.dps && p.dps.months > 0 ? (
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-ink-400">Projected value</dt>
              <dd className="tnum mt-0.5 font-semibold text-ink-900">{formatBdt(p.dpsFinalValue)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Interest earned</dt>
              <dd className="tnum mt-0.5 font-semibold text-positive-700">
                {formatBdt(p.dpsInterest)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-400">Over</dt>
              <dd className="tnum mt-0.5 font-semibold text-ink-900">
                {p.dps.months} mo
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs text-ink-400">
            No contribution is being allocated, so there is nothing to project.
          </p>
        )}
        {p.dpsMonthsRequired !== null &&
          p.monthsRequired !== null &&
          p.dpsMonthsRequired > 0 &&
          p.dpsMonthsRequired < p.monthsRequired && (
            <p className="mt-2 rounded-lg bg-positive-50 px-2.5 py-1.5 text-[11px] text-positive-700">
              With DPS interest the target would be reached in {p.dpsMonthsRequired} months —{' '}
              {p.monthsRequired - p.dpsMonthsRequired} month
              {p.monthsRequired - p.dpsMonthsRequired === 1 ? '' : 's'} sooner than saving in plain
              cash.
            </p>
          )}
      </div>

      {/* Bonus 1: live contribution control */}
      <div className="mt-4 border-t border-[var(--border-soft)] pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`contrib-${p.pocketId}`} className="text-xs font-medium text-ink-600">
            Adjust monthly contribution
          </label>
          <span className="tnum text-xs font-semibold text-ink-900">
            {formatBdt(displayContribution)}
            {saving && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" aria-hidden="true" />}
          </span>
        </div>
        <input
          id={`contrib-${p.pocketId}`}
          type="range"
          min={0}
          max={sliderMax}
          step={50000}
          value={displayContribution}
          onChange={(e) => setSliderValue(Number(e.target.value))}
          onMouseUp={(e) => void commit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => void commit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              void commit(Number((e.target as HTMLInputElement).value))
            }
          }}
          className="mt-2 w-full accent-brand-600"
          aria-valuetext={formatBdt(displayContribution)}
        />
        <p className="mt-1.5 text-[11px] text-ink-400">
          Release the slider to save — the completion date and DPS projection update immediately.
        </p>
      </div>
    </article>
  )
}

/* ── Pocket create/edit form (PRD §27) ─────────────────────────────────── */
function PocketForm({
  open,
  editing,
  onClose,
  onSubmit
}: {
  open: boolean
  editing: Pocket | null
  onClose: () => void
  onSubmit: (draft: {
    name: string
    item: string
    target: number
    monthlyContribution: number
    currentBalance: number
  }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [item, setItem] = useState('')
  const [targetText, setTargetText] = useState('')
  const [contribText, setContribText] = useState('')
  const [balanceText, setBalanceText] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  // Sync form state when the dialog opens.
  const [syncedFor, setSyncedFor] = useState<string | null>(null)
  const key = open ? (editing?.id ?? 'new') : null
  if (key !== syncedFor) {
    setSyncedFor(key)
    setName(editing?.name ?? '')
    setItem(editing?.item ?? '')
    setTargetText(editing ? String(editing.target / 100) : '')
    setContribText(editing ? String(editing.monthlyContribution / 100) : '')
    setBalanceText(editing ? String(editing.currentBalance / 100) : '')
    setTouched({})
  }

  const target = parseBdtToPaisa(targetText)
  const contribution = parseBdtToPaisa(contribText)
  const balance = balanceText.trim() === '' ? 0 : parseBdtToPaisa(balanceText)

  const errors: Record<string, string> = {}
  if (!name.trim()) errors.name = 'Give the pocket a name.'
  if (!item.trim()) errors.item = 'Describe what you are saving for.'
  if (target === null || target <= 0) errors.target = 'Target must be greater than zero.'
  if (contribution === null) errors.contribution = 'Enter a monthly contribution (0 is allowed).'
  if (balance === null) errors.balance = 'Enter a valid amount already saved.'
  else if (target !== null && balance > target) errors.balance = 'Already-saved amount cannot exceed the target.'

  const valid = Object.keys(errors).length === 0

  const submit = async () => {
    if (!valid || target === null || contribution === null || balance === null) return
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(),
        item: item.trim(),
        target,
        monthlyContribution: contribution,
        currentBalance: balance
      })
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit savings pocket' : 'Create savings pocket'}
      description="The completion date will be derived from your forecasted monthly surplus."
    >
      <div className="space-y-4">
        <Field
          id="p-name"
          label="Pocket name"
          required
          error={touched.name ? errors.name : undefined}
          onBlur={() => setTouched((p) => ({ ...p, name: true }))}
        >
          <input
            id="p-name"
            className={cx('input', touched.name && errors.name && 'input-error')}
            placeholder="e.g. Laptop"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field
          id="p-item"
          label="Item / details"
          required
          error={touched.item ? errors.item : undefined}
          onBlur={() => setTouched((p) => ({ ...p, item: true }))}
        >
          <input
            id="p-item"
            className={cx('input', touched.item && errors.item && 'input-error')}
            placeholder="e.g. MacBook Air M4 (13-inch)"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="p-target"
            label="Target amount"
            required
            error={touched.target ? errors.target : undefined}
            onBlur={() => setTouched((p) => ({ ...p, target: true }))}
            hint={target !== null && target > 0 ? formatBdt(target) : undefined}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                ৳
              </span>
              <input
                id="p-target"
                className={cx('input pl-8 tnum', touched.target && errors.target && 'input-error')}
                inputMode="decimal"
                placeholder="145,000"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
              />
            </div>
          </Field>

          <Field
            id="p-contrib"
            label="Monthly contribution"
            required
            error={touched.contribution ? errors.contribution : undefined}
            onBlur={() => setTouched((p) => ({ ...p, contribution: true }))}
            hint={contribution !== null ? formatBdt(contribution) : undefined}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                ৳
              </span>
              <input
                id="p-contrib"
                className={cx('input pl-8 tnum', touched.contribution && errors.contribution && 'input-error')}
                inputMode="decimal"
                placeholder="12,000"
                value={contribText}
                onChange={(e) => setContribText(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <Field
          id="p-balance"
          label="Already saved (optional)"
          error={touched.balance ? errors.balance : undefined}
          onBlur={() => setTouched((p) => ({ ...p, balance: true }))}
          hint="Counts towards the target and earns DPS interest in the projection."
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
              ৳
            </span>
            <input
              id="p-balance"
              className={cx('input pl-8 tnum', touched.balance && errors.balance && 'input-error')}
              inputMode="decimal"
              placeholder="0"
              value={balanceText}
              onChange={(e) => setBalanceText(e.target.value)}
            />
          </div>
        </Field>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn-accent" onClick={submit} disabled={!valid || busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : editing ? (
            'Save changes'
          ) : (
            'Create pocket'
          )}
        </button>
      </div>
    </Modal>
  )
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  onBlur,
  children
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  onBlur?: () => void
  children: React.ReactNode
}) {
  return (
    <div onBlur={onBlur}>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-negative-600">*</span>}
      </label>
      {children}
      {(error || hint) && (
        <p className={cx('mt-1.5 text-xs', error ? 'text-negative-600' : 'text-ink-400')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

/* ── DPS schedule modal (PRD §32) ──────────────────────────────────────── */
function DpsDetailModal({
  projection,
  rate,
  onClose
}: {
  projection: PocketProjection | null
  rate: number
  onClose: () => void
}) {
  const chartData = useMemo(
    () =>
      projection?.dps?.schedule.map((r) => ({
        month: r.month,
        Deposits: r.cumulativeDeposits + projection.currentBalance,
        'With interest': r.closingBalance
      })) ?? [],
    [projection]
  )

  if (!projection) return null
  const dps = projection.dps

  return (
    <Modal
      open={projection !== null}
      onClose={onClose}
      title={`How DPS is calculated — ${projection.name}`}
      description={`DPS comparison rate: ${rate.toFixed(2)}% annually`}
      size="lg"
    >
      <div className="flex gap-2.5 rounded-xl bg-warn-50 px-3.5 py-3 text-xs leading-relaxed text-warn-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          This is a <strong>projection for comparison</strong> at the rate you configured
          ({rate.toFixed(2)}% annual), <strong>not a guaranteed bank return</strong>.
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
        <p className="text-xs font-semibold text-ink-900">The rule, applied every month</p>
        <pre className="tnum mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-600">
{`1. Add deposit          balanceAfterDeposit = balance + deposit
2. Compute interest     interest = balanceAfterDeposit × ${rate} ÷ 12 ÷ 100
3. Round HALF UP        to the nearest paisa
4. Add to balance       balance = balanceAfterDeposit + interest
5. Next month earns interest on the new balance (compounding)

Monthly rate = ${rate} ÷ 12 = ${(rate / 12).toFixed(4)}% per month`}
        </pre>
      </div>

      {dps && dps.months > 0 ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Monthly deposit" value={formatBdt(dps.monthlyDeposit)} />
            <Stat label="Total deposits" value={formatBdt(dps.totalDeposits)} />
            <Stat label="Interest earned" value={formatBdt(dps.totalInterest)} tone="positive" />
            <Stat label="Projected value" value={formatBdt(dps.finalValue)} tone="brand" />
          </dl>

          <div className="mt-5 h-52" aria-label="DPS growth chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#7d8798' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatBdtCompact(v)}
                />
                <Tooltip content={<ChartTooltip labelPrefix="Month " />} />
                <Area
                  type="monotone"
                  dataKey="With interest"
                  stroke="#4f46e5"
                  fill="#c7d2fe"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="Deposits"
                  stroke="#94a3b8"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-soft)]">
            <table className="w-full text-xs">
              <caption className="sr-only">Month-by-month DPS schedule</caption>
              <thead className="sticky top-0 bg-ink-50">
                <tr className="text-left font-medium uppercase tracking-wider text-ink-500">
                  <th scope="col" className="px-3 py-2">Mo</th>
                  <th scope="col" className="px-3 py-2 text-right">Opening</th>
                  <th scope="col" className="px-3 py-2 text-right">Deposit</th>
                  <th scope="col" className="px-3 py-2 text-right">After deposit</th>
                  <th scope="col" className="px-3 py-2 text-right">Interest</th>
                  <th scope="col" className="px-3 py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {dps.schedule.map((r) => (
                  <tr key={r.month} className="border-t border-[var(--border-soft)]">
                    <td className="px-3 py-1.5 text-ink-500">{r.month}</td>
                    <td className="px-3 py-1.5 text-right text-ink-500">{formatBdt(r.openingBalance)}</td>
                    <td className="px-3 py-1.5 text-right text-ink-600">{formatBdt(r.deposit)}</td>
                    <td className="px-3 py-1.5 text-right text-ink-600">
                      {formatBdt(r.balanceAfterDeposit)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-positive-700">
                      {formatBdt(r.interest)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-ink-900">
                      {formatBdt(r.closingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Interest is computed on the balance <em>after</em> that month’s deposit and rounded
            half-up to the paisa, exactly as the supplied DPS rule specifies. All values are held as
            integer paisa, so no floating-point drift accumulates over the schedule.
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
          No contribution is currently allocated to this pocket, so there is no DPS schedule to
          project. Increase the contribution or free up forecast surplus to see one.
        </p>
      )}
    </Modal>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral'
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'brand'
}) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2.5">
      <dt className="text-[11px] text-ink-500">{label}</dt>
      <dd
        className={cx(
          'tnum mt-0.5 text-sm font-semibold',
          tone === 'positive' ? 'text-positive-700' : tone === 'brand' ? 'text-brand-700' : 'text-ink-900'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
