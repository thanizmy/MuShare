import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { EmptyState } from '../components/feedback/EmptyState'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="space-y-6">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="That page doesn't exist or has moved."
      />
      <div className="text-center">
        <Link to="/" className="btn-primary">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
