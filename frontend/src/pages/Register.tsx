import { Link } from 'react-router-dom'

import { AuthLayout } from '../components/auth/AuthLayout'
import { RegisterForm } from '../components/auth/RegisterForm'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useRegisterForm } from '../hooks/useAuthForm'

export default function RegisterPage() {
  useDocumentTitle('Create account')
  const form = useRegisterForm()
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Stream music and share it as stories."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink underline hover:text-accent-soft">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm form={form} />
    </AuthLayout>
  )
}
