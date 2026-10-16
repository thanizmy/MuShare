import { useCallback, useState, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import { login, register } from '../store/session'
import type { LoginInput, RegisterInput } from '../types/auth'
import {
  validateEmail,
  validateLoginPassword,
  validatePassword,
  validateUsername,
  type FieldError,
} from '../lib/validation'

type Validators<V> = { [K in keyof V]: (value: string) => FieldError }

export interface AuthForm<V extends Record<keyof V, string>> {
  values: V
  /** Errors for fields the user has touched or after a submit attempt. */
  errors: Partial<Record<keyof V, string>>
  serverError: string | null
  submitting: boolean
  setValue: (name: keyof V, value: string) => void
  markTouched: (name: keyof V) => void
  handleSubmit: (event: FormEvent) => Promise<void>
}

export function useAuthForm<V extends Record<keyof V, string>>(
  initial: V,
  validators: Validators<V>,
  submit: (values: V) => Promise<void>,
): AuthForm<V> {
  const [values, setValues] = useState<V>(initial)
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const allErrors = (Object.keys(validators) as Array<keyof V>).reduce<
    Partial<Record<keyof V, string>>
  >((acc, name) => {
    const message = validators[name](values[name])
    if (message) acc[name] = message
    return acc
  }, {})

  const errors = (Object.keys(allErrors) as Array<keyof V>).reduce<
    Partial<Record<keyof V, string>>
  >((acc, name) => {
    if (submitAttempted || touched[name]) acc[name] = allErrors[name]
    return acc
  }, {})

  const setValue = useCallback((name: keyof V, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setServerError(null)
  }, [])

  const markTouched = useCallback((name: keyof V) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitAttempted(true)
    if (Object.keys(allErrors).length > 0) return

    setSubmitting(true)
    setServerError(null)
    try {
      await submit(values)
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the server. Check your connection and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return { values, errors, serverError, submitting, setValue, markTouched, handleSubmit }
}

export const useLoginForm = () =>
  useAuthForm<LoginInput>(
    { email: '', password: '' },
    { email: validateEmail, password: validateLoginPassword },
    (v) => login({ email: v.email.trim(), password: v.password }),
  )

export const useRegisterForm = () =>
  useAuthForm<RegisterInput>(
    { email: '', username: '', password: '' },
    { email: validateEmail, username: validateUsername, password: validatePassword },
    (v) => register({ email: v.email.trim(), username: v.username, password: v.password }),
  )
