import { Mic2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PageTitle } from '../components/layout/PageTitle'
import { AlbumCard } from '../components/media/AlbumCard'
import { CoverImage } from '../components/media/CoverImage'
import { PlayAllButton } from '../components/media/PlayAllButton'
import { TrackList } from '../components/media/TrackList'
import { ShareToStoryButton } from '../components/stories/ShareToStoryButton'
import { useArtist } from '../hooks/useCatalog'

export default function ArtistPage() {
  const { artistId = '' } = useParams()
  const query = useArtist(artistId)

  return (
    <QueryBoundary
      query={query}
      skeleton={
        <div className="space-y-8">
          <div className="flex items-end gap-6">
            <div className="skeleton h-40 w-40 rounded-full md:h-52 md:w-52" />
            <div className="skeleton h-10 w-64" />
          </div>
          <RowSkeletons />
        </div>
      }
      notFound={
        <EmptyState icon={Mic2} title="Artist not found" description="They may have been removed, or hidden everything they published." />
      }
    >
      {(artist) => (
        <div className="space-y-8">
          <PageTitle title={artist.name} />
          <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <CoverImage
              src={artist.image_url}
              alt={artist.name}
              className="h-44 w-44 shrink-0 rounded-full shadow-glass md:h-56 md:w-56"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Artist</p>
              <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-6xl">
                {artist.name}
              </h1>
              {artist.bio && <p className="mt-3 max-w-xl text-sm text-ink-muted">{artist.bio}</p>}
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3">
            <PlayAllButton tracks={artist.top_tracks} />
            <ShareToStoryButton subject={{ kind: 'artist', artist }} />
          </div>

          {artist.top_tracks.length > 0 && (
            <section aria-label="Popular" className="space-y-3">
              <h2 className="text-xl font-bold">Popular</h2>
              <TrackList tracks={artist.top_tracks} label={`Popular tracks by ${artist.name}`} />
            </section>
          )}

          {artist.albums.length > 0 && (
            <section aria-label="Albums" className="space-y-3">
              <h2 className="text-xl font-bold">Albums</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {artist.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} className="w-full" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </QueryBoundary>
  )
}
