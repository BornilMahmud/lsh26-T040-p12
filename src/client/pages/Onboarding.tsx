/**
 * First-time user experience — PRD §8.
 * Step 1 salary · Step 2 tracking style · Step 3 DPS comparison rate.
 * The DPS rate is explicitly labelled "illustrative" and never presented as a
 * guaranteed bank return.
 */

import { useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Loader2,
  PlayCircle,
  Receipt,
  PencilLine,
  Layers,
  Percent,
  Wallet
} from 'lucide-react'
import { useLedger } from '@/hooks/useLedger'
import { useToast } from '@/hooks/useToast'
import { formatBdt, parseBdtToPaisa } from '@/lib/money'
import type { TrackingStyle } from '@/types'
import { cx } from '@/components/ui'

const TRACKING_OPTIONS: { value: TrackingStyle; label: string; description: string; Icon: typeof PencilLine }[] = [
  { value: 'manual', label: 'Manually', description: 'I type in expenses as they happen', Icon: PencilLine },
  { value: 'receipts', label: 'Receipts', description: 'I keep bills and screenshots', Icon: Receipt },
  { value: 'both', label: 'Both', description: 'A mix of typing and scanning', Icon: Layers }
]

const RATE_PRESETS = [7.5, 8, 9, 10]

export default function Onboarding() {
  const { saveSettings, loadDemoData } = useLedger()
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [salaryText, setSalaryText] = useState('')
  const [tracking, setTracking] = useState<TrackingStyle>('both')
  const [rateText, setRateText] = useState('8.00')
  const [saving, setSaving] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  // A setup failure (e.g. undeployed Firestore rules) must stay on screen —
  // a toast that vanishes leaves the user stuck with no explanation.
  const [setupError, setSetupError] = useState<string | null>(null)

  const salaryPaisa = parseBdtToPaisa(salaryText)
  const salaryValid = salaryPaisa !== null && salaryPaisa > 0
  const rate = Number(rateText)
  const rateValid = Number.isFinite(rate) && rate >= 0 && rate <= 100

  const finish = async () => {
    if (!salaryValid || !rateValid) return
    setSaving(true)
    setSetupError(null)
    try {
      await saveSettings({
        monthlySalary: salaryPaisa,
        dpsAnnualRatePercent: rate,
        trackingStyle: tracking,
        onboardingComplete: true
      })
      toast.success('You’re all set', 'Add your first expense to see your dashboard come alive.')
    } catch (err) {
      const message = (err as Error).message
      setSetupError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const runDemo = async () => {
    setDemoLoading(true)
    setSetupError(null)
    try {
      await loadDemoData()
      toast.success('Demo ledger loaded', 'Three months of realistic data with live forecasts.')
    } catch (err) {
      const message = (err as Error).message
      setSetupError(message)
      toast.error(message)
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f5f6f8] px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2" aria-hidden="true">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cx(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                s <= step ? 'bg-ink-900' : 'bg-ink-200'
              )}
            />
          ))}
        </div>

        {setupError && (
          <div
            role="alert"
            className="animate-in mb-4 flex gap-2.5 rounded-xl border border-negative-500/30 bg-negative-50 px-3.5 py-3 text-xs leading-relaxed text-negative-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">Setup could not be saved</p>
              <p className="mt-1">{setupError}</p>
            </div>
          </div>
        )}

        <div className="card p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
            Step {step} of 3
          </p>

          {/* ── Step 1: salary ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="animate-in">
              <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                <Wallet className="h-5 w-5 text-brand-600" aria-hidden="true" />
              </div>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
                What’s your monthly salary?
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">
                This anchors your remaining balance, forecast and savings capacity. You can change it
                any time in Settings.
              </p>

              <label htmlFor="salary" className="label mt-6">
                Monthly salary
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-400">
                  ৳
                </span>
                <input
                  id="salary"
                  className="input pl-8 text-lg font-semibold tnum"
                  inputMode="decimal"
                  placeholder="50,000"
                  value={salaryText}
                  onChange={(e) => setSalaryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && salaryValid) setStep(2)
                  }}
                  autoFocus
                  aria-describedby="salary-help"
                />
              </div>
              <p id="salary-help" className="mt-2 text-xs text-ink-400">
                {salaryValid
                  ? `Recorded as ${formatBdt(salaryPaisa)} per month.`
                  : 'Enter the amount you receive each month.'}
              </p>

              <div className="mt-7 flex justify-end">
                <button className="btn-primary" onClick={() => setStep(2)} disabled={!salaryValid}>
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: tracking style ────────────────────────────────── */}
          {step === 2 && (
            <div className="animate-in">
              <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink-900">
                How do you usually track expenses?
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">
                We’ll put your preferred entry method front and centre.
              </p>

              <fieldset className="mt-6 space-y-2.5">
                <legend className="sr-only">Preferred expense tracking method</legend>
                {TRACKING_OPTIONS.map(({ value, label, description, Icon }) => {
                  const active = tracking === value
                  return (
                    <label
                      key={value}
                      className={cx(
                        'flex cursor-pointer items-center gap-3.5 rounded-xl border p-3.5 transition-all',
                        active
                          ? 'border-ink-900 bg-ink-50 ring-1 ring-ink-900'
                          : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50/60'
                      )}
                    >
                      <input
                        type="radio"
                        name="tracking"
                        value={value}
                        checked={active}
                        onChange={() => setTracking(value)}
                        className="sr-only"
                      />
                      <div
                        className={cx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          active ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-900">{label}</p>
                        <p className="text-xs text-ink-500">{description}</p>
                      </div>
                      {active && <Check className="h-4 w-4 shrink-0 text-ink-900" aria-hidden="true" />}
                    </label>
                  )
                })}
              </fieldset>

              <div className="mt-7 flex justify-between">
                <button className="btn-ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
                <button className="btn-primary" onClick={() => setStep(3)}>
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: DPS rate ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="animate-in">
              <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                <Percent className="h-5 w-5 text-brand-600" aria-hidden="true" />
              </div>
              <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
                Set your DPS comparison rate
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">
                Used to show what your savings pockets could look like in a monthly deposit scheme.
              </p>

              <label htmlFor="rate" className="label mt-6">
                Illustrative DPS comparison rate (annual)
              </label>
              <div className="relative">
                <input
                  id="rate"
                  className={cx('input pr-8 text-lg font-semibold tnum', !rateValid && 'input-error')}
                  inputMode="decimal"
                  value={rateText}
                  onChange={(e) => setRateText(e.target.value)}
                  aria-describedby="rate-help"
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-400">
                  %
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {RATE_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setRateText(p.toFixed(2))}
                    className={cx(
                      'btn btn-sm border',
                      Number(rateText) === p
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                    )}
                  >
                    {p.toFixed(2)}%
                  </button>
                ))}
              </div>

              <div
                id="rate-help"
                className="mt-4 flex gap-2.5 rounded-xl bg-warn-50 px-3.5 py-3 text-xs leading-relaxed text-warn-700"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  This is an <strong>illustrative comparison rate</strong> for projection only — not a
                  guaranteed bank return. The app always shows the exact rate it used, and you can
                  change it in Settings.
                </span>
              </div>

              <div className="mt-7 flex justify-between">
                <button className="btn-ghost" onClick={() => setStep(2)} disabled={saving}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
                <button className="btn-primary" onClick={finish} disabled={!rateValid || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Setting up…
                    </>
                  ) : (
                    <>
                      Enter dashboard
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick demo path */}
        <div className="mt-4 flex items-center justify-center">
          <button onClick={runDemo} disabled={demoLoading} className="btn-ghost text-xs">
            {demoLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Skip and load the demo ledger instead
          </button>
        </div>
      </div>
    </div>
  )
}
