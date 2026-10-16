import type { Story, StoryGroup, StoryInput } from '../../types/stories'
import { request } from '../client'

export const getStoryFeed = (signal?: AbortSignal) =>
  request<StoryGroup[]>('/stories/feed', { signal })

export const getUserStories = (username: string, signal?: AbortSignal) =>
  request<Story[]>(`/users/${encodeURIComponent(username)}/stories`, { signal })

export const createStory = (input: StoryInput) =>
  request<Story>('/stories', { method: 'POST', body: input })

export const deleteStory = (storyId: string) =>
  request<void>(`/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE' })
