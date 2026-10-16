import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ApiError } from '../../api/client'
import { ErrorState } from './ErrorState'

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>
  skeleton: ReactNode
  /** Rendered instead of `children` when the data is present but empty. */
  empty?: { when: (data: T) => boolean; node: ReactNode }
  /** Rendered for a 404 instead of the generic error. */
  notFound?: ReactNode
  /** When set, error and empty states keep this section heading above them. */
  title?: string
  children: (data: T) => ReactNode
}

/** Maps a query's loading / error / empty / success states onto the right UI. */
export function QueryBoundary<T>({
  query,
  skeleton,
  empty,
  notFound,
  title,
  children,
}: QueryBoundaryProps<T>) {
  const framed = (node: ReactNode) =>
    title ? (
      <section aria-label={title} className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {node}
      </section>
    ) : (
      <>{node}</>
    )

  if (query.isPending) return <>{skeleton}</>

  if (query.isError) {
    if (notFound && query.error instanceof ApiError && query.error.status === 404) {
      return <>{notFound}</>
    }
    return framed(
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />,
    )
  }

  if (empty?.when(query.data)) return framed(empty.node)
  return <>{children(query.data)}</>
}
