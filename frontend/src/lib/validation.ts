// Client-side mirrors of the API's Pydantic rules, for instant feedback.
// The server remains the authority.

export type FieldError = string | null

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME = /^[A-Za-z0-9_]{3,30}$/

export function validateEmail(value: string): FieldError {
  const email = value.trim()
  if (!email) return 'Email is required'
  if (email.length > 320 || !EMAIL.test(email)) return 'Enter a valid email address'
  return null
}

export function validateUsername(value: string): FieldError {
  if (!value) return 'Username is required'
  if (!USERNAME.test(value)) return 'Use 3-30 letters, numbers or underscores'
  return null
}

export function validatePassword(value: string): FieldError {
  if (!value) return 'Password is required'
  if (value.length < 8) return 'Use at least 8 characters'
  if (value.length > 128) return 'Use 128 characters or fewer'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include a letter and a number'
  return null
}

export function validateLoginPassword(value: string): FieldError {
  return value ? null : 'Password is required'
}
