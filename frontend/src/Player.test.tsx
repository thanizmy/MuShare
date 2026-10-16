import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getAudioEngine } from './audio/AudioEngine'
import { playerStore } from './store/playerStore'
import { ALBUM_DETAIL, ARTIST_DETAIL, TRACKS, homeApi } from './test/fixtures'
import type { FakeEngine } from './test/FakeEngine'
import { AUTH, json, mockApi, renderApp } from './test/utils'

const engine = () => getAudioEngine() as unknown as FakeEngine
const [A, B, C] = TRACKS

const signedIn = { 'POST /api/auth/refresh': () => json(AUTH), ...homeApi }

const player = () => screen.getByRole('contentinfo', { name: 'Player' })
const mini = () => screen.getByRole('contentinfo', { name: 'Mini player' })

async function openHome() {
  mockApi(signedIn)
  renderApp('/')
  await screen.findByRole('heading', { name: 'Popular tracks' })
}

async function playFromHome(title: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Play ${title}` }))
}

describe('Home shelves', () => {
  it('shows skeletons, then popular tracks, albums and artists', async () => {
    mockApi(signedIn)
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Popular tracks' })).toBeInTheDocument()
    expect(await screen.findByText('Afterglow')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New albums' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Neon Horizons/ })).toHaveAttribute('href', '/albums/album-1')
    const artists = screen.getByRole('region', { name: 'Artists' })
    expect(within(artists).getByRole('link', { name: /Nova Drift/ })).toHaveAttribute(
      'href',
      '/artists/artist-1',
    )
  })

  it('shows an error with retry when a shelf fails, without hiding the others', async () => {
    let attempts = 0
    mockApi({
      ...signedIn,
      'GET /api/tracks?sort=popular&limit=12': () =>
        ++attempts === 1 ? json({ detail: 'Catalog unavailable' }, 503) : json(TRACKS),
    })
    renderApp('/')

    expect(await screen.findByText('Catalog unavailable')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'New albums' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Afterglow')).toBeInTheDocument()
  })

  it('shows an empty state for an empty catalog', async () => {
    mockApi({ ...signedIn, 'GET /api/tracks?sort=popular&limit=12': () => json([]) })
    renderApp('/')
    expect(await screen.findByText('No tracks yet')).toBeInTheDocument()
  })

  it('scrolls a shelf with its arrow buttons', async () => {
    await openHome()
    await userEvent.click(screen.getByRole('button', { name: 'Scroll Popular tracks right' }))
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
  })
})

describe('playback from the UI', () => {
  it('starts a track and reflects it in both players', async () => {
    await openHome()
    await playFromHome('Afterglow')

    expect(engine().lastLoad).toBe(A.audio_url)
    expect(within(player()).getByText('Afterglow')).toBeInTheDocument()
    expect(within(player()).getByRole('link', { name: 'Nova Drift' })).toHaveAttribute(
      'href',
      '/artists/artist-1',
    )
    expect(within(player()).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(within(mini()).getByText('Afterglow')).toBeInTheDocument()
    expect(within(mini()).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('queues the whole shelf so next/previous move through it', async () => {
    await openHome()
    await playFromHome('Afterglow')

    await userEvent.click(within(player()).getByRole('button', { name: 'Next track' }))
    expect(engine().lastLoad).toBe(B.audio_url)
    expect(within(player()).getByText('City Lights Fade')).toBeInTheDocument()

    await userEvent.click(within(player()).getByRole('button', { name: 'Next track' }))
    expect(within(player()).getByText('Midnight Circuit')).toBeInTheDocument()
    expect(within(player()).getByRole('button', { name: 'Next track' })).toBeDisabled()

    engine().tick(1, 240)
    await userEvent.click(within(player()).getByRole('button', { name: 'Previous track' }))
    expect(within(player()).getByText('City Lights Fade')).toBeInTheDocument()
  })

  it('pauses and resumes from the player and from the card', async () => {
    await openHome()
    await playFromHome('Afterglow')

    await userEvent.click(within(player()).getByRole('button', { name: 'Pause' }))
    expect(engine().paused).toBe(true)
    expect(within(player()).getByRole('button', { name: 'Play' })).toBeInTheDocument()

    // The card's button resumes the current track rather than restarting it.
    await userEvent.click(screen.getByRole('button', { name: 'Play Afterglow' }))
    expect(engine().paused).toBe(false)
    expect(engine().loads).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Pause Afterglow' }))
    expect(engine().paused).toBe(true)
  })

  it('auto-advances when a track ends', async () => {
    await openHome()
    await playFromHome('Afterglow')
    engine().end()
    await waitFor(() => expect(within(player()).getByText('City Lights Fade')).toBeInTheDocument())
  })

  it('keeps playing while navigating between pages', async () => {
    mockApi({
      ...signedIn,
      'GET /api/albums/album-1': () => json(ALBUM_DETAIL),
    })
    renderApp('/')
    await playFromHome('Afterglow')

    await userEvent.click(screen.getAllByRole('link', { name: /Neon Horizons/ })[0])
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    expect(engine().paused).toBe(false)
    expect(engine().loads).toHaveLength(1)
    expect(within(player()).getByText('Afterglow')).toBeInTheDocument()
  })

  it('disables controls and shows the idle message with nothing loaded', async () => {
    await openHome()
    expect(player()).toHaveTextContent('Nothing playing')
    expect(within(player()).getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(within(player()).getByRole('button', { name: 'Previous track' })).toBeDisabled()
    expect(within(player()).getByRole('slider', { name: 'Seek' })).toBeDisabled()
  })

  it('shows a track error and recovers when skipping', async () => {
    await openHome()
    await playFromHome('Afterglow')
    engine().fail('This track is unavailable or in an unsupported format.')

    expect(await within(player()).findByRole('alert')).toHaveTextContent(/unavailable/i)

    await userEvent.click(within(player()).getByRole('button', { name: 'Next track' }))
    await waitFor(() => expect(within(player()).queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('seek, volume, mute, shuffle, repeat', () => {
  it('shows progress and commits a seek only when released', async () => {
    await openHome()
    await playFromHome('Afterglow')
    engine().tick(30, 200)

    const slider = within(player()).getByRole('slider', { name: 'Seek' })
    expect(slider).toHaveAttribute('aria-valuetext', '0:30 of 3:20')
    expect(within(player()).getByText('0:30')).toBeInTheDocument()
    expect(within(player()).getByText('3:20')).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '120' } })
    expect(engine().currentTime).toBe(30) // still dragging: audio untouched

    fireEvent.pointerUp(slider)
    expect(engine().currentTime).toBe(120)
  })

  it('changes volume and toggles mute', async () => {
    await openHome()
    const volume = within(player()).getByRole('slider', { name: 'Volume' })

    fireEvent.change(volume, { target: { value: '0.25' } })
    expect(engine().volume).toBe(0.25)
    expect(volume).toHaveAttribute('aria-valuetext', '25 percent')

    await userEvent.click(within(player()).getByRole('button', { name: 'Mute' }))
    expect(engine().muted).toBe(true)
    expect(within(player()).getByRole('button', { name: 'Unmute' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(within(player()).getByRole('button', { name: 'Unmute' }))
    expect(engine().muted).toBe(false)
  })

  it('toggles shuffle and cycles repeat modes with accessible state', async () => {
    await openHome()
    const shuffle = within(player()).getByRole('button', { name: 'Shuffle' })
    expect(shuffle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(shuffle)
    expect(shuffle).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(player()).getByRole('button', { name: 'Repeat off' }))
    await userEvent.click(within(player()).getByRole('button', { name: 'Repeat all' }))
    await userEvent.click(within(player()).getByRole('button', { name: 'Repeat one' }))
    expect(within(player()).getByRole('button', { name: 'Repeat off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('renders mini-player progress', async () => {
    await openHome()
    await playFromHome('Afterglow')
    engine().tick(50, 200)
    const bar = within(mini()).getByRole('progressbar', { name: 'Playback progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(bar).toHaveAttribute('aria-valuetext', '0:50 of 3:20')
  })
})

describe('keyboard shortcuts', () => {
  async function playing() {
    await openHome()
    await playFromHome('Afterglow')
    engine().tick(30, 200)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  it('Space toggles play/pause', async () => {
    await playing()
    await userEvent.keyboard(' ')
    expect(engine().paused).toBe(true)
    await userEvent.keyboard(' ')
    expect(engine().paused).toBe(false)
  })

  it('Left/Right seek by 5 seconds', async () => {
    await playing()
    await userEvent.keyboard('{ArrowRight}')
    expect(playerStore.getState().currentTime).toBe(35)
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(playerStore.getState().currentTime).toBe(25)
  })

  it('Up/Down change volume and M mutes', async () => {
    await playing()
    await userEvent.keyboard('{ArrowDown}')
    expect(engine().volume).toBe(0.75)
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(engine().volume).toBe(0.85)
    await userEvent.keyboard('m')
    expect(engine().muted).toBe(true)
  })

  it('leaves keys alone while typing in the search box', async () => {
    await playing()
    const input = screen.getByRole('searchbox')
    await userEvent.click(input)
    await userEvent.keyboard('a b{ArrowLeft}')

    expect(input).toHaveValue('a b')
    expect(engine().paused).toBe(false)
    expect(playerStore.getState().currentTime).toBe(30)
  })

  it('leaves arrow keys to a focused slider', async () => {
    await playing()
    const volume = within(player()).getByRole('slider', { name: 'Volume' })
    volume.focus()
    fireEvent.keyDown(volume, { key: 'ArrowLeft' })
    expect(playerStore.getState().currentTime).toBe(30)
  })

  it('does nothing when no track is loaded', async () => {
    await openHome()
    const prevented = !fireEvent.keyDown(document.body, { key: ' ' })
    expect(prevented).toBe(false)
    expect(engine().loads).toEqual([])
  })

  it('ignores combinations with modifier keys', async () => {
    await playing()
    fireEvent.keyDown(document.body, { key: 'ArrowRight', ctrlKey: true })
    expect(playerStore.getState().currentTime).toBe(30)
  })
})

describe('album and artist pages', () => {
  it('shows an album and plays it from the top', async () => {
    mockApi({ ...signedIn, 'GET /api/albums/album-1': () => json(ALBUM_DETAIL) })
    renderApp('/albums/album-1')

    expect(await screen.findByRole('heading', { name: 'Neon Horizons' })).toBeInTheDocument()
    expect(screen.getByText(/3 songs, 10 min/)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Tracks on Neon Horizons' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)

    const page = within(screen.getByRole('main'))
    await userEvent.click(page.getByRole('button', { name: 'Play' }))
    expect(engine().lastLoad).toBe(A.audio_url)
    expect(page.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('plays the clicked row and queues the rest of the album', async () => {
    mockApi({ ...signedIn, 'GET /api/albums/album-1': () => json(ALBUM_DETAIL) })
    renderApp('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await userEvent.click(screen.getByRole('button', { name: 'Play Midnight Circuit' }))
    expect(engine().lastLoad).toBe(C.audio_url)
    expect(playerStore.getState().queue).toEqual(TRACKS)

    const list = screen.getByRole('list', { name: 'Tracks on Neon Horizons' })
    const row = within(list).getByText('Midnight Circuit').closest('li')!
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(within(row).getByRole('button', { name: 'Pause Midnight Circuit' })).toBeInTheDocument()
  })

  it('shows not-found for a missing album', async () => {
    mockApi({ ...signedIn, 'GET /api/albums/nope': () => json({ detail: 'Album not found' }, 404) })
    renderApp('/albums/nope')
    expect(await screen.findByText('Album not found', { selector: 'h2' })).toBeInTheDocument()
  })

  it('shows an artist with popular tracks and albums', async () => {
    mockApi({ ...signedIn, 'GET /api/artists/artist-1': () => json(ARTIST_DETAIL) })
    renderApp('/artists/artist-1')

    expect(await screen.findByRole('heading', { name: 'Nova Drift' })).toBeInTheDocument()
    expect(screen.getByText('Synth-driven electronic duo.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Popular tracks by Nova Drift' })).toBeInTheDocument()
    const albums = screen.getByRole('region', { name: 'Albums' })
    expect(within(albums).getByRole('link', { name: /Neon Horizons/ })).toHaveAttribute(
      'href',
      '/albums/album-1',
    )
  })

  it('shows not-found for a missing artist', async () => {
    mockApi({
      ...signedIn,
      'GET /api/artists/nope': () => json({ detail: 'Artist not found' }, 404),
    })
    renderApp('/artists/nope')
    expect(await screen.findByText('Artist not found', { selector: 'h2' })).toBeInTheDocument()
  })
})

describe('search', () => {
  const results = (q: string) => ({
    query: q,
    tracks: [A],
    artists: [ARTIST_DETAIL],
    albums: [ALBUM_DETAIL],
  })

  it('shows a prompt before anything is typed', async () => {
    mockApi(signedIn)
    renderApp('/search')
    expect(await screen.findByText('Search MuShare')).toBeInTheDocument()
  })

  it('searches live from the top bar, debounced, and updates the URL', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      'GET /api/search?q=aft': () => json(results('aft')),
    })
    const router = renderApp('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })

    await userEvent.type(screen.getByRole('searchbox'), 'aft')

    expect(await screen.findByRole('heading', { name: /Results for/ })).toHaveTextContent('aft')
    expect(router.state.location.pathname).toBe('/search')
    expect(router.state.location.search).toBe('?q=aft')
    expect(await screen.findByRole('list', { name: 'Track results' })).toHaveTextContent('Afterglow')
    expect(screen.getByRole('region', { name: 'Artists' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Albums' })).toBeInTheDocument()

    const searches = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/search'))
    expect(searches).toHaveLength(1) // typing "aft" fired one request, not three
  })

  it('plays a result and queues the result list', async () => {
    mockApi({ ...signedIn, 'GET /api/search?q=aft': () => json(results('aft')) })
    renderApp('/search?q=aft')
    await userEvent.click(await screen.findByRole('button', { name: 'Play Afterglow' }))
    expect(engine().lastLoad).toBe(A.audio_url)
  })

  it('prefills the box from the URL and clears it', async () => {
    mockApi({ ...signedIn, 'GET /api/search?q=aft': () => json(results('aft')) })
    renderApp('/search?q=aft')

    const box = await screen.findByRole('searchbox')
    expect(box).toHaveValue('aft')

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
    expect(await screen.findByText('Search MuShare')).toBeInTheDocument()
  })

  it('shows a helpful empty state when nothing matches', async () => {
    mockApi({
      ...signedIn,
      'GET /api/search?q=zzz': () => json({ query: 'zzz', tracks: [], artists: [], albums: [] }),
    })
    renderApp('/search?q=zzz')
    expect(await screen.findByText('No results')).toBeInTheDocument()
    expect(screen.getByText(/Nothing matched/)).toBeInTheDocument()
  })

  it('shows an error with retry when search fails', async () => {
    let attempts = 0
    mockApi({
      ...signedIn,
      'GET /api/search?q=aft': () =>
        ++attempts === 1 ? json({ detail: 'Search is down' }, 503) : json(results('aft')),
    })
    renderApp('/search?q=aft')
    expect(await screen.findByText('Search is down')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('list', { name: 'Track results' })).toBeInTheDocument()
  })

  it('submits immediately on Enter', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      'GET /api/search?q=night+owl': () => json(results('night owl')),
    })
    renderApp('/')
    await screen.findByRole('heading', { name: 'Popular tracks' })

    await userEvent.type(screen.getByRole('searchbox'), 'night owl{Enter}')
    await screen.findByRole('list', { name: 'Track results' })
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/search?q=night+owl')).toBe(true)
  })
})

describe('signing out', () => {
  it('stops playback and clears the queue', async () => {
    mockApi({ ...signedIn, 'POST /api/auth/logout': () => new Response(null, { status: 204 }) })
    renderApp('/')
    await playFromHome('Afterglow')
    expect(playerStore.getState().isPlaying).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    await screen.findByRole('heading', { name: /welcome back/i })

    expect(playerStore.getState()).toMatchObject({ status: 'idle', queue: [], isPlaying: false })
    expect(engine().paused).toBe(true)
  })
})
