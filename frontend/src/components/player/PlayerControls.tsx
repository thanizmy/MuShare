import { Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'

import type { PlaybackStatus, RepeatMode } from '../../store/playerStore'

interface PlayerControlsProps {
  hasTrack: boolean
  isPlaying: boolean
  status: PlaybackStatus
  canNext: boolean
  shuffle: boolean
  repeat: RepeatMode
  /** Compact (mini-player) shows only play/pause and next. */
  compact?: boolean
  onTogglePlay: () => void
  onNext: () => void
  onPrevious: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
}

const iconButton =
  'rounded-full p-2 text-ink-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted'

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one',
}

export function PlayerControls({
  hasTrack,
  isPlaying,
  status,
  canNext,
  shuffle,
  repeat,
  compact = false,
  onTogglePlay,
  onNext,
  onPrevious,
  onToggleShuffle,
  onCycleRepeat,
}: PlayerControlsProps) {
  const buffering = status === 'loading'
  const PlayIcon = buffering ? Loader2 : isPlaying ? Pause : Play

  const playButton = (
    <button
      type="button"
      aria-label={isPlaying ? 'Pause' : 'Play'}
      aria-busy={buffering || undefined}
      disabled={!hasTrack}
      onClick={onTogglePlay}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
    >
      <PlayIcon
        className={`h-5 w-5 ${buffering ? 'animate-spin' : isPlaying ? '' : 'translate-x-px'}`}
        fill={buffering ? 'none' : 'currentColor'}
        aria-hidden
      />
    </button>
  )

  const nextButton = (
    <button
      type="button"
      aria-label="Next track"
      disabled={!hasTrack || !canNext}
      onClick={onNext}
      className={iconButton}
    >
      <SkipForward className="h-5 w-5" fill="currentColor" aria-hidden />
    </button>
  )

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {playButton}
        {nextButton}
      </div>
    )
  }

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Shuffle"
        aria-pressed={shuffle}
        onClick={onToggleShuffle}
        className={`${iconButton} ${shuffle ? 'text-accent!' : ''}`}
      >
        <Shuffle className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Previous track"
        disabled={!hasTrack}
        onClick={onPrevious}
        className={iconButton}
      >
        <SkipBack className="h-5 w-5" fill="currentColor" aria-hidden />
      </button>
      {playButton}
      {nextButton}
      <button
        type="button"
        aria-label={REPEAT_LABEL[repeat]}
        aria-pressed={repeat !== 'off'}
        onClick={onCycleRepeat}
        className={`${iconButton} ${repeat !== 'off' ? 'text-accent!' : ''}`}
      >
        <RepeatIcon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
