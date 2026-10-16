import { describe, expect, it } from 'vitest'

import {
  validateEmail,
  validateLoginPassword,
  validatePassword,
  validateUsername,
} from './validation'

describe('validateEmail', () => {
  it.each(['ada@example.com', '  ada@example.com  ', 'a.b+tag@sub.example.org'])(
    'accepts %j',
    (value) => expect(validateEmail(value)).toBeNull(),
  )

  it.each(['', '   ', 'ada', 'ada@', '@example.com', 'ada@example', 'a b@example.com'])(
    'rejects %j',
    (value) => expect(validateEmail(value)).not.toBeNull(),
  )
})

describe('validateUsername', () => {
  it.each(['ada', 'ada_l', 'A1_b2', 'x'.repeat(30)])('accepts %j', (value) =>
    expect(validateUsername(value)).toBeNull(),
  )

  it.each(['', 'ab', 'has space', 'dash-ed', 'x'.repeat(31), 'émile'])('rejects %j', (value) =>
    expect(validateUsername(value)).not.toBeNull(),
  )
})

describe('validatePassword', () => {
  it('accepts a password with letters and digits', () => {
    expect(validatePassword('correct-horse-9')).toBeNull()
  })

  it.each([
    ['', /required/i],
    ['short1', /8 characters/i],
    ['onlyletters', /letter and a number/i],
    ['12345678', /letter and a number/i],
    ['a1'.repeat(70), /128/],
  ])('rejects %j', (value, message) => {
    expect(validatePassword(value)).toMatch(message)
  })
})

describe('validateLoginPassword', () => {
  it('only requires something to be entered', () => {
    expect(validateLoginPassword('x')).toBeNull()
    expect(validateLoginPassword('')).toMatch(/required/i)
  })
})
