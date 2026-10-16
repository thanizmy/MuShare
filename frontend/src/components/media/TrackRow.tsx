import { Pause, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { formatTime } from '../../lib/format'
import type { Track } from '../../types/catalog'
import { FavoriteButton } from '../library/FavoriteButton'
import { TrackActions } from '../library/TrackActions'
import { CoverImage } from './CoverImage'

interface TrackRowProps {
  track: Track
  /** 1-based position shown in the leading column. */
  index: number
  isCurrent: boolean
  isPlaying: boolean
  showCover?: boolean
  onToggle: () => void
  /** Extra "…" menu items for this context (e.g. remove from playlist). */
  menuItems?: (close: () => void) => ReactNode
  /** Extra controls after the menu (e.g. move up / down). */
  trailing?: ReactNode
}

export function TrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  showCover = true,
  onToggle,
  menuItems,
  trailing,
}: TrackRowProps) {
  const hidden = track.is_hidden === true
  const active = !hidden && isCurrent && isPlaying
  const Icon = active ? Pause : Play

  return (
    <li
      aria-current={isCurrent || undefined}
      className={`group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-2 hover:bg-white/10 md:grid-cols-[2.5rem_minmax(0,3fr)_minmax(0,2fr)_auto] ${
        isCurrent ? 'bg-white/5' : ''
      } ${hidden ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        aria-label={hidden ? `${track.title} is hidden by the artist` : `${active ? 'Pause' : 'Play'} ${track.title}`}
        disabled={hidden}
        onClick={onToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:hover:text-ink-muted"
      >
        <span
          className={`${active ? 'hidden' : hidden ? '' : 'group-hover:hidden group-focus-within:hidden'}`}
        >
          {index}
        </span>
        <Icon
          className={`h-4 w-4 ${active ? 'text-accent' : hidden ? 'hidden' : 'hidden group-hover:block group-focus-within:block'}`}
          fill="currentColor"
          aria-hidden
        />
      </button>

      <div className="flex min-w-0 items-center gap-3">
        {showCover && (
          <CoverImage src={track.album.cover_url} className="h-10 w-10 shrink-0 rounded-sm" />
        )}
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${isCurrent ? 'text-accent' : ''}`}>
            {track.title}
          </p>
          {hidden ? (
            <p className="truncate text-xs font-semibold text-ink-muted">Hidden by the artist</p>
          ) : (
            <Link
              to={`/artists/${track.album.artist.id}`}
              className="block truncate text-xs text-ink-muted hover:text-ink hover:underline"
            >
              {track.album.artist.name}
            </Link>
          )}
        </div>
      </div>

      {hidden ? (
        <span className="hidden truncate text-sm text-ink-muted md:block">{track.album.title}</span>
      ) : (
        <Link
          to={`/albums/${track.album.id}`}
          className="hidden truncate text-sm text-ink-muted hover:text-ink hover:underline md:block"
        >
          {track.album.title}
        </Link>
      )}

      <div className="flex items-center gap-0.5">
        <FavoriteButton track={track} />
        <span className="w-12 text-right text-sm tabular-nums text-ink-muted">
          {formatTime(track.duration_sec)}
        </span>
        <TrackActions track={track} extraItems={menuItems} />
        {trailing}
      </div>
    </li>
  )
}
