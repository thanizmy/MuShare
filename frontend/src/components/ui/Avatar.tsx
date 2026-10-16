interface AvatarProps {
  user: { username: string; avatar_url: string | null }
  /** Tailwind size classes, e.g. "h-8 w-8". */
  className?: string
  textClassName?: string
}

/** Profile picture, or the user's initial on the accent colour when there is none. */
export function Avatar({ user, className = 'h-8 w-8', textClassName = 'text-sm' }: AvatarProps) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`${className} ${textClassName} flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-black`}
    >
      {user.username.charAt(0).toUpperCase()}
    </span>
  )
}
