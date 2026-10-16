import { Heart } from 'lucide-react'

import { useIsFavorite, useToggleFavorite } from '../../hooks/useLibrary'
import type { Track } from '../../types/catalog'

export function FavoriteButton({ track }: { track: Track }) {
  const liked = useIsFavorite(track.id)
  const toggle = useToggleFavorite(track.id)

  return (
    <button
      type="button"
      aria-label={`Save ${track.title} to Liked Songs`}
      aria-pressed={liked}
      onClick={() => toggle.mutate({ track, favorite: !liked })}
      className={`rounded-full p-2 transition hover:scale-110 ${
        liked ? 'text-accent' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}
