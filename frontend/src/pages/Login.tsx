import { Link } from 'react-router-dom'

import { AuthLayout } from '../components/auth/AuthLayout'
import { LoginForm } from '../components/auth/LoginForm'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLoginForm } from '../hooks/useAuthForm'

export default function LoginPage() {
  useDocumentTitle('Log in')
  const form = useLoginForm()
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to keep the music going."
      footer={
        <>
          New to MuShare?{' '}
          <Link to="/register" className="font-semibold text-ink underline hover:text-accent-soft">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm form={form} />
    </AuthLayout>
  )
}
