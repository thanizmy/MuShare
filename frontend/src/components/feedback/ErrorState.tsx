import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message = 'Something went wrong while loading this.', onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger/5 px-6 py-8 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      )}
    </div>
  )
}
