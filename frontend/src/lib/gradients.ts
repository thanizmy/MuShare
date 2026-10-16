export interface StoryGradient {
  name: string
  /** "#RRGGBB,#RRGGBB", the format the API stores. */
  value: string
}

export const STORY_GRADIENTS: StoryGradient[] = [
  { name: 'Emerald', value: '#1DB954,#0B3D2E' },
  { name: 'Sunset', value: '#FF7A59,#7B2CBF' },
  { name: 'Ocean', value: '#38BDF8,#1E3A8A' },
  { name: 'Grape', value: '#C084FC,#4C1D95' },
  { name: 'Rose', value: '#FB7185,#881337' },
  { name: 'Midnight', value: '#475569,#020617' },
]

const VALID = /^#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}$/

/** CSS background for a stored gradient; falls back to the default if it's malformed. */
export function gradientCss(value: string): string {
  const safe = VALID.test(value) ? value : STORY_GRADIENTS[0].value
  const [from, to] = safe.split(',')
  return `linear-gradient(160deg, ${from}, ${to})`
}
