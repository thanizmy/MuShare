import type { AuthForm } from '../../hooks/useAuthForm'
import type { LoginInput } from '../../types/auth'
import { TextField } from '../ui/TextField'
import { FormError } from './FormError'

export function LoginForm({ form }: { form: AuthForm<LoginInput> }) {
  const { values, errors, serverError, submitting, setValue, markTouched, handleSubmit } = form

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormError message={serverError} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        onValueChange={(v) => setValue('email', v)}
        onBlur={() => markTouched('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        error={errors.password}
        onValueChange={(v) => setValue('password', v)}
        onBlur={() => markTouched('password')}
      />
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Log in'}
      </button>
    </form>
  )
}
