import { LogOut, Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { User } from '../../types/auth'
import { Avatar } from '../ui/Avatar'

interface TopBarProps {
  user: User
  onOpenMenu: () => void
  onLogout: () => void
  /** Centre slot, used for the search box. */
  children?: ReactNode
}

export function TopBar({ user, onOpenMenu, onLogout, children }: TopBarProps) {
  return (
    <header className="glass-strong sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 md:px-8">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMenu}
        className="rounded-full p-2 text-ink-muted hover:bg-white/10 hover:text-ink md:hidden"
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      <div className="flex min-w-0 flex-1 items-center">{children}</div>

      <div className="flex items-center gap-3">
        <Link
          to={`/u/${user.username}`}
          aria-label="Your profile"
          className="flex items-center gap-2 rounded-full text-sm font-semibold hover:text-accent-soft"
        >
          <Avatar user={user} />
          <span className="hidden max-w-[10rem] truncate lg:inline">{user.username}</span>
        </Link>
        <button type="button" onClick={onLogout} className="btn-ghost px-3! py-2!">
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Log out</span>
          <span className="sr-only sm:hidden">Log out</span>
        </button>
      </div>
    </header>
  )
}
