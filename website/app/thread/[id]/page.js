import CommentTree from '../../../components/CommentTree'
import Link from 'next/link'
import { apiGet } from '../../../lib/api'
import { buildCommentTree } from '../../../lib/comments'
import { isNsfwUrl } from '../../../lib/nsfw'
import ThreadTagsClient from '../../../components/ThreadTagsClient'
import WebsiteAuthClient from '../../../components/WebsiteAuthClient'
import CommentComposerClient from '../../../components/CommentComposerClient'

export const dynamic = 'force-dynamic'

function resolveWebsiteBase() {
  return (
    process.env.WEBSITE_URL ||
    process.env.NEXT_PUBLIC_WEBSITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export default async function ThreadPage({ params, searchParams }) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const normalizedUrl = decodeURIComponent(resolvedParams.id)
  const showNsfw = resolvedSearchParams.nsfw === '1'
  const showControversial = resolvedSearchParams.controversial === '1'
  const sort = ['oldest', 'newest', 'top'].includes(resolvedSearchParams.sort)
    ? resolvedSearchParams.sort
    : 'oldest'
  const websiteBase = resolveWebsiteBase()
  const threadPath = `/thread/${encodeURIComponent(normalizedUrl)}`
  const threadUrl = `${websiteBase}${threadPath}`
  const shareTitle = `Babble discussion: ${normalizedUrl}`
  const xShareUrl = `https://x.com/intent/tweet?url=${encodeURIComponent(threadUrl)}&text=${encodeURIComponent(shareTitle)}`
  const redditShareUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(threadUrl)}&title=${encodeURIComponent(shareTitle)}`
  const hnShareUrl = `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(threadUrl)}&t=${encodeURIComponent(shareTitle)}`
  const nsfwBlocked = await isNsfwUrl(normalizedUrl)

  if (nsfwBlocked && !showNsfw) {
    return (
      <section>
        <h1>Thread</h1>
        <p className="muted">This thread is hidden by default because it matches the NSFW blocklist.</p>
        <p className="meta-line">
          <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?nsfw=1`}>Show NSFW thread</Link>
          <Link href="/">Back to feed</Link>
        </p>
      </section>
    )
  }

  let data = { comments: [] }
  let error = null

  try {
    data = await apiGet('/comments', {
      url: normalizedUrl,
      view_mode: showControversial ? 'pit' : undefined,
      sort
    })
  } catch (err) {
    error = err.message
  }

  const tree = buildCommentTree(data.comments || [])

  return (
    <section>
      <h1>Thread</h1>
      <p className="meta-line">
        {showNsfw ? <Link href={`/thread/${encodeURIComponent(normalizedUrl)}`}>Hide NSFW</Link> : <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?nsfw=1`}>Show NSFW</Link>}
        {showControversial ? (
          <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?sort=${sort}${showNsfw ? '&nsfw=1' : ''}`}>Hide controversial comments</Link>
        ) : (
          <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?controversial=1&sort=${sort}${showNsfw ? '&nsfw=1' : ''}`}>Show controversial comments</Link>
        )}
        <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?sort=top${showControversial ? '&controversial=1' : ''}${showNsfw ? '&nsfw=1' : ''}`}>Top</Link>
        <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?sort=newest${showControversial ? '&controversial=1' : ''}${showNsfw ? '&nsfw=1' : ''}`}>Newest</Link>
        <Link href={`/thread/${encodeURIComponent(normalizedUrl)}?sort=oldest${showControversial ? '&controversial=1' : ''}${showNsfw ? '&nsfw=1' : ''}`}>Oldest</Link>
      </p>
      <p>
        <a href={normalizedUrl} target="_blank" rel="noreferrer">
          {normalizedUrl}
        </a>
        {data.archive_links?.length ? (
          <>
            {' '}
            <a href={data.archive_links[0].url} target="_blank" rel="noreferrer">
              View Archive
            </a>
          </>
        ) : null}
      </p>
      {data.archive_links?.length ? (
        <div className="tag-panel">
          <strong>Recommended archives</strong>
          <p className="meta-line">
            {data.archive_links.map((archive) => (
              <a key={archive.url} href={archive.url} target="_blank" rel="noreferrer">
                {archive.label}
              </a>
            ))}
          </p>
        </div>
      ) : null}
      <div className="tag-panel">
        <strong>Share this thread</strong>
        <p className="meta-line">
          <a href={xShareUrl} target="_blank" rel="noreferrer">Share on X</a>
          <a href={redditShareUrl} target="_blank" rel="noreferrer">Share on Reddit</a>
          <a href={hnShareUrl} target="_blank" rel="noreferrer">Share on HN</a>
        </p>
      </div>
      {error ? <p>Could not load thread: {error}</p> : null}
      {!error ? <WebsiteAuthClient /> : null}
      {!error ? <CommentComposerClient url={normalizedUrl} /> : null}
      {!error ? <ThreadTagsClient url={normalizedUrl} /> : null}
      {!error ? <CommentTree comments={tree} highlightControversial={showControversial} /> : null}
    </section>
  )
}
