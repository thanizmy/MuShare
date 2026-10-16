import { ExternalLink, Pause, Play, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import { useDeleteStory } from '../../hooks/useStories'
import { useStoryPreview } from '../../hooks/useStoryPreview'
import { gradientCss } from '../../lib/gradients'
import { displayForStory } from '../../lib/storyDisplay'
import { formatRelative } from '../../lib/time'
import { playerStore } from '../../store/playerStore'
import { useSeenStoriesStore, useStoryViewerStore } from '../../store/storyStores'
import type { StoryGroup } from '../../types/stories'
import { CoverImage } from '../media/CoverImage'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'

interface StoryViewerProps {
  groups: StoryGroup[]
  startGroup: number
  onClose: () => void
}

/** Full-screen story player: segmented progress, 15-second previews, tap or key to navigate. */
function StoryViewer({ groups: initialGroups, startGroup, onClose }: StoryViewerProps) {
  const { user: me } = useAuth()
  const markSeen = useSeenStoriesStore((s) => s.markSeen)
  const deleteStory = useDeleteStory()

  const [groups, setGroups] = useState(initialGroups)
  const [groupIndex, setGroupIndex] = useState(startGroup)
  const [storyIndex, setStoryIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [restartKey, setRestartKey] = useState(0)

  const group = groups[groupIndex]
  const story = group?.stories[storyIndex] ?? null
  const isOwn = story !== null && me?.id === story.user.id

  // Story audio takes over from the main player and hands it back afterwards.
  useEffect(() => {
    const wasPlaying = playerStore.getState().isPlaying
    if (wasPlaying) playerStore.getState().togglePlay()
    return () => {
      if (wasPlaying && !playerStore.getState().isPlaying) playerStore.getState().togglePlay()
    }
  }, [])

  useEffect(() => {
    if (story) markSeen(story.id)
  }, [story, markSeen])

  const next = useCallback(() => {
    if (!group) return onClose()
    if (storyIndex < group.stories.length - 1) setStoryIndex(storyIndex + 1)
    else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1)
      setStoryIndex(0)
    } else onClose()
  }, [group, groupIndex, groups.length, onClose, storyIndex])

  const previous = useCallback(() => {
    if (storyIndex > 0) setStoryIndex(storyIndex - 1)
    else if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1)
      setStoryIndex(groups[groupIndex - 1].stories.length - 1)
    } else setRestartKey((k) => k + 1) // nothing earlier: replay this one
  }, [groupIndex, groups, storyIndex])

  const preview = useStoryPreview({
    story,
    paused,
    restartKey,
    onFinished: next,
    onBlocked: () => setPaused(true),
  })

  // A different story always starts playing.
  useEffect(() => setPaused(false), [story?.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') previous()
      else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        setPaused((p) => !p)
      } else return
      event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [next, previous])

  const handleDelete = async () => {
    if (!story) return
    try {
      await deleteStory.mutateAsync(story.id)
    } catch {
      return // the hook already showed an error toast
    }
    const remaining = groups
      .map((g, i) =>
        i === groupIndex ? { ...g, stories: g.stories.filter((s) => s.id !== story.id) } : g,
      )
      .filter((g) => g.stories.length > 0)
    if (remaining.length === 0) return onClose()
    const groupGone = remaining.length < groups.length
    setGroups(remaining)
    if (groupGone) {
      if (groupIndex >= remaining.length) return onClose()
      setStoryIndex(0)
    } else {
      setStoryIndex(Math.min(storyIndex, remaining[groupIndex].stories.length - 1))
    }
  }

  if (!group || !story) return null
  const display = displayForStory(story)

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col" style={{ background: gradientCss(story.background_color) }}>
      <div className="flex gap-1 px-3 pt-3" aria-hidden>
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white"
              style={{
                width: i < storyIndex ? '100%' : i === storyIndex ? `${preview.progress * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-3 py-3">
        <Link
          to={`/u/${story.user.username}`}
          onClick={onClose}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <Avatar user={story.user} className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-white">{story.user.username}</span>
            <span className="block text-xs text-white/80">{formatRelative(story.created_at)}</span>
          </span>
        </Link>
        <button
          type="button"
          aria-label={paused ? 'Play story' : 'Pause story'}
          onClick={() => setPaused((p) => !p)}
          className="rounded-full p-2 text-white hover:bg-white/15"
        >
          {paused ? <Play className="h-5 w-5" fill="currentColor" aria-hidden /> : <Pause className="h-5 w-5" fill="currentColor" aria-hidden />}
        </button>
        {isOwn && (
          <button
            type="button"
            aria-label="Delete story"
            disabled={deleteStory.isPending}
            onClick={() => void handleDelete()}
            className="rounded-full p-2 text-white hover:bg-white/15"
          >
            <Trash2 className="h-5 w-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label="Close stories"
          onClick={onClose}
          className="rounded-full p-2 text-white hover:bg-white/15"
        >
          <X className="h-6 w-6" aria-hidden />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10">
        {/* Large tap zones: left goes back, right goes forward. */}
        <button
          type="button"
          aria-label="Previous story"
          onClick={previous}
          className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
        />
        <button
          type="button"
          aria-label="Next story"
          onClick={next}
          className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize"
        />

        {display && (
          <CoverImage
            src={display.imageUrl}
            alt={`${display.title} ${display.round ? 'profile picture' : 'cover'}`}
            className={`pointer-events-none h-56 w-56 shadow-glass sm:h-64 sm:w-64 ${
              display.round ? 'rounded-full' : 'rounded-card'
            }`}
          />
        )}
        <div className="pointer-events-none w-full space-y-3 text-center text-white">
          {display && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/80">
                {display.label}
              </p>
              <p className="mt-1 text-xl font-extrabold">{display.title}</p>
              {display.label !== 'Artist' && (
                <p className="text-sm text-white/85">{display.subtitle}</p>
              )}
            </div>
          )}
          {story.caption && (
            // A dark panel keeps the text readable on every gradient.
            <p className="mx-auto max-w-xs rounded-card bg-black/40 px-4 py-3 text-[1rem] font-semibold break-words text-white">
              {story.caption}
            </p>
          )}
          {story.track?.is_hidden && (
            <p role="status" className="text-xs font-semibold text-white/85">
              Hidden by the artist
            </p>
          )}
          {preview.status === 'silent' && story.preview && (
            <p role="status" className="text-xs text-white/85">
              Audio unavailable for this track
            </p>
          )}
          {paused && (
            <p role="status" className="text-xs font-semibold uppercase tracking-wider text-white/85">
              Paused. Press play to listen.
            </p>
          )}
        </div>

        {/* Quick access to what the story is about. Sits above the tap zones. */}
        {display?.href && (
          <Link
            to={display.href}
            onClick={onClose}
            className="relative z-10 inline-flex items-center gap-2 rounded-full bg-black/45 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-xs hover:bg-black/60"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {display.linkLabel}
          </Link>
        )}
      </div>
    </div>
  )
}

/** Mounted once in the app shell; shows the viewer whenever a session is open. */
export function StoryViewerHost() {
  const session = useStoryViewerStore((s) => s.session)
  const close = useStoryViewerStore((s) => s.close)
  const title = session ? `${session.groups[session.startGroup]?.user.username ?? 'Stories'}'s stories` : 'Stories'

  return (
    <Modal open={session !== null} title={title} onClose={close} variant="story">
      {session && <StoryViewer groups={session.groups} startGroup={session.startGroup} onClose={close} />}
    </Modal>
  )
}
