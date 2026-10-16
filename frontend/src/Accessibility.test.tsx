import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ALBUM_DETAIL, ARTIST_DETAIL, homeApi } from './test/fixtures'
import { AUTH, json, mockApi, renderApp } from './test/utils'

const api = () =>
  mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    'GET /api/albums/album-1': () => json(ALBUM_DETAIL),
    'GET /api/artists/artist-1': () => json(ARTIST_DETAIL),
  })

describe('skip link', () => {
  it('is the first thing a keyboard user reaches, and moves focus to the main content', async () => {
    api()
    renderApp('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })

    await userEvent.tab()
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('document titles', () => {
  it.each([
    ['/', 'Home · MuShare'],
    ['/search', 'Search · MuShare'],
    ['/library', 'Your Library · MuShare'],
    ['/favorites', 'Liked Songs · MuShare'],
    ['/nowhere/at/all', 'Page not found · MuShare'],
  ])('%s -> %s', async (path, title) => {
    api()
    renderApp(path)
    await waitFor(() => expect(document.title).toBe(title))
  })

  it('uses the album or artist name once it has loaded', async () => {
    api()
    renderApp('/albums/album-1')
    await waitFor(() => expect(document.title).toBe('Neon Horizons · MuShare'))
  })

  it('uses the artist name on artist pages', async () => {
    api()
    renderApp('/artists/artist-1')
    await waitFor(() => expect(document.title).toBe('Nova Drift · MuShare'))
  })

  it('titles the auth pages', async () => {
    mockApi({ 'POST /api/auth/refresh': () => json({ detail: 'no' }, 401) })
    renderApp('/login')
    await waitFor(() => expect(document.title).toBe('Log in · MuShare'))
  })
})

describe('route announcer', () => {
  it('announces the new page heading politely after navigating', async () => {
    api()
    renderApp('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })

    await userEvent.click(screen.getByRole('link', { name: 'Your Library' }))
    await screen.findByRole('heading', { level: 1, name: 'Your Library' })

    const announcer = screen.getByTestId('route-announcer')
    expect(announcer).toHaveAttribute('aria-live', 'polite')
    await waitFor(() => expect(announcer).toHaveTextContent('Your Library, page loaded'), {
      timeout: 2000,
    })
    act(() => undefined)
  })
})
