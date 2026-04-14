import Link from 'next/link'
import { apiGet } from '../lib/api'
import { isNsfwUrl } from '../lib/nsfw'
import MySubscriptionsFeedClient from '../components/MySubscriptionsFeedClient'

export const dynamic = 'force-dynamic'

function formatHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid-url'
  }
}

export default async function HomePage({ searchParams }) {
  const resolvedParams = (await searchParams) || {}
  const page = Math.max(1, Number.parseInt(resolvedParams.page || '1', 10) || 1)
  const sort = ['newest', 'oldest', 'popular', 'active'].includes(resolvedParams.sort)
    ? resolvedParams.sort
    : 'popular'
  const tab = resolvedParams.tab === 'subscriptions' ? 'subscriptions' : 'trending'
  const showNsfw = resolvedParams.nsfw === '1'
  const tag = (resolvedParams.tag || '').toString().trim().toLowerCase()
  let feed = []
  let pagination = null
  let error = null
  let availableTags = []

  if (tab === 'subscriptions') {
    return (
      <section>
        <p className="meta-line">
          <Link href="/?tab=trending">Trending</Link>
          <Link href="/?tab=subscriptions">My Subscriptions</Link>
        </p>
        <MySubscriptionsFeedClient />
      </section>
    )
  }

  try {
    const data = await apiGet('/feed', {
      include_meta: 1,
      page,
      page_size: 25,
      sort,
      tag
    })
    feed = data.items || []
    pagination = data.pagination || null
    availableTags = data.available_tags || []
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  let visibility = []
  try {
    visibility = await Promise.all(
      feed.map(async (item) => {
        const blocked = await isNsfwUrl(item.url_normalized)
        return { item, blocked }
      })
    )
  } catch (err) {
    error = error || (err instanceof Error ? err.message : String(err))
    visibility = feed.map((item) => ({ item, blocked: false }))
  }
  const blockedCount = visibility.filter((entry) => entry.blocked).length
  const visibleFeed = showNsfw
    ? visibility.map((entry) => entry.item)
    : visibility.filter((entry) => !entry.blocked).map((entry) => entry.item)

  const groupedByDomain = visibleFeed.reduce((acc, item) => {
    const domain = formatHostname(item.url_normalized)
    if (!acc[domain]) acc[domain] = []
    acc[domain].push(item)
    return acc
  }, {})
  const domainGroups = Object.entries(groupedByDomain)

  return (
    <section>
      <h1>Conversations</h1>
      <p className="muted">Sorted by {sort}.</p>
      <p className="meta-line">
        <Link href="/?tab=trending">Trending</Link>
        <Link href="/?tab=subscriptions">My Subscriptions</Link>
        <Link href={`/?sort=popular&page=1${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Popular</Link>
        <Link href={`/?sort=active&page=1${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Active</Link>
        <Link href={`/?sort=newest&page=1${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Newest</Link>
        <Link href={`/?sort=oldest&page=1${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Oldest</Link>
        {showNsfw ? <Link href={`/?sort=${sort}&page=${page}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Hide NSFW</Link> : <Link href={`/?sort=${sort}&page=${page}&nsfw=1${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Show NSFW</Link>}
        {tag ? <Link href={`/?sort=${sort}&page=1${showNsfw ? '&nsfw=1' : ''}`}>Clear tag</Link> : null}
      </p>
      {availableTags?.length ? (
        <p className="meta-line">
          {availableTags.slice(0, 12).map((t) => (
            <Link key={t.tag} href={`/?sort=${sort}&page=1${showNsfw ? '&nsfw=1' : ''}&tag=${encodeURIComponent(t.tag)}`}>
              #{t.tag} ({t.thread_count})
            </Link>
          ))}
        </p>
      ) : null}
      {!showNsfw && blockedCount > 0 ? <p className="muted">{blockedCount} NSFW thread(s) hidden on this page.</p> : null}
      {error ? <p>Could not load feed: {error}</p> : null}
      {domainGroups.map(([domain, items]) => (
        <section key={domain} className="domain-group">
          <h2 className="domain-heading">Conversation happening on: {domain}</h2>
          <ol className="thread-list">
            {items.map((item) => (
              <li key={item.url_normalized} className="thread-item">
                <div className="thread-main">
                  <span className="thread-count">{item.comment_count}</span>
                  <Link
                    href={`/thread/${encodeURIComponent(item.url_normalized)}${showNsfw ? '?nsfw=1' : ''}`}
                    className="thread-title"
                  >
                    {item.url_normalized}
                  </Link>
                </div>
                <div className="meta-line">
                  <span>{new Date(item.last_activity).toLocaleString()}</span>
                  {typeof item.activity_density === 'number' ? <span>{item.activity_density.toFixed(2)} activity/hr</span> : null}
                  <a href={item.url} target="_blank" rel="noreferrer">
                    visit
                  </a>
                  {item.tags?.length ? (
                    <>
                      {item.tags.slice(0, 4).map((t) => (
                        <Link key={`${item.url_normalized}-${t.tag}`} href={`/?sort=${sort}&page=1${showNsfw ? '&nsfw=1' : ''}&tag=${encodeURIComponent(t.tag)}`}>
                          #{t.tag} ({t.votes})
                        </Link>
                      ))}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {!error && visibleFeed.length === 0 ? <p className="muted">No visible threads on this page.</p> : null}
      {pagination ? (
        <p className="meta-line">
          <span>
            Page {pagination.page} of {pagination.total_pages}
          </span>
          {pagination.has_prev ? (
            <Link href={`/?sort=${sort}&page=${pagination.page - 1}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Previous</Link>
          ) : null}
          {pagination.has_next ? (
            <Link href={`/?sort=${sort}&page=${pagination.page + 1}${showNsfw ? '&nsfw=1' : ''}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}>Next</Link>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
