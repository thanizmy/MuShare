import { Headphones } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useWrapped } from '../../hooks/useSocial'
import type { Wrapped, WrappedPeriod } from '../../types/social'
import { EmptyState } from '../feedback/EmptyState'
import { QueryBoundary } from '../feedback/QueryBoundary'
import { RowSkeletons } from '../feedback/Skeletons'
import { CoverImage } from '../media/CoverImage'
import { TrackList } from '../media/TrackList'
import { GenreBars } from './GenreBars'

const PERIODS: { value: WrappedPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
]

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-surface p-4">
      <p className="text-3xl font-extrabold tabular-nums tracking-tight text-accent-soft">
        {value.toLocaleString('en-US')}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  )
}

function WrappedBody({ data }: { data: Wrapped }) {
  const playsByTrack = new Map(data.top_tracks.map((t) => [t.track.id, t.plays]))

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat label="Plays" value={data.total_plays} />
        <Stat label="Minutes listened" value={data.total_minutes} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Top artists" className="space-y-3">
          <h3 className="text-lg font-bold">Top artists</h3>
          <ol className="space-y-1">
            {data.top_artists.map(({ artist, plays }, i) => (
              <li key={artist.id}>
                <Link
                  to={`/artists/${artist.id}`}
                  className="flex items-center gap-3 rounded-control p-2 hover:bg-white/10"
                >
                  <span className="w-5 text-right text-sm tabular-nums text-ink-muted">{i + 1}</span>
                  <CoverImage src={artist.image_url} className="h-12 w-12 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{artist.name}</span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {plays} {plays === 1 ? 'play' : 'plays'}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Top genres" className="space-y-3">
          <h3 className="text-lg font-bold">Top genres</h3>
          <GenreBars genres={data.top_genres} />
        </section>
      </div>

      <section aria-label="Top songs" className="space-y-3">
        <h3 className="text-lg font-bold">Top songs</h3>
        <TrackList
          tracks={data.top_tracks.map((t) => t.track)}
          label="Top songs list"
          trailing={(track) => {
            const plays = playsByTrack.get(track.id) ?? 0
            return (
              <span className="ml-2 w-16 text-right text-xs tabular-nums text-ink-muted">
                {plays} {plays === 1 ? 'play' : 'plays'}
              </span>
            )
          }}
        />
      </section>
    </div>
  )
}

/** A listener's top artists, songs and genres, for all time or the last 30 days. */
export function WrappedPanel({ username, isMe }: { username: string; isMe: boolean }) {
  const [period, setPeriod] = useState<WrappedPeriod>('all')
  const query = useWrapped(username, period)

  return (
    <section aria-label="Wrapped" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">Wrapped</h2>
        <div role="group" aria-label="Time period" className="flex rounded-full bg-white/5 p-1">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                period === value ? 'bg-white text-black' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <QueryBoundary
        query={query}
        skeleton={<RowSkeletons count={4} />}
        empty={{
          when: (data) => data.total_plays === 0,
          node: (
            <EmptyState
              icon={Headphones}
              title="No listening history yet"
              description={
                isMe
                  ? 'Listen to a few tracks and your top artists, songs and genres will show up here.'
                  : `${username} hasn't listened to anything ${period === '30d' ? 'in the last 30 days' : 'yet'}.`
              }
            />
          ),
        }}
      >
        {(data) => <WrappedBody data={data} />}
      </QueryBoundary>
    </section>
  )
}
