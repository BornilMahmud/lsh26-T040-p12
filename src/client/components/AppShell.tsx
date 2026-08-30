/**
 * Application shell — PRD §9, §10, §42.
 * Desktop: fixed sidebar navigation. Mobile: compact header + bottom nav.
 * Includes the dynamic month selector that drives every metric.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChevronDown,
  FlaskConical,
  Lightbulb,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  TrendingUp,
  Wallet,
  X
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLedger } from '@/hooks/useLedger'
import { formatMonthKey } from '@/lib/dates'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Overview', Icon: BarChart3, end: true },
  { to: '/expenses', label: 'Expenses', Icon: Receipt, end: false },
  { to: '/forecast', label: 'Forecast', Icon: TrendingUp, end: false },
  { to: '/insights', label: 'Insights', Icon: Lightbulb, end: false },
  { to: '/savings', label: 'Savings', Icon: PiggyBank, end: false },
  { to: '/what-if', label: 'What-if', Icon: FlaskConical, end: false },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, end: false }
]

/** Bottom nav shows the 5 most-used destinations on small screens. */
const MOBILE_NAV = NAV.filter((n) => ['/', '/expenses', '/savings', '/insights', '/what-if'].includes(n.to))

export function MonthSelector({ compact }: { compact?: boolean }) {
  const { months, selectedMonth, setSelectedMonth, today } = useLedger()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'btn-secondary rounded-xl',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Selected month: ${formatMonthKey(selectedMonth)}. Change month.`}
      >
        <span className="font-medium">
          {formatMonthKey(selectedMonth, compact)}
          {selectedMonth === currentMonthKey && (
            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-400">
              current
            </span>
          )}
        </span>
        <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select month"
          className="animate-scale-in absolute right-0 z-40 mt-1.5 max-h-72 w-52 overflow-y-auto rounded-xl border border-[var(--border-soft)] bg-white p-1.5 shadow-xl"
        >
          {months.map((m) => (
            <button
              key={m}
              role="option"
              aria-selected={m === selectedMonth}
              onClick={() => {
                setSelectedMonth(m)
                setOpen(false)
              }}
              className={cx(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                m === selectedMonth ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'
              )}
            >
              <span>{formatMonthKey(m)}</span>
              {m === currentMonthKey && (
                <span
                  className={cx(
                    'text-[10px] font-medium uppercase tracking-wide',
                    m === selectedMonth ? 'text-white/60' : 'text-ink-400'
                  )}
                >
                  current
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppShell({
  children,
  onAddExpense
}: {
  children: ReactNode
  onAddExpense: () => void
}) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--border-soft)] bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink-900">
            <Wallet className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-ink-900">
              Personal Ledger
            </p>
            <p className="text-[11px] text-ink-400">Manager</p>
          </div>
        </div>

        <button onClick={onAddExpense} className="btn-accent mx-3 rounded-xl">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add expense
        </button>

        <nav className="mt-5 flex-1 space-y-1 px-3" aria-label="Main navigation">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('nav-item', isActive ? 'nav-item-active' : 'nav-item-idle')
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--border-soft)] p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                {(user?.displayName ?? 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink-900">{user?.displayName}</p>
              <p className="truncate text-[11px] text-ink-400">
                {user?.isDemo ? 'Demo session' : user?.email}
              </p>
            </div>
            <button
              onClick={() => void logout()}
              className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile header ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border-soft)] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="rounded-lg p-1.5 text-ink-600 transition-colors hover:bg-ink-100"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-900">
            <Wallet className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight text-ink-900">
            Personal Ledger
          </span>
        </div>
        <MonthSelector compact />
      </header>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold tracking-tight text-ink-900">Menu</span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
              {NAV.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx('nav-item', isActive ? 'nav-item-active' : 'nav-item-idle')
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-[var(--border-soft)] p-3">
              <button onClick={() => void logout()} className="btn-secondary w-full">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="pb-24 lg:pb-10 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* ── Mobile bottom nav (PRD §42) ─────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-6 border-t border-[var(--border-soft)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Primary navigation"
      >
        {MOBILE_NAV.slice(0, 2).map(({ to, label, Icon, end }) => (
          <BottomLink key={to} to={to} label={label} Icon={Icon} end={end} />
        ))}
        <div className="flex items-center justify-center">
          <button
            onClick={onAddExpense}
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25 transition-transform active:scale-95"
            aria-label="Add expense"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        {MOBILE_NAV.slice(2, 5).map(({ to, label, Icon, end }) => (
          <BottomLink key={to} to={to} label={label} Icon={Icon} end={end} />
        ))}
      </nav>
    </div>
  )
}

function BottomLink({
  to,
  label,
  Icon,
  end
}: {
  to: string
  label: string
  Icon: typeof BarChart3
  end: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
          isActive ? 'text-ink-900' : 'text-ink-400'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('h-[18px] w-[18px]', isActive && 'stroke-[2.4]')} aria-hidden="true" />
          {label}
        </>
      )}
    </NavLink>
  )
}
