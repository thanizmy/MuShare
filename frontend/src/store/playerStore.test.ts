import { beforeEach, describe, expect, it } from 'vitest'

import { FakeEngine } from '../test/FakeEngine'
import { TRACKS } from '../test/fixtures'
import {
  buildShuffleOrder,
  canGoNext,
  createPlayerStore,
  currentTrackOf,
  type PlayerStore,
} from './playerStore'

const [A, B, C] = TRACKS

/** A random() that walks a fixed sequence, so shuffles are reproducible. */
const sequence = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

function setup(options: { random?: () => number; storage?: Storage | null } = {}) {
  const engine = new FakeEngine()
  const store = createPlayerStore(engine, { storage: null, ...options })
  const get = () => store.getState()
  const current = () => currentTrackOf(get())?.id ?? null
  return { engine, store, get, current }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('play', () => {
  it('queues the list, loads the chosen track and starts playback', () => {
    const { engine, get, current } = setup()
    get().play(B, TRACKS)

    expect(current()).toBe(B.id)
    expect(get().queue).toEqual(TRACKS)
    expect(engine.lastLoad).toBe(B.audio_url)
    expect(get()).toMatchObject({ isPlaying: true, status: 'ready', currentTime: 0 })
    expect(get().duration).toBe(B.duration_sec)
  })

  it('plays a lone track when no queue is given', () => {
    const { get, current } = setup()
    get().play(A)
    expect(get().queue).toEqual([A])
    expect(current()).toBe(A.id)
  })

  it('prepends the track when it is not part of the supplied queue', () => {
    const { get, current } = setup()
    get().play(C, [A, B])
    expect(get().queue.map((t) => t.id)).toEqual([C.id, A.id, B.id])
    expect(current()).toBe(C.id)
  })
})

describe('togglePlay', () => {
  it('does nothing when idle', () => {
    const { engine, get } = setup()
    get().togglePlay()
    expect(engine.loads).toEqual([])
    expect(get().status).toBe('idle')
  })

  it('pauses and resumes without reloading', () => {
    const { engine, get } = setup()
    get().play(A, TRACKS)
    get().togglePlay()
    expect(get().isPlaying).toBe(false)
    expect(engine.paused).toBe(true)

    get().togglePlay()
    expect(get().isPlaying).toBe(true)
    expect(engine.loads).toHaveLength(1)
  })

  it('reloads the track when retrying after an error', () => {
    const { engine, get } = setup()
    get().play(A, TRACKS)
    engine.fail('This track is unavailable')
    expect(get()).toMatchObject({ status: 'error', isPlaying: false })

    get().togglePlay()
    expect(engine.loads).toHaveLength(2)
    expect(get()).toMatchObject({ status: 'ready', isPlaying: true, errorMessage: null })
  })
})

describe('advancing', () => {
  it('moves to the next track when one ends', () => {
    const { engine, get, current } = setup()
    get().play(A, TRACKS)
    engine.end()
    expect(current()).toBe(B.id)
    expect(engine.lastLoad).toBe(B.audio_url)
  })

  it('stops and rewinds after the last track when repeat is off', () => {
    const { engine, get, current } = setup()
    get().play(C, TRACKS)
    engine.tick(100, 240)
    engine.end()

    expect(current()).toBe(C.id)
    expect(get()).toMatchObject({ isPlaying: false, currentTime: 0, status: 'ready' })
    expect(engine.currentTime).toBe(0)
  })

  it('wraps to the first track when repeat is all', () => {
    const { engine, get, current } = setup()
    get().cycleRepeat() // all
    get().play(C, TRACKS)
    engine.end()
    expect(current()).toBe(A.id)
    expect(get().isPlaying).toBe(true)
  })

  it('replays the same track when repeat is one', () => {
    const { engine, get, current } = setup()
    get().cycleRepeat()
    get().cycleRepeat() // one
    get().play(B, TRACKS)
    engine.tick(150, 180)
    engine.end()

    expect(current()).toBe(B.id)
    expect(engine.loads).toHaveLength(1) // no reload, just a rewind
    expect(engine.currentTime).toBe(0)
    expect(get().isPlaying).toBe(true)
  })

  it('next() steps forward and is a no-op at the end unless repeat is all', () => {
    const { get, current } = setup()
    get().play(B, TRACKS)
    get().next()
    expect(current()).toBe(C.id)
    expect(canGoNext(get())).toBe(false)

    get().next()
    expect(current()).toBe(C.id)

    get().cycleRepeat() // all
    expect(canGoNext(get())).toBe(true)
    get().next()
    expect(current()).toBe(A.id)
  })

  it('next() with an empty queue does nothing', () => {
    const { engine, get } = setup()
    get().next()
    expect(engine.loads).toEqual([])
  })
})

describe('previous', () => {
  it('restarts the track when more than 3 seconds in', () => {
    const { engine, get, current } = setup()
    get().play(B, TRACKS)
    engine.tick(10, 180)
    get().previous()
    expect(current()).toBe(B.id)
    expect(get().currentTime).toBe(0)
    expect(engine.currentTime).toBe(0)
  })

  it('goes back a track when near the start', () => {
    const { engine, get, current } = setup()
    get().play(B, TRACKS)
    engine.tick(1, 180)
    get().previous()
    expect(current()).toBe(A.id)
  })

  it('restarts instead of going back from the first track', () => {
    const { engine, get, current } = setup()
    get().play(A, TRACKS)
    engine.tick(1, 200)
    get().previous()
    expect(current()).toBe(A.id)
    expect(engine.loads).toHaveLength(1)
    expect(get().currentTime).toBe(0)
  })

  it('wraps to the last track from the first when repeat is all', () => {
    const { engine, get, current } = setup()
    get().cycleRepeat()
    get().play(A, TRACKS)
    engine.tick(1, 200)
    get().previous()
    expect(current()).toBe(C.id)
  })
})

describe('seek', () => {
  it('moves the engine and state, clamped to the track length', () => {
    const { engine, get } = setup()
    get().play(A, TRACKS) // duration 200
    get().seek(90)
    expect(engine.currentTime).toBe(90)
    expect(get().currentTime).toBe(90)

    get().seek(999)
    expect(get().currentTime).toBe(200)
    get().seek(-3)
    expect(get().currentTime).toBe(0)
  })

  it('seekBy is relative to the current position', () => {
    const { engine, get } = setup()
    get().play(A, TRACKS)
    engine.tick(30, 200)
    get().seekBy(5)
    expect(get().currentTime).toBe(35)
    get().seekBy(-10)
    expect(get().currentTime).toBe(25)
  })

  it('is ignored when nothing is loaded', () => {
    const { engine, get } = setup()
    get().seek(30)
    expect(get().currentTime).toBe(0)
    expect(engine.currentTime).toBe(0)
  })
})

describe('volume and mute', () => {
  it('clamps volume to 0..1 and applies it to the engine', () => {
    const { engine, get } = setup()
    get().setVolume(0.35)
    expect(engine.volume).toBe(0.35)
    get().setVolume(4)
    expect(get().volume).toBe(1)
    get().setVolume(-1)
    expect(get().volume).toBe(0)
  })

  it('raising the volume while muted unmutes', () => {
    const { engine, get } = setup()
    get().toggleMute()
    expect(engine.muted).toBe(true)
    get().setVolume(0.4)
    expect(get().muted).toBe(false)
    expect(engine.muted).toBe(false)
  })

  it('steps by 5% and starts from silence when muted', () => {
    const { get } = setup() // default volume 0.8
    get().changeVolumeBy(-1)
    expect(get().volume).toBe(0.75)
    get().changeVolumeBy(1)
    get().changeVolumeBy(1)
    expect(get().volume).toBe(0.85)

    get().toggleMute()
    get().changeVolumeBy(1)
    expect(get().volume).toBe(0.05)
    expect(get().muted).toBe(false)
  })

  it('unmuting at zero volume restores an audible level', () => {
    const { engine, get } = setup()
    get().setVolume(0)
    get().toggleMute()
    get().toggleMute()
    expect(get().muted).toBe(false)
    expect(get().volume).toBe(0.5)
    expect(engine.volume).toBe(0.5)
  })
})

describe('shuffle', () => {
  it('buildShuffleOrder is a permutation with the pinned track first', () => {
    for (const first of [0, 3, 7]) {
      const order = buildShuffleOrder(8, first, Math.random)
      expect(order[0]).toBe(first)
      expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    }
    expect(buildShuffleOrder(0, -1, Math.random)).toEqual([])
    expect(buildShuffleOrder(1, 0, Math.random)).toEqual([0])
  })

  it('keeps the current track playing and reorders the rest', () => {
    const { engine, get, current } = setup({ random: sequence(0.99, 0.01) })
    get().play(B, TRACKS)
    get().toggleShuffle()

    expect(get().shuffle).toBe(true)
    expect(current()).toBe(B.id)
    expect(get().position).toBe(0)
    expect(get().order[0]).toBe(1)
    expect(engine.loads).toHaveLength(1) // no restart
  })

  it('plays in shuffled order and "previous" retraces it', () => {
    const { engine, get, current } = setup({ random: sequence(0, 0) })
    get().play(A, TRACKS)
    get().toggleShuffle()
    const order = get().order.map((i) => TRACKS[i].id)

    get().next()
    expect(current()).toBe(order[1])
    get().next()
    expect(current()).toBe(order[2])
    engine.tick(0.5, 100)
    get().previous()
    expect(current()).toBe(order[1])
  })

  it('turning shuffle off restores album order from the current track', () => {
    const { get, current } = setup({ random: sequence(0.9, 0.1) })
    get().play(A, TRACKS)
    get().toggleShuffle()
    get().next()
    const nowPlaying = current()!
    get().toggleShuffle()

    expect(get().shuffle).toBe(false)
    expect(get().order).toEqual([0, 1, 2])
    expect(current()).toBe(nowPlaying)
    expect(get().position).toBe(TRACKS.findIndex((t) => t.id === nowPlaying))
  })

  it('shuffles a queue started while shuffle is already on', () => {
    const { get, current } = setup({ random: sequence(0.5) })
    get().toggleShuffle()
    get().play(C, TRACKS)
    expect(current()).toBe(C.id)
    expect(get().order[0]).toBe(2)
  })

  it('can be toggled with nothing queued', () => {
    const { get } = setup()
    get().toggleShuffle()
    expect(get().shuffle).toBe(true)
    expect(get().order).toEqual([])
  })
})

describe('repeat', () => {
  it('cycles off -> all -> one -> off', () => {
    const { get } = setup()
    const seen = [get().repeat]
    for (let i = 0; i < 3; i++) {
      get().cycleRepeat()
      seen.push(get().repeat)
    }
    expect(seen).toEqual(['off', 'all', 'one', 'off'])
  })
})

describe('failures', () => {
  const rejectWith = (engine: FakeEngine, name: string) => {
    engine.playImpl = () => Promise.reject(new DOMException('nope', name))
  }

  it('explains a blocked autoplay without marking the track broken', async () => {
    const { engine, get } = setup()
    rejectWith(engine, 'NotAllowedError')
    get().play(A, TRACKS)
    await flush()
    expect(get()).toMatchObject({ isPlaying: false, status: 'ready' })
    expect(get().errorMessage).toMatch(/blocked/i)
  })

  it('ignores AbortError from a superseded load', async () => {
    const { engine, get } = setup()
    rejectWith(engine, 'AbortError')
    get().play(A, TRACKS)
    await flush()
    expect(get().errorMessage).toBeNull()
    expect(get().status).toBe('ready')
  })

  it('marks other failures as an error', async () => {
    const { engine, get } = setup()
    rejectWith(engine, 'NotSupportedError')
    get().play(A, TRACKS)
    await flush()
    expect(get()).toMatchObject({ status: 'error', isPlaying: false })
    expect(get().errorMessage).toMatch(/could not be played/i)
  })

  it('does not let a stale rejection overwrite a newer track', async () => {
    const { engine, get, current } = setup()
    let rejectFirst!: (reason: unknown) => void
    engine.playImpl = () => new Promise<void>((_, reject) => (rejectFirst = reject))
    get().play(A, TRACKS)

    engine.playImpl = () => Promise.resolve()
    get().play(B, TRACKS)
    rejectFirst(new DOMException('late', 'NotSupportedError'))
    await flush()

    expect(current()).toBe(B.id)
    expect(get().status).toBe('ready')
    expect(get().errorMessage).toBeNull()
  })

  it('surfaces element errors and recovers by skipping ahead', () => {
    const { engine, get, current } = setup()
    get().play(A, TRACKS)
    engine.fail('This track is unavailable or in an unsupported format.')
    expect(get()).toMatchObject({ status: 'error', isPlaying: false })
    expect(get().errorMessage).toMatch(/unavailable/i)

    get().next()
    expect(current()).toBe(B.id)
    expect(get()).toMatchObject({ status: 'ready', errorMessage: null })
  })
})

describe('engine events', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
    ctx.get().play(A, TRACKS)
  })

  it('tracks time and duration', () => {
    ctx.engine.tick(12, 199)
    expect(ctx.get()).toMatchObject({ currentTime: 12, duration: 199 })
  })

  it('keeps the catalog duration while the element does not know it yet', () => {
    ctx.engine.tick(1, 0)
    expect(ctx.get().duration).toBe(A.duration_sec)
  })

  it('shows buffering on waiting and clears it on canplay', () => {
    ctx.engine.emit((l) => l.onWaiting?.())
    expect(ctx.get().status).toBe('loading')
    ctx.engine.emit((l) => l.onCanPlay?.())
    expect(ctx.get().status).toBe('ready')
  })

  it('ignores waiting when idle', () => {
    ctx.get().stop()
    ctx.engine.emit((l) => l.onWaiting?.())
    expect(ctx.get().status).toBe('idle')
  })
})

describe('stop', () => {
  it('clears the queue and returns to idle', () => {
    const { engine, get } = setup()
    get().play(B, TRACKS)
    get().stop()
    expect(get()).toMatchObject({
      queue: [],
      position: -1,
      status: 'idle',
      isPlaying: false,
      currentTime: 0,
    })
    expect(engine.paused).toBe(true)
    expect(currentTrackOf(get())).toBeNull()
  })
})

describe('persistence', () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial))
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
      clear: () => data.clear(),
      key: (i) => [...data.keys()][i] ?? null,
      get length() {
        return data.size
      },
    }
  }

  it('saves preferences and restores them in a new store', () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.get().setVolume(0.3)
    first.get().toggleShuffle()
    first.get().cycleRepeat()
    first.get().toggleMute()

    const second = setup({ storage })
    expect(second.get()).toMatchObject({ volume: 0.3, shuffle: true, repeat: 'all', muted: true })
    expect(second.engine.volume).toBe(0.3)
    expect(second.engine.muted).toBe(true)
  })

  it('falls back to defaults for corrupt or out-of-range data', () => {
    const corrupt = setup({ storage: memoryStorage({ 'mushare.player': '{not json' }) })
    expect(corrupt.get()).toMatchObject({ volume: 0.8, muted: false, shuffle: false, repeat: 'off' })

    const hostile = setup({
      storage: memoryStorage({
        'mushare.player': JSON.stringify({ volume: 99, repeat: 'sideways', muted: 'yes' }),
      }),
    })
    expect(hostile.get()).toMatchObject({ volume: 1, repeat: 'off', muted: false })
  })

  it('keeps working when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    } as unknown as Storage
    const { get } = setup({ storage: broken })
    expect(() => get().setVolume(0.2)).not.toThrow()
    expect(get().volume).toBe(0.2)
  })
})

describe('selectors', () => {
  it('currentTrackOf is null for an idle player', () => {
    const { get } = setup()
    expect(currentTrackOf(get() as PlayerStore)).toBeNull()
    expect(canGoNext(get())).toBe(false)
  })
})
