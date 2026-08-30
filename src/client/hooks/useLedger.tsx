/**
 * CENTRAL LEDGER STORE — PRD §59, §76, §77.
 *
 * DATA FLOW
 *   repository (Firestore | local)
 *        ↓  live subscription
 *   normalized expenses / pockets / settings
 *        ↓  useMemo over the PURE engines
 *   summary · comparison · forecast · insights · recurring · savings
 *        ↓
 *   dashboard / expenses / forecast / insights / savings / what-if pages
 *
 * Every page reads its numbers from THIS object, so a metric can never be
 * computed two different ways in two places. Because the derived values are
 * memoized on [expenses, pockets, salary, dpsRate, monthKey], any change to an
 * expense, the salary, a pocket contribution or the DPS rate invalidates and
 * recomputes the whole analytics chain with no page refresh (PRD §76).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type {
  Expense,
  ExpenseDraft,
  Pocket,
  PocketDraft,
  ReceiptRecord,
  UserSettings
} from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { getDb } from '@/firebase/config'
import { FirestoreRepository } from '@/services/firestoreRepository'
import { LocalRepository } from '@/services/localRepository'
import type { DataRepository } from '@/services/repository'
import { useAuth } from './useAuth'
import {
  availableMonths,
  calculateMonthComparison,
  calculateMonthlySummary,
  expensesForMonth,
  monthlyTrend,
  type MonthComparison,
  type MonthlySummary
} from '@/analytics/summary'
import { calculateForecast, type ForecastFacts } from '@/analytics/forecastEngine'
import { generateInsights, type Insight } from '@/analytics/insightEngine'
import {
  applyRecurringFlags,
  detectRecurringExpenses,
  type RecurringGroup
} from '@/analytics/recurringEngine'
import { calculatePocketProjections, type SavingsFacts } from '@/analytics/pocketCalculator'
import { monthKeyOf, toDayKey, type MonthKey } from '@/lib/dates'
import { describeFirebaseError, firebaseErrorCode } from '@/lib/firebaseErrors'
import { buildDemoExpenses, buildDemoPockets, DEMO_DPS_RATE, DEMO_SALARY } from '@/data/demoData'

interface LedgerContextValue {
  // ── raw state ─────────────────────────────────────────────────────────────
  repository: DataRepository | null
  expenses: Expense[]
  pockets: Pocket[]
  settings: UserSettings
  settingsLoaded: boolean
  loading: boolean
  error: string | null

  // ── month selection (PRD §10) ────────────────────────────────────────────
  selectedMonth: MonthKey
  setSelectedMonth: (m: MonthKey) => void
  months: MonthKey[]

  // ── derived analytics (single source of truth) ────────────────────────────
  monthExpenses: Expense[]
  summary: MonthlySummary
  comparison: MonthComparison
  forecast: ForecastFacts
  insights: Insight[]
  recurringGroups: RecurringGroup[]
  savings: SavingsFacts
  trend: { monthKey: MonthKey; total: number }[]
  today: Date

  // ── mutations ─────────────────────────────────────────────────────────────
  addExpense: (draft: ExpenseDraft, id?: string) => Promise<string>
  updateExpense: (id: string, patch: Partial<ExpenseDraft>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  addPocket: (draft: PocketDraft) => Promise<string>
  updatePocket: (id: string, patch: Partial<PocketDraft>) => Promise<void>
  deletePocket: (id: string) => Promise<void>
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>
  saveReceipt: (record: Omit<ReceiptRecord, 'userId'>) => Promise<void>
  importDataset: (expenses: ExpenseDraft[], pockets: PocketDraft[], settings: Partial<UserSettings>) => Promise<void>
  loadDemoData: () => Promise<void>
  clearAllData: () => Promise<void>
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [pockets, setPockets] = useState<Pocket[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonthRaw] = useState<MonthKey>(() => monthKeyOf(toDayKey(new Date())))

  // "Today" is stable for the session so charts and forecasts don't jitter,
  // but it is a real date — never a hard-coded month (PRD §10).
  const today = useMemo(() => new Date(), [])

  // ── repository selection ────────────────────────────────────────────────
  const repository = useMemo<DataRepository | null>(() => {
    if (!user) return null
    const db = getDb()
    if (user.isDemo || !db) return new LocalRepository(user.uid)
    return new FirestoreRepository(db, user.uid)
  }, [user])

  // ── live subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!repository) {
      setExpenses([])
      setPockets([])
      setSettings(DEFAULT_SETTINGS)
      setSettingsLoaded(false)
      setLoading(false)
      return
    }

    setLoading(true)
    let settled = 0
    const done = () => {
      settled += 1
      if (settled >= 3) setLoading(false)
    }

    const onErr = (label: string) => (e: unknown) => {
      console.error(`[ledger] ${label} subscription failed`, { code: firebaseErrorCode(e) }, e)
      // Translated, actionable copy — a permission-denied (undeployed security
      // rules) must not look like a network blip (PRD §40).
      setError(describeFirebaseError(e, `load your ${label}`))
      done()
    }

    let first = { e: true, p: true, s: true }
    const unsubExpenses = repository.subscribeExpenses((list) => {
      setExpenses(list)
      setError(null)
      if (first.e) {
        first.e = false
        done()
      }
    }, onErr('expenses'))

    const unsubPockets = repository.subscribePockets((list) => {
      setPockets(list)
      if (first.p) {
        first.p = false
        done()
      }
    }, onErr('savings pockets'))

    const unsubSettings = repository.subscribeSettings((s) => {
      setSettings(s ?? DEFAULT_SETTINGS)
      setSettingsLoaded(true)
      if (first.s) {
        first.s = false
        done()
      }
    }, onErr('settings'))

    return () => {
      unsubExpenses()
      unsubPockets()
      unsubSettings()
    }
  }, [repository])

  // ── recurring flags applied to the canonical expense list ───────────────
  // Derived (not trusted from storage) so the flag is always consistent with
  // the current data set — deleting last month's rent must un-flag this one.
  const flaggedExpenses = useMemo(() => applyRecurringFlags(expenses), [expenses])

  const recurringGroups = useMemo(() => detectRecurringExpenses(expenses).groups, [expenses])

  // ── month list, dynamically derived from the data (PRD §10) ─────────────
  const months = useMemo(() => {
    const fromData = availableMonths(flaggedExpenses)
    const currentMonth = monthKeyOf(toDayKey(today))
    const set = new Set<MonthKey>([currentMonth, ...fromData])
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  }, [flaggedExpenses, today])

  // Keep the selection valid as data changes.
  useEffect(() => {
    if (!months.includes(selectedMonth) && months.length > 0) {
      setSelectedMonthRaw(months[0])
    }
  }, [months, selectedMonth])

  const setSelectedMonth = useCallback((m: MonthKey) => setSelectedMonthRaw(m), [])

  // ── DERIVED ANALYTICS — the whole chain, memoized ───────────────────────
  const monthExpenses = useMemo(
    () => expensesForMonth(flaggedExpenses, selectedMonth),
    [flaggedExpenses, selectedMonth]
  )

  const forecast = useMemo(
    () =>
      calculateForecast({
        expenses: flaggedExpenses,
        salary: settings.monthlySalary,
        monthKey: selectedMonth,
        today
      }),
    [flaggedExpenses, settings.monthlySalary, selectedMonth, today]
  )

  const summary = useMemo(
    () =>
      calculateMonthlySummary({
        expenses: flaggedExpenses,
        monthKey: selectedMonth,
        salary: settings.monthlySalary,
        daysElapsed: forecast.elapsedDays
      }),
    [flaggedExpenses, selectedMonth, settings.monthlySalary, forecast.elapsedDays]
  )

  const comparison = useMemo(
    () =>
      calculateMonthComparison({
        expenses: flaggedExpenses,
        currentMonth: selectedMonth,
        previousMonth: forecast.previousMonthKey
      }),
    [flaggedExpenses, selectedMonth, forecast.previousMonthKey]
  )

  const savings = useMemo(
    () =>
      calculatePocketProjections({
        pockets,
        forecastSurplus: forecast.forecastSurplus,
        dpsAnnualRatePercent: settings.dpsAnnualRatePercent,
        today
      }),
    [pockets, forecast.forecastSurplus, settings.dpsAnnualRatePercent, today]
  )

  const insights = useMemo(
    () =>
      generateInsights({
        expenses: flaggedExpenses,
        monthExpenses,
        forecast,
        comparison,
        savings,
        recurringGroups
      }),
    [flaggedExpenses, monthExpenses, forecast, comparison, savings, recurringGroups]
  )

  const trend = useMemo(() => monthlyTrend(flaggedExpenses), [flaggedExpenses])

  // ── mutations ───────────────────────────────────────────────────────────
  /**
   * Wrap a repository mutation. On failure we log the ORIGINAL error (with its
   * Firebase code) and re-throw a translated, actionable message — see
   * lib/firebaseErrors.ts. `action` is a verb phrase: "save your settings".
   */
  const guard = useCallback(
    <T,>(fn: (repo: DataRepository) => Promise<T>, action: string): Promise<T> => {
      if (!repository) return Promise.reject(new Error('Not signed in'))
      return fn(repository).catch((err) => {
        console.error(
          `[ledger] failed to ${action}`,
          { code: firebaseErrorCode(err) ?? '(no code)' },
          err
        )
        throw new Error(describeFirebaseError(err, action))
      })
    },
    [repository]
  )

  const value: LedgerContextValue = {
    repository,
    expenses: flaggedExpenses,
    pockets,
    settings,
    settingsLoaded,
    loading,
    error,
    selectedMonth,
    setSelectedMonth,
    months,
    monthExpenses,
    summary,
    comparison,
    forecast,
    insights,
    recurringGroups,
    savings,
    trend,
    today,
    addExpense: (draft, id) => guard((r) => r.addExpense(draft, id), 'save that expense'),
    updateExpense: (id, patch) => guard((r) => r.updateExpense(id, patch), 'update that expense'),
    deleteExpense: (id) => guard((r) => r.deleteExpense(id), 'delete that expense'),
    addPocket: (draft) => guard((r) => r.addPocket(draft), 'create that savings pocket'),
    updatePocket: (id, patch) => guard((r) => r.updatePocket(id, patch), 'update that savings pocket'),
    deletePocket: (id) => guard((r) => r.deletePocket(id), 'delete that savings pocket'),
    saveSettings: (patch) => guard((r) => r.saveSettings(patch), 'save your settings'),
    saveReceipt: (record) => guard((r) => r.saveReceipt(record), 'store the receipt details'),
    importDataset: (importedExpenses, importedPockets, importedSettings) =>
      guard(async (r) => {
        await r.replaceAllExpenses(importedExpenses)
        await r.replaceAllPockets(importedPockets)
        await r.saveSettings({ ...importedSettings, onboardingComplete: true })
      }, 'import the dataset'),
    loadDemoData: () =>
      guard(async (r) => {
        await r.replaceAllExpenses(buildDemoExpenses(today))
        await r.replaceAllPockets(buildDemoPockets())
        await r.saveSettings({
          monthlySalary: DEMO_SALARY,
          dpsAnnualRatePercent: DEMO_DPS_RATE,
          onboardingComplete: true,
          trackingStyle: 'both'
        })
      }, 'load the demo data'),
    clearAllData: () => guard((r) => r.clearAll(), 'clear your data')
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside <LedgerProvider>')
  return ctx
}
