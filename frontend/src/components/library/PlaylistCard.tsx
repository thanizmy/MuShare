import { ListMusic } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { PlaylistSummary } from '../../types/library'
import { CoverImage } from '../media/CoverImage'

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link
      to={`/playlists/${playlist.id}`}
      className="block rounded-card bg-surface p-3 transition hover:bg-elevated"
    >
      {playlist.cover_url ? (
        <CoverImage src={playlist.cover_url} className="aspect-square w-full rounded-control" />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center rounded-control bg-elevated">
          <ListMusic className="h-1/3 w-1/3 text-ink-faint" aria-hidden />
        </span>
      )}
      <p className="mt-3 truncate text-sm font-bold">{playlist.title}</p>
      <p className="truncate text-xs text-ink-muted">
        {playlist.track_count} {playlist.track_count === 1 ? 'song' : 'songs'}
        {playlist.is_public ? ' · Public' : ''}
      </p>
    </Link>
  )
}
