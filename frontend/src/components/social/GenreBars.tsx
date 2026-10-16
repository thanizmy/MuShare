import type { TopGenre } from '../../types/social'

/**
 * Ranked horizontal bars: one measure (plays) across categories, so a single colour and no
 * legend. Each bar is labelled directly with its value, and the list itself is the table view.
 */
export function GenreBars({ genres }: { genres: TopGenre[] }) {
  const max = Math.max(1, ...genres.map((g) => g.plays))

  return (
    <ol aria-label="Top genres" className="space-y-3">
      {genres.map((g) => (
        <li key={g.genre}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-semibold">{g.genre}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">
              {g.plays} {g.plays === 1 ? 'play' : 'plays'}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(g.plays / max) * 100}%` }}
              title={`${g.genre}: ${g.plays} ${g.plays === 1 ? 'play' : 'plays'}`}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
