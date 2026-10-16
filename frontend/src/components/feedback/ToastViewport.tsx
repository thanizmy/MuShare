import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

import { useToastStore, type ToastKind } from '../../store/toastStore'

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info } satisfies Record<ToastKind, unknown>
const COLORS: Record<ToastKind, string> = {
  success: 'text-accent-soft',
  error: 'text-danger',
  info: 'text-ink-muted',
}

/** Announces transient messages politely to screen readers and shows them above the player. */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-28"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            className="glass-strong pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-elevated px-4 py-2.5 text-sm shadow-glass"
          >
            <Icon className={`h-4 w-4 shrink-0 ${COLORS[t.kind]}`} aria-hidden />
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="rounded-full p-0.5 text-ink-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
