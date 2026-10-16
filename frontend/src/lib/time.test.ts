import { describe, expect, it } from 'vitest'

import { formatRelative } from './time'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('formatRelative', () => {
  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [60, '1m ago'],
    [59 * 60, '59m ago'],
    [3600, '1h ago'],
    [23 * 3600 + 59 * 60, '23h ago'],
    [24 * 3600, '1d ago'],
    [3 * 24 * 3600, '3d ago'],
  ])('%d seconds ago -> %s', (seconds, expected) => {
    expect(formatRelative(ago(seconds), NOW)).toBe(expected)
  })

  it('treats a timestamp in the future as just now', () => {
    expect(formatRelative(ago(-500), NOW)).toBe('just now')
  })
})
