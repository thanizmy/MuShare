import { SearchX, Search as SearchIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { AlbumCard } from '../components/media/AlbumCard'
import { ArtistCard } from '../components/media/ArtistCard'
import { TrackList } from '../components/media/TrackList'
import { UserCard } from '../components/social/UserCard'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useSearch } from '../hooks/useCatalog'
import { useUserSearch } from '../hooks/useSocial'

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

export default function SearchPage() {
  useDocumentTitle('Search')
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim()
  const results = useSearch(query)
  const people = useUserSearch(query)

  if (!query) {
    return (
      <EmptyState
        icon={SearchIcon}
        title="Search MuShare"
        description="Find tracks, artists, albums and people. Results appear as you type."
      />
    )
  }

  const matchedPeople = people.data ?? []
  // People load separately; don't declare "no results" while they might still turn up.
  const noPeople = !people.isPending && matchedPeople.length === 0

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold tracking-tight">
        Results for <span className="text-accent-soft">“{query}”</span>
      </h1>
      <QueryBoundary
        query={results}
        skeleton={<RowSkeletons />}
        empty={{
          when: (r) => r.tracks.length + r.artists.length + r.albums.length === 0 && noPeople,
          node: (
            <EmptyState
              icon={SearchX}
              title="No results"
              description={`Nothing matched “${query}”. Check the spelling or try a different search.`}
            />
          ),
        }}
      >
        {(r) => (
          <>
            {r.tracks.length > 0 && (
              <section aria-label="Tracks" className="space-y-3">
                <h2 className="text-xl font-bold">Tracks</h2>
                <TrackList tracks={r.tracks} label="Track results" />
              </section>
            )}
            {r.artists.length > 0 && (
              <section aria-label="Artists" className="space-y-3">
                <h2 className="text-xl font-bold">Artists</h2>
                <div className={GRID}>
                  {r.artists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} className="w-full" />
                  ))}
                </div>
              </section>
            )}
            {r.albums.length > 0 && (
              <section aria-label="Albums" className="space-y-3">
                <h2 className="text-xl font-bold">Albums</h2>
                <div className={GRID}>
                  {r.albums.map((album) => (
                    <AlbumCard key={album.id} album={album} className="w-full" />
                  ))}
                </div>
              </section>
            )}
            {matchedPeople.length > 0 && (
              <section aria-label="People" className="space-y-3">
                <h2 className="text-xl font-bold">People</h2>
                <ul aria-label="People results" className="grid gap-2 md:grid-cols-2">
                  {matchedPeople.map((user) => (
                    <UserCard key={user.id} user={user} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  )
}
