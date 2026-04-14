'use client'

import { useState } from 'react'
import { apiRequest } from '../lib/api'

export default function CommentComposerClient({ url }) {
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submitComment() {
    const token = typeof window !== 'undefined'
      ? (window.localStorage.getItem('babbleWebsiteToken') || '').trim()
      : ''
    setMessage('')
    setError('')
    if (!token) {
      setError('Log in in Website Account first.')
      return
    }
    const content = body.trim()
    if (!content) {
      setError('Comment cannot be empty.')
      return
    }
    setLoading(true)
    try {
      await apiRequest('/comments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { url, body: content }
      })
      setBody('')
      setMessage('Comment posted.')
      window.location.reload()
    } catch (err) {
      setError(err.message || 'Failed to post comment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="tag-panel">
      <h2>Add Comment</h2>
      <textarea
        className="search-input"
        style={{ minHeight: 96 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Join the discussion..."
      />
      <p className="meta-line">
        <button onClick={submitComment} disabled={loading}>
          {loading ? 'Posting...' : 'Post comment'}
        </button>
      </p>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p>{error}</p> : null}
    </section>
  )
}
