import { useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { useUpdateProfile } from '../../hooks/useSocial'
import type { UserProfile } from '../../types/social'
import { FormError } from '../auth/FormError'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'

const MAX_BIO = 300

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.length > 0
  } catch {
    return false
  }
}

function EditProfileForm({ profile, onClose }: { profile: UserProfile; onClose: () => void }) {
  const update = useUpdateProfile()
  const [bio, setBio] = useState(profile.bio ?? '')
  const [avatar, setAvatar] = useState(profile.avatar_url ?? '')
  const [serverError, setServerError] = useState<string | null>(null)

  const avatarError =
    avatar.trim() && !isHttpsUrl(avatar.trim()) ? 'Use an https:// image link' : undefined
  const bioError = bio.trim().length > MAX_BIO ? `Use ${MAX_BIO} characters or fewer` : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (update.isPending || avatarError || bioError) return
    setServerError(null)
    try {
      await update.mutateAsync({ bio: bio.trim() || null, avatar_url: avatar.trim() || null })
      onClose()
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not save. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormError message={serverError} />
      <div>
        <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-semibold">
          Bio
        </label>
        <textarea
          id="profile-bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-invalid={bioError ? true : undefined}
          className="w-full resize-none rounded-control border border-line bg-elevated px-3.5 py-2.5 text-sm text-ink hover:bg-hover focus:border-accent focus:bg-hover"
        />
        <p className={`mt-1 text-right text-xs ${bioError ? 'text-danger' : 'text-ink-faint'}`}>
          {bio.trim().length}/{MAX_BIO}
        </p>
      </div>
      <TextField
        label="Profile picture link"
        type="url"
        placeholder="https://…"
        value={avatar}
        error={avatarError}
        hint="Optional. Must be an https:// image link."
        onValueChange={setAvatar}
      />
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export function EditProfileModal({
  open,
  profile,
  onClose,
}: {
  open: boolean
  profile: UserProfile
  onClose: () => void
}) {
  return (
    <Modal open={open} title="Edit profile" onClose={onClose}>
      <EditProfileForm profile={profile} onClose={onClose} />
    </Modal>
  )
}
