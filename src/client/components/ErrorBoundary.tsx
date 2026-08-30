/**
 * Top-level error boundary — PRD §40, §56.
 * A rendering failure must never leave a blank screen, and the raw error is
 * logged rather than shown to the user.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="card max-w-md p-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-negative-50">
            <AlertTriangle className="h-5 w-5 text-negative-600" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-ink-900">Something went wrong</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            The page hit an unexpected problem. Your saved data is unaffected — reloading usually
            fixes it.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-6 w-full">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
