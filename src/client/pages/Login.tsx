/**
 * Login page — PRD §5, §43.
 * Primary CTA: "Continue with Google" with loading + error states.
 * Secondary: "Explore Demo" (PRD §54) so the product can be evaluated
 * end-to-end without credentials.
 */

import { useState } from 'react'
import { AlertTriangle, ArrowRight, Loader2, PlayCircle, ShieldCheck, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

export default function Login() {
  const { signInWithGoogle, startDemo, error, isFirebaseConfigured, clearError } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  const handleGoogle = async () => {
    setSigningIn(true)
    clearError()
    try {
      await signInWithGoogle()
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ── Left: brand / value proposition ─────────────────────────────── */}
      <section className="relative flex flex-col justify-between bg-ink-900 px-6 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14">
        <header className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Wallet className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Personal Ledger Manager</span>
        </header>

        <div className="my-12 lg:my-0">
          <h1 className="max-w-md text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
            Know where your money goes.
            <br />
            <span className="text-white/55">Know where it's going.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
            Record expenses, scan receipts, and see the rest of your month before it happens — with
            forecast-driven savings dates you can actually plan around.
          </p>

          <ul className="mt-9 space-y-3.5">
            {[
              { Icon: TrendingUp, text: 'Weighted forecast blends this month’s pace with last month’s pattern' },
              { Icon: Wallet, text: 'Savings pockets dated from real forecasted surplus, not wishful division' },
              { Icon: ShieldCheck, text: 'Receipt amounts are never invented — low confidence always asks you' }
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/70">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/35">
          Amounts in Bangladeshi Taka (৳). Stored per user and never shared.
        </p>
      </section>

      {/* ── Right: sign-in ─────────────────────────────────────────────── */}
      <section className="flex flex-1 items-center justify-center px-6 py-12 lg:px-14">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Your ledger is private to your account.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex gap-2.5 rounded-xl border border-negative-500/25 bg-negative-50 px-3.5 py-3 text-xs leading-relaxed text-negative-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGoogle}
            disabled={signingIn}
            className="btn mt-6 w-full gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-900 shadow-sm transition-all hover:border-ink-300 hover:bg-ink-50 active:scale-[0.99] disabled:opacity-60"
          >
            {signingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Signing you in…
              </>
            ) : (
              <>
                <GoogleIcon className="h-4.5 w-4.5" />
                Continue with Google
              </>
            )}
          </button>

          {!isFirebaseConfigured && (
            <p className="mt-3 rounded-xl bg-warn-50 px-3.5 py-2.5 text-xs leading-relaxed text-warn-700">
              Firebase credentials are not configured for this deployment, so Google sign-in is
              unavailable here. Demo Mode below runs the complete application with local storage.
            </p>
          )}

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">or</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>

          <button onClick={startDemo} className="btn-secondary w-full justify-between rounded-xl py-3">
            <span className="flex items-center gap-2.5">
              <PlayCircle className="h-4.5 w-4.5 text-brand-600" aria-hidden="true" />
              Explore Demo
            </span>
            <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
          </button>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
            Loads a realistic Dhaka ledger with live forecasts, insights and savings pockets. Demo
            data behaves exactly like real data — every number is computed by the same engines.
          </p>
        </div>
      </section>
    </div>
  )
}
