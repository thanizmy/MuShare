import { describe, expect, it } from 'vitest'

import { FakeEngine } from '../test/FakeEngine'
import { TRACKS } from '../test/fixtures'
import { createPlayerStore, currentTrackOf } from './playerStore'

const [A, B, C] = TRACKS

function setup() {
  const engine = new FakeEngine()
  const store = createPlayerStore(engine, { storage: null })
  return { engine, get: store.getState, current: () => currentTrackOf(store.getState())?.id }
}

describe('enqueue', () => {
  it('starts playing when nothing is loaded', () => {
    const { engine, get, current } = setup()
    get().enqueue(B)
    expect(current()).toBe(B.id)
    expect(engine.lastLoad).toBe(B.audio_url)
    expect(get().isPlaying).toBe(true)
  })

  it('appends without interrupting what is playing', () => {
    const { engine, get, current } = setup()
    get().play(A)
    get().enqueue(B)
    get().enqueue(C)

    expect(current()).toBe(A.id)
    expect(engine.loads).toHaveLength(1)
    expect(get().queue.map((t) => t.id)).toEqual([A.id, B.id, C.id])
    expect(get().order).toEqual([0, 1, 2])
  })

  it('plays queued tracks after the current one ends', () => {
    const { engine, get, current } = setup()
    get().play(A)
    get().enqueue(B)
    engine.end()
    expect(current()).toBe(B.id)
  })

  it('can queue the same track twice', () => {
    const { get } = setup()
    get().play(A)
    get().enqueue(B)
    get().enqueue(B)
    expect(get().queue.map((t) => t.id)).toEqual([A.id, B.id, B.id])
  })

  it('goes to the end of a shuffled order', () => {
    const { get } = setup()
    get().play(A, [A, B])
    get().toggleShuffle()
    get().enqueue(C)
    expect(get().order[get().order.length - 1]).toBe(2)
  })
})

describe('jumpTo', () => {
  it('plays the track at that position of the play order', () => {
    const { engine, get, current } = setup()
    get().play(A, TRACKS)
    get().jumpTo(2)
    expect(current()).toBe(C.id)
    expect(engine.lastLoad).toBe(C.audio_url)
  })

  it('follows the shuffled order, not the queue order', () => {
    const { get, current } = setup()
    get().play(A, TRACKS)
    get().toggleShuffle()
    const target = TRACKS[get().order[2]]
    get().jumpTo(2)
    expect(current()).toBe(target.id)
  })

  it('ignores out-of-range positions', () => {
    const { engine, get, current } = setup()
    get().play(A, TRACKS)
    get().jumpTo(-1)
    get().jumpTo(3)
    expect(current()).toBe(A.id)
    expect(engine.loads).toHaveLength(1)
  })
})
