import { AudioWaveform, EyeOff, ImagePlus, Pencil, Trash2, Upload } from 'lucide-react'
import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { FormError } from '../components/auth/FormError'
import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PageTitle } from '../components/layout/PageTitle'
import { CoverImage } from '../components/media/CoverImage'
import { PlayPieceButton } from '../components/studio/PlayPieceButton'
import { PublishDialog } from '../components/studio/PublishDialog'
import { StatusChip } from '../components/studio/StatusChip'
import { ShareToStoryButton } from '../components/stories/ShareToStoryButton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal } from '../components/ui/Modal'
import { TextField } from '../components/ui/TextField'
import { useAuth } from '../hooks/useAuth'
import {
  useDeletePiece,
  usePiece,
  useRemoveCover,
  useSetCover,
  useStudioUsage,
  useUnpublishPiece,
  useUpdatePiece,
} from '../hooks/useStudio'
import { formatBytes, formatTime } from '../lib/format'
import { pieceToStoryPiece } from '../lib/pieceTrack'
import { toast } from '../store/toastStore'
import type { Piece } from '../types/studio'

const STATUS_NOTE: Record<Piece['status'], string> = {
  draft:
    'Only you can see and hear this. Publish it to add it to the catalog, or share it to a story for your followers without publishing.',
  published: 'Published. Everyone can find, play and save this.',
  hidden:
    'Hidden from the catalog. People who saved it see it greyed out as “Hidden by the artist”. Publish it again to bring it back.',
}

function EditForm({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const update = useUpdatePiece(piece.id)
  const [title, setTitle] = useState(piece.title)
  const [description, setDescription] = useState(piece.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const trimmed = title.trim()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!trimmed || update.isPending) return
    setError(null)
    try {
      await update.mutateAsync({ title: trimmed, description: description.trim() })
      onClose()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormError message={error} />
      <TextField
        label="Title"
        value={title}
        maxLength={120}
        error={trimmed ? undefined : 'A piece needs a title'}
        onValueChange={setTitle}
      />
      <div>
        <label htmlFor="edit-piece-description" className="mb-1.5 block text-sm font-semibold">
          Description <span className="font-normal text-ink-muted">(only you see it)</span>
        </label>
        <textarea
          id="edit-piece-description"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-control border border-line bg-elevated px-3.5 py-2.5 text-sm text-ink hover:bg-hover focus:border-accent focus:bg-hover"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!trimmed || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function PieceView({ piece }: { piece: Piece }) {
  const { user } = useAuth()
  const usage = useStudioUsage()
  const navigate = useNavigate()
  const setCover = useSetCover(piece.id)
  const removeCover = useRemoveCover(piece.id)
  const unpublish = useUnpublishPiece(piece.id)
  const deletion = useDeletePiece(piece.id)
  const coverInput = useId()
  const [editing, setEditing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirming, setConfirming] = useState<'unpublish' | 'delete' | null>(null)

  const maxCover = usage.data?.max_cover_bytes ?? 3 * 1024 * 1024
  const artistName = usage.data?.artist_name ?? user?.username ?? 'you'

  const onCoverChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow choosing the same file again later
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Cover art must be a JPEG, PNG or WebP image.')
    if (file.size > maxCover) {
      return toast.error(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(maxCover)}.`)
    }
    setCover.mutate(file)
  }

  return (
    <div className="space-y-8">
      <PageTitle title={piece.title} />
      <Link to="/studio" className="text-sm text-ink-muted hover:text-ink">
        ← My Studio
      </Link>

      <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <CoverImage
          src={piece.cover_url}
          alt={`${piece.title} cover`}
          className="h-44 w-44 shrink-0 rounded-card shadow-glass md:h-56 md:w-56"
        />
        <div className="min-w-0 space-y-3">
          <StatusChip status={piece.status} />
          <h1 className="break-words text-4xl font-extrabold tracking-tight md:text-5xl">
            {piece.title}
          </h1>
          <p className="text-sm text-ink-muted">
            {formatTime(piece.duration_sec)} · {formatBytes(piece.audio_bytes)} · by {artistName}
          </p>
          {piece.description && <p className="max-w-xl text-sm text-ink-muted">{piece.description}</p>}
        </div>
      </header>

      <p className="max-w-2xl rounded-card bg-surface p-4 text-sm text-ink-muted">
        {STATUS_NOTE[piece.status]}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <PlayPieceButton piece={piece} variant="full" />
        {piece.status === 'published' ? (
          <button type="button" className="btn-ghost" onClick={() => setConfirming('unpublish')}>
            <EyeOff className="h-4 w-4" aria-hidden />
            Unpublish
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setPublishing(true)}>
            <Upload className="h-4 w-4" aria-hidden />
            {piece.status === 'hidden' ? 'Publish again' : 'Publish'}
          </button>
        )}
        <ShareToStoryButton
          subject={{
            kind: 'piece',
            ownerName: artistName,
            piece: pieceToStoryPiece(piece),
          }}
        />
        <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit details
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming('delete')}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </button>
      </div>

      <section aria-label="Cover art" className="flex flex-wrap items-center gap-3">
        <label htmlFor={coverInput} className="btn-ghost cursor-pointer">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {piece.cover_url ? 'Change cover' : 'Add cover art'}
        </label>
        <input
          id={coverInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Cover art file"
          disabled={setCover.isPending}
          onChange={onCoverChosen}
        />
        {piece.cover_url && (
          <button
            type="button"
            className="btn-ghost"
            disabled={removeCover.isPending}
            onClick={() => removeCover.mutate()}
          >
            Remove cover
          </button>
        )}
      </section>

      {piece.status === 'published' && piece.album_id && piece.artist_id && (
        <p className="flex flex-wrap gap-x-5 text-sm">
          <Link to={`/albums/${piece.album_id}`} className="font-semibold hover:underline">
            View it in the catalog
          </Link>
          <Link to={`/artists/${piece.artist_id}`} className="font-semibold hover:underline">
            View your artist page
          </Link>
        </p>
      )}

      <Modal open={editing} title="Edit details" onClose={() => setEditing(false)}>
        <EditForm piece={piece} onClose={() => setEditing(false)} />
      </Modal>
      <PublishDialog open={publishing} piece={piece} onClose={() => setPublishing(false)} />
      <ConfirmDialog
        open={confirming === 'unpublish'}
        title="Unpublish this piece?"
        message="It leaves search and your artist page right away. People who saved it will see it greyed out as “Hidden by the artist” and won't be able to play it. You can publish it again any time."
        confirmLabel="Unpublish"
        busy={unpublish.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          try {
            await unpublish.mutateAsync()
          } finally {
            setConfirming(null)
          }
        }}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        title="Delete this piece?"
        message={
          piece.status === 'draft'
            ? `“${piece.title}” and its files will be deleted permanently. Any stories using it will disappear too.`
            : `“${piece.title}” and its files will be deleted permanently. It will also disappear from other people's playlists and favorites, and from any stories using it. To keep it as a hidden reference instead, unpublish it.`
        }
        confirmLabel="Delete"
        busy={deletion.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          try {
            await deletion.mutateAsync()
            navigate('/studio', { replace: true })
          } catch {
            setConfirming(null) // the hook already showed an error toast
          }
        }}
      />
    </div>
  )
}

export default function StudioPiecePage() {
  const { pieceId = '' } = useParams()
  const query = usePiece(pieceId)

  return (
    <QueryBoundary
      query={query}
      skeleton={
        <div className="space-y-8">
          <div className="flex items-end gap-6">
            <div className="skeleton h-44 w-44 md:h-56 md:w-56" />
            <div className="skeleton h-10 w-64" />
          </div>
          <RowSkeletons count={2} />
        </div>
      }
      notFound={
        <EmptyState
          icon={AudioWaveform}
          title="Piece not found"
          description="It may have been deleted, or it isn't yours."
          action={
            <Link to="/studio" className="btn-primary">
              Back to My Studio
            </Link>
          }
        />
      }
    >
      {(piece) => <PieceView piece={piece} />}
    </QueryBoundary>
  )
}
