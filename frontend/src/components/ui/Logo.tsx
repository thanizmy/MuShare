import { Music2 } from 'lucide-react'

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-9 w-9'
  const icon = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`flex ${box} items-center justify-center rounded-full bg-accent shadow-glow`}>
        <Music2 className={`${icon} text-black`} aria-hidden />
      </span>
      <span className={`font-extrabold tracking-tight ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>
        MuShare
      </span>
    </span>
  )
}
