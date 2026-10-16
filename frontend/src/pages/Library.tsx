import { Heart, ListMusic, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { CardSkeletons } from '../components/feedback/Skeletons'
import { PlaylistCard } from '../components/library/PlaylistCard'
import { PlaylistFormModal } from '../components/library/PlaylistFormModal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useCreatePlaylist, useFavoriteCount, usePlaylists } from '../hooks/useLibrary'

export default function LibraryPage() {
  useDocumentTitle('Your Library')
  const playlists = usePlaylists()
  const favoriteCount = useFavoriteCount()
  const createPlaylist = useCreatePlaylist()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const createButton = (
    <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      Create playlist
    </button>
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Your Library</h1>
        {createButton}
      </div>

      <Link
        to="/favorites"
        className="flex items-center gap-4 rounded-card bg-linear-to-br from-accent-deep to-surface p-5 transition hover:brightness-110"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-control bg-accent">
          <Heart className="h-7 w-7 text-black" fill="currentColor" aria-hidden />
        </span>
        <span>
          <span className="block text-lg font-bold">Liked Songs</span>
          <span className="block text-sm text-ink-muted">
            {favoriteCount.data === undefined
              ? 'Your favorite tracks'
              : `${favoriteCount.data} ${favoriteCount.data === 1 ? 'song' : 'songs'}`}
          </span>
        </span>
      </Link>

      <section aria-label="Your playlists" className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Playlists</h2>
        <QueryBoundary
          query={playlists}
          skeleton={
            <div className="flex gap-3 overflow-hidden">
              <CardSkeletons count={4} />
            </div>
          }
          empty={{
            when: (items) => items.length === 0,
            node: (
              <EmptyState
                icon={ListMusic}
                title="Create your first playlist"
                description="Collect tracks you love in one place. Add any track from its … menu."
                action={createButton}
              />
            ),
          }}
        >
          {(items) => (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          )}
        </QueryBoundary>
      </section>

      <PlaylistFormModal
        open={creating}
        heading="Create playlist"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (values) => {
          const playlist = await createPlaylist.mutateAsync(values)
          navigate(`/playlists/${playlist.id}`)
        }}
      />
    </div>
  )
}
