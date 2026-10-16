import {
  AudioWaveform,
  Heart,
  Home,
  Library,
  ListMusic,
  Plus,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useCreatePlaylist, usePlaylists } from '../../hooks/useLibrary'
import { PlaylistFormModal } from '../library/PlaylistFormModal'
import { Logo } from '../ui/Logo'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Your Library', icon: Library },
  { to: '/favorites', label: 'Liked Songs', icon: Heart },
  { to: '/studio', label: 'My Studio', icon: AudioWaveform },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition ${
    isActive ? 'bg-white/10 text-ink' : 'text-ink-muted hover:text-ink'
  }`

function PlaylistNav() {
  const playlists = usePlaylists()
  const createPlaylist = useCreatePlaylist()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  return (
    <section aria-label="Playlists" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Playlists</h2>
        <button
          type="button"
          aria-label="Create playlist"
          onClick={() => setCreating(true)}
          className="rounded-full p-1 text-ink-muted hover:bg-white/10 hover:text-ink"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {playlists.data?.map((playlist) => (
          <li key={playlist.id}>
            <NavLink to={`/playlists/${playlist.id}`} className={linkClass}>
              <ListMusic className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{playlist.title}</span>
            </NavLink>
          </li>
        ))}
        {playlists.data?.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-faint">No playlists yet</li>
        )}
      </ul>
      <PlaylistFormModal
        open={creating}
        heading="Create playlist"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={async (values) => {
          const playlist = await createPlaylist.mutateAsync(values)
          navigate(`/playlists/${playlist.id}`)
        }}
      />
    </section>
  )
}

export function SidebarContent() {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <Logo />
      </div>
      <nav aria-label="Primary">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={linkClass}>
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <PlaylistNav />
    </div>
  )
}
