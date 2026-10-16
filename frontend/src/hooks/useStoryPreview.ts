import { useEffect, useMemo, useRef, useState } from 'react'

import { createPreviewEngine } from '../audio/AudioEngine'
import type { Story } from '../types/stories'

/** How much of a track a story plays before moving on. */
export const PREVIEW_SECONDS = 15

export type PreviewStatus = 'loading' | 'playing' | 'silent'

interface Options {
  story: Story | null
  paused: boolean
  /** Bump to restart the current story (e.g. "previous" on the first one). */
  restartKey: number
  onFinished: () => void
  /** The browser refused to start audio without a gesture. */
  onBlocked: () => void
}

/**
 * Plays a story's 15-second preview on its own audio element and reports progress.
 * The audio clock drives progress; if the audio can't load, a timer takes over so the
 * story still advances instead of hanging.
 */
export function useStoryPreview({ story, paused, restartKey, onFinished, onBlocked }: Options) {
  const engine = useMemo(() => createPreviewEngine(), [])
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<PreviewStatus>('loading')

  const callbacks = useRef({ onFinished, onBlocked })
  callbacks.current = { onFinished, onBlocked }
  const finished = useRef(false)

  const storyId = story?.id
  // The server decides what plays behind each story (a track, a borrowed catalog track, or a
  // signed link to a studio piece); some stories have nothing to play at all.
  const audioUrl = story?.preview?.audio_url
  const start = story?.preview?.start_sec ?? 0

  // Load and wire up a new story.
  useEffect(() => {
    if (!storyId) return
    finished.current = false
    setElapsed(0)
    if (!audioUrl) {
      // Nothing to play: the timer below paces the story instead.
      setStatus('silent')
      return () => {
        finished.current = true
      }
    }
    setStatus('loading')

    const finish = () => {
      if (finished.current) return
      finished.current = true
      callbacks.current.onFinished()
    }
    const unsubscribe = engine.subscribe({
      // Seeking before metadata is loaded isn't dependable, so do it again once it is.
      onReady: () => engine.seek(start),
      onTimeUpdate: (time) => {
        const played = Math.max(0, time - start)
        setElapsed(Math.min(played, PREVIEW_SECONDS))
        if (played >= PREVIEW_SECONDS) finish()
      },
      onPlaying: () => setStatus('playing'),
      onEnded: finish,
      onError: () => setStatus('silent'),
    })
    engine.load(audioUrl)
    engine.seek(start)

    return () => {
      finished.current = true
      unsubscribe()
      engine.pause()
    }
  }, [engine, storyId, audioUrl, start, restartKey])

  // Start / pause audio.
  useEffect(() => {
    if (!audioUrl) return
    if (paused) {
      engine.pause()
      return
    }
    engine.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') return
      if (name === 'NotAllowedError') callbacks.current.onBlocked()
      else setStatus('silent')
    })
  }, [engine, audioUrl, storyId, paused, restartKey])

  // Without working audio, a timer stands in for the audio clock.
  useEffect(() => {
    if (status !== 'silent' || paused || !storyId) return
    const tick = 100
    const timer = setInterval(() => {
      setElapsed((current) => {
        const next = current + tick / 1000
        if (next >= PREVIEW_SECONDS && !finished.current) {
          finished.current = true
          callbacks.current.onFinished()
        }
        return Math.min(next, PREVIEW_SECONDS)
      })
    }, tick)
    return () => clearInterval(timer)
  }, [status, paused, storyId, restartKey])

  return { elapsed, status, progress: elapsed / PREVIEW_SECONDS }
}
