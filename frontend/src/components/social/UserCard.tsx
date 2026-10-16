import { Link } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import type { UserSummary } from '../../types/social'
import { Avatar } from '../ui/Avatar'
import { FollowButton } from './FollowButton'

/** One person in a list: avatar, name and bio, with a follow button unless it's you. */
export function UserCard({ user }: { user: UserSummary }) {
  const { user: me } = useAuth()
  const isMe = me?.username.toLowerCase() === user.username.toLowerCase()

  return (
    <li className="flex items-center gap-4 rounded-card bg-surface p-3 transition hover:bg-elevated">
      <Link to={`/u/${user.username}`} className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar user={user} className="h-14 w-14" textClassName="text-xl" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{user.username}</span>
          {user.bio && <span className="block truncate text-xs text-ink-muted">{user.bio}</span>}
        </span>
      </Link>
      {!isMe && <FollowButton username={user.username} isFollowing={user.is_following} compact />}
    </li>
  )
}
