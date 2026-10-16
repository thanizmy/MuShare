import { Share2 } from 'lucide-react'

import { useStoryComposerStore } from '../../store/storyStores'
import type { StorySubject } from '../../types/stories'

/** Opens the story composer with this album, artist or track already chosen. */
export function ShareToStoryButton({ subject }: { subject: StorySubject }) {
  const openComposer = useStoryComposerStore((s) => s.open)

  return (
    <button type="button" className="btn-ghost" onClick={() => openComposer(subject)}>
      <Share2 className="h-4 w-4" aria-hidden />
      Share to story
    </button>
  )
}
