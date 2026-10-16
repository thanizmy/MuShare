import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { configureAuthBridge } from '../api/client'
import { createPreviewEngine, getAudioEngine } from '../audio/AudioEngine'
import { useAuthStore } from '../store/authStore'
import { playerStore } from '../store/playerStore'
import {
  useSeenStoriesStore,
  useStoryComposerStore,
  useStoryViewerStore,
} from '../store/storyStores'
import { useToastStore } from '../store/toastStore'
import { useUiStore } from '../store/uiStore'
import type { FakeEngine } from './FakeEngine'

// The player store is created at import time, so the engine must be swapped globally.
// Tests drive playback through this fake instead of a real <audio> element.
vi.mock('../audio/AudioEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/AudioEngine')>()
  const { FakeEngine: Fake } = await import('./FakeEngine')
  const engine = new Fake()
  const preview = new Fake()
  return { ...actual, getAudioEngine: () => engine, createPreviewEngine: () => preview }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // Module-level state must not leak between tests.
  configureAuthBridge(null)
  useAuthStore.setState({ status: 'loading', user: null, accessToken: null })
  useUiStore.setState({ drawerOpen: false, queueOpen: false })
  useToastStore.setState({ toasts: [] })
  useSeenStoriesStore.setState({ seen: [] })
  useStoryViewerStore.setState({ session: null })
  useStoryComposerStore.setState({ isOpen: false, subject: null })
  ;(getAudioEngine() as unknown as FakeEngine).reset()
  ;(createPreviewEngine() as unknown as FakeEngine).reset()
  playerStore.setState(playerStore.getInitialState(), true)
  localStorage.clear()
  document.body.style.overflow = ''
})

// jsdom does not implement media playback; stub it so audio code can be tested later.
Object.defineProperties(window.HTMLMediaElement.prototype, {
  play: { configurable: true, value: vi.fn(() => Promise.resolve()) },
  pause: { configurable: true, value: vi.fn() },
  load: { configurable: true, value: vi.fn() },
})

// jsdom has no layout, so scrolling APIs are missing.
Element.prototype.scrollBy = vi.fn() as unknown as typeof Element.prototype.scrollBy

// jsdom has no object URLs; cover previews in the upload flow need them.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
}
