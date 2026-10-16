import { Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Track } from '../../types/catalog'
import { CoverImage } from './CoverImage'

interface TrackCardProps {
  track: Track
  isCurrent: boolean
  isPlaying: boolean
  onToggle: () => void
}

export function TrackCard({ track, isCurrent, isPlaying, onToggle }: TrackCardProps) {
  const hidden = track.is_hidden === true
  const active = !hidden && isCurrent && isPlaying
  const Icon = active ? Pause : Play

  return (
    <article className={`group w-40 shrink-0 snap-start rounded-card bg-surface p-3 transition hover:bg-elevated sm:w-44 ${hidden ? 'opacity-60' : ''}`}>
      <div className="relative">
        <CoverImage src={track.album.cover_url} className="aspect-square w-full rounded-control" />
        {!hidden && (
        <button
          type="button"
          aria-label={`${active ? 'Pause' : 'Play'} ${track.title}`}
          onClick={onToggle}
          className={`absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-black shadow-glass transition hover:scale-105 hover:bg-accent-soft focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 ${
            active ? 'opacity-100' : 'translate-y-2 opacity-0'
          }`}
        >
          <Icon className="h-5 w-5" fill="currentColor" aria-hidden />
        </button>
        )}
      </div>
      <p className={`mt-3 truncate text-sm font-bold ${isCurrent ? 'text-accent' : ''}`}>
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
    </article>
  )
}
