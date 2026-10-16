import { Link } from 'react-router-dom'

import { isPrivateStudioTrack } from '../../lib/pieceTrack'
import type { Track } from '../../types/catalog'
import { CoverImage } from '../media/CoverImage'

interface NowPlayingProps {
  track: Track | null
  errorMessage: string | null
  coverClassName: string
}

export function NowPlaying({ track, errorMessage, coverClassName }: NowPlayingProps) {
  if (!track) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <CoverImage src={null} className={`${coverClassName} rounded-control`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Nothing playing</p>
          <p className="truncate text-xs text-ink-muted">Pick a track to start listening</p>
        </div>
      </div>
    )
  }

  // A private studio piece has no catalog page yet, so there is nothing to link to.
  if (isPrivateStudioTrack(track)) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <CoverImage src={track.album.cover_url} className={`${coverClassName} rounded-control`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          {errorMessage ? (
            <p role="alert" className="truncate text-xs text-danger">
              {errorMessage}
            </p>
          ) : (
            <p className="truncate text-xs text-ink-muted">{track.album.artist.name} · Private</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <CoverImage src={track.album.cover_url} className={`${coverClassName} rounded-control`} />
      <div className="min-w-0">
        <Link
          to={`/albums/${track.album.id}`}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {track.title}
        </Link>
        {errorMessage ? (
          <p role="alert" className="truncate text-xs text-danger">
            {errorMessage}
          </p>
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
  )
}
