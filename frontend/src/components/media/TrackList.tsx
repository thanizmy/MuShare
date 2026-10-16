import type { ReactNode } from 'react'

import { useTrackPlayback } from '../../hooks/usePlayer'
import type { Track } from '../../types/catalog'
import { TrackRow } from './TrackRow'

interface TrackListProps {
  tracks: Track[]
  label: string
  showCover?: boolean
  menuItems?: (track: Track, close: () => void) => ReactNode
  trailing?: (track: Track, index: number) => ReactNode
}

/** A playable list: starting any row queues the whole list from that track. */
export function TrackList({ tracks, label, showCover, menuItems, trailing }: TrackListProps) {
  const { currentTrackId, isPlaying, play, togglePlay } = useTrackPlayback()

  return (
    <ol aria-label={label} className="space-y-0.5">
      {tracks.map((track, i) => (
        <TrackRow
          key={track.id}
          track={track}
          index={i + 1}
          showCover={showCover}
          isCurrent={track.id === currentTrackId}
          isPlaying={isPlaying}
          onToggle={() => (track.id === currentTrackId ? togglePlay() : play(track, tracks))}
          menuItems={menuItems ? (close) => menuItems(track, close) : undefined}
          trailing={trailing?.(track, i)}
        />
      ))}
    </ol>
  )
}
