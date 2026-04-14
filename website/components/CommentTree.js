'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

const TRUSTED_IMAGE_HOSTS = new Set([
  'i.imgur.com',
  'images.unsplash.com',
  'media.tenor.com',
  'cdn.discordapp.com',
  'pbs.twimg.com',
  'i.redd.it',
  'images.pexels.com'
])

const NSFW_HOST_HINTS = ['porn', 'xxx', 'xvideos', 'xhamster', 'redtube', 'onlyfans', 'nsfw']

function extractImageUrls(text) {
  const value = String(text || '')
  const matches = value.match(/https?:\/\/[^\s)]+/gi) || []
  return matches
    .map((url) => url.replace(/[),.!?]+$/, ''))
    .filter((url) => /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url))
}

function hostForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLikelyNsfwHost(host) {
  if (!host) return false
  return NSFW_HOST_HINTS.some((hint) => host.includes(hint))
}

function isTrustedHost(host) {
  return TRUSTED_IMAGE_HOSTS.has(host)
}

function CommentNode({
  comment,
  depth = 0,
  canReport,
  onReport,
  canVote,
  onVote,
  highlightControversial,
  showImages,
  trustedOnly,
  allowNsfwImages
}) {
  const classes = [
    'comment-node',
    highlightControversial && comment.is_hidden_by_default ? 'comment-controversial' : ''
  ].filter(Boolean).join(' ')

  const quoteLabel = (comment.anchor_selector || '').startsWith('comment:')
    ? 'Quoted from another comment'
    : comment.anchor_text ? 'Quoted from page' : ''

  return (
    <li className={classes} style={{ marginLeft: `${depth * 16}px` }}>
      <div className="comment-row">
        {canVote ? (
          <div className="vote-rail" aria-label="Vote controls">
            <button
              className={`vote-btn ${comment.user_vote === 1 ? 'active up' : ''}`}
              onClick={() => onVote(comment.id, 1)}
              title="Upvote"
            >
              ▲
            </button>
            <div className="vote-score">{comment.score || 0}</div>
            <button
              className={`vote-btn ${comment.user_vote === -1 ? 'active down' : ''}`}
              onClick={() => onVote(comment.id, -1)}
              title="Downvote"
            >
              ▼
            </button>
            {comment.user_vote ? (
              <button className="vote-clear" onClick={() => onVote(comment.id, 0)} title="Clear vote">
                •
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="comment-content">
          <div className="comment-meta">
            <Link href={`/user/${encodeURIComponent(comment.username)}`}>
              @{comment.username}
            </Link>
            <span>{new Date(comment.created_at).toLocaleString()}</span>
          </div>
          {comment.anchor_text ? (
            <div className="anchor-quote-wrap">
              <div className="anchor-quote-label">{quoteLabel}</div>
              <blockquote className="anchor-quote">{comment.anchor_text}</blockquote>
            </div>
          ) : null}
          <p className="comment-body">{comment.body}</p>
          {showImages ? (
            <div className="comment-image-grid">
              {extractImageUrls(comment.body).map((url) => {
                const host = hostForUrl(url)
                const trusted = isTrustedHost(host)
                const nsfw = isLikelyNsfwHost(host)
                if (nsfw && !allowNsfwImages) return null
                if (trustedOnly && !trusted) return null
                return (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="comment-image-link">
                    <img src={url} alt="Embedded from comment URL" loading="lazy" className="comment-image" />
                  </a>
                )
              })}
            </div>
          ) : null}
          {canReport ? (
            <p className="meta-line">
              <button onClick={() => onReport(comment.id)}>Report</button>
            </p>
          ) : null}
        </div>
      </div>
      {comment.children?.length > 0 ? (
        <ul className="comment-list">
          {comment.children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              depth={depth + 1}
              canReport={canReport}
              onReport={onReport}
              canVote={canVote}
              onVote={onVote}
              highlightControversial={highlightControversial}
              showImages={showImages}
              trustedOnly={trustedOnly}
              allowNsfwImages={allowNsfwImages}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function CommentTree({ comments, highlightControversial = false }) {
  const [token, setToken] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportError, setReportError] = useState('')
  const [showImages, setShowImages] = useState(false)
  const [trustedOnly, setTrustedOnly] = useState(true)
  const [allowNsfwImages, setAllowNsfwImages] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncToken = () => setToken((window.localStorage.getItem('babbleWebsiteToken') || '').trim())
    syncToken()
    window.addEventListener('babble-auth-changed', syncToken)
    window.addEventListener('storage', syncToken)
    setShowImages(window.localStorage.getItem('babbleShowImages') === '1')
    const trusted = window.localStorage.getItem('babbleTrustedImagesOnly')
    setTrustedOnly(trusted !== '0')
    setAllowNsfwImages(window.localStorage.getItem('babbleAllowNsfwImages') === '1')
    return () => {
      window.removeEventListener('babble-auth-changed', syncToken)
      window.removeEventListener('storage', syncToken)
    }
  }, [])

  async function reportComment(commentId) {
    setReportError('')
    setReportMessage('')
    if (!token) {
      setReportError('Log in in Website Account first.')
      return
    }
    const reason = window.prompt('Reason for report:')
    if (!reason || !reason.trim()) return
    try {
      await apiRequest('/flags', {
        method: 'POST',
        body: { comment_id: commentId, reason: reason.trim() },
        headers: { Authorization: `Bearer ${token}` }
      })
      setReportMessage('Report submitted.')
    } catch (err) {
      setReportError(err.message)
    }
  }

  async function voteComment(commentId, vote) {
    setReportError('')
    setReportMessage('')
    if (!token) {
      setReportError('Log in in Website Account first.')
      return
    }
    try {
      await apiRequest(`/comments/${commentId}/vote`, {
        method: 'POST',
        body: { vote },
        headers: { Authorization: `Bearer ${token}` }
      })
      // Keep implementation simple for now; refetch via page reload.
      window.location.reload()
    } catch (err) {
      setReportError(err.message)
    }
  }

  if (!comments.length) {
    return <p className="muted">No comments yet. Be the first in the extension.</p>
  }

  return (
    <>
      <div className="search-form">
        <p className="meta-line">
          <span>{token ? 'Interactions enabled.' : 'Log in in Website Account to vote/report.'}</span>
        </p>
        <p className="meta-line">
          <label>
            <input
              type="checkbox"
              checked={showImages}
              onChange={(e) => {
                setShowImages(e.target.checked)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('babbleShowImages', e.target.checked ? '1' : '0')
                }
              }}
            />
            Show image URLs inline
          </label>
          <label>
            <input
              type="checkbox"
              checked={trustedOnly}
              onChange={(e) => {
                setTrustedOnly(e.target.checked)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('babbleTrustedImagesOnly', e.target.checked ? '1' : '0')
                }
              }}
            />
            Trusted hosts only
          </label>
          <label>
            <input
              type="checkbox"
              checked={allowNsfwImages}
              onChange={(e) => {
                setAllowNsfwImages(e.target.checked)
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('babbleAllowNsfwImages', e.target.checked ? '1' : '0')
                }
              }}
            />
            Allow NSFW image embeds
          </label>
        </p>
        {reportMessage ? <p className="muted">{reportMessage}</p> : null}
        {reportError ? <p>{reportError}</p> : null}
      </div>
      <ul className="comment-list">
        {comments.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            canReport={true}
            onReport={reportComment}
            canVote={true}
            onVote={voteComment}
            highlightControversial={highlightControversial}
            showImages={showImages}
            trustedOnly={trustedOnly}
            allowNsfwImages={allowNsfwImages}
          />
        ))}
      </ul>
    </>
  )
}
