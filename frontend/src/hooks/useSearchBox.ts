import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { useDebouncedValue } from './useDebouncedValue'

const DEBOUNCE_MS = 250

const searchUrl = (query: string) => (query ? `/search?q=${encodeURIComponent(query)}` : '/search')

/** Keeps the top-bar input and the /search?q= URL in step, searching as the user types. */
export function useSearchBox() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const onSearchPage = location.pathname === '/search'
  const urlQuery = onSearchPage ? (params.get('q') ?? '') : ''

  const [value, setValue] = useState(urlQuery)
  const debounced = useDebouncedValue(value, DEBOUNCE_MS)
  // The last query this hook pushed to the URL, so its own navigation isn't mistaken
  // for an external change (back button, link) that should overwrite what's being typed.
  const lastPushed = useRef(urlQuery)

  useEffect(() => {
    if (urlQuery === lastPushed.current) return
    lastPushed.current = urlQuery
    setValue(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const query = debounced.trim()
    if (query === lastPushed.current.trim()) return
    if (!query && !onSearchPage) return
    lastPushed.current = query
    navigate(searchUrl(query), { replace: onSearchPage })
    // Only a new debounced value should trigger navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = value.trim()
    if (!query) return
    lastPushed.current = query
    navigate(searchUrl(query), { replace: onSearchPage })
  }

  return { value, setValue, submit, clear: () => setValue('') }
}
