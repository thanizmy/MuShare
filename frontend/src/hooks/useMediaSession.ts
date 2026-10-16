import { useEffect } from 'react'

import { usePlayer } from './usePlayer'
import { playerStore } from '../store/playerStore'

/** Lock-screen / hardware media key integration, where the browser supports it. */
export function useMediaSession() {
  const { track, isPlaying } = usePlayer()

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.album.artist.name,
          album: track.album.title,
          artwork: track.album.cover_url ? [{ src: track.album.cover_url, sizes: '600x600' }] : [],
        })
      : null
  }, [track])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = !track ? 'none' : isPlaying ? 'playing' : 'paused'
  }, [track, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const { mediaSession } = navigator
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => !playerStore.getState().isPlaying && playerStore.getState().togglePlay()],
      ['pause', () => playerStore.getState().isPlaying && playerStore.getState().togglePlay()],
      ['previoustrack', () => playerStore.getState().previous()],
      ['nexttrack', () => playerStore.getState().next()],
      ['seekto', (details) => details.seekTime != null && playerStore.getState().seek(details.seekTime)],
    ]
    for (const [action, handler] of actions) {
      try {
        mediaSession.setActionHandler(action, handler)
      } catch {
        // Some browsers don't support every action.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          mediaSession.setActionHandler(action, null)
        } catch {
          // ignore
        }
      }
    }
  }, [])
}
