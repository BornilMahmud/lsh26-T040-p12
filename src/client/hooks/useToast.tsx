/**
 * Toast notification system — PRD §58.
 * Accessible: the live region announces messages to screen readers (PRD §45).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (tone: ToastTone, title: string, description?: string) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

const TONE_META: Record<ToastTone, { Icon: typeof CheckCircle2; classes: string; iconClass: string }> = {
  success: {
    Icon: CheckCircle2,
    classes: 'border-positive-500/30 bg-white',
    iconClass: 'text-positive-600'
  },
  error: { Icon: XCircle, classes: 'border-negative-500/30 bg-white', iconClass: 'text-negative-600' },
  warning: { Icon: AlertTriangle, classes: 'border-warn-500/30 bg-white', iconClass: 'text-warn-600' },
  info: { Icon: Info, classes: 'border-brand-500/30 bg-white', iconClass: 'text-brand-600' }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      counter += 1
      const id = counter
      // Diagnostic errors (e.g. "Firestore blocked this write ... press Publish")
      // are long. Promote the first sentence to the title and keep the guidance
      // as the description so the toast stays scannable.
      let head = title
      let body = description
      if (!body && title.length > 90) {
        const cut = title.indexOf('. ')
        if (cut > 0 && cut < title.length - 2) {
          head = title.slice(0, cut + 1)
          body = title.slice(cut + 2)
        }
      }
      setToasts((prev) => [...prev.slice(-3), { id, tone, title: head, description: body }])
      // Actionable errors need time to read; success messages do not.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 15000 : 4200)
    },
    [dismiss]
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (t, d) => toast('success', t, d),
      error: (t, d) => toast('error', t, d),
      info: (t, d) => toast('info', t, d),
      warning: (t, d) => toast('warning', t, d)
    }),
    [toast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
        role="region"
        aria-label="Notifications"
      >
        <div aria-live="polite" aria-atomic="false" className="contents">
          {toasts.map((t) => {
            const { Icon, classes, iconClass } = TONE_META[t.tone]
            return (
              <div
                key={t.id}
                className={`animate-in card flex items-start gap-3 border p-3.5 shadow-lg ${classes}`}
                role={t.tone === 'error' ? 'alert' : 'status'}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-ink-500">{t.description}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
