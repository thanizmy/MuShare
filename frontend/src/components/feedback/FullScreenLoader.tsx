import { Logo } from '../ui/Logo'

export function FullScreenLoader() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex h-full flex-col items-center justify-center gap-6 bg-canvas"
    >
      <Logo size="lg" />
      <div className="skeleton h-1.5 w-40" />
    </div>
  )
}
