import { Link } from 'react-router-dom'

import type { ArtistSummary } from '../../types/catalog'
import { CoverImage } from './CoverImage'

export function ArtistCard({ artist, className = 'w-40 shrink-0 snap-start sm:w-44' }: { artist: ArtistSummary; className?: string }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className={`block rounded-card bg-surface p-3 text-center transition hover:bg-elevated ${className}`}
    >
      <CoverImage src={artist.image_url} className="aspect-square w-full rounded-full" />
      <p className="mt-3 truncate text-sm font-bold">{artist.name}</p>
      <p className="text-xs text-ink-muted">Artist</p>
    </Link>
  )
}
