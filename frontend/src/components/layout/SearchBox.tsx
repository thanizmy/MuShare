import { Search, X } from 'lucide-react'

import { useSearchBox } from '../../hooks/useSearchBox'

export function SearchBox() {
  const { value, setValue, submit, clear } = useSearchBox()

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        type="search"
        aria-label="Search tracks, artists and albums"
        placeholder="What do you want to listen to?"
        autoComplete="off"
        maxLength={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-full border border-line bg-white/10 py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-muted hover:bg-white/15 focus:border-white/40 focus:bg-white/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </form>
  )
}
