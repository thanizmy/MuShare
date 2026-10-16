import { ListMusic, Volume1, Volume2, VolumeX } from 'lucide-react'

import { usePlayer } from '../../hooks/usePlayer'
import { formatTime } from '../../lib/format'
import { isPrivateStudioTrack } from '../../lib/pieceTrack'
import { useUiStore } from '../../store/uiStore'
import { FavoriteButton } from '../library/FavoriteButton'
import { Slider } from '../ui/Slider'
import { NowPlaying } from './NowPlaying'
import { PlayerControls } from './PlayerControls'

/** Desktop player: track info, transport controls with a seek bar, and volume. */
export function PlayerBar() {
  const p = usePlayer()
  const queueOpen = useUiStore((s) => s.queueOpen)
  const toggleQueue = useUiStore((s) => s.toggleQueue)
  const hasTrack = p.track !== null
  const silent = p.muted || p.volume === 0
  const VolumeIcon = silent ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2

  return (
    <footer
      aria-label="Player"
      className="glass-strong fixed inset-x-0 bottom-0 z-40 hidden h-player grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-4 border-x-0 border-b-0 px-6 md:grid"
    >
      <div className="flex min-w-0 items-center gap-2">
        <NowPlaying track={p.track} errorMessage={p.errorMessage} coverClassName="h-14 w-14 shrink-0" />
        {p.track && !isPrivateStudioTrack(p.track) && <FavoriteButton track={p.track} />}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <PlayerControls
          hasTrack={hasTrack}
          isPlaying={p.isPlaying}
          status={p.status}
          canNext={p.canNext}
          shuffle={p.shuffle}
          repeat={p.repeat}
          onTogglePlay={p.togglePlay}
          onNext={p.next}
          onPrevious={p.previous}
          onToggleShuffle={p.toggleShuffle}
          onCycleRepeat={p.cycleRepeat}
        />
        <div className="flex w-full max-w-xl items-center gap-2 text-xs tabular-nums text-ink-muted">
          <span aria-hidden className="w-10 text-right">
            {formatTime(p.currentTime)}
          </span>
          <Slider
            label="Seek"
            className="flex-1"
            value={p.currentTime}
            max={p.duration}
            step={0.25}
            deferred
            disabled={!hasTrack}
            valueText={`${formatTime(p.currentTime)} of ${formatTime(p.duration)}`}
            onChange={p.seek}
          />
          <span aria-hidden className="w-10">
            {formatTime(p.duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Queue"
          aria-expanded={queueOpen}
          onClick={toggleQueue}
          className={`rounded-full p-2 transition hover:text-ink ${queueOpen ? 'text-accent' : 'text-ink-muted'}`}
        >
          <ListMusic className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={silent ? 'Unmute' : 'Mute'}
          aria-pressed={silent}
          onClick={p.toggleMute}
          className="rounded-full p-2 text-ink-muted transition hover:text-ink"
        >
          <VolumeIcon className="h-5 w-5" aria-hidden />
        </button>
        <Slider
          label="Volume"
          className="w-28"
          value={p.muted ? 0 : p.volume}
          max={1}
          step={0.01}
          valueText={`${Math.round((p.muted ? 0 : p.volume) * 100)} percent`}
          onChange={p.setVolume}
        />
      </div>
    </footer>
  )
}
