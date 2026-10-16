import { useEffect } from 'react'

const SUFFIX = 'MuShare'

/** Sets the browser tab / history title for the current page. */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX
  }, [title])
}
