import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'

import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { playerStore } from './store/playerStore'
import { useAuthStore } from './store/authStore'
import { bootstrapSession, initSession } from './store/session'

type AppRouter = Parameters<typeof RouterProvider>[0]['router']

interface AppProps {
  router: AppRouter
  queryClient: QueryClient
}

export default function App({ router, queryClient }: AppProps) {
  useEffect(() => {
    initSession()
    void bootstrapSession()
  }, [])

  // Signing out ends playback and discards cached data so the next user starts clean.
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (previous.status === 'authenticated' && state.status === 'anonymous') {
          playerStore.getState().stop()
          queryClient.clear()
        }
      }),
    [queryClient],
  )

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
