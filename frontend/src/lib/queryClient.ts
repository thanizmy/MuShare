import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Client errors (404, 422...) won't fix themselves; only retry transient failures.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status < 500),
      },
    },
  })
}
