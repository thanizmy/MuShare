import { create } from 'zustand'

import type { StoryGroup, StorySubject } from '../types/stories'

// ---------------------------------------------------------------- viewer

interface ViewerState {
  session: { groups: StoryGroup[]; startGroup: number } | null
  open: (groups: StoryGroup[], startGroup?: number) => void
  close: () => void
}

/** Which stories the full-screen viewer is showing, if any. */
export const useStoryViewerStore = create<ViewerState>((set) => ({
  session: null,
  open: (groups, startGroup = 0) => {
    if (groups.some((g) => g.stories.length > 0)) set({ session: { groups, startGroup } })
  },
  close: () => set({ session: null }),
}))

// -------------------------------------------------------------- composer

interface ComposerState {
  isOpen: boolean
  /** Something chosen up front (a track menu, an album or artist page), or null to search. */
  subject: StorySubject | null
  open: (subject?: StorySubject | null) => void
  close: () => void
}

export const useStoryComposerStore = create<ComposerState>((set) => ({
  isOpen: false,
  subject: null,
  open: (subject = null) => set({ isOpen: true, subject }),
  close: () => set({ isOpen: false, subject: null }),
}))

// ------------------------------------------------------------ seen state

const SEEN_KEY = 'mushare.seenStories'
const MAX_REMEMBERED = 500

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    // Storage unavailable: the rings just won't remember what you've watched.
  }
}

interface SeenState {
  seen: string[]
  markSeen: (storyId: string) => void
}

/** Which stories this browser has watched. A per-viewer convenience, so it stays local. */
export const useSeenStoriesStore = create<SeenState>((set, get) => ({
  seen: readSeen(),
  markSeen: (storyId) => {
    if (get().seen.includes(storyId)) return
    // Keep only the most recent ids; expired stories drop out of the feed anyway.
    const seen = [...get().seen, storyId].slice(-MAX_REMEMBERED)
    writeSeen(seen)
    set({ seen })
  },
}))
