import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { recordPlay } from '../api/endpoints/library'
import { isPrivateStudioTrack } from '../lib/pieceTrack'
import { currentTrackOf, playerStore } from '../store/playerStore'
import { libraryKeys } from './useLibrary'

/** A play counts once the listener has heard this much (or half, for short tracks). */
export const MIN_LISTEN_SECONDS = 30

/** Records listening history while the app is open. Mount once, inside the signed-in shell. */
export function useHistoryLogger() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let loggedTrackId: string | null = null

    return playerStore.subscribe((state) => {
      const track = currentTrackOf(state)
      // Nothing loaded, or the track just started / was restarted: arm for a new play.
      // Private studio pieces aren't catalog tracks, so there is nothing to record a play against.
      if (!track || isPrivateStudioTrack(track) || state.currentTime < 1) {
        loggedTrackId = null
        return
      }
      const threshold = Math.min(MIN_LISTEN_SECONDS, track.duration_sec / 2)
      if (loggedTrackId === track.id || !state.isPlaying || state.currentTime < threshold) return

      loggedTrackId = track.id
      recordPlay(track.id)
        .then(() => queryClient.invalidateQueries({ queryKey: libraryKeys.recent }))
        .catch(() => {
          // History is best-effort; a failed report must never interrupt listening.
        })
    })
  }, [queryClient])
}
