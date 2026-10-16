import { ArrowLeft, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '../components/feedback/EmptyState'
import { QueryBoundary } from '../components/feedback/QueryBoundary'
import { RowSkeletons } from '../components/feedback/Skeletons'
import { PageTitle } from '../components/layout/PageTitle'
import { UserCard } from '../components/social/UserCard'
import { useFollowers, useFollowing } from '../hooks/useSocial'

/** Who follows a user, or who they follow. */
export default function UserListPage({ kind }: { kind: 'followers' | 'following' }) {
  const { username = '' } = useParams()
  const followers = useFollowers(username)
  const following = useFollowing(username)
  const query = kind === 'followers' ? followers : following
  const title = kind === 'followers' ? 'Followers' : 'Following'

  return (
    <div className="space-y-6">
      <PageTitle title={`${title} · ${username}`} />
      <Link
        to={`/u/${username}`}
        className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {username}
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>

      <QueryBoundary
        query={query}
        skeleton={<RowSkeletons />}
        notFound={
          <EmptyState icon={Users} title="User not found" description="That profile doesn't exist." />
        }
        empty={{
          when: (users) => users.length === 0,
          node: (
            <EmptyState
              icon={Users}
              title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              description={
                kind === 'followers'
                  ? `When people follow ${username}, they'll appear here.`
                  : `People ${username} follows will appear here.`
              }
            />
          ),
        }}
      >
        {(users) => (
          <ul aria-label={title} className="space-y-2">
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </ul>
        )}
      </QueryBoundary>
    </div>
  )
}
