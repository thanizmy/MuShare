import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toast, useToastStore } from './toastStore'

const messages = () => useToastStore.getState().toasts.map((t) => t.message)

describe('toastStore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a toast and removes it after a few seconds', () => {
    toast.success('Saved')
    expect(messages()).toEqual(['Saved'])
    vi.advanceTimersByTime(3900)
    expect(messages()).toEqual(['Saved'])
    vi.advanceTimersByTime(200)
    expect(messages()).toEqual([])
  })

  it('records the kind of each toast', () => {
    toast.error('Broke')
    toast.info('FYI')
    expect(useToastStore.getState().toasts.map((t) => t.kind)).toEqual(['error', 'info'])
  })

  it('keeps only the three most recent', () => {
    for (const m of ['a', 'b', 'c', 'd']) toast.info(m)
    expect(messages()).toEqual(['b', 'c', 'd'])
  })

  it('dismisses one toast without touching the others', () => {
    toast.info('keep')
    toast.info('drop')
    const drop = useToastStore.getState().toasts[1]
    useToastStore.getState().dismiss(drop.id)
    expect(messages()).toEqual(['keep'])
  })

  it('an expired timer for an already-dismissed toast is harmless', () => {
    toast.info('x')
    useToastStore.getState().dismiss(useToastStore.getState().toasts[0].id)
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(messages()).toEqual([])
  })
})
