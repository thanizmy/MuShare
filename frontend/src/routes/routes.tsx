import type { RouteObject } from 'react-router-dom'

import { AppShell } from '../components/layout/AppShell'
import AlbumPage from '../pages/Album'
import ArtistPage from '../pages/Artist'
import FavoritesPage from '../pages/Favorites'
import HomePage from '../pages/Home'
import LibraryPage from '../pages/Library'
import LoginPage from '../pages/Login'
import NotFoundPage from '../pages/NotFound'
import PlaylistPage from '../pages/Playlist'
import ProfilePage from '../pages/Profile'
import RegisterPage from '../pages/Register'
import SearchPage from '../pages/Search'
import StudioPage from '../pages/Studio'
import StudioPiecePage from '../pages/StudioPiece'
import UserListPage from '../pages/UserList'
import { GuestOnly, RequireAuth } from './guards'

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'albums/:albumId', element: <AlbumPage /> },
          { path: 'artists/:artistId', element: <ArtistPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'studio', element: <StudioPage /> },
          { path: 'studio/:pieceId', element: <StudioPiecePage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'playlists/:playlistId', element: <PlaylistPage /> },
          { path: 'u/:username', element: <ProfilePage /> },
          { path: 'u/:username/followers', element: <UserListPage kind="followers" /> },
          { path: 'u/:username/following', element: <UserListPage kind="following" /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
