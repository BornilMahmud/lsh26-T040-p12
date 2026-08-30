/**
 * Settings — PRD §38, plus the developer-only test-data importer (§50–§53)
 * and demo tools (§54). The importer is deliberately kept out of the main
 * navigation and behind a disclosure labelled "Developer & judging tools".
 */

import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgePercent,
  CheckCircle2,
  Database,
  FileJson,
  Info,
  Loader2,
  LogOut,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Wallet
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLedger } from '@/hooks/useLedger'
import { useToast } from '@/hooks/useToast'
import { formatBdt, parseBdtToPaisa } from '@/lib/money'
import { formatMonthKey } from '@/lib/dates'
import { parseP12Json, type NormalizedTestCase, type ValidationIssue } from '@/data/testCases'
import {
  Badge,
  ConfirmDialog,
  Disclosure,
  SectionHeader,
  cx
} from '@/components/ui'
import { PageHeading } from './Dashboard'

export default function Settings() {
  const { user, logout, isFirebaseConfigured } = useAuth()
  const {
    settings,
    saveSettings,
    expenses,
    pockets,
    repository,
    loadDemoData,
    clearAllData,
    importDataset
  } = useLedger()
  const toast = useToast()

  const [salaryText, setSalaryText] = useState(String(settings.monthlySalary / 100))
  const [rateText, setRateText] = useState(settings.dpsAnnualRatePercent.toFixed(2))
  const [savingProfile, setSavingProfile] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  const salary = parseBdtToPaisa(salaryText)
  const rate = Number(rateText)
  const salaryValid = salary !== null && salary >= 0
  const rateValid = Number.isFinite(rate) && rate >= 0 && rate <= 100
  const dirty =
    salary !== settings.monthlySalary || Math.abs(rate - settings.dpsAnnualRatePercent) > 1e-9

  const save = async () => {
    if (!salaryValid || !rateValid || salary === null) return
    setSavingProfile(true)
    try {
      await saveSettings({ monthlySalary: salary, dpsAnnualRatePercent: rate })
      toast.success('Settings saved', 'Your forecast and savings dates have been recalculated.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingProfile(false)
    }
  }

  const runDemo = async () => {
    setDemoBusy(true)
    try {
      await loadDemoData()
      toast.success('Demo ledger loaded', 'Three months of data with live forecasts and pockets.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDemoBusy(false)
    }
  }

  const doClear = async () => {
    setClearBusy(true)
    try {
      await clearAllData()
      toast.success('All expenses and pockets cleared')
      setConfirmClear(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setClearBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading title="Settings" subtitle="Salary, DPS rate, profile and data tools." />

      {/* ── Money settings ──────────────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Money" subtitle="These drive every forecast and savings date." />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-salary" className="label">
              Monthly salary
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                ৳
              </span>
              <input
                id="s-salary"
                className={cx('input pl-8 tnum font-semibold', !salaryValid && 'input-error')}
                inputMode="decimal"
                value={salaryText}
                onChange={(e) => setSalaryText(e.target.value)}
              />
            </div>
            <p className={cx('mt-1.5 text-xs', salaryValid ? 'text-ink-400' : 'text-negative-600')}>
              {salaryValid
                ? `Currently ${formatBdt(salary)} per month.`
                : 'Enter a valid, non-negative amount.'}
            </p>
          </div>

          <div>
            <label htmlFor="s-rate" className="label">
              DPS comparison rate (annual)
            </label>
            <div className="relative">
              <input
                id="s-rate"
                className={cx('input pr-8 tnum font-semibold', !rateValid && 'input-error')}
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                %
              </span>
            </div>
            <p className={cx('mt-1.5 text-xs', rateValid ? 'text-ink-400' : 'text-negative-600')}>
              {rateValid
                ? `Monthly rate ${(rate / 12).toFixed(4)}% · used for all DPS projections.`
                : 'Enter a rate between 0 and 100.'}
            </p>
          </div>

          <div>
            <label htmlFor="s-currency" className="label">
              Default currency
            </label>
            <select id="s-currency" className="input" value="BDT" disabled>
              <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
            </select>
            <p className="mt-1.5 text-xs text-ink-400">
              Single-currency by design: all amounts are stored as integer paisa, so no conversion
              rounding can occur.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2.5 rounded-xl bg-warn-50 px-3.5 py-3 text-xs leading-relaxed text-warn-700">
          <BadgePercent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            The DPS rate is an <strong>illustrative comparison rate</strong> used for projections
            only — it is not a guaranteed bank return. The app always displays the exact rate in use.
          </span>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="btn-accent" onClick={save} disabled={!dirty || !salaryValid || !rateValid || savingProfile}>
            {savingProfile ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Profile" />
        <div className="flex flex-wrap items-center gap-4">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="h-14 w-14 rounded-2xl object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100">
              <User className="h-6 w-6 text-ink-400" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{user?.displayName}</p>
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone={user?.isDemo ? 'warning' : 'positive'}>
                {user?.isDemo ? 'Demo session (local storage)' : 'Google account'}
              </Badge>
              <Badge tone={repository?.kind === 'firestore' ? 'brand' : 'neutral'}>
                {repository?.kind === 'firestore' ? 'Cloud Firestore' : 'Local storage'}
              </Badge>
            </div>
          </div>
          <button onClick={() => void logout()} className="btn-secondary">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>

        {user?.isDemo && (
          <p className="mt-4 flex gap-2.5 rounded-xl bg-ink-50 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            <span>
              You’re in Demo Mode. Data is stored only in this browser, but it runs through exactly
              the same calculation engines and repository interface as a signed-in account — the
              dashboard, forecast, insights, pockets and what-if controls are all fully live.
            </span>
          </p>
        )}
      </div>

      {/* ── Data summary ────────────────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Your data" />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DataStat label="Expenses" value={String(expenses.length)} Icon={Wallet} />
          <DataStat label="Savings pockets" value={String(pockets.length)} Icon={Database} />
          <DataStat
            label="Receipt-sourced"
            value={String(expenses.filter((e) => e.source === 'receipt').length)}
            Icon={FileJson}
          />
          <DataStat
            label="Recurring flagged"
            value={String(expenses.filter((e) => e.recurring).length)}
            Icon={RefreshCw}
          />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={runDemo} disabled={demoBusy} className="btn-secondary">
            {demoBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
            )}
            Load demo ledger
          </button>
          <button onClick={() => setConfirmClear(true)} className="btn-secondary text-negative-600">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear all expenses & pockets
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Loading the demo ledger replaces your current expenses and pockets.
        </p>
      </div>

      {/* ── Security note (PRD §39, §64) ────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Privacy & security" />
        <ul className="space-y-2.5 text-xs leading-relaxed text-ink-600">
          <SecurityRow
            ok
            text={`Your data is stored under user-scoped paths (users/${user?.uid.slice(0, 6)}…/expenses), and Firestore security rules verify the authenticated uid on every read and write — another user can never reach your expenses, receipts, pockets or profile.`}
          />
          <SecurityRow
            ok
            text="Receipt images are stored at receipts/{your-uid}/… with Storage rules restricting access to the owning account, capped to images under 10 MB."
          />
          <SecurityRow
            ok
            text="Receipt reading happens in a server-side edge function, so the vision provider's API key is never shipped to your browser."
          />
          <SecurityRow
            ok={isFirebaseConfigured}
            text={
              isFirebaseConfigured
                ? 'Firebase is configured for this deployment via environment variables; no secrets are committed to the repository.'
                : 'Firebase is not configured for this deployment, so the app is running against local storage only.'
            }
          />
        </ul>
      </div>

      {/* ── Developer & judging tools (PRD §51) ─────────────────────────── */}
      <Disclosure
        label="Developer & judging tools"
        icon={<FileJson className="h-4 w-4 text-ink-400" aria-hidden="true" />}
      >
        <TestDataImporter onImport={importDataset} />
      </Disclosure>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all expenses and pockets?"
        message={
          <p>
            All {expenses.length} expenses and {pockets.length} savings pockets will be permanently
            removed. Your salary and DPS rate will be kept.
          </p>
        }
        confirmLabel="Clear everything"
        busy={clearBusy}
        onConfirm={doClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}

/* ══ P12 test-data importer (PRD §50–§53) ══════════════════════════════════ */

function TestDataImporter({
  onImport
}: {
  onImport: (
    expenses: NormalizedTestCase['expenses'],
    pockets: NormalizedTestCase['pockets'],
    settings: { monthlySalary: number; dpsAnnualRatePercent: number }
  ) => Promise<void>
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [jsonText, setJsonText] = useState('')
  const [cases, setCases] = useState<NormalizedTestCase[]>([])
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const selected = useMemo(() => cases.find((c) => c.caseId === selectedId) ?? null, [cases, selectedId])
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const parse = (text: string) => {
    setJsonText(text)
    if (!text.trim()) {
      setCases([])
      setIssues([])
      setSelectedId('')
      return
    }
    const result = parseP12Json(text)
    setCases(result.cases)
    setIssues(result.issues)
    setSelectedId(result.cases[0]?.caseId ?? '')
    if (result.ok) {
      toast.success(
        `Parsed ${result.cases.length} case${result.cases.length === 1 ? '' : 's'}`,
        result.issues.length > 0 ? `${result.issues.length} validation note(s)` : undefined
      )
    } else {
      toast.error('Could not read any test cases', 'See the validation messages below.')
    }
  }

  const doImport = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await onImport(selected.expenses, selected.pockets, {
        monthlySalary: selected.salary,
        dpsAnnualRatePercent: selected.dpsAnnualRatePercent
      })
      toast.success(
        `Imported ${selected.caseId}`,
        `${selected.expenses.length} expenses, ${selected.pockets.length} pockets, salary ${formatBdt(selected.salary)}, DPS ${selected.dpsAnnualRatePercent}%`
      )
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 text-xs">
      <p className="leading-relaxed text-ink-600">
        Load a P12 public test case to verify behaviour. The importer reads whatever cases the JSON
        contains — no case is hard-coded, and the DPS rate is taken from each case rather than
        assumed. Amounts are normalized to integer paisa on import.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Choose JSON file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            parse(await f.text())
            e.target.value = ''
          }}
        />
        {jsonText && (
          <button
            onClick={() => {
              setJsonText('')
              setCases([])
              setIssues([])
              setSelectedId('')
            }}
            className="btn-ghost btn-sm"
          >
            Clear
          </button>
        )}
      </div>

      <div>
        <label htmlFor="p12-json" className="label">
          …or paste the P12 JSON
        </label>
        <textarea
          id="p12-json"
          className="input resize-y font-mono text-[11px]"
          rows={5}
          placeholder='{ "cases": [ { "case_id": "PUB-01", "today": "2026-08-17", "salary_bdt": "50000", "expenses": [...], "pockets": [...], "dps_annual_rate_percent": 8 } ] }'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          onBlur={(e) => e.target.value.trim() && parse(e.target.value)}
          spellCheck={false}
        />
        <p className="mt-1.5 text-ink-400">
          Accepts an array of cases, a {'{ "cases": [...] }'} wrapper, or a single case object.
        </p>
      </div>

      {/* Validation output (PRD §53) */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-negative-500/25 bg-negative-50 p-3.5">
          <p className="flex items-center gap-1.5 font-semibold text-negative-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {errors.length} validation error{errors.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {errors.slice(0, 25).map((i, idx) => (
              <li key={idx} className="text-[11px] leading-relaxed text-negative-700">
                <code className="font-mono">{i.path}</code> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <details className="rounded-xl border border-warn-500/25 bg-warn-50 p-3.5">
          <summary className="cursor-pointer font-semibold text-warn-700">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {warnings.slice(0, 25).map((i, idx) => (
              <li key={idx} className="text-[11px] leading-relaxed text-warn-700">
                <code className="font-mono">{i.path}</code> — {i.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Case selection */}
      {cases.length > 0 && (
        <div className="rounded-xl border border-[var(--border-soft)] bg-white p-3.5">
          <label htmlFor="p12-case" className="label">
            Select case to import
          </label>
          <select
            id="p12-case"
            className="input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {cases.map((c) => (
              <option key={c.caseId} value={c.caseId}>
                {c.caseId} — salary {formatBdt(c.salary)}, {c.expenses.length} expenses,{' '}
                {c.pockets.length} pockets, DPS {c.dpsAnnualRatePercent}%
              </option>
            ))}
          </select>

          {selected && (
            <>
              <dl className="tnum mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniField label="Salary" value={formatBdt(selected.salary)} />
                <MiniField label="DPS rate" value={`${selected.dpsAnnualRatePercent}%`} />
                <MiniField
                  label="This month"
                  value={selected.monthsThis ? formatMonthKey(selected.monthsThis, true) : '—'}
                />
                <MiniField
                  label="Last month"
                  value={selected.monthsLast ? formatMonthKey(selected.monthsLast, true) : '—'}
                />
              </dl>

              {selected.today && (
                <p className="mt-2 flex gap-2 rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    This case declares <code className="font-mono">today = {selected.today}</code>.
                    The app forecasts against the real current date, so if that differs the
                    elapsed-day pace will differ from the case’s reference values while every formula
                    stays identical.
                  </span>
                </p>
              )}

              {selected.dpsRule && (
                <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
                  <strong>Case DPS rule:</strong> {selected.dpsRule}
                </p>
              )}

              <button
                onClick={doImport}
                disabled={busy || errors.length > 0}
                className="btn-accent btn-sm mt-3.5 w-full"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Database className="h-3.5 w-3.5" aria-hidden="true" />
                    Import {selected.caseId} (replaces current data)
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-50 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink-900">{value}</dd>
    </div>
  )
}

function DataStat({
  label,
  value,
  Icon
}: {
  label: string
  value: string
  Icon: typeof Wallet
}) {
  return (
    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <dt className="text-xs text-ink-500">{label}</dt>
        <Icon className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
      </div>
      <dd className="tnum mt-1 text-xl font-semibold text-ink-900">{value}</dd>
    </div>
  )
}

function SecurityRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex gap-2.5">
      {ok ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive-600" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" aria-hidden="true" />
      )}
      <span>{text}</span>
    </li>
  )
}
