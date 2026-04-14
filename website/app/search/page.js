import Link from 'next/link'
import { apiGet } from '../../lib/api'
import { isNsfwUrl } from '../../lib/nsfw'

export const dynamic = 'force-dynamic'

export default async function SearchPage({ searchParams }) {
  const resolvedParams = await searchParams
  const q = (resolvedParams.q || '').toString().trim()
  const showNsfw = resolvedParams.nsfw === '1'
  const tag = (resolvedParams.tag || '').toString().trim().toLowerCase()
  const threadPage = Math.max(1, Number.parseInt(resolvedParams.thread_page || '1', 10) || 1)
  const commentPage = Math.max(1, Number.parseInt(resolvedParams.comment_page || '1', 10) || 1)

  let data = null
  let error = null

  if (q) {
    try {
      data = await apiGet('/search', {
        q,
        tag,
        thread_page: threadPage,
        thread_page_size: 25,
        comment_page: commentPage,
        comment_page_size: 50
      })
    } catch (err) {
      error = err.message
    }
  }

  let visibleThreads = []
  let visibleComments = []
  let blockedThreads = 0
  let blockedComments = 0

  if (data) {
    const threadEntries = await Promise.all(
      (data.threads || []).map(async (thread) => ({
        thread,
        blocked: await isNsfwUrl(thread.url_normalized)
      }))
    )
    blockedThreads = threadEntries.filter((entry) => entry.blocked).length
    visibleThreads = showNsfw
      ? threadEntries.map((entry) => entry.thread)
      : threadEntries.filter((entry) => !entry.blocked).map((entry) => entry.thread)

    const commentEntries = await Promise.all(
      (data.comments || []).map(async (comment) => ({
        comment,
        blocked: await isNsfwUrl(comment.url_normalized)
      }))
    )
    blockedComments = commentEntries.filter((entry) => entry.blocked).length
    visibleComments = showNsfw
      ? commentEntries.map((entry) => entry.comment)
      : commentEntries.filter((entry) => !entry.blocked).map((entry) => entry.comment)
  }

  return (
    <section>
      <h1>Search</h1>
      <p className="meta-line">
        {showNsfw ? (
          <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage}&comment_page=${commentPage}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
            Hide NSFW
          </Link>
        ) : (
          <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage}&comment_page=${commentPage}&nsfw=1${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
            Show NSFW
          </Link>
        )}
        {tag ? <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=1&comment_page=1${showNsfw ? '&nsfw=1' : ''}`}>Clear tag</Link> : null}
      </p>
      {data?.available_tags?.length ? (
        <p className="meta-line">
          {data.available_tags.slice(0, 12).map((t) => (
            <Link key={t.tag} href={`/search?q=${encodeURIComponent(q)}&thread_page=1&comment_page=1${showNsfw ? '&nsfw=1' : ''}&tag=${encodeURIComponent(t.tag)}`}>
              #{t.tag} ({t.thread_count})
            </Link>
          ))}
        </p>
      ) : null}
      <form className="search-form" action="/search">
        <input
          className="search-input"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search URLs and comment text"
          minLength={2}
        />
        <input type="hidden" name="nsfw" value={showNsfw ? '1' : '0'} />
        <input type="hidden" name="tag" value={tag} />
      </form>

      {error ? <p>Search error: {error}</p> : null}

      {!q ? <p className="muted">Enter a query to search threads and comments.</p> : null}
      {!showNsfw && (blockedThreads > 0 || blockedComments > 0) ? (
        <p className="muted">
          Hidden on this page: {blockedThreads} thread(s), {blockedComments} comment(s) from NSFW domains.
        </p>
      ) : null}

      {data ? (
        <>
          <h2>Threads</h2>
          <ul className="thread-list">
            {visibleThreads.map((item) => (
              <li key={item.url_normalized} className="thread-item">
                <Link href={`/thread/${encodeURIComponent(item.url_normalized)}${showNsfw ? '?nsfw=1' : ''}`}>
                  {item.url_normalized}
                </Link>
                <div className="meta-line">
                  <span>{item.comment_count} comments</span>
                  <span>{new Date(item.last_activity).toLocaleString()}</span>
                  {item.tags?.length ? (
                    <>
                      {item.tags.slice(0, 4).map((t) => (
                        <Link key={`${item.url_normalized}-${t.tag}`} href={`/search?q=${encodeURIComponent(q)}&thread_page=1&comment_page=1${showNsfw ? '&nsfw=1' : ''}&tag=${encodeURIComponent(t.tag)}`}>
                          #{t.tag}
                        </Link>
                      ))}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="meta-line">
            <span>
              Thread page {data.pagination.threads.page} of {data.pagination.threads.total_pages}
            </span>
            {data.pagination.threads.has_prev ? (
              <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage - 1}&comment_page=${commentPage}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
                Previous
              </Link>
            ) : null}
            {data.pagination.threads.has_next ? (
              <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage + 1}&comment_page=${commentPage}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
                Next
              </Link>
            ) : null}
          </p>

          <h2>Comments</h2>
          <ul className="thread-list">
            {visibleComments.map((comment) => (
              <li key={comment.id} className="thread-item">
                <p className="comment-body">{comment.body}</p>
                <div className="meta-line">
                  <Link href={`/user/${encodeURIComponent(comment.username)}`}>@{comment.username}</Link>
                  <Link href={`/thread/${encodeURIComponent(comment.url_normalized)}${showNsfw ? '?nsfw=1' : ''}`}>thread</Link>
                  <span>{new Date(comment.created_at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="meta-line">
            <span>
              Comment page {data.pagination.comments.page} of {data.pagination.comments.total_pages}
            </span>
            {data.pagination.comments.has_prev ? (
              <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage}&comment_page=${commentPage - 1}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
                Previous
              </Link>
            ) : null}
            {data.pagination.comments.has_next ? (
              <Link href={`/search?q=${encodeURIComponent(q)}&thread_page=${threadPage}&comment_page=${commentPage + 1}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>
                Next
              </Link>
            ) : null}
          </p>
        </>
      ) : null}
    </section>
  )
}
