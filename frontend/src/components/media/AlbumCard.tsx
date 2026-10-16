import { Link } from 'react-router-dom'

import type { AlbumSummary } from '../../types/catalog'
import { CoverImage } from './CoverImage'

export function AlbumCard({ album, className = 'w-40 shrink-0 snap-start sm:w-44' }: { album: AlbumSummary; className?: string }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      className={`block rounded-card bg-surface p-3 transition hover:bg-elevated ${className}`}
    >
      <CoverImage src={album.cover_url} className="aspect-square w-full rounded-control" />
      <p className="mt-3 truncate text-sm font-bold">{album.title}</p>
      <p className="truncate text-xs text-ink-muted">
        {[album.release_year, album.artist.name].filter(Boolean).join(' · ')}
      </p>
    </Link>
  )
}
