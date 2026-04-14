import { apiGet } from '../../../lib/api'

export const dynamic = 'force-dynamic'

export default async function PublicProfilePage({ params, searchParams }) {
  const resolvedParams = await params
  const resolvedSearch = await searchParams
  const username = decodeURIComponent(resolvedParams.username)
  const sort = ['oldest', 'newest'].includes(resolvedSearch.sort) ? resolvedSearch.sort : 'newest'

  let data = null
  let error = null

  try {
    data = await apiGet(`/users/${encodeURIComponent(username)}`, { sort })
  } catch (err) {
    error = err.message
  }

  if (error) {
    return (
      <section>
        <h1>Profile</h1>
        <p>Could not load profile: {error}</p>
      </section>
    )
  }

  return (
    <section>
      <h1>@{data.user.username}</h1>
      <p className="muted">Reputation: {data.user.reputation}</p>
      <p>{data.user.bio || 'No bio yet.'}</p>
      <p className="meta-line">
        <a href={`/u/${encodeURIComponent(data.user.username)}?sort=newest`}>Newest</a>
        <a href={`/u/${encodeURIComponent(data.user.username)}?sort=oldest`}>Oldest</a>
      </p>
      <ul className="thread-list">
        {data.comments.map((comment) => (
          <li key={comment.id} className="thread-item">
            <p className="comment-body">{comment.body}</p>
            <div className="meta-line">
              <a href={`/thread/${encodeURIComponent(comment.url_normalized)}`}>thread</a>
              <a href={comment.url} target="_blank" rel="noreferrer">source</a>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
