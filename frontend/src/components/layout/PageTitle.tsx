import { useDocumentTitle } from '../../hooks/useDocumentTitle'

/** Sets the document title from inside a render callback, where a hook can't be called. */
export function PageTitle({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}
