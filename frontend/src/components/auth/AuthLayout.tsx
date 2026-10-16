import type { ReactNode } from 'react'

import { Logo } from '../ui/Logo'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-linear-to-b from-accent-deep/50 to-canvas p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <section className="glass rounded-card p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </section>
        <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>
      </div>
    </div>
  )
}
