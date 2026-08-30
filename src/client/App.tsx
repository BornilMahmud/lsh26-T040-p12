/**
 * Application root: providers, protected routing, and the global
 * "Add expense" dialog (reachable from every page).
 */

import { Suspense, lazy, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LedgerProvider, useLedger } from './hooks/useLedger'
import { ToastProvider } from './hooks/useToast'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import ExpenseForm from './features/expenses/ExpenseForm'

const Expenses = lazy(() => import('./pages/Expenses'))
const Forecast = lazy(() => import('./pages/Forecast'))
const Insights = lazy(() => import('./pages/Insights'))
const Savings = lazy(() => import('./pages/Savings'))
const WhatIf = lazy(() => import('./pages/WhatIf'))
const Settings = lazy(() => import('./pages/Settings'))

function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
        <p className="text-sm text-ink-500">{label}</p>
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      <span className="sr-only">Loading page</span>
    </div>
  )
}

/** Authenticated area: onboarding gate, shell, routes, add-expense dialog. */
function AuthedApp() {
  const { settings, settingsLoaded, loading } = useLedger()
  const [addOpen, setAddOpen] = useState(false)

  // Wait for settings before deciding onboarding vs dashboard, so the user
  // never sees a flash of the wrong screen.
  if (loading && !settingsLoaded) return <FullPageLoader label="Loading your ledger…" />

  if (!settings.onboardingComplete) return <Onboarding />

  return (
    <>
      <AppShell onAddExpense={() => setAddOpen(true)}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard onAddExpense={() => setAddOpen(true)} />} />
            <Route path="/expenses" element={<Expenses onAddExpense={() => setAddOpen(true)} />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/what-if" element={<WhatIf />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
      <ExpenseForm open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  )
}

/** Protected route boundary — PRD §5. */
function Gate() {
  const { user, loading } = useAuth()

  if (loading) return <FullPageLoader label="Checking your session…" />
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <LedgerProvider>
      <AuthedApp />
    </LedgerProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
