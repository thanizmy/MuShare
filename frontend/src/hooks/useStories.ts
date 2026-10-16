import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { createStory, deleteStory, getStoryFeed, getUserStories } from '../api/endpoints/stories'
import { toast } from '../store/toastStore'
import type { StoryInput } from '../types/stories'

export const storyKeys = {
  feed: ['stories', 'feed'] as const,
  user: (username: string) => ['stories', 'user', username.toLowerCase()] as const,
  all: ['stories'] as const,
}

export const useStoryFeed = () =>
  useQuery({
    queryKey: storyKeys.feed,
    queryFn: ({ signal }) => getStoryFeed(signal),
    // Stories come and go on a 24-hour clock; refresh now and then without being noisy.
    staleTime: 60_000,
  })

/** A user's active stories. Empty unless you're them or you follow them. */
export const useUserStories = (username: string) =>
  useQuery({
    queryKey: storyKeys.user(username),
    queryFn: ({ signal }) => getUserStories(username, signal),
  })

export function useCreateStory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StoryInput) => createStory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.all })
      toast.success('Story shared. It disappears in 24 hours.')
    },
  })
}

export function useDeleteStory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (storyId: string) => deleteStory(storyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storyKeys.all })
      toast.success('Story deleted')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the story."),
  })
}
