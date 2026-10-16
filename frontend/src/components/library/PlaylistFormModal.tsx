import { useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { FormError } from '../auth/FormError'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'

export interface PlaylistFormValues {
  title: string
  description: string
  is_public: boolean
}

interface PlaylistFormModalProps {
  open: boolean
  heading: string
  submitLabel: string
  initial?: Partial<PlaylistFormValues>
  onSubmit: (values: PlaylistFormValues) => Promise<void>
  onClose: () => void
}

function PlaylistForm({
  submitLabel,
  initial,
  onSubmit,
  onClose,
}: Omit<PlaylistFormModalProps, 'open' | 'heading'>) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const trimmed = title.trim()
  const titleError = !trimmed
    ? 'Give your playlist a name'
    : trimmed.length > 120
      ? 'Use 120 characters or fewer'
      : undefined
  const descriptionError = description.trim().length > 500 ? 'Use 500 characters or fewer' : undefined

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (busy || titleError || descriptionError) return
    setBusy(true)
    setServerError(null)
    try {
      await onSubmit({ title: trimmed, description: description.trim(), is_public: isPublic })
      onClose()
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormError message={serverError} />
      <TextField
        label="Name"
        value={title}
        maxLength={120}
        error={touched ? titleError : undefined}
        onValueChange={setTitle}
        onBlur={() => setTouched(true)}
      />
      <div>
        <label htmlFor="playlist-description" className="mb-1.5 block text-sm font-semibold">
          Description <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id="playlist-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={descriptionError ? true : undefined}
          className="w-full resize-none rounded-control border border-line bg-elevated px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint hover:bg-hover focus:border-accent focus:bg-hover"
        />
        {descriptionError && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {descriptionError}
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          <span className="font-semibold">Public playlist</span>
          <span className="block text-xs text-ink-muted">
            Other MuShare users can view it with the link.
          </span>
        </span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

/** Create / edit dialog. The form mounts only while open, so each opening starts fresh. */
export function PlaylistFormModal({ open, heading, ...form }: PlaylistFormModalProps) {
  return (
    <Modal open={open} title={heading} onClose={form.onClose}>
      <PlaylistForm {...form} />
    </Modal>
  )
}
