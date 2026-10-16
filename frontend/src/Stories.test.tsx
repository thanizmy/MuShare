import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPreviewEngine, getAudioEngine } from './audio/AudioEngine'
import { PREVIEW_SECONDS } from './hooks/useStoryPreview'
import { playerStore } from './store/playerStore'
import { useSeenStoriesStore } from './store/storyStores'
import { createFakeSocial } from './test/fakeSocial'
import { BOB, CARA, ME, createFakeStories, makeStory } from './test/fakeStories'
import { ALBUM_DETAIL, TRACKS, homeApi } from './test/fixtures'
import type { FakeEngine } from './test/FakeEngine'
import { AUTH, json, mockApi, renderApp } from './test/utils'
import type { StoryGroup } from './types/stories'

const preview = () => createPreviewEngine() as unknown as FakeEngine
const mainEngine = () => getAudioEngine() as unknown as FakeEngine
const [A, B, C] = TRACKS
const START = A.preview_start_sec // every fixture track previews from 10s

function boot(path: string, groups: StoryGroup[] = [], withSocial = false) {
  const stories = createFakeStories(groups)
  const social = createFakeSocial([
    { id: BOB.id, username: BOB.username, bio: null, avatar_url: null },
    { id: CARA.id, username: CARA.username, bio: null, avatar_url: null },
  ])
  const fetchMock = mockApi({
    'POST /api/auth/refresh': () => json(AUTH),
    ...homeApi,
    'GET /api/albums/album-1': () => json(ALBUM_DETAIL),
    'GET /api/search?q=:q': () =>
      json({ query: 'aft', tracks: [A, B], artists: [], albums: [] }),
    ...(withSocial ? social.routes : {}),
    ...stories.routes,
  })
  renderApp(path)
  return { stories, social, fetchMock }
}

const toastRegion = () => screen.getAllByRole('status').find((el) => el.hasAttribute('aria-live'))!
const viewer = () => screen.findByRole('dialog', { name: /stories$/ })
const bubble = (label: string) => screen.findByRole('button', { name: `View ${label} story` })

const bobStories = (): StoryGroup => ({
  user: BOB,
  stories: [
    makeStory(BOB, 0, { caption: 'Late night loop' }),
    makeStory(BOB, 1, { background_color: '#FF7A59,#7B2CBF' }),
  ],
})
const caraStories = (): StoryGroup => ({ user: CARA, stories: [makeStory(CARA, 2)] })

afterEach(() => vi.useRealTimers())

// ----------------------------------------------------------------- stories row

describe('stories row', () => {
  it('shows an add button and a bubble per person with stories, you first', async () => {
    boot('/', [
      { user: ME, stories: [makeStory(ME, 0)] },
      bobStories(),
    ])

    const row = await screen.findByRole('region', { name: 'Stories' })
    expect(within(row).getByRole('button', { name: 'Add story' })).toBeInTheDocument()
    const bubbles = await within(row).findAllByRole('button', { name: /^View .* story$/ })
    expect(bubbles.map((b) => b.getAttribute('aria-label'))).toEqual([
      'View Your story',
      'View bobby story',
    ])
  })

  it('marks unwatched bubbles and greys out watched ones', async () => {
    const bob = bobStories()
    boot('/', [bob])
    useSeenStoriesStore.setState({ seen: bob.stories.map((s) => s.id) })

    expect(await bubble('bobby')).toHaveAttribute('data-seen', 'true')
  })

  it('shows just the add button when nobody has a story', async () => {
    boot('/')
    const row = await screen.findByRole('region', { name: 'Stories' })
    expect(within(row).getByRole('button', { name: 'Add story' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^View / })).not.toBeInTheDocument()
  })
})

// -------------------------------------------------------------------- composer

describe('story composer', () => {
  async function openFromHome() {
    const ctx = boot('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Add story' }))
    return { ...ctx, modal: within(await screen.findByRole('dialog', { name: 'Share to your story' })) }
  }

  it('picks a track by searching, adds a caption and gradient, and shares', async () => {
    const { stories, modal } = await openFromHome()
    expect(modal.getByRole('button', { name: 'Share to story' })).toBeDisabled()

    await userEvent.type(modal.getByLabelText('Search for something to share'), 'aft')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Afterglow' }))
    expect(modal.getByRole('button', { name: 'Change' })).toBeInTheDocument()

    await userEvent.type(modal.getByLabelText(/Caption/), '  on repeat ')
    expect(modal.getByText('9/280')).toBeInTheDocument() // trimmed length
    await userEvent.click(modal.getByRole('radio', { name: 'Sunset' }))
    expect(modal.getByRole('radio', { name: 'Sunset' })).toHaveAttribute('aria-checked', 'true')
    expect(modal.getByRole('radio', { name: 'Emerald' })).toHaveAttribute('aria-checked', 'false')
    expect(within(modal.getByTestId('story-preview')).getByText('on repeat')).toBeInTheDocument()

    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))

    await waitFor(() => expect(stories.state.groups).toHaveLength(1))
    expect(stories.state.groups[0].stories[0]).toMatchObject({
      caption: 'on repeat',
      background_color: '#FF7A59,#7B2CBF',
      track: { id: A.id },
    })
    expect(await within(toastRegion()).findByText(/Story shared/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The new story appears in the row straight away.
    expect(await bubble('Your')).toBeInTheDocument()
  })

  it('shares with no caption as null and the default background', async () => {
    const { stories, modal } = await openFromHome()
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'aft')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose City Lights Fade' }))
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))

    await waitFor(() => expect(stories.state.groups).toHaveLength(1))
    expect(stories.state.groups[0].stories[0]).toMatchObject({
      caption: null,
      background_color: '#1DB954,#0B3D2E',
    })
  })

  it('lets you change the chosen track', async () => {
    const { modal } = await openFromHome()
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'aft')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Afterglow' }))
    await userEvent.click(modal.getByRole('button', { name: 'Change' }))
    expect(modal.getByLabelText('Search for something to share')).toBeInTheDocument()
    expect(modal.getByRole('button', { name: 'Share to story' })).toBeDisabled()
  })

  it('blocks an over-long caption', async () => {
    const { stories, modal } = await openFromHome()
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'aft')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Afterglow' }))
    fireEvent.change(modal.getByLabelText(/Caption/), { target: { value: 'x'.repeat(281) } })

    expect(modal.getByRole('alert')).toHaveTextContent('Use 280 characters or fewer')
    expect(modal.getByRole('button', { name: 'Share to story' })).toBeDisabled()
    expect(stories.state.groups).toHaveLength(0)
  })

  it('keeps the dialog open and shows the error when sharing fails', async () => {
    const { stories, modal } = await openFromHome()
    stories.failNext('POST /api/stories', 409, 'You can have at most 30 active stories')
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'aft')
    await userEvent.click(await modal.findByRole('button', { name: 'Choose Afterglow' }))
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))

    expect(await modal.findByRole('alert')).toHaveTextContent('at most 30 active stories')
    expect(screen.getByRole('dialog', { name: 'Share to your story' })).toBeInTheDocument()
  })

  it('opens with the track preselected from a track menu', async () => {
    const { stories } = boot('/albums/album-1')
    await screen.findByRole('heading', { name: 'Neon Horizons' })

    await userEvent.click(screen.getByRole('button', { name: 'More options for City Lights Fade' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Share to story…' }))

    const modal = within(await screen.findByRole('dialog', { name: 'Share to your story' }))
    expect(modal.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(modal.getAllByText('City Lights Fade').length).toBeGreaterThan(0)
    expect(modal.queryByLabelText('Search for something to share')).not.toBeInTheDocument()
    await userEvent.click(modal.getByRole('button', { name: 'Share to story' }))
    await waitFor(() => expect(stories.state.groups[0]?.stories[0].track?.id).toBe(B.id))
  })

  it('tells you when no track matches the search', async () => {
    const ctx = boot('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Add story' }))
    const modal = within(await screen.findByRole('dialog', { name: 'Share to your story' }))
    mockApi({
      'POST /api/auth/refresh': () => json(AUTH),
      ...homeApi,
      ...ctx.stories.routes,
      'GET /api/search?q=:q': () => json({ query: 'zz', tracks: [], artists: [], albums: [] }),
    })
    await userEvent.type(modal.getByLabelText('Search for something to share'), 'zz')
    expect(await modal.findByText(/Nothing matches/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------- viewer

describe('story viewer', () => {
  it('opens full screen, shows the story, and plays the preview from its start point', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))

    const dialog = within(await screen.findByRole('dialog', { name: "bobby's stories" }))
    expect(dialog.getByText('Afterglow')).toBeInTheDocument()
    expect(dialog.getByText('Nova Drift')).toBeInTheDocument()
    expect(dialog.getByText('Late night loop')).toBeInTheDocument()
    expect(dialog.getByText('3h ago')).toBeInTheDocument()

    expect(preview().lastLoad).toBe(A.audio_url)
    expect(preview().currentTime).toBe(START)
    expect(preview().paused).toBe(false)
  })

  it('seeks again once metadata loads, because early seeks are not dependable', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))
    await viewer()

    preview().seek(0) // the browser ignored the early seek
    act(() => preview().emit((l) => l.onReady?.()))
    expect(preview().currentTime).toBe(START)
  })

  it('shows segmented progress that follows the audio', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = await viewer()

    preview().tick(START + PREVIEW_SECONDS / 2, 200)
    const bars = [...dialog.querySelectorAll<HTMLElement>('[aria-hidden] > div > div')]
    expect(bars).toHaveLength(2)
    expect(bars[0].style.width).toBe('50%')
    expect(bars[1].style.width).toBe('0%')
  })

  it('advances after 15 seconds of audio, then to the next person, then closes', async () => {
    boot('/', [bobStories(), caraStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(dialog.getByText('Afterglow')).toBeInTheDocument()
    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(dialog.getByText('City Lights Fade')).toBeInTheDocument())
    expect(preview().lastLoad).toBe(B.audio_url)

    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(dialog.getByText('Midnight Circuit')).toBeInTheDocument())
    expect(dialog.getByText('carol')).toBeInTheDocument()

    preview().tick(START + PREVIEW_SECONDS, 200)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('advances when the track ends before the preview does', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())
    preview().end()
    await waitFor(() => expect(dialog.getByText('City Lights Fade')).toBeInTheDocument())
  })

  it('navigates with the tap zones and arrow keys, and replays at the very start', async () => {
    boot('/', [bobStories(), caraStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    await userEvent.click(dialog.getByRole('button', { name: 'Next story' }))
    expect(dialog.getByText('City Lights Fade')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Previous story' }))
    expect(dialog.getByText('Afterglow')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(dialog.getByText('Midnight Circuit')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(dialog.getByText('City Lights Fade')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}') // back to the first story
    expect(dialog.getByText('Afterglow')).toBeInTheDocument()
    const loadsBefore = preview().loads.length
    preview().seek(START + 9)
    await userEvent.click(dialog.getByRole('button', { name: 'Previous story' }))
    expect(dialog.getByText('Afterglow')).toBeInTheDocument() // nowhere earlier to go
    expect(preview().loads.length).toBe(loadsBefore + 1) // restarted
    expect(preview().currentTime).toBe(START)
  })

  it('pauses and resumes from the button and the space bar', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    await userEvent.click(dialog.getByRole('button', { name: 'Pause story' }))
    expect(preview().paused).toBe(true)
    expect(dialog.getByText(/Press play to listen/)).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Play story' }))
    expect(preview().paused).toBe(false)

    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard(' ')
    expect(preview().paused).toBe(true)
    await userEvent.keyboard(' ')
    expect(preview().paused).toBe(false)
  })

  it('waits for a tap when the browser blocks autoplay', async () => {
    boot('/', [bobStories()])
    preview().playImpl = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    await userEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    expect(await dialog.findByRole('button', { name: 'Play story' })).toBeInTheDocument()
    preview().playImpl = () => Promise.resolve()
    await userEvent.click(dialog.getByRole('button', { name: 'Play story' }))
    expect(dialog.getByRole('button', { name: 'Pause story' })).toBeInTheDocument()
  })

  it('still advances on a timer when the audio cannot load', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    boot('/', [bobStories()])
    fireEvent.click(await bubble('bobby'))
    const dialog = within(await viewer())

    act(() => preview().fail('This track is unavailable'))
    expect(await dialog.findByText('Audio unavailable for this track')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime((PREVIEW_SECONDS + 1) * 1000)
    })
    await waitFor(() => expect(dialog.getByText('City Lights Fade')).toBeInTheDocument())
  })

  it('closes with Escape or the close button, and remembers what you watched', async () => {
    const bob = bobStories()
    boot('/', [bob])
    await userEvent.click(await bubble('bobby'))
    await viewer()
    await userEvent.keyboard('{ArrowRight}') // watch both

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(preview().paused).toBe(true)
    expect((await bubble('bobby')).getAttribute('data-seen')).toBe('true')
    expect(JSON.parse(localStorage.getItem('mushare.seenStories') ?? '[]')).toEqual(
      bob.stories.map((s) => s.id),
    )

    await userEvent.click(await bubble('bobby'))
    await userEvent.click(within(await viewer()).getByRole('button', { name: 'Close stories' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pauses the main player while watching and resumes it afterwards', async () => {
    boot('/', [bobStories()])
    act(() => playerStore.getState().play(C))
    expect(mainEngine().paused).toBe(false)

    await userEvent.click(await bubble('bobby'))
    await viewer()
    expect(mainEngine().paused).toBe(true)

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(mainEngine().paused).toBe(false))
    expect(playerStore.getState().isPlaying).toBe(true)
  })

  it('leaves the main player alone if it was not playing', async () => {
    boot('/', [bobStories()])
    act(() => playerStore.getState().play(C))
    act(() => playerStore.getState().togglePlay()) // user paused it
    expect(mainEngine().paused).toBe(true)

    await userEvent.click(await bubble('bobby'))
    await viewer()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mainEngine().paused).toBe(true)
  })

  it('lets you delete your own story, and only yours', async () => {
    const { stories } = boot('/', [
      { user: ME, stories: [makeStory(ME, 0, { caption: 'mine' }), makeStory(ME, 1)] },
      bobStories(),
    ])
    await userEvent.click(await bubble('Your'))
    const dialog = within(await viewer())

    await userEvent.click(dialog.getByRole('button', { name: 'Delete story' }))

    await waitFor(() => expect(stories.state.groups[0].stories).toHaveLength(1))
    expect(await within(toastRegion()).findByText('Story deleted')).toBeInTheDocument()
    // The next of your stories slides into place.
    await waitFor(() => expect(dialog.getByText('City Lights Fade')).toBeInTheDocument())

    await userEvent.keyboard('{Escape}')
    await userEvent.click(await bubble('bobby'))
    const bobDialog = within(await viewer())
    expect(bobDialog.queryByRole('button', { name: 'Delete story' })).not.toBeInTheDocument()
  })

  it('closes after deleting the last story', async () => {
    const { stories } = boot('/', [{ user: ME, stories: [makeStory(ME, 0)] }])
    await userEvent.click(await bubble('Your'))
    await userEvent.click(within(await viewer()).getByRole('button', { name: 'Delete story' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stories.state.groups).toEqual([])
  })

  it('keeps the story open and reports the failure when deleting fails', async () => {
    const { stories } = boot('/', [{ user: ME, stories: [makeStory(ME, 0)] }])
    stories.failNext('DELETE /api/stories/:id', 500, 'Could not delete')
    await userEvent.click(await bubble('Your'))
    await userEvent.click(within(await viewer()).getByRole('button', { name: 'Delete story' }))

    expect(await within(toastRegion()).findByText('Could not delete')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('links the header to the author profile', async () => {
    boot('/', [bobStories()], true)
    await userEvent.click(await bubble('bobby'))
    await userEvent.click(within(await viewer()).getByRole('link', { name: /bobby/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'bobby' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /stories$/ })).not.toBeInTheDocument()
  })

  it('traps keyboard focus inside the viewer', async () => {
    boot('/', [bobStories()])
    await userEvent.click(await bubble('bobby'))
    const dialog = await viewer()

    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await userEvent.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

// --------------------------------------------------------------------- profile

describe('stories on profiles', () => {
  it('shows a ring that opens that person’s stories', async () => {
    boot('/u/bobby', [bobStories()], true)
    await userEvent.click(await screen.findByRole('button', { name: "View bobby's story" }))

    const dialog = within(await viewer())
    expect(dialog.getByText('Afterglow')).toBeInTheDocument()
    // Only this person's stories play from a profile.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('has no ring when there is nothing to see', async () => {
    boot('/u/carol', [], true)
    await screen.findByRole('heading', { level: 1, name: 'carol' })
    expect(screen.queryByRole('button', { name: "View carol's story" })).not.toBeInTheDocument()
  })
})
