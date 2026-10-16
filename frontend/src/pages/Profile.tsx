import { Pencil, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { PageTitle } from '../components/layout/PageTitle'
import { EditProfileModal } from '../components/social/EditProfileModal'
import { FollowButton } from '../components/social/FollowButton'
import { LikeProfileButton } from '../components/social/LikeProfileButton'
import { WrappedPanel } from '../components/social/WrappedPanel'
import { Avatar } from '../components/ui/Avatar'
import { useUserStories } from '../hooks/useStories'
import { useProfile } from '../hooks/useSocial'
import { useStoryViewerStore } from '../store/storyStores'
import type { UserProfile } from '../types/social'

function Count({ to, value, label }: { to?: string; value: number; label: string }) {
  const content = (
    <>
      <span className="font-bold tabular-nums text-ink">{value}</span> {label}
    </>
  )
  return to ? (
    <Link to={to} className="hover:underline">
      {content}
    </Link>
  ) : (
    <span>{content}</span>
  )
}

function ProfileView({ profile }: { profile: UserProfile }) {
  const [editing, setEditing] = useState(false)
  const base = `/u/${profile.username}`
  const stories = useUserStories(profile.username)
  const openViewer = useStoryViewerStore((s) => s.open)
  const activeStories = stories.data ?? []

  return (
    <div className="space-y-10">
      <PageTitle title={profile.username} />
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
        {activeStories.length > 0 ? (
          <button
            type="button"
            aria-label={`View ${profile.username}'s story`}
            onClick={() => openViewer([{ user: profile, stories: activeStories }])}
            className="shrink-0 rounded-full bg-linear-to-tr from-accent to-accent-soft p-1 transition hover:scale-105"
          >
            <span className="block rounded-full bg-canvas p-1">
              <Avatar user={profile} className="h-32 w-32 md:h-44 md:w-44" textClassName="text-6xl" />
            </span>
          </button>
        ) : (
          <Avatar
            user={profile}
            className="h-32 w-32 shadow-glass md:h-44 md:w-44"
            textClassName="text-6xl"
          />
        )}
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Profile</p>
          <h1 className="break-words text-4xl font-extrabold tracking-tight md:text-6xl">
            {profile.username}
          </h1>
          {profile.bio && <p className="max-w-xl text-sm text-ink-muted">{profile.bio}</p>}
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
            <Count to={`${base}/followers`} value={profile.follower_count} label="followers" />
            <Count to={`${base}/following`} value={profile.following_count} label="following" />
            {/* No link: likes are a tally, not a browsable list. */}
            <Count value={profile.like_count} label={profile.like_count === 1 ? 'like' : 'likes'} />
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {profile.is_me ? (
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit profile
          </button>
        ) : (
          <>
            <FollowButton username={profile.username} isFollowing={profile.is_following} />
            <LikeProfileButton
              username={profile.username}
              isLiked={profile.is_liked}
              count={profile.like_count}
            />
          </>
        )}
      </div>

      <WrappedPanel username={profile.username} isMe={profile.is_me} />

      {profile.is_me && (
        <EditProfileModal open={editing} profile={profile} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { username = '' } = useParams()
  const query = useProfile(username)

  return (
    <QueryBoundary
      query={query}
      skeleton={
        <div className="flex items-end gap-6">
          <div className="skeleton h-32 w-32 rounded-full md:h-44 md:w-44" />
          <div className="skeleton h-10 w-64" />
        </div>
      }
      notFound={
        <EmptyState
          icon={UserX}
          title="User not found"
          description="Check the spelling, or search for them by name."
        />
      }
    >
      {(profile) => <ProfileView profile={profile} />}
    </QueryBoundary>
  )
}
