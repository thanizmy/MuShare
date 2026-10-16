import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { getAudioEngine, type AudioEnginePort } from '../audio/AudioEngine'
import { clamp } from '../lib/format'
import { isPlayable } from '../lib/playable'
import type { Track } from '../types/catalog'

export type RepeatMode = 'off' | 'all' | 'one'
export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Past this point, "previous" restarts the current track instead of going back. */
const RESTART_THRESHOLD_SEC = 3
const STORAGE_KEY = 'mushare.player'
const VOLUME_STEP = 0.05

export interface PlayerState {
  queue: Track[]
  /** Play order as indices into `queue`; identity unless shuffled. */
  order: number[]
  /** Index into `order` of the current track, or -1 when idle. */
  position: number
  status: PlaybackStatus
  isPlaying: boolean
  currentTime: number
  duration: number
  errorMessage: string | null
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
}

export interface PlayerActions {
  play: (track: Track, queue?: Track[]) => void
  /** Add to the end of the queue; starts playing if nothing is loaded. */
  enqueue: (track: Track) => void
  /** Play the track at this index of the play order (a queue panel click). */
  jumpTo: (position: number) => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  seekBy: (deltaSeconds: number) => void
  setVolume: (volume: number) => void
  changeVolumeBy: (direction: 1 | -1) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  stop: () => void
}

export type PlayerStore = PlayerState & PlayerActions

interface Preferences {
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
}

const DEFAULT_PREFERENCES: Preferences = { volume: 0.8, muted: false, shuffle: false, repeat: 'off' }

function readPreferences(storage: Storage | null): Preferences {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      volume: typeof parsed.volume === 'number' ? clamp(parsed.volume, 0, 1) : DEFAULT_PREFERENCES.volume,
      muted: parsed.muted === true,
      shuffle: parsed.shuffle === true,
      repeat:
        parsed.repeat === 'all' || parsed.repeat === 'one' ? parsed.repeat : DEFAULT_PREFERENCES.repeat,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const identity = (length: number) => Array.from({ length }, (_, i) => i)

/** Fisher-Yates over all indices except `first`, which is pinned to the front. */
export function buildShuffleOrder(length: number, first: number, random: () => number): number[] {
  const rest = identity(length).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return first >= 0 && first < length ? [first, ...rest] : rest
}

export const currentTrackOf = (s: PlayerState): Track | null =>
  s.position >= 0 ? (s.queue[s.order[s.position]] ?? null) : null

export const canGoNext = (s: PlayerState): boolean =>
  s.queue.length > 0 && (s.position < s.order.length - 1 || s.repeat === 'all')

interface StoreOptions {
  random?: () => number
  storage?: Storage | null
}

export function createPlayerStore(engine: AudioEnginePort, options: StoreOptions = {}) {
  const random = options.random ?? Math.random
  const storage = options.storage === undefined ? safeStorage() : options.storage
  const prefs = readPreferences(storage)

  // Incremented on every load so a late rejection from an old play() can't clobber new state.
  let loadToken = 0

  engine.setVolume(prefs.volume)
  engine.setMuted(prefs.muted)

  const initial: PlayerState = {
    queue: [],
    order: [],
    position: -1,
    status: 'idle',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    errorMessage: null,
    ...prefs,
  }

  const store = createStore<PlayerStore>()((set, get) => {
    const persist = () => {
      const { volume, muted, shuffle, repeat } = get()
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify({ volume, muted, shuffle, repeat }))
      } catch {
        // Storage can be unavailable (private mode, quota); preferences just won't persist.
      }
    }

    const reportPlayFailure = (token: number, error: unknown) => {
      if (token !== loadToken) return
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') return // superseded by a newer load or pause()
      if (name === 'NotAllowedError') {
        set({ isPlaying: false, status: 'ready', errorMessage: 'Playback was blocked. Press play to start.' })
        return
      }
      set({ isPlaying: false, status: 'error', errorMessage: 'This track could not be played.' })
    }

    const startPlayback = (token: number) => {
      engine.play().catch((error: unknown) => reportPlayFailure(token, error))
    }

    /** Load and play whatever track `position` points at. */
    const startCurrent = () => {
      const track = currentTrackOf(get())
      if (!track) return
      const token = ++loadToken
      set({
        status: 'loading',
        currentTime: 0,
        duration: track.duration_sec,
        errorMessage: null,
      })
      engine.load(track.audio_url)
      startPlayback(token)
    }

    const goTo = (position: number) => {
      set({ position })
      startCurrent()
    }

    const finishQueue = () => {
      engine.pause()
      engine.seek(0)
      set({ isPlaying: false, status: 'ready', currentTime: 0 })
    }

    engine.subscribe({
      onTimeUpdate: (currentTime, duration) =>
        set((s) => ({ currentTime, duration: duration || s.duration })),
      onPlaying: () => set({ isPlaying: true, status: 'ready', errorMessage: null }),
      onPause: () => set({ isPlaying: false }),
      onWaiting: () => set((s) => (s.status === 'idle' ? s : { status: 'loading' })),
      onCanPlay: () => set((s) => (s.status === 'loading' ? { status: 'ready' } : s)),
      onError: (message) => set({ status: 'error', isPlaying: false, errorMessage: message }),
      onEnded: () => {
        const s = get()
        if (s.repeat === 'one') {
          engine.seek(0)
          startPlayback(loadToken)
        } else if (s.position < s.order.length - 1) {
          goTo(s.position + 1)
        } else if (s.repeat === 'all') {
          if (s.shuffle) set({ order: buildShuffleOrder(s.queue.length, -1, random) })
          goTo(0)
        } else {
          finishQueue()
        }
      },
    })

    return {
      ...initial,

      play: (track, queue = [track]) => {
        // A track its artist hid can't be played, and neither can it sit in the queue.
        if (!isPlayable(track)) return
        const playable = queue.filter(isPlayable)
        const list = playable.some((t) => t.id === track.id) ? playable : [track, ...playable]
        const index = list.findIndex((t) => t.id === track.id)
        const { shuffle } = get()
        set({
          queue: list,
          order: shuffle ? buildShuffleOrder(list.length, index, random) : identity(list.length),
          position: shuffle ? 0 : index,
        })
        startCurrent()
      },

      enqueue: (track) => {
        if (!isPlayable(track)) return
        const s = get()
        if (!currentTrackOf(s)) {
          get().play(track)
          return
        }
        const index = s.queue.length
        set({ queue: [...s.queue, track], order: [...s.order, index] })
      },

      jumpTo: (position) => {
        const s = get()
        if (position < 0 || position >= s.order.length) return
        goTo(position)
      },

      togglePlay: () => {
        const s = get()
        if (!currentTrackOf(s)) return
        if (s.isPlaying) {
          engine.pause()
        } else if (s.status === 'error') {
          startCurrent()
        } else {
          startPlayback(loadToken)
        }
      },

      next: () => {
        const s = get()
        if (s.queue.length === 0) return
        if (s.position < s.order.length - 1) goTo(s.position + 1)
        else if (s.repeat === 'all') goTo(0)
      },

      previous: () => {
        const s = get()
        if (!currentTrackOf(s)) return
        if (s.currentTime > RESTART_THRESHOLD_SEC || (s.position === 0 && s.repeat !== 'all')) {
          get().seek(0)
        } else {
          goTo(s.position > 0 ? s.position - 1 : s.order.length - 1)
        }
      },

      seek: (seconds) => {
        const s = get()
        if (!currentTrackOf(s)) return
        const target = clamp(seconds, 0, s.duration > 0 ? s.duration : Infinity)
        engine.seek(target)
        set({ currentTime: target })
      },

      seekBy: (delta) => get().seek(get().currentTime + delta),

      setVolume: (volume) => {
        const next = clamp(volume, 0, 1)
        engine.setVolume(next)
        const unmute = next > 0 && get().muted
        if (unmute) engine.setMuted(false)
        set({ volume: next, ...(unmute ? { muted: false } : {}) })
        persist()
      },

      changeVolumeBy: (direction) => {
        const s = get()
        // Nudging the volume while muted starts from silence rather than the hidden level.
        const base = s.muted ? 0 : s.volume
        get().setVolume(Math.round((base + direction * VOLUME_STEP) * 100) / 100)
      },

      toggleMute: () => {
        const s = get()
        const muted = !s.muted
        const restoreVolume = !muted && s.volume === 0
        if (restoreVolume) {
          engine.setVolume(0.5)
        }
        engine.setMuted(muted)
        set({ muted, ...(restoreVolume ? { volume: 0.5 } : {}) })
        persist()
      },

      toggleShuffle: () => {
        const s = get()
        const shuffle = !s.shuffle
        const currentIndex = s.position >= 0 ? s.order[s.position] : -1
        if (s.queue.length === 0) {
          set({ shuffle })
        } else if (shuffle) {
          set({ shuffle, order: buildShuffleOrder(s.queue.length, currentIndex, random), position: 0 })
        } else {
          set({ shuffle, order: identity(s.queue.length), position: currentIndex })
        }
        persist()
      },

      cycleRepeat: () => {
        const order: RepeatMode[] = ['off', 'all', 'one']
        set((s) => ({ repeat: order[(order.indexOf(s.repeat) + 1) % order.length] }))
        persist()
      },

      stop: () => {
        loadToken++
        engine.pause()
        set({
          queue: [],
          order: [],
          position: -1,
          status: 'idle',
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          errorMessage: null,
        })
      },
    }
  })

  return store
}

export const playerStore = createPlayerStore(getAudioEngine())

export function usePlayerStore<T>(selector: (state: PlayerStore) => T): T {
  return useStore(playerStore, selector)
}
