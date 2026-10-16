import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPreviewEngine } from './audio/AudioEngine'
import { PREVIEW_SECONDS } from './hooks/useStoryPreview'
import {
  BOB,
  ME,
  createFakeStories,
  makeAlbumStory,
  makeArtistStory,
  makeStory,
} from './test/fakeStories'
import { ALBUM, ALBUM_DETAIL, ARTIST, ARTIST_DETAIL, TRACKS, homeApi } from './test/fixtures'
import type { FakeEngine } from './test/FakeEngine'
import { AUTH, json, mockApi, renderApp } from './test/utils'
import type { StoryGroup } from './types/stories'

const preview = () => createPreviewEngine() as unknown as FakeEngine
const [A, B] = TRACKS
const START = A.preview_start_sec

function boot(path: string, groups: StoryGroup[] = []) {
  const stories = createFakeStories(groups)
  mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    'GET /api/albums/album-1': () => json(ALBUM_DETAIL),
    'GET /api/artists/artist-1': () => json(ARTIST_DETAIL),
    'GET /api/search?q=:q': () =>
      json({ query: 'nova', tracks: [A], albums: [ALBUM], artists: [ARTIST] }),
    ...stories.routes,
  })
  renderApp(path)
  return { stories }
}

const composer = () => screen.findByRole('dialog', { name: 'Share to your story' })
const viewer = () => screen.findByRole('dialog', { name: /stories$/ })
const bubble = (label: string) => screen.findByRole('button', { name: `View ${label} story` })
const mainArea = () => within(screen.getByRole('main'))

afterEach(() => vi.useRealTimers())

// ------------------------------------------------------- sharing from the pages

describe('sharing an album', () => {
  it('opens the composer with the album already chosen, and shares it', async () => {
    const { stories } = boot('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await userEvent.click(mainArea().getByRole('button', { name: 'Share to story' }))
    const modal = within(await composer())

    // The album is the subject: no search needed, and the hint says where followers can go.
    expect(modal.getByText('Album · Nova Drift · 2023')).toBeInTheDocument()
    expect(modal.queryByLabelText('Search for something to share')).not.toBeInTheDocument()
    expect(modal.getByText(/tap through to the album/)).toBeInTheDocument()

    await userEvent.type(modal.getByLabelText(/Caption/), 'Play this one loud')
    await userEvent.click(modal.getByRole('radio', { name: 'Ocean' }))
    expect(within(modal.getByTestId('story-preview')).getByText('Neon Horizons')).toBeInTheDocument()
    expect(within(modal.getByTestId('story-preview')).getByText('Play this one loud')).toBeInTheDocument()

    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))

    await waitFor(() => expect(stories.state.posted).toHaveLength(1))
    // Exactly one subject id goes over the wire.
    expect(stories.state.posted[0]).toEqual({
      album_id: 'album-1',
      caption: 'Play this one loud',
      background_color: '#38BDF8,#1E3A8A',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Stories show up in the row on Home.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }))
    expect(await bubble('Your')).toBeInTheDocument()
  })

  it('lets you change your mind and pick something else', async () => {
    boot('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })
    await userEvent.click(mainArea().getByRole('button', { name: 'Share to story' }))
    const modal = within(await composer())

    await userEvent.click(modal.getByRole('button', { name: 'Change' }))
    expect(modal.getByLabelText('Search for something to share')).toBeInTheDocument()
    expect(modal.getByRole('button', { name: 'Share to story' })).toBeDisabled()
  })
})

describe('sharing an artist', () => {
  it('opens the composer with the artist chosen, and shares only the artist', async () => {
    const { stories } = boot('/artists/artist-1')
    await screen.findByRole('heading', { name: 'Nova Drift' })

    await userEvent.click(mainArea().getByRole('button', { name: 'Share to story' }))
    const modal = within(await composer())

    expect(modal.getByText('Artist · Artist')).toBeInTheDocument()
    expect(modal.getByText(/tap through to the artist page/)).toBeInTheDocument()

    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))

    await waitFor(() => expect(stories.state.posted).toHaveLength(1))
    expect(stories.state.posted[0]).toEqual({
      artist_id: 'artist-1',
      caption: null,
      background_color: '#1DB954,#0B3D2E',
    })
    // Stories show up in the row on Home.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }))
    expect(await bubble('Your')).toBeInTheDocument()
  })
})

describe('choosing what to share by searching', () => {
  async function openPicker() {
    const ctx = boot('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Add story' }))
    const modal = within(await composer())
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'nova')
    return { ...ctx, modal }
  }

  it('offers tracks, albums and artists in separate groups', async () => {
    const { modal } = await openPicker()
    await modal.findByRole('button', { name: 'Choose Afterglow' })

    const tracks = within(modal.getByRole('region', { name: 'Tracks' }))
    const albums = within(modal.getByRole('region', { name: 'Albums' }))
    const artists = within(modal.getByRole('region', { name: 'Artists' }))
    expect(tracks.getByText('Track · Nova Drift')).toBeInTheDocument()
    expect(albums.getByText('Album · Nova Drift · 2023')).toBeInTheDocument()
    expect(artists.getByText('Artist')).toBeInTheDocument()
  })

  it('shares an album picked from the search results', async () => {
    const { stories, modal } = await openPicker()
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Neon Horizons' }))
    expect(modal.getByText('Album · Nova Drift · 2023')).toBeInTheDocument()

    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    await waitFor(() => expect(stories.state.posted[0]).toMatchObject({ album_id: 'album-1' }))
    expect(stories.state.posted[0]).not.toHaveProperty('track_id')
  })

  it('shares an artist picked from the search results', async () => {
    const { stories, modal } = await openPicker()
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Nova Drift' }))

    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    await waitFor(() => expect(stories.state.posted[0]).toMatchObject({ artist_id: 'artist-1' }))
    expect(stories.state.posted[0]).not.toHaveProperty('track_id')
  })

  it('still shares a track picked from the same results', async () => {
    const { stories, modal } = await openPicker()
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Afterglow' }))
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    await waitFor(() => expect(stories.state.posted[0]).toMatchObject({ track_id: 'track-1' }))
  })

  it('reports an unknown share target from the server', async () => {
    const { stories, modal } = await openPicker()
    stories.failNext('POST /api/stories', 404, 'Album not found')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Neon Horizons' }))
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    expect(await modal.findByRole('alert')).toHaveTextContent('Album not found')
  })
})

// ------------------------------------------------------------------ the viewer

describe('viewing an album story', () => {
  const albumGroup = (): StoryGroup => ({
    user: BOB,
    stories: [makeAlbumStory(BOB, { caption: 'Whole album, no skips' })],
  })

  it('shows the cover, album details and caption, and plays the album preview', async () => {
    boot('/', [albumGroup()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(dialog.getByText('Album', { selector: 'p' })).toBeInTheDocument()
    expect(dialog.getByText('Neon Horizons')).toBeInTheDocument()
    expect(dialog.getByText('Nova Drift · 2023')).toBeInTheDocument()
    expect(dialog.getByText('Whole album, no skips')).toBeInTheDocument()
    expect(dialog.getByRole('img', { name: 'Neon Horizons cover' })).toBeInTheDocument()

    expect(preview().lastLoad).toBe(A.audio_url) // the album's first track
    expect(preview().currentTime).toBe(START)
  })

  it('links straight to the album and closes the viewer', async () => {
    boot('/', [albumGroup()])
    await userEvent.click(await bubble('bobby'))
    const link = within(await viewer()).getByRole('link', { name: 'Open album' })
    expect(link).toHaveAttribute('href', '/albums/album-1')

    await userEvent.click(link)

    expect(await screen.findByRole('heading', { level: 1, name: 'Neon Horizons' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /stories$/ })).not.toBeInTheDocument()
  })
})

describe('viewing an artist story', () => {
  const artistGroup = (): StoryGroup => ({ user: BOB, stories: [makeArtistStory(BOB)] })

  it('shows a round profile picture and plays the artist’s top track', async () => {
    boot('/', [artistGroup()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    const picture = dialog.getByRole('img', { name: 'Nova Drift profile picture' })
    expect(picture).toHaveClass('rounded-full')
    expect(picture).toHaveAttribute('src', 'https://img.example/nova.jpg')
    expect(dialog.getByText('Artist', { selector: 'p' })).toBeInTheDocument()
    expect(dialog.getByText('Nova Drift')).toBeInTheDocument()

    expect(preview().lastLoad).toBe(B.audio_url) // the fixture's top track
  })

  it('links to the artist page', async () => {
    boot('/', [artistGroup()])
    await userEvent.click(await bubble('bobby'))
    const link = within(await viewer()).getByRole('link', { name: 'View artist' })
    expect(link).toHaveAttribute('href', '/artists/artist-1')

    await userEvent.click(link)

    expect(await screen.findByRole('heading', { level: 1, name: 'Nova Drift' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /stories$/ })).not.toBeInTheDocument()
  })
})

describe('viewing a track story', () => {
  it('shows the cover and links to the album', async () => {
    boot('/', [{ user: BOB, stories: [makeStory(BOB, 0)] }])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(dialog.getByText('Track', { selector: 'p' })).toBeInTheDocument()
    expect(dialog.getByText('Afterglow')).toBeInTheDocument()
    expect(dialog.getByRole('link', { name: 'Open album' })).toHaveAttribute(
      'href',
      '/albums/album-1',
    )
  })
})

describe('mixed stories', () => {
  it('plays each kind in turn with the right artwork, label and audio', async () => {
    boot('/', [
      {
        user: BOB,
        stories: [makeStory(BOB, 0), makeAlbumStory(BOB, { preview_track: TRACKS[2] }), makeArtistStory(BOB)],
      },
    ])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(dialog.getByText('Track', { selector: 'p' })).toBeInTheDocument()
    expect(preview().lastLoad).toBe(TRACKS[0].audio_url)

    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(dialog.getByText('Album', { selector: 'p' })).toBeInTheDocument())
    expect(preview().lastLoad).toBe(TRACKS[2].audio_url)

    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(dialog.getByText('Artist', { selector: 'p' })).toBeInTheDocument())
    expect(preview().lastLoad).toBe(TRACKS[1].audio_url)
    expect(dialog.getByRole('link', { name: 'View artist' })).toBeInTheDocument()

    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('a story with nothing to play', () => {
  it('shows the artwork silently and still moves on after 15 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    boot('/', [
      {
        user: BOB,
        stories: [makeAlbumStory(BOB, { preview_track: null }), makeStory(BOB, 1)],
      },
    ])
    fireEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(dialog.getByText('Neon Horizons')).toBeInTheDocument()
    expect(preview().loads).toEqual([]) // nothing was loaded
    // No misleading "audio unavailable": there simply isn't any.
    expect(dialog.queryByText(/Audio unavailable/)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime((PREVIEW_SECONDS + 1) * 1000)
    })
    await waitFor(() => expect(dialog.getByText('City Lights Fade')).toBeInTheDocument())
    expect(preview().lastLoad).toBe(B.audio_url) // the next story plays normally
  })

  it('can be paused without audio', async () => {
    boot('/', [{ user: BOB, stories: [makeAlbumStory(BOB, { preview_track: null })] }])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    await userEvent.click(dialog.getByRole('button', { name: 'Pause story' }))
    expect(dialog.getByText(/Press play to listen/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Play story' }))
    expect(dialog.getByRole('button', { name: 'Pause story' })).toBeInTheDocument()
  })
})

describe('deleting your own album or artist story', () => {
  it('works the same as for a track story', async () => {
    const { stories } = boot('/', [
      { user: ME, stories: [makeArtistStory(ME), makeAlbumStory(ME)] },
    ])
    await userEvent.click(await bubble('Your'))
    const dialog = within(await viewer())

    await userEvent.click(dialog.getByRole('button', { name: 'Delete story' }))

    await waitFor(() => expect(stories.state.groups[0].stories).toHaveLength(1))
    await waitFor(() => expect(dialog.getByText('Album', { selector: 'p' })).toBeInTheDocument())
  })
})
