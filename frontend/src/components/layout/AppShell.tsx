import type { MouseEvent } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import { useHistoryLogger } from '../../hooks/useHistoryLogger'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useMediaSession } from '../../hooks/useMediaSession'
import { useUiStore } from '../../store/uiStore'
import { ToastViewport } from '../feedback/ToastViewport'
import { StoryComposerHost } from '../stories/StoryComposer'
import { StoryViewerHost } from '../stories/StoryViewer'
import { MiniPlayer } from '../player/MiniPlayer'
import { PlayerBar } from '../player/PlayerBar'
import { QueuePanel } from '../player/QueuePanel'
import { MobileDrawer } from './MobileDrawer'
import { RouteAnnouncer } from './RouteAnnouncer'
import { SearchBox } from './SearchBox'
import { SidebarContent } from './SidebarContent'
import { TopBar } from './TopBar'

export function AppShell() {
  const { user, logout } = useAuth()
  const openDrawer = useUiStore((s) => s.openDrawer)
  useKeyboardShortcuts()
  useMediaSession()
  useHistoryLogger()

  if (!user) return <Navigate to="/login" replace />

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    document.getElementById('main-content')?.focus()
  }

  return (
    <div className="h-full bg-canvas">
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only z-[80] rounded-full bg-accent px-4 py-2 text-sm font-bold text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <RouteAnnouncer />
      <aside className="fixed left-0 top-0 z-20 hidden h-[calc(100%-var(--player-height))] w-64 border-r border-line bg-surface md:block">
        <SidebarContent />
      </aside>
      <MobileDrawer />

      <main
        id="main-content"
        tabIndex={-1}
        className="h-full overflow-y-auto pb-mini-player outline-hidden md:pb-player md:pl-64"
      >
        <TopBar user={user} onOpenMenu={openDrawer} onLogout={() => void logout()}>
          <SearchBox />
        </TopBar>
        <div className="px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>

      <PlayerBar />
      <MiniPlayer />
      <QueuePanel />
      <StoryComposerHost />
      <StoryViewerHost />
      <ToastViewport />
    </div>
  )
}
