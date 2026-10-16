import { FileAudio, ImagePlus, Upload, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { useStudioUsage, useUploadPiece } from '../../hooks/useStudio'
import { formatBytes } from '../../lib/format'
import { toast } from '../../store/toastStore'
import { FormError } from '../auth/FormError'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|wav)$/i

function titleFromFilename(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function UploadForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const usage = useStudioUsage()
  const upload = useUploadPiece()
  const audioInput = useId()
  const coverInput = useId()
  const [audio, setAudio] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleTouched = useRef(false)

  const limits = usage.data
  const maxAudio = limits?.max_audio_bytes ?? 30 * 1024 * 1024
  const maxCover = limits?.max_cover_bytes ?? 3 * 1024 * 1024
  const uploading = upload.isPending

  useEffect(() => {
    if (!cover) return setCoverPreview(null)
    const url = URL.createObjectURL(cover)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [cover])

  const pickAudio = (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!AUDIO_EXTENSIONS.test(file.name) && !file.type.startsWith('audio/')) {
      setAudio(null)
      return setError('Choose an MP3, M4A, OGG or WAV file.')
    }
    if (file.size > maxAudio) {
      setAudio(null)
      return setError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxAudio)}.`)
    }
    setAudio(file)
    // Offer the file's name as a starting title, until the person writes their own.
    if (!titleTouched.current) setTitle(titleFromFilename(file.name))
  }

  const pickCover = (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) return setError('Cover art must be a JPEG, PNG or WebP image.')
    if (file.size > maxCover) {
      return setError(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(maxCover)}.`)
    }
    setCover(file)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    pickAudio(event.dataTransfer.files[0])
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!audio || uploading) return
    setError(null)
    try {
      const piece = await upload.mutateAsync({ audio, title, description, cover })
      toast.success('Uploaded. It stays private until you publish it.')
      onClose()
      navigate(`/studio/${piece.id}`)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof ApiError ? caught.message : 'The upload failed. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={error} />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-card border-2 border-dashed p-5 text-center transition ${
          dragging ? 'border-accent bg-accent/10' : 'border-line'
        }`}
      >
        {audio ? (
          <div className="flex items-center gap-3 text-left">
            <FileAudio className="h-8 w-8 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{audio.name}</p>
              <p className="text-xs text-ink-muted">{formatBytes(audio.size)}</p>
            </div>
            <button
              type="button"
              aria-label="Remove audio file"
              disabled={uploading}
              onClick={() => setAudio(null)}
              className="rounded-full p-1.5 text-ink-muted hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-8 w-8 text-ink-muted" aria-hidden />
            <p className="mt-2 text-sm">Drag an audio file here, or</p>
            <label htmlFor={audioInput} className="btn-ghost mt-3 cursor-pointer">
              Choose a file
            </label>
            <input
              id={audioInput}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav"
              className="sr-only"
              aria-label="Audio file"
              onChange={(e) => pickAudio(e.target.files?.[0])}
            />
            <p className="mt-3 text-xs text-ink-muted">
              MP3, M4A, OGG or WAV · up to {formatBytes(maxAudio)}
              {limits ? ` · ${Math.floor(limits.max_duration_sec / 60)} minutes` : ''}
            </p>
          </>
        )}
      </div>

      <TextField
        label="Title"
        value={title}
        maxLength={120}
        placeholder="Untitled"
        onValueChange={(value) => {
          titleTouched.current = true
          setTitle(value)
        }}
      />

      <div>
        <label htmlFor="piece-description" className="mb-1.5 block text-sm font-semibold">
          Description <span className="font-normal text-ink-muted">(optional, only you see it)</span>
        </label>
        <textarea
          id="piece-description"
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-control border border-line bg-elevated px-3.5 py-2.5 text-sm text-ink hover:bg-hover focus:border-accent focus:bg-hover"
        />
      </div>

      <div className="flex items-center gap-4">
        {coverPreview ? (
          <img src={coverPreview} alt="Cover preview" className="h-16 w-16 rounded-control object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-control bg-elevated">
            <ImagePlus className="h-6 w-6 text-ink-faint" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <label htmlFor={coverInput} className="btn-ghost cursor-pointer px-4! py-1.5!">
            {cover ? 'Change cover' : 'Add cover art'}
          </label>
          <input
            id={coverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Cover art"
            onChange={(e) => pickCover(e.target.files?.[0])}
          />
          <p className="mt-1 text-xs text-ink-muted">Optional · JPEG, PNG or WebP</p>
        </div>
      </div>

      {uploading && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
            <span>Uploading…</span>
            <span className="tabular-nums">{Math.round(upload.progress * 100)}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(upload.progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${upload.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Uploads are private. Nobody else can see or hear a piece until you publish it or share it
        to your story.
      </p>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (uploading) upload.cancel()
            else onClose()
          }}
        >
          {uploading ? 'Cancel upload' : 'Cancel'}
        </button>
        <button type="submit" className="btn-primary" disabled={!audio || uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  )
}

export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Upload a piece" onClose={onClose}>
      <UploadForm onClose={onClose} />
    </Modal>
  )
}
