export interface EngineListener {
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onPlaying?: () => void
  onPause?: () => void
  onWaiting?: () => void
  onCanPlay?: () => void
  /** Metadata is loaded, so seeking to a start position is reliable. */
  onReady?: () => void
  onEnded?: () => void
  onError?: (message: string) => void
}

/** The narrow surface the player store needs; lets tests swap in a fake. */
export interface AudioEnginePort {
  load(url: string): void
  play(): Promise<void>
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  subscribe(listener: EngineListener): () => void
}

const MEDIA_ERRORS: Record<number, string> = {
  1: 'Playback was interrupted.',
  2: 'A network error stopped this track from loading.',
  3: 'This track could not be decoded.',
  4: 'This track is unavailable or in an unsupported format.',
}

/** Owns the single HTMLAudioElement. Lives outside React so navigation never interrupts audio. */
export class AudioEngine implements AudioEnginePort {
  private readonly listeners = new Set<EngineListener>()

  constructor(private readonly audio: HTMLAudioElement = new Audio()) {
    audio.preload = 'auto'
    const emitTime = () => this.emit((l) => l.onTimeUpdate?.(audio.currentTime, this.duration()))
    audio.addEventListener('timeupdate', emitTime)
    audio.addEventListener('durationchange', emitTime)
    audio.addEventListener('playing', () => this.emit((l) => l.onPlaying?.()))
    audio.addEventListener('pause', () => this.emit((l) => l.onPause?.()))
    audio.addEventListener('waiting', () => this.emit((l) => l.onWaiting?.()))
    audio.addEventListener('canplay', () => this.emit((l) => l.onCanPlay?.()))
    audio.addEventListener('loadedmetadata', () => this.emit((l) => l.onReady?.()))
    audio.addEventListener('ended', () => this.emit((l) => l.onEnded?.()))
    audio.addEventListener('error', () => {
      const code = audio.error?.code ?? 0
      this.emit((l) => l.onError?.(MEDIA_ERRORS[code] ?? 'This track could not be played.'))
    })
  }

  private duration() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  private emit(fn: (listener: EngineListener) => void) {
    this.listeners.forEach(fn)
  }

  load(url: string) {
    this.audio.src = url
    this.audio.load()
  }

  play() {
    return this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  seek(seconds: number) {
    this.audio.currentTime = Math.max(0, seconds)
  }

  setVolume(volume: number) {
    this.audio.volume = Math.min(1, Math.max(0, volume))
  }

  setMuted(muted: boolean) {
    this.audio.muted = muted
  }

  subscribe(listener: EngineListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/** A separate element for short story previews, so they never fight the main player. */
export function createPreviewEngine(): AudioEngine {
  return new AudioEngine()
}

let singleton: AudioEngine | null = null

export function getAudioEngine(): AudioEngine {
  singleton ??= new AudioEngine()
  return singleton
}
