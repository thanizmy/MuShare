import { Pause, Play } from 'lucide-react'

import { useTrackPlayback } from '../../hooks/usePlayer'
import { isPlayable } from '../../lib/playable'
import type { Track } from '../../types/catalog'

/** Plays a list from the top; becomes Pause while one of its tracks is playing. */
export function PlayAllButton({ tracks: allTracks }: { tracks: Track[] }) {
  const tracks = allTracks.filter(isPlayable)
  const { currentTrackId, isPlaying, play, togglePlay } = useTrackPlayback()
  const active = tracks.some((t) => t.id === currentTrackId)
  const showPause = active && isPlaying
  const Icon = showPause ? Pause : Play

  return (
    <button
      type="button"
      disabled={tracks.length === 0}
      onClick={() => (active ? togglePlay() : play(tracks[0], tracks))}
      className="btn-primary px-6!"
    >
      <Icon className="h-5 w-5" fill="currentColor" aria-hidden />
      {showPause ? 'Pause' : 'Play'}
    </button>
  )
}
