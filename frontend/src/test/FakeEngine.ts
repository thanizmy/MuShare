import { act } from '@testing-library/react'

import type { AudioEnginePort, EngineListener } from '../audio/AudioEngine'

/** In-memory audio engine: behaves like a browser element that always loads instantly. */
export class FakeEngine implements AudioEnginePort {
  private listeners = new Set<EngineListener>()
  loads: string[] = []
  paused = true
  currentTime = 0
  volume = 1
  muted = false
  /** Override to make play() reject, e.g. with a NotAllowedError. */
  playImpl: () => Promise<void> = () => Promise.resolve()

  load(url: string) {
    this.loads.push(url)
    this.currentTime = 0
  }

  play() {
    this.paused = false
    this.emit((l) => l.onPlaying?.())
    return this.playImpl()
  }

  pause() {
    this.paused = true
    this.emit((l) => l.onPause?.())
  }

  seek(seconds: number) {
    this.currentTime = seconds
  }

  setVolume(volume: number) {
    this.volume = volume
  }

  setMuted(muted: boolean) {
    this.muted = muted
  }

  subscribe(listener: EngineListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Forget playback state between tests; store subscriptions are deliberately kept. */
  reset() {
    this.loads = []
    this.paused = true
    this.currentTime = 0
    this.volume = 1
    this.muted = false
    this.playImpl = () => Promise.resolve()
  }

  // ---- test helpers: things the browser would do on its own
  emit(fn: (listener: EngineListener) => void) {
    this.listeners.forEach(fn)
  }
  // The helpers below are called from tests, outside React's event handlers, so React
  // needs to be told the resulting store updates are expected.
  tick(currentTime: number, duration: number) {
    this.currentTime = currentTime
    act(() => this.emit((l) => l.onTimeUpdate?.(currentTime, duration)))
  }
  end() {
    act(() => this.emit((l) => l.onEnded?.()))
  }
  fail(message: string) {
    act(() => this.emit((l) => l.onError?.(message)))
  }
  get lastLoad() {
    return this.loads[this.loads.length - 1]
  }
}
