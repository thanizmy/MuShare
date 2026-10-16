import { Heart } from 'lucide-react'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PlayAllButton } from '../components/media/PlayAllButton'
import { TrackList } from '../components/media/TrackList'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFavorites } from '../hooks/useLibrary'

export default function FavoritesPage() {
  useDocumentTitle('Liked Songs')
  const query = useFavorites()

  return (
    <div className="space-y-6">
      <header className="flex items-end gap-5">
        <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-card bg-linear-to-br from-accent to-accent-deep shadow-glass md:h-44 md:w-44">
          <Heart className="h-1/2 w-1/2 text-black" fill="currentColor" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Playlist</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">Liked Songs</h1>
          {query.data && (
            <p className="mt-3 text-sm text-ink-muted">
              {query.data.length} {query.data.length === 1 ? 'song' : 'songs'}
            </p>
          )}
        </div>
      </header>

      <QueryBoundary
        query={query}
        skeleton={<RowSkeletons />}
        empty={{
          when: (tracks) => tracks.length === 0,
          node: (
            <EmptyState
              icon={Heart}
              title="No liked songs yet"
              description="Tap the heart on any track and it will be saved here."
            />
          ),
        }}
      >
        {(tracks) => (
          <>
            <PlayAllButton tracks={tracks} />
            <TrackList tracks={tracks} label="Liked songs" />
          </>
        )}
      </QueryBoundary>
    </div>
  )
}
