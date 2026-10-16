import { Search } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '../../api/client'
import { useSearch } from '../../hooks/useCatalog'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useAuth } from '../../hooks/useAuth'
import { useCreateStory } from '../../hooks/useStories'
import { usePieces } from '../../hooks/useStudio'
import { STORY_GRADIENTS, gradientCss } from '../../lib/gradients'
import { pieceToStoryPiece } from '../../lib/pieceTrack'
import { displayForSubject, subjectToInput } from '../../lib/storyDisplay'
import { useStoryComposerStore } from '../../store/storyStores'
import type { StorySubject } from '../../types/stories'
import { FormError } from '../auth/FormError'
import { CoverImage } from '../media/CoverImage'
import { Modal } from '../ui/Modal'

const MAX_CAPTION = 280

function PickerGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
        {title}
      </h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

function PickerRow({
  subject,
  onPick,
}: {
  subject: StorySubject
  onPick: (subject: StorySubject) => void
}) {
  const display = displayForSubject(subject)
  return (
    <li>
      <button
        type="button"
        aria-label={`Choose ${display.title}`}
        onClick={() => onPick(subject)}
        className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-white/10"
      >
        <CoverImage
          src={display.imageUrl}
          className={`h-10 w-10 shrink-0 ${display.round ? 'rounded-full' : 'rounded-sm'}`}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{display.title}</span>
          <span className="block truncate text-xs text-ink-muted">
            {display.label === 'Artist' ? 'Artist' : `${display.label} · ${display.subtitle}`}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Search for anything shareable: tracks, albums or artists. */
function SubjectPicker({ onPick }: { onPick: (subject: StorySubject) => void }) {
  const [text, setText] = useState('')
  const query = useDebouncedValue(text, 250)
  const results = useSearch(query)
  const { tracks = [], albums = [], artists = [] } = results.data ?? {}

  // The person's own studio pieces, so unreleased music is one click away. They never appear
  // in the catalog search, because nothing private does.
  const { user } = useAuth()
  const pieces = usePieces()
  const needle = text.trim().toLowerCase()
  const myPieces = (pieces.data ?? [])
    .filter((p) => !needle || p.title.toLowerCase().includes(needle))
    .slice(0, 5)

  const nothing =
    results.isSuccess && tracks.length + albums.length + artists.length + myPieces.length === 0

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search for something to share"
          placeholder="Search for a track, album or artist"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-control border border-line bg-elevated py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent"
        />
      </div>
      {query.trim() && nothing && (
        <p className="px-1 text-sm text-ink-muted">Nothing matches “{query.trim()}”.</p>
      )}
      <div className="max-h-64 overflow-y-auto">
        {myPieces.length > 0 && (
          <PickerGroup title="My Studio">
            {myPieces.map((piece) => (
              <PickerRow
                key={piece.id}
                subject={{
                  kind: 'piece',
                  piece: pieceToStoryPiece(piece),
                  ownerName: user?.username ?? 'you',
                }}
                onPick={onPick}
              />
            ))}
          </PickerGroup>
        )}
        {tracks.length > 0 && (
          <PickerGroup title="Tracks">
            {tracks.map((track) => (
              <PickerRow key={track.id} subject={{ kind: 'track', track }} onPick={onPick} />
            ))}
          </PickerGroup>
        )}
        {albums.length > 0 && (
          <PickerGroup title="Albums">
            {albums.map((album) => (
              <PickerRow key={album.id} subject={{ kind: 'album', album }} onPick={onPick} />
            ))}
          </PickerGroup>
        )}
        {artists.length > 0 && (
          <PickerGroup title="Artists">
            {artists.map((artist) => (
              <PickerRow key={artist.id} subject={{ kind: 'artist', artist }} onPick={onPick} />
            ))}
          </PickerGroup>
        )}
      </div>
    </div>
  )
}

/** What followers can do from the story, in plain words. */
function linkHint(subject: StorySubject | null, href: string | null): string {
  if (!subject) return ''
  if (subject.kind === 'piece') {
    return href
      ? 'Followers can listen, and tap through to the album. '
      : 'Followers can listen, but there is no page to open until you publish it. '
  }
  return `Followers can tap through to the ${subject.kind === 'artist' ? 'artist page' : 'album'}. `
}

function ComposerForm({
  initialSubject,
  onClose,
}: {
  initialSubject: StorySubject | null
  onClose: () => void
}) {
  const create = useCreateStory()
  const [subject, setSubject] = useState<StorySubject | null>(initialSubject)
  const [caption, setCaption] = useState('')
  const [gradient, setGradient] = useState(STORY_GRADIENTS[0].value)
  const [serverError, setServerError] = useState<string | null>(null)

  const display = subject ? displayForSubject(subject) : null
  const captionLength = caption.trim().length
  const captionError = captionLength > MAX_CAPTION ? `Use ${MAX_CAPTION} characters or fewer` : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!subject || captionError || create.isPending) return
    setServerError(null)
    try {
      await create.mutateAsync({
        ...subjectToInput(subject),
        caption: caption.trim() || null,
        background_color: gradient,
      })
      onClose()
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Could not share. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={serverError} />

      {subject && display ? (
        <div className="flex items-center gap-3 rounded-card bg-elevated p-3">
          <CoverImage
            src={display.imageUrl}
            className={`h-12 w-12 shrink-0 ${display.round ? 'rounded-full' : 'rounded-sm'}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{display.title}</p>
            <p className="truncate text-xs text-ink-muted">
              {display.label} · {display.subtitle}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost px-3! py-1.5!"
            onClick={() => setSubject(null)}
          >
            Change
          </button>
        </div>
      ) : (
        <SubjectPicker onPick={setSubject} />
      )}

      <div>
        <label htmlFor="story-caption" className="mb-1.5 block text-sm font-semibold">
          Caption <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id="story-caption"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          aria-invalid={captionError ? true : undefined}
          placeholder="Say something about this"
          className="w-full resize-none rounded-control border border-line bg-elevated px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint hover:bg-hover focus:border-accent focus:bg-hover"
        />
        <p
          role={captionError ? 'alert' : undefined}
          className={`mt-1 text-right text-xs ${captionError ? 'text-danger' : 'text-ink-faint'}`}
        >
          {captionError ?? `${captionLength}/${MAX_CAPTION}`}
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Background</legend>
        <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-2">
          {STORY_GRADIENTS.map(({ name, value }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={gradient === value}
              aria-label={name}
              title={name}
              onClick={() => setGradient(value)}
              style={{ background: gradientCss(value) }}
              className={`h-10 w-10 rounded-full ring-offset-2 ring-offset-surface transition ${
                gradient === value ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'
              }`}
            />
          ))}
        </div>
      </fieldset>

      <div
        data-testid="story-preview"
        aria-label="Story preview"
        role="img"
        className="flex items-center gap-3 rounded-card p-4"
        style={{ background: gradientCss(gradient) }}
      >
        <CoverImage
          src={display?.imageUrl ?? null}
          className={`h-16 w-16 shrink-0 ${display?.round ? 'rounded-full' : 'rounded-control'}`}
        />
        <div className="min-w-0 text-white">
          <p className="truncate text-sm font-extrabold">
            {display?.title ?? 'Pick something to share'}
          </p>
          <p className="truncate text-xs text-white/85">{display?.subtitle ?? ' '}</p>
          {caption.trim() && (
            <p className="mt-1.5 line-clamp-2 rounded-sm bg-black/40 px-2 py-1 text-xs font-semibold break-words">
              {caption.trim()}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        {linkHint(subject, display?.href ?? null)}It stays up for 24 hours, then disappears.
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={!subject || create.isPending || captionError !== null}
        >
          {create.isPending ? 'Sharing…' : 'Share to story'}
        </button>
      </div>
    </form>
  )
}

/** Mounted once in the app shell. Opened from "Add story", a track menu, or an album/artist page. */
export function StoryComposerHost() {
  const { isOpen, subject, close } = useStoryComposerStore()

  return (
    <Modal open={isOpen} title="Share to your story" onClose={close}>
      <ComposerForm initialSubject={subject} onClose={close} />
    </Modal>
  )
}
