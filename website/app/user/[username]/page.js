import Link from 'next/link'
import { apiGet } from '../../../lib/api'

export const dynamic = 'force-dynamic'

export default async function UserPage({ params }) {
  const resolvedParams = await params
  const username = decodeURIComponent(resolvedParams.username)

  let data = null
  let error = null

  try {
    data = await apiGet(`/users/${encodeURIComponent(username)}`)
  } catch (err) {
    error = err.message
  }

  if (error) {
    return (
      <section>
        <h1>User</h1>
        <p>Could not load user: {error}</p>
      </section>
    )
  }

  return (
    <section>
      <h1>@{data.user.username}</h1>
      <p className="muted">
        Joined {new Date(data.user.created_at).toLocaleDateString()} - {data.stats.total_comments}{' '}
        comments - {data.stats.threads_participated} threads
      </p>
      <ul className="thread-list">
        {data.comments.map((comment) => (
          <li key={comment.id} className="thread-item">
            <p className="comment-body">{comment.body}</p>
            <div className="meta-line">
              <Link href={`/thread/${encodeURIComponent(comment.url_normalized)}`}>thread</Link>
              <a href={comment.url} target="_blank" rel="noreferrer">
                source
              </a>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
