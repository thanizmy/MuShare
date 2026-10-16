import type { Story, StoryInput, StorySubject } from '../types/stories'

/** Everything needed to draw a story's artwork and link, whatever it is about. */
export interface StoryDisplay {
  label: string
  title: string
  subtitle: string
  imageUrl: string | null
  /** Artists get a round, profile-style picture; music gets square cover art. */
  round: boolean
  /** Where the quick-access link goes, and what it says. Null when there's nowhere to go,
   * such as a studio piece that isn't published yet. */
  href: string | null
  linkLabel: string
}

function albumSubtitle(album: { release_year: number | null; artist: { name: string } }) {
  return [album.artist.name, album.release_year].filter(Boolean).join(' · ')
}

export function displayForSubject(subject: StorySubject): StoryDisplay {
  switch (subject.kind) {
    case 'track': {
      const { track } = subject
      return {
        label: 'Track',
        title: track.title,
        subtitle: track.album.artist.name,
        imageUrl: track.album.cover_url,
        round: false,
        href: `/albums/${track.album.id}`,
        linkLabel: 'Open album',
      }
    }
    case 'album': {
      const { album } = subject
      return {
        label: 'Album',
        title: album.title,
        subtitle: albumSubtitle(album),
        imageUrl: album.cover_url,
        round: false,
        href: `/albums/${album.id}`,
        linkLabel: 'Open album',
      }
    }
    case 'artist': {
      const { artist } = subject
      return {
        label: 'Artist',
        title: artist.name,
        subtitle: 'Artist',
        imageUrl: artist.image_url,
        round: true,
        href: `/artists/${artist.id}`,
        linkLabel: 'View artist',
      }
    }
    case 'piece': {
      const { piece, ownerName } = subject
      return {
        label: 'Original',
        title: piece.title,
        subtitle: `by ${ownerName}`,
        imageUrl: piece.cover_url,
        round: false,
        href: piece.album_id ? `/albums/${piece.album_id}` : null,
        linkLabel: 'Open album',
      }
    }
  }
}

/** The subject of a story fetched from the API. */
export function subjectOfStory(story: Story): StorySubject | null {
  if (story.kind === 'track' && story.track) return { kind: 'track', track: story.track }
  if (story.kind === 'album' && story.album) return { kind: 'album', album: story.album }
  if (story.kind === 'artist' && story.artist) return { kind: 'artist', artist: story.artist }
  if (story.kind === 'piece' && story.piece) {
    return { kind: 'piece', piece: story.piece, ownerName: story.user.username }
  }
  return null
}

export function displayForStory(story: Story): StoryDisplay | null {
  const subject = subjectOfStory(story)
  return subject ? displayForSubject(subject) : null
}

/** The id field the API expects for a subject. */
export function subjectToInput(
  subject: StorySubject,
): Pick<StoryInput, 'track_id' | 'album_id' | 'artist_id' | 'piece_id'> {
  switch (subject.kind) {
    case 'track':
      return { track_id: subject.track.id }
    case 'album':
      return { album_id: subject.album.id }
    case 'artist':
      return { artist_id: subject.artist.id }
    case 'piece':
      return { piece_id: subject.piece.id }
  }
}
