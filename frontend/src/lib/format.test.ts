import { describe, expect, it } from 'vitest'

import { clamp, formatTime, formatTotalDuration } from './format'

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [83, '1:23'],
    [83.9, '1:23'],
    [600, '10:00'],
    [3599, '59:59'],
    [3725, '1:02:05'],
  ])('%d -> %s', (input, expected) => expect(formatTime(input)).toBe(expected))

  it.each([NaN, Infinity, -4])('treats %s as zero', (input) =>
    expect(formatTime(input)).toBe('0:00'),
  )
})

describe('formatTotalDuration', () => {
  it.each([
    [0, '0 min'],
    [1500, '25 min'],
    [3600, '1 hr'],
    [5400, '1 hr 30 min'],
  ])('%d -> %s', (input, expected) => expect(formatTotalDuration(input)).toBe(expected))
})

describe('clamp', () => {
  it('limits to the range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
  })
})
