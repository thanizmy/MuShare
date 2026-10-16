import { EyeOff, Globe, Lock } from 'lucide-react'

import type { PieceStatus } from '../../types/studio'

const CHIPS = {
  draft: { label: 'Draft', hint: 'Only you can see this', icon: Lock, tone: 'text-ink-muted' },
  published: {
    label: 'Published',
    hint: 'Everyone can find and play this',
    icon: Globe,
    tone: 'text-accent-soft',
  },
  hidden: {
    label: 'Hidden',
    hint: 'Pulled from the catalog',
    icon: EyeOff,
    tone: 'text-ink-muted',
  },
} satisfies Record<PieceStatus, unknown>

/** Status as icon + word, never colour alone. */
export function StatusChip({ status }: { status: PieceStatus }) {
  const { label, hint, icon: Icon, tone } = CHIPS[status]
  return (
    <span
      title={hint}
      className={`inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}
