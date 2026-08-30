/**
 * Shared UI primitives: accessible modal, confirm dialog, number display,
 * skeletons, empty states, badges, progress bars, disclosure panel.
 * PRD §41, §45, §57, §69.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ChevronDown, X } from 'lucide-react'
import { formatBdt } from '@/lib/money'
import type { Paisa } from '@/types'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* ── Money ─────────────────────────────────────────────────────────────────
   Optional count-up on change — subtle, and disabled for large/critical
   figures to avoid "over-animating financial numbers" (PRD §69).           */
export function Money({
  value,
  className,
  sign,
  animate = false
}: {
  value: Paisa | null | undefined
  className?: string
  sign?: boolean
  animate?: boolean
}) {
  const [display, setDisplay] = useState(value ?? 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const target = value ?? 0
    if (!animate || Math.abs(target - display) < 100) {
      setDisplay(target)
      return
    }
    const from = display
    const start = performance.now()
    const duration = 420
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (target - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate])

  return (
    <span className={cx('tnum', className)}>{formatBdt(animate ? display : (value ?? 0), { sign })}</span>
  )
}

/* ── Modal ─────────────────────────────────────────────────────────────────
   Focus-trapped, Escape-closable, labelled dialog (PRD §45).               */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md'
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus the first field for immediate keyboard use.
    const t = window.setTimeout(() => {
      const panel = panelRef.current
      const target = panel?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select, textarea, button'
      )
      target?.focus()
    }, 40)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = bodyOverflow
      window.clearTimeout(t)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const maxWidth = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-5xl'
  }[size]

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cx(
          'animate-scale-in relative z-10 w-full bg-white shadow-2xl',
          'rounded-t-3xl sm:rounded-2xl',
          'max-h-[92dvh] overflow-y-auto',
          maxWidth
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-soft)] bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-ink-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-ink-500">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body
  )
}

/* ── Confirm dialog (PRD §37) ─────────────────────────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="flex gap-3">
        {destructive && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-negative-50">
            <AlertTriangle className="h-4.5 w-4.5 text-negative-600" aria-hidden="true" />
          </div>
        )}
        <div className="text-sm text-ink-600">{message}</div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          className={destructive ? 'btn-danger' : 'btn-accent'}
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/* ── Disclosure ("How this works" panels, PRD §22, §32) ──────────────────── */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  icon
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-ink-50/60">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-ink-700 transition-colors hover:text-ink-900"
      >
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={contentId} className="animate-in border-t border-[var(--border-soft)] px-4 py-3.5 text-sm text-ink-600">
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Skeletons (PRD §57) ──────────────────────────────────────────────────── */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cx('card p-5', className)}>
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-7 w-32" />
      <div className="skeleton mt-3 h-2 w-full" />
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height }} aria-hidden="true" />
}

/* ── Empty state (PRD §41) ────────────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  message,
  action
}: {
  icon: ReactNode
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-500">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ── Badges ───────────────────────────────────────────────────────────────── */
export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'brand'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  positive: 'bg-positive-50 text-positive-700',
  negative: 'bg-negative-50 text-negative-700',
  warning: 'bg-warn-50 text-warn-700',
  brand: 'bg-brand-50 text-brand-700'
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  title
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span className={cx('chip', BADGE_TONES[tone], className)} title={title}>
      {children}
    </span>
  )
}

/* ── Progress bar ─────────────────────────────────────────────────────────── */
export function ProgressBar({
  percent,
  tone = 'brand',
  label,
  showMarker
}: {
  percent: number
  tone?: 'brand' | 'positive' | 'negative' | 'warning'
  label?: string
  /** Optional secondary marker (e.g. month elapsed) at this percent. */
  showMarker?: number
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const barTone = {
    brand: 'bg-brand-600',
    positive: 'bg-positive-500',
    negative: 'bg-negative-500',
    warning: 'bg-warn-500'
  }[tone]

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-ink-100"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', barTone)}
        style={{ width: `${clamped}%` }}
      />
      {showMarker !== undefined && (
        <div
          className="absolute top-0 h-full w-0.5 bg-ink-900/50"
          style={{ left: `${Math.max(0, Math.min(100, showMarker))}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/* ── Section header ───────────────────────────────────────────────────────── */
export function SectionHeader({
  title,
  subtitle,
  action
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ── Inline error banner (PRD §40) ────────────────────────────────────────── */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-negative-500/25 bg-negative-50 px-4 py-3 text-sm text-negative-700"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-sm bg-negative-600 text-white hover:bg-negative-700">
          Retry
        </button>
      )}
    </div>
  )
}

/** Copy-to-clipboard button used by the DPS/forecast transparency panels. */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => setCopied(false)
    )
  }, [])
  return { copied, copy }
}
