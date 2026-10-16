import { Disc3 } from 'lucide-react'
import { useState } from 'react'

interface CoverImageProps {
  src: string | null
  /** Accessible description; leave empty when the title is shown beside the image. */
  alt?: string
  className?: string
}

/** Cover art that degrades to a placeholder when missing or broken. */
export function CoverImage({ src, alt = '', className = '' }: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={`flex items-center justify-center bg-elevated ${className}`}
      >
        <Disc3 className="h-1/2 w-1/2 text-ink-faint" aria-hidden />
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={`object-cover ${className}`}
    />
  )
}
