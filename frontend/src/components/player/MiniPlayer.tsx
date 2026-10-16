import { usePlayer } from '../../hooks/usePlayer'
import { formatTime } from '../../lib/format'
import { NowPlaying } from './NowPlaying'
import { PlayerControls } from './PlayerControls'

/** Mobile bottom player: compact controls and a thin, read-only progress line. */
export function MiniPlayer() {
  const p = usePlayer()
  const percent = p.duration > 0 ? Math.min(100, (p.currentTime / p.duration) * 100) : 0

  return (
    <footer
      aria-label="Mini player"
      className="glass-strong fixed inset-x-0 bottom-0 z-40 flex h-mini-player items-center justify-between gap-3 border-x-0 border-b-0 px-4 md:hidden"
    >
      {p.track && (
        <div
          role="progressbar"
          aria-label="Playback progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(p.duration)}
          aria-valuenow={Math.round(p.currentTime)}
          aria-valuetext={`${formatTime(p.currentTime)} of ${formatTime(p.duration)}`}
          className="absolute inset-x-0 top-0 h-0.5 bg-white/15"
        >
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <NowPlaying track={p.track} errorMessage={p.errorMessage} coverClassName="h-11 w-11 shrink-0" />
      </div>
      <PlayerControls
        compact
        hasTrack={p.track !== null}
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
    </footer>
  )
}
