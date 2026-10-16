import { Plus } from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useStoryFeed } from '../../hooks/useStories'
import {
  useSeenStoriesStore,
  useStoryComposerStore,
  useStoryViewerStore,
} from '../../store/storyStores'
import { Avatar } from '../ui/Avatar'

interface StoryBubbleProps {
  user: { username: string; avatar_url: string | null }
  label: string
  seen: boolean
  onOpen: () => void
}

/** An avatar in a ring: bright when there is something new to watch, grey once watched. */
export function StoryBubble({ user, label, seen, onOpen }: StoryBubbleProps) {
  return (
    <li className="w-20 shrink-0 text-center">
      <button
        type="button"
        aria-label={`View ${label} story`}
        data-seen={seen}
        onClick={onOpen}
        className="group mx-auto block"
      >
        <span
          className={`block rounded-full p-[3px] transition group-hover:scale-105 ${
            seen ? 'bg-white/25' : 'bg-linear-to-tr from-accent to-accent-soft'
          }`}
        >
          <span className="block rounded-full bg-canvas p-[3px]">
            <Avatar user={user} className="h-16 w-16" textClassName="text-xl" />
          </span>
        </span>
        <span className="mt-1.5 block truncate text-xs text-ink-muted">{label}</span>
      </button>
    </li>
  )
}

/** The row at the top of Home: add a story, then everyone you follow who has one. */
export function StoriesRow() {
  const { user } = useAuth()
  const feed = useStoryFeed()
  const seen = useSeenStoriesStore((s) => s.seen)
  const openComposer = useStoryComposerStore((s) => s.open)
  const openViewer = useStoryViewerStore((s) => s.open)
  const groups = feed.data ?? []

  return (
    <section aria-label="Stories">
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        <li className="w-20 shrink-0 text-center">
          <button
            type="button"
            aria-label="Add story"
            onClick={() => openComposer()}
            className="group mx-auto block"
          >
            <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-dashed border-line transition group-hover:border-accent">
              <Plus className="h-7 w-7 text-ink-muted group-hover:text-accent" aria-hidden />
            </span>
            <span className="mt-1.5 block truncate text-xs text-ink-muted">Add story</span>
          </button>
        </li>
        {groups.map((group, index) => {
          const isMine = group.user.id === user?.id
          return (
            <StoryBubble
              key={group.user.id}
              user={group.user}
              label={isMine ? 'Your' : group.user.username}
              seen={group.stories.every((s) => seen.includes(s.id))}
              onOpen={() => openViewer(groups, index)}
            />
          )
        })}
      </ul>
    </section>
  )
}
