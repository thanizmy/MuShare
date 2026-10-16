import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import {
  followUser,
  getFollowers,
  getFollowing,
  getProfile,
  getWrapped,
  likeUser,
  searchUsers,
  unfollowUser,
  unlikeUser,
  updateMyProfile,
} from '../api/endpoints/social'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import type { ProfileUpdate, UserProfile, UserSummary, WrappedPeriod } from '../types/social'

export const socialKeys = {
  profile: (username: string) => ['profile', username] as const,
  wrapped: (username: string, period: WrappedPeriod) => ['wrapped', username, period] as const,
  followers: (username: string) => ['users', 'followers', username] as const,
  following: (username: string) => ['users', 'following', username] as const,
  search: (query: string) => ['users', 'search', query] as const,
  anyUserList: ['users'] as const,
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback

export const useProfile = (username: string) =>
  useQuery({
    queryKey: socialKeys.profile(username),
    queryFn: ({ signal }) => getProfile(username, signal),
  })

export const useWrapped = (username: string, period: WrappedPeriod) =>
  useQuery({
    queryKey: socialKeys.wrapped(username, period),
    queryFn: ({ signal }) => getWrapped(username, period, signal),
    placeholderData: keepPreviousData,
  })

export const useFollowers = (username: string) =>
  useQuery({
    queryKey: socialKeys.followers(username),
    queryFn: ({ signal }) => getFollowers(username, signal),
  })

export const useFollowing = (username: string) =>
  useQuery({
    queryKey: socialKeys.following(username),
    queryFn: ({ signal }) => getFollowing(username, signal),
  })

export const useUserSearch = (query: string) => {
  const trimmed = query.trim()
  return useQuery({
    queryKey: socialKeys.search(trimmed),
    queryFn: ({ signal }) => searchUsers(trimmed, signal),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  })
}

/**
 * Builds an optimistic mutation that flips one flag on a user's profile (and, for follows,
 * on every cached user list), then settles to the server's authoritative profile.
 */
function useProfileToggle(
  username: string,
  options: {
    scope: string
    apply: (profile: UserProfile, on: boolean) => UserProfile
    send: (on: boolean) => Promise<UserProfile>
    failure: (on: boolean) => string
    onListItem?: (user: UserSummary, on: boolean) => UserSummary
  },
) {
  const queryClient = useQueryClient()
  const key = socialKeys.profile(username)

  return useMutation({
    mutationFn: (on: boolean) => options.send(on),
    // Rapid clicks on the same control run in order.
    scope: { id: `${options.scope}:${username.toLowerCase()}` },
    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previousProfile = queryClient.getQueryData<UserProfile>(key)
      if (previousProfile) queryClient.setQueryData(key, options.apply(previousProfile, on))

      const listItem = options.onListItem
      const previousLists = listItem
        ? queryClient.getQueriesData<UserSummary[]>({ queryKey: socialKeys.anyUserList })
        : []
      if (listItem) {
        queryClient.setQueriesData<UserSummary[]>({ queryKey: socialKeys.anyUserList }, (users) =>
          users?.map((u) => (u.username.toLowerCase() === username.toLowerCase() ? listItem(u, on) : u)),
        )
      }
      return { previousProfile, previousLists }
    },
    onError: (error, on, context) => {
      queryClient.setQueryData(key, context?.previousProfile)
      context?.previousLists.forEach(([listKey, data]) => queryClient.setQueryData(listKey, data))
      toast.error(messageOf(error, options.failure(on)))
    },
    onSuccess: (profile) => queryClient.setQueryData(key, profile),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: socialKeys.anyUserList })
      // Follower/following counts of the signed-in user's own profile may have changed.
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export const useToggleFollow = (username: string) =>
  useProfileToggle(username, {
    scope: 'follow',
    apply: (p, on) => ({
      ...p,
      is_following: on,
      follower_count: Math.max(0, p.follower_count + (on ? 1 : -1)),
    }),
    onListItem: (u, on) => ({ ...u, is_following: on }),
    send: (on) => (on ? followUser(username) : unfollowUser(username)),
    failure: (on) => `Couldn't ${on ? 'follow' : 'unfollow'} ${username}.`,
  })

export const useToggleLike = (username: string) =>
  useProfileToggle(username, {
    scope: 'like',
    apply: (p, on) => ({
      ...p,
      is_liked: on,
      like_count: Math.max(0, p.like_count + (on ? 1 : -1)),
    }),
    send: (on) => (on ? likeUser(username) : unlikeUser(username)),
    failure: (on) => `Couldn't ${on ? 'like' : 'unlike'} ${username}'s profile.`,
  })

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileUpdate) => updateMyProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(socialKeys.profile(profile.username), profile)
      // Keep the top bar's avatar in step.
      useAuthStore.getState().updateUser({ avatar_url: profile.avatar_url, bio: profile.bio })
      toast.success('Profile updated')
    },
  })
}
