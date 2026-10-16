import { Disc3 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PageTitle } from '../components/layout/PageTitle'
import { CoverImage } from '../components/media/CoverImage'
import { PlayAllButton } from '../components/media/PlayAllButton'
import { TrackList } from '../components/media/TrackList'
import { ShareToStoryButton } from '../components/stories/ShareToStoryButton'
import { useAlbum } from '../hooks/useCatalog'
import { formatTotalDuration } from '../lib/format'

export default function AlbumPage() {
  const { albumId = '' } = useParams()
  const query = useAlbum(albumId)

  return (
    <QueryBoundary
      query={query}
      skeleton={
        <div className="space-y-8">
          <div className="flex items-end gap-6">
            <div className="skeleton h-40 w-40 md:h-52 md:w-52" />
            <div className="skeleton h-10 w-64" />
          </div>
          <RowSkeletons />
        </div>
      }
      notFound={
        <EmptyState icon={Disc3} title="Album not found" description="It may have been removed, or hidden by the artist." />
      }
    >
      {(album) => {
        const total = album.tracks.reduce((sum, t) => sum + t.duration_sec, 0)
        return (
          <div className="space-y-8">
            <PageTitle title={album.title} />
            <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <CoverImage
                src={album.cover_url}
                alt={`${album.title} cover`}
                className="h-44 w-44 shrink-0 rounded-card shadow-glass md:h-56 md:w-56"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Album</p>
                <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">
                  {album.title}
                </h1>
                <p className="mt-3 text-sm text-ink-muted">
                  <Link
                    to={`/artists/${album.artist.id}`}
                    className="font-semibold text-ink hover:underline"
                  >
                    {album.artist.name}
                  </Link>
                  {album.release_year ? ` · ${album.release_year}` : ''} · {album.tracks.length}{' '}
                  {album.tracks.length === 1 ? 'song' : 'songs'}, {formatTotalDuration(total)}
                </p>
              </div>
            </header>
            <div className="flex flex-wrap items-center gap-3">
              <PlayAllButton tracks={album.tracks} />
              <ShareToStoryButton subject={{ kind: 'album', album }} />
            </div>
            <TrackList tracks={album.tracks} label={`Tracks on ${album.title}`} showCover={false} />
          </div>
        )
      }}
    </QueryBoundary>
  )
}
