import { Check, UserPlus } from 'lucide-react'

import { useToggleFollow } from '../../hooks/useSocial'

interface FollowButtonProps {
  username: string
  isFollowing: boolean
  compact?: boolean
}

export function FollowButton({ username, isFollowing, compact = false }: FollowButtonProps) {
  const toggle = useToggleFollow(username)
  const Icon = isFollowing ? Check : UserPlus

  return (
    <button
      type="button"
      aria-label={`Follow ${username}`}
      aria-pressed={isFollowing}
      onClick={() => toggle.mutate(!isFollowing)}
      className={`${isFollowing ? 'btn-ghost' : 'btn-primary'} ${compact ? 'px-4! py-1.5!' : ''}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}
