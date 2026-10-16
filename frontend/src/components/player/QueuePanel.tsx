import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'
import { formatTime } from '../../lib/format'
import { CoverImage } from '../media/CoverImage'
import type { Track } from '../../types/catalog'
import { Modal } from '../ui/Modal'

/** Slide-over listing what is playing now and what plays next, in play order. */
export function QueuePanel() {
  const open = useUiStore((s) => s.queueOpen)
  const close = useUiStore((s) => s.closeQueue)
  // Select stable pieces of state; deriving the list inside the selector would build a new
  // array every call and defeat shallow comparison.
  const { queue, order, position, jumpTo } = usePlayerStore(
    useShallow((s) => ({ queue: s.queue, order: s.order, position: s.position, jumpTo: s.jumpTo })),
  )
  const current = position >= 0 ? (queue[order[position]] ?? null) : null
  const upcoming = useMemo(
    () => order.slice(position + 1).map((index) => queue[index]),
    [queue, order, position],
  )

  return (
    <Modal open={open} onClose={close} title="Queue" variant="side">
      <div className="space-y-6">
        <section aria-label="Now playing">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-muted">
            Now playing
          </h3>
          {current ? (
            <QueueRow track={current} />
          ) : (
            <p className="text-sm text-ink-muted">Nothing playing.</p>
          )}
        </section>

        <section aria-label="Next up">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-muted">
            Next up
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing queued. Use “Add to queue” on any track.
            </p>
          ) : (
            <ol className="space-y-0.5">
              {upcoming.map((track, i) => (
                <li key={`${track.id}-${i}`}>
                  <button
                    type="button"
                    aria-label={`Play ${track.title}`}
                    onClick={() => jumpTo(position + 1 + i)}
                    className="block w-full rounded-control text-left hover:bg-white/10"
                  >
                    <QueueRow track={track} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  )
}

function QueueRow({ track }: { track: Track }) {
  // Spans, not divs: this row can sit inside a <button>.
  return (
    <span className="flex items-center gap-3 p-2">
      <CoverImage src={track.album.cover_url} className="h-10 w-10 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{track.title}</span>
        <span className="block truncate text-xs text-ink-muted">{track.album.artist.name}</span>
      </span>
      <span className="text-xs tabular-nums text-ink-muted">{formatTime(track.duration_sec)}</span>
    </span>
  )
}
