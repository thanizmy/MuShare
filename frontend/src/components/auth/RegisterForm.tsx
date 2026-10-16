import type { AuthForm } from '../../hooks/useAuthForm'
import type { RegisterInput } from '../../types/auth'
import { TextField } from '../ui/TextField'
import { FormError } from './FormError'

export function RegisterForm({ form }: { form: AuthForm<RegisterInput> }) {
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
        label="Username"
        autoComplete="username"
        value={values.username}
        error={errors.username}
        hint="3-30 letters, numbers or underscores"
        onValueChange={(v) => setValue('username', v)}
        onBlur={() => markTouched('username')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        error={errors.password}
        hint="At least 8 characters, with a letter and a number"
        onValueChange={(v) => setValue('password', v)}
        onBlur={() => markTouched('password')}
      />
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
