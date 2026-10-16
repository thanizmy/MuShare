import { ThumbsUp } from 'lucide-react'

import { useToggleLike } from '../../hooks/useSocial'

interface LikeProfileButtonProps {
  username: string
  isLiked: boolean
  count: number
}

export function LikeProfileButton({ username, isLiked, count }: LikeProfileButtonProps) {
  const toggle = useToggleLike(username)

  return (
    <button
      type="button"
      aria-label={`Like ${username}'s profile`}
      aria-pressed={isLiked}
      onClick={() => toggle.mutate(!isLiked)}
      className={`btn-ghost ${isLiked ? 'border-accent! text-accent!' : ''}`}
    >
      <ThumbsUp className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} aria-hidden />
      <span className="tabular-nums">{count}</span>
    </button>
  )
}
