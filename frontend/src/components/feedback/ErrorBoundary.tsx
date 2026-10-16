import { AlertTriangle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div role="alert" className="flex h-full items-center justify-center bg-canvas p-6">
        <div className="glass max-w-md rounded-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-danger" aria-hidden />
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-muted">
            An unexpected error stopped this page from loading. Reloading usually fixes it.
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
