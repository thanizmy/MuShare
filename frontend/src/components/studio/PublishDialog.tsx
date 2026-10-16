import { useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { usePublishPiece, useStudioUsage } from '../../hooks/useStudio'
import type { Piece } from '../../types/studio'
import { FormError } from '../auth/FormError'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'

function PublishForm({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const { user } = useAuth()
  const usage = useStudioUsage()
  const publish = usePublishPiece(piece.id)
  const [confirmed, setConfirmed] = useState(false)
  const [artistName, setArtistName] = useState(usage.data?.artist_name ?? user?.username ?? '')
  const [error, setError] = useState<string | null>(null)

  const name = artistName.trim()
  const nameError = !name ? 'Your artist name can’t be empty' : undefined
  const republishing = piece.status === 'hidden'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!confirmed || nameError || publish.isPending) return
    setError(null)
    try {
      await publish.mutateAsync({ artistName: name })
      onClose()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not publish. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={error} />

      <div className="space-y-2 text-sm text-ink-muted">
        <p>
          {republishing
            ? `Publishing brings “${piece.title}” back to the catalog.`
            : `Publishing adds “${piece.title}” to the catalog.`}{' '}
          After that:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Anyone on MuShare can find it in search, play it, like it and add it to playlists.</li>
          <li>It appears on your public artist page.</li>
          <li>
            You can unpublish whenever you like. People who saved it will see it greyed out as
            “Hidden by the artist”.
          </li>
        </ul>
      </div>

      <TextField
        label="Artist name"
        value={artistName}
        maxLength={100}
        error={nameError}
        hint="Shown on your artist page and next to your music."
        onValueChange={setArtistName}
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line p-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          <span className="font-semibold">I own the rights to this piece</span>
          <span className="block text-xs text-ink-muted">
            I made it, or I have permission to publish it, and I’m choosing to make it public.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={!confirmed || Boolean(nameError) || publish.isPending}
        >
          {publish.isPending ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </form>
  )
}

export function PublishDialog({
  open,
  piece,
  onClose,
}: {
  open: boolean
  piece: Piece
  onClose: () => void
}) {
  return (
    <Modal open={open} title="Publish to the catalog" onClose={onClose}>
      <PublishForm piece={piece} onClose={onClose} />
    </Modal>
  )
}
