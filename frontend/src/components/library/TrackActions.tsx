import { MoreHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useAddToPlaylist, useCreatePlaylist, usePlaylists } from '../../hooks/useLibrary'
import { usePlayerStore } from '../../store/playerStore'
import { useStoryComposerStore } from '../../store/storyStores'
import { toast } from '../../store/toastStore'
import type { Track } from '../../types/catalog'
import type { PlaylistSummary } from '../../types/library'
import { MenuHeading, MenuItem, PopoverMenu } from '../ui/PopoverMenu'
import { PlaylistFormModal } from './PlaylistFormModal'

interface TrackActionsProps {
  track: Track
  /** Context-specific items, e.g. "Remove from this playlist". */
  extraItems?: (close: () => void) => ReactNode
}

function PlaylistChoices({
  onPick,
  onCreate,
}: {
  onPick: (playlist: PlaylistSummary) => void
  onCreate: () => void
}) {
  // Rendered only while the menu is open, so playlists load on demand.
  const playlists = usePlaylists()

  return (
    <>
      {playlists.isPending && <p className="px-3 py-2 text-sm text-ink-muted">Loading playlists…</p>}
      {playlists.isError && (
        <p role="alert" className="px-3 py-2 text-sm text-danger">
          Couldn&apos;t load your playlists.
        </p>
      )}
      {playlists.data?.map((playlist) => (
        <MenuItem key={playlist.id} onClick={() => onPick(playlist)}>
          {playlist.title}
        </MenuItem>
      ))}
      <MenuItem onClick={onCreate}>New playlist…</MenuItem>
    </>
  )
}

/** The "…" menu on a track: queue it, add it to a playlist, or create a playlist for it. */
export function TrackActions({ track, extraItems }: TrackActionsProps) {
  const enqueue = usePlayerStore((s) => s.enqueue)
  const openStoryComposer = useStoryComposerStore((s) => s.open)
  const [creating, setCreating] = useState(false)
  const createPlaylist = useCreatePlaylist()
  const addToPlaylist = useAddToPlaylist()

  // A hidden track can't be queued, shared or added anywhere new; the only thing left to
  // offer is what the surrounding page provides, such as removing it from this playlist.
  if (track.is_hidden && !extraItems) return null

  return (
    <>
      <PopoverMenu label={`More options for ${track.title}`} icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
        {(close) =>
          track.is_hidden ? (
            <>{extraItems?.(close)}</>
          ) : (
          <>
            <MenuItem
              onClick={() => {
                enqueue(track)
                toast.success(`Added “${track.title}” to queue`)
                close()
              }}
            >
              Add to queue
            </MenuItem>
            <MenuItem
              onClick={() => {
                openStoryComposer({ kind: 'track', track })
                close()
              }}
            >
              Share to story…
            </MenuItem>
            {extraItems?.(close)}
            <MenuHeading>Add to playlist</MenuHeading>
            <PlaylistChoices
              onPick={(playlist) => {
                addToPlaylist.mutate({ playlist, track })
                close()
              }}
              onCreate={() => {
                close()
                setCreating(true)
              }}
            />
          </>
          )
        }
      </PopoverMenu>
      <PlaylistFormModal
        open={creating}
        heading="Create playlist"
        submitLabel="Create and add"
        onClose={() => setCreating(false)}
        onSubmit={async (values) => {
          const playlist = await createPlaylist.mutateAsync(values)
          await addToPlaylist.mutateAsync({ playlist, track })
        }}
      />
    </>
  )
}
