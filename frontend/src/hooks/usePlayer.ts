import { useShallow } from 'zustand/react/shallow'

import { canGoNext, currentTrackOf, usePlayerStore } from '../store/playerStore'

/** Everything a player UI needs, with current-track and queue-edge facts precomputed. */
export function usePlayer() {
  return usePlayerStore(
    useShallow((s) => ({
      track: currentTrackOf(s),
      canNext: canGoNext(s),
      status: s.status,
      isPlaying: s.isPlaying,
      currentTime: s.currentTime,
      duration: s.duration,
      errorMessage: s.errorMessage,
      volume: s.volume,
      muted: s.muted,
      shuffle: s.shuffle,
      repeat: s.repeat,
      togglePlay: s.togglePlay,
      next: s.next,
      previous: s.previous,
      seek: s.seek,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      toggleShuffle: s.toggleShuffle,
      cycleRepeat: s.cycleRepeat,
    })),
  )
}

/** For lists of tracks: which one is current, and how to start or pause one. */
export function useTrackPlayback() {
  return usePlayerStore(
    useShallow((s) => ({
      currentTrackId: currentTrackOf(s)?.id ?? null,
      isPlaying: s.isPlaying,
      play: s.play,
      togglePlay: s.togglePlay,
    })),
  )
}
