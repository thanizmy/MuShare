import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioEngine, type EngineListener } from './AudioEngine'

function setup() {
  const audio = document.createElement('audio')
  const engine = new AudioEngine(audio)
  const listener: Record<keyof EngineListener, ReturnType<typeof vi.fn>> = {
    onTimeUpdate: vi.fn(),
    onPlaying: vi.fn(),
    onPause: vi.fn(),
    onWaiting: vi.fn(),
    onCanPlay: vi.fn(),
    onReady: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
  }
  engine.subscribe(listener as unknown as EngineListener)
  return { audio, engine, listener }
}

const define = (el: HTMLAudioElement, prop: string, value: unknown) =>
  Object.defineProperty(el, prop, { configurable: true, writable: true, value })

describe('AudioEngine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads a source and starts buffering it', () => {
    const { audio, engine } = setup()
    engine.load('https://audio.example/1.mp3')
    expect(audio.src).toBe('https://audio.example/1.mp3')
    expect(audio.load).toHaveBeenCalled()
  })

  it('delegates play and pause to the element', async () => {
    const { audio, engine } = setup()
    await engine.play()
    engine.pause()
    expect(audio.play).toHaveBeenCalled()
    expect(audio.pause).toHaveBeenCalled()
  })

  it('forwards media events to listeners', () => {
    const { audio, listener } = setup()
    audio.dispatchEvent(new Event('playing'))
    audio.dispatchEvent(new Event('pause'))
    audio.dispatchEvent(new Event('waiting'))
    audio.dispatchEvent(new Event('canplay'))
    audio.dispatchEvent(new Event('ended'))
    expect(listener.onPlaying).toHaveBeenCalledOnce()
    expect(listener.onPause).toHaveBeenCalledOnce()
    expect(listener.onWaiting).toHaveBeenCalledOnce()
    expect(listener.onCanPlay).toHaveBeenCalledOnce()
    expect(listener.onEnded).toHaveBeenCalledOnce()
  })

  it('reports when metadata has loaded so callers can seek reliably', () => {
    const { audio, listener } = setup()
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(listener.onReady).toHaveBeenCalledOnce()
  })

  it('reports current time and duration on timeupdate', () => {
    const { audio, listener } = setup()
    define(audio, 'currentTime', 12.5)
    define(audio, 'duration', 200)
    audio.dispatchEvent(new Event('timeupdate'))
    expect(listener.onTimeUpdate).toHaveBeenCalledWith(12.5, 200)
  })

  it('reports an unknown duration (NaN/Infinity) as 0', () => {
    const { audio, listener } = setup()
    define(audio, 'currentTime', 1)
    define(audio, 'duration', NaN)
    audio.dispatchEvent(new Event('durationchange'))
    expect(listener.onTimeUpdate).toHaveBeenLastCalledWith(1, 0)
    define(audio, 'duration', Infinity)
    audio.dispatchEvent(new Event('timeupdate'))
    expect(listener.onTimeUpdate).toHaveBeenLastCalledWith(1, 0)
  })

  it.each([
    [2, /network/i],
    [3, /decoded/i],
    [4, /unavailable|unsupported/i],
    [0, /could not be played/i],
  ])('maps media error code %d to a readable message', (code, message) => {
    const { audio, listener } = setup()
    define(audio, 'error', code ? { code } : null)
    audio.dispatchEvent(new Event('error'))
    expect(listener.onError).toHaveBeenCalledWith(expect.stringMatching(message))
  })

  it('seeks, never below zero', () => {
    const { audio, engine } = setup()
    define(audio, 'currentTime', 0)
    engine.seek(42)
    expect(audio.currentTime).toBe(42)
    engine.seek(-5)
    expect(audio.currentTime).toBe(0)
  })

  it('sets volume clamped to 0..1, and mute', () => {
    const { audio, engine } = setup()
    engine.setVolume(0.3)
    expect(audio.volume).toBeCloseTo(0.3)
    engine.setVolume(7)
    expect(audio.volume).toBe(1)
    engine.setVolume(-1)
    expect(audio.volume).toBe(0)
    engine.setMuted(true)
    expect(audio.muted).toBe(true)
  })

  it('stops notifying after unsubscribe', () => {
    const { audio, engine } = setup()
    const extra = { onPlaying: vi.fn() }
    const unsubscribe = engine.subscribe(extra)
    audio.dispatchEvent(new Event('playing'))
    unsubscribe()
    audio.dispatchEvent(new Event('playing'))
    expect(extra.onPlaying).toHaveBeenCalledOnce()
  })
})
