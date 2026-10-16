import { ArrowDown, ArrowUp, ListMusic, Lock, Globe, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PageTitle } from '../components/layout/PageTitle'
import { PlaylistFormModal } from '../components/library/PlaylistFormModal'
import { CoverImage } from '../components/media/CoverImage'
import { PlayAllButton } from '../components/media/PlayAllButton'
import { TrackList } from '../components/media/TrackList'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { MenuItem } from '../components/ui/PopoverMenu'
import { useAuth } from '../hooks/useAuth'
import {
  useDeletePlaylist,
  usePlaylist,
  useRemoveFromPlaylist,
  useReorderPlaylist,
  useUpdatePlaylist,
} from '../hooks/useLibrary'
import { formatTotalDuration } from '../lib/format'
import type { PlaylistDetail } from '../types/library'

function PlaylistView({ playlist }: { playlist: PlaylistDetail }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOwner = user?.id === playlist.owner.id
  const update = useUpdatePlaylist(playlist.id)
  const remove = useRemoveFromPlaylist(playlist.id)
  const reorder = useReorderPlaylist(playlist.id)
  const deletion = useDeletePlaylist(playlist.id)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const tracks = playlist.entries.map((e) => e.track)
  const entryIdOf = new Map(playlist.entries.map((e) => [e.track.id, e.entry_id]))
  const total = tracks.reduce((sum, t) => sum + t.duration_sec, 0)
  const VisibilityIcon = playlist.is_public ? Globe : Lock

  const move = (index: number, delta: -1 | 1) => {
    const ids = playlist.entries.map((e) => e.entry_id)
    ;[ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <div className="space-y-8">
      <PageTitle title={playlist.title} />
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
        {playlist.cover_url ? (
          <CoverImage
            src={playlist.cover_url}
            alt=""
            className="h-44 w-44 shrink-0 rounded-card shadow-glass md:h-56 md:w-56"
          />
        ) : (
          <span className="flex h-44 w-44 shrink-0 items-center justify-center rounded-card bg-elevated shadow-glass md:h-56 md:w-56">
            <ListMusic className="h-1/3 w-1/3 text-ink-faint" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <VisibilityIcon className="h-3 w-3" aria-hidden />
            {playlist.is_public ? 'Public playlist' : 'Private playlist'}
          </p>
          <h1 className="mt-1 break-words text-4xl font-extrabold tracking-tight md:text-5xl">
            {playlist.title}
          </h1>
          {playlist.description && (
            <p className="mt-3 max-w-xl text-sm text-ink-muted">{playlist.description}</p>
          )}
          <p className="mt-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">{playlist.owner.username}</span> ·{' '}
            {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            {tracks.length > 0 ? `, ${formatTotalDuration(total)}` : ''}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <PlayAllButton tracks={tracks} />
        {isOwner && (
          <>
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit details
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </>
        )}
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="This playlist is empty"
          description={
            isOwner
              ? 'Open the … menu on any track and choose this playlist to add it.'
              : 'No tracks have been added yet.'
          }
        />
      ) : (
        <TrackList
          tracks={tracks}
          label={`Tracks in ${playlist.title}`}
          menuItems={
            isOwner
              ? (track, close) => (
                  <MenuItem
                    onClick={() => {
                      remove.mutate(entryIdOf.get(track.id)!)
                      close()
                    }}
                  >
                    Remove from this playlist
                  </MenuItem>
                )
              : undefined
          }
          trailing={
            isOwner
              ? (track, index) => (
                  <span className="ml-1 flex">
                    <button
                      type="button"
                      aria-label={`Move ${track.title} up`}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                      className="rounded-full p-1.5 text-ink-muted hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${track.title} down`}
                      disabled={index === tracks.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                      className="rounded-full p-1.5 text-ink-muted hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                )
              : undefined
          }
        />
      )}

      <PlaylistFormModal
        open={editing}
        heading="Edit playlist"
        submitLabel="Save"
        initial={{
          title: playlist.title,
          description: playlist.description ?? '',
          is_public: playlist.is_public,
        }}
        onClose={() => setEditing(false)}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
        }}
      />
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete playlist?"
        message={`“${playlist.title}” will be permanently deleted. The tracks themselves stay in the catalog.`}
        confirmLabel="Delete"
        busy={deletion.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          try {
            await deletion.mutateAsync()
            navigate('/library', { replace: true })
          } catch {
            setConfirmingDelete(false) // the hook already showed an error toast
          }
        }}
      />
    </div>
  )
}

export default function PlaylistPage() {
  const { playlistId = '' } = useParams()
  const query = usePlaylist(playlistId)

  return (
    <QueryBoundary
      query={query}
      skeleton={
        <div className="space-y-8">
          <div className="flex items-end gap-6">
            <div className="skeleton h-44 w-44 md:h-56 md:w-56" />
            <div className="skeleton h-10 w-64" />
          </div>
          <RowSkeletons />
        </div>
      }
      notFound={
        <EmptyState
          icon={ListMusic}
          title="Playlist not found"
          description="It may have been deleted, or it's private."
        />
      }
    >
      {(playlist) => <PlaylistView playlist={playlist} />}
    </QueryBoundary>
  )
}
