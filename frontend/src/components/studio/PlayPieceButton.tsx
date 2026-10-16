import { Pause, Play } from 'lucide-react'

import { useAuth } from '../../hooks/useAuth'
import { useTrackPlayback } from '../../hooks/usePlayer'
import { useStudioUsage } from '../../hooks/useStudio'
import { pieceToTrack } from '../../lib/pieceTrack'
import type { Piece } from '../../types/studio'

interface PlayPieceButtonProps {
  piece: Piece
  /** "round" is the small icon button on list rows; "full" is the labelled page button. */
  variant?: 'round' | 'full'
}

/** Plays a studio piece in the normal player, whether or not it is published. */
export function PlayPieceButton({ piece, variant = 'round' }: PlayPieceButtonProps) {
  const { user } = useAuth()
  const usage = useStudioUsage()
  const { currentTrackId, isPlaying, play, togglePlay } = useTrackPlayback()

  const track = pieceToTrack(piece, usage.data?.artist_name ?? user?.username ?? 'You')
  const current = currentTrackId === track.id
  const playing = current && isPlaying
  const Icon = playing ? Pause : Play
  const onClick = () => (current ? togglePlay() : play(track, [track]))

  if (variant === 'full') {
    return (
      <button type="button" className="btn-primary px-6!" onClick={onClick}>
        <Icon className="h-5 w-5" fill="currentColor" aria-hidden />
        {playing ? 'Pause' : 'Play'}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={`${playing ? 'Pause' : 'Play'} ${piece.title}`}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
    >
      <Icon className="h-4 w-4" fill="currentColor" aria-hidden />
    </button>
  )
}
