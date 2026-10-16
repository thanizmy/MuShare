import { formatBytes } from '../../lib/format'
import type { StudioUsage } from '../../types/studio'

function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const nearFull = percent >= 90

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-bold uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink-muted">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={text}
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={`h-full rounded-full ${nearFull ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** How much of the per-person studio allowance is used. */
export function UsageMeter({ usage }: { usage: StudioUsage }) {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface p-4 sm:flex-row sm:gap-8">
      <Meter
        label="Pieces"
        used={usage.pieces_used}
        limit={usage.pieces_limit}
        text={`${usage.pieces_used} of ${usage.pieces_limit}`}
      />
      <Meter
        label="Storage"
        used={usage.bytes_used}
        limit={usage.bytes_limit}
        text={`${formatBytes(usage.bytes_used)} of ${formatBytes(usage.bytes_limit)}`}
      />
    </div>
  )
}
