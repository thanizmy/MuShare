import { describe, expect, it } from 'vitest'

import { STORY_GRADIENTS, gradientCss } from './gradients'

describe('gradientCss', () => {
  it('turns a stored pair into a diagonal CSS gradient', () => {
    expect(gradientCss('#FF7A59,#7B2CBF')).toBe('linear-gradient(160deg, #FF7A59, #7B2CBF)')
  })

  it.each(['', 'red', '#12345,#123456', '#1DB954', 'url(x),#000000', '#GGGGGG,#000000'])(
    'falls back to the default for malformed value %j',
    (value) => {
      expect(gradientCss(value)).toBe(gradientCss(STORY_GRADIENTS[0].value))
    },
  )

  it('offers presets the API will accept', () => {
    for (const { value } of STORY_GRADIENTS) expect(value).toMatch(/^#[0-9A-F]{6},#[0-9A-F]{6}$/)
  })
})
