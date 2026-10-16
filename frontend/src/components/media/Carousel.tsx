import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

interface CarouselProps {
  title: string
  children: ReactNode
}

/** A titled, horizontally scrolling shelf with snap points and arrow buttons. */
export function Carousel({ title, children }: CarouselProps) {
  const scroller = useRef<HTMLDivElement>(null)

  const scrollByPage = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <div className="hidden gap-1 md:flex">
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollByPage(-1)}
            className="rounded-full bg-white/5 p-1.5 text-ink-muted hover:bg-white/10 hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollByPage(1)}
            className="rounded-full bg-white/5 p-1.5 text-ink-muted hover:bg-white/10 hover:text-ink"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8"
      >
        {children}
      </div>
    </section>
  )
}
