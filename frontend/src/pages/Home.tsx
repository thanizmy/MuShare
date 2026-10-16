import { Disc3, Headphones, Mic2 } from 'lucide-react'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { CardSkeletons } from '../components/feedback/Skeletons'
import { AlbumCard } from '../components/media/AlbumCard'
import { ArtistCard } from '../components/media/ArtistCard'
import { Carousel } from '../components/media/Carousel'
import { StoriesRow } from '../components/stories/StoriesRow'
import { TrackCard } from '../components/media/TrackCard'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAlbums, useArtists, usePopularTracks } from '../hooks/useCatalog'
import { useRecentlyPlayed } from '../hooks/useLibrary'
import { useAuth } from '../hooks/useAuth'
import { useTrackPlayback } from '../hooks/usePlayer'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function PopularTracks() {
  const query = usePopularTracks()
  const { currentTrackId, isPlaying, play, togglePlay } = useTrackPlayback()
  const title = 'Popular tracks'

  return (
    <QueryBoundary
      query={query}
      title={title}
      skeleton={
        <Carousel title={title}>
          <CardSkeletons />
        </Carousel>
      }
      empty={{
        when: (tracks) => tracks.length === 0,
        node: <EmptyState icon={Headphones} title="No tracks yet" description="The catalog is empty." />,
      }}
    >
      {(tracks) => (
        <Carousel title={title}>
          {tracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              isCurrent={track.id === currentTrackId}
              isPlaying={isPlaying}
              onToggle={() => (track.id === currentTrackId ? togglePlay() : play(track, tracks))}
            />
          ))}
        </Carousel>
      )}
    </QueryBoundary>
  )
}

/** Shown only once the listener has history; a brand-new account just doesn't see it. */
function RecentlyPlayed() {
  const { data } = useRecentlyPlayed()
  const { currentTrackId, isPlaying, play, togglePlay } = useTrackPlayback()
  if (!data || data.length === 0) return null

  return (
    <Carousel title="Recently played">
      {data.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          isCurrent={track.id === currentTrackId}
          isPlaying={isPlaying}
          onToggle={() => (track.id === currentTrackId ? togglePlay() : play(track, data))}
        />
      ))}
    </Carousel>
  )
}

function NewAlbums() {
  const query = useAlbums()
  const title = 'New albums'

  return (
    <QueryBoundary
      query={query}
      title={title}
      skeleton={
        <Carousel title={title}>
          <CardSkeletons />
        </Carousel>
      }
      empty={{
        when: (albums) => albums.length === 0,
        node: <EmptyState icon={Disc3} title="No albums yet" description="The catalog is empty." />,
      }}
    >
      {(albums) => (
        <Carousel title={title}>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Carousel>
      )}
    </QueryBoundary>
  )
}

function FeaturedArtists() {
  const query = useArtists()
  const title = 'Artists'

  return (
    <QueryBoundary
      query={query}
      title={title}
      skeleton={
        <Carousel title={title}>
          <CardSkeletons />
        </Carousel>
      }
      empty={{
        when: (artists) => artists.length === 0,
        node: <EmptyState icon={Mic2} title="No artists yet" description="The catalog is empty." />,
      }}
    >
      {(artists) => (
        <Carousel title={title}>
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </Carousel>
      )}
    </QueryBoundary>
  )
}

export default function HomePage() {
  useDocumentTitle('Home')
  const { user } = useAuth()

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-extrabold tracking-tight">
        {greeting(new Date().getHours())}, {user?.username}
      </h1>
      <StoriesRow />
      <RecentlyPlayed />
      <PopularTracks />
      <NewAlbums />
      <FeaturedArtists />
    </div>
  )
}
