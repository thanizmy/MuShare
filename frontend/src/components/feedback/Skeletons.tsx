export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-40 shrink-0 rounded-card bg-surface p-3 sm:w-44" aria-hidden>
          <div className="skeleton aspect-square w-full" />
          <div className="skeleton mt-3 h-4 w-3/4" />
          <div className="skeleton mt-2 h-3 w-1/2" />
        </div>
      ))}
    </>
  )
}

export function RowSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="skeleton h-10 w-10" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
