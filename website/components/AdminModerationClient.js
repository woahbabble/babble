'use client'

import { useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

export default function AdminModerationClient({ initialStatus = 'open' }) {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const canLoad = useMemo(() => token.trim().length > 0, [token])

  async function loadFlags(nextStatus = status) {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await apiRequest('/admin/flags', {
        searchParams: { status: nextStatus, page: 1, page_size: 50 },
        headers: { 'x-admin-token': token.trim() }
      })
      setItems(data.items || [])
      setStatus(nextStatus)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function removeComment(commentId) {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/admin/comments/${commentId}/remove`, {
        method: 'POST',
        headers: { 'x-admin-token': token.trim() }
      })
      setMessage('Comment removed.')
      await loadFlags(status)
    } catch (err) {
      setError(err.message)
    }
  }

  async function reviewFlag(flagId, nextStatus) {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/admin/flags/${flagId}/review`, {
        method: 'POST',
        headers: { 'x-admin-token': token.trim() },
        body: { status: nextStatus }
      })
      setMessage(`Flag marked ${nextStatus}.`)
      await loadFlags(status)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h1>Moderation</h1>
      <p className="muted">Review reports and remove violating comments.</p>
      <div className="search-form">
        <input
          className="search-input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Admin token"
        />
      </div>
      <p className="meta-line">
        <button onClick={() => loadFlags('open')} disabled={!canLoad || loading}>Open</button>
        <button onClick={() => loadFlags('resolved')} disabled={!canLoad || loading}>Resolved</button>
        <button onClick={() => loadFlags('dismissed')} disabled={!canLoad || loading}>Dismissed</button>
      </p>
      {loading ? <p className="muted">Loading...</p> : null}
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <ul className="thread-list">
        {items.map((flag) => (
          <li key={flag.id} className="thread-item">
            <p className="comment-body">{flag.comment_body}</p>
            <div className="meta-line">
              <span>flag #{flag.id}</span>
              <span>reported by @{flag.reporter_username}</span>
              <span>author @{flag.comment_author}</span>
              <span>{new Date(flag.created_at).toLocaleString()}</span>
            </div>
            <p className="muted">Reason: {flag.reason}</p>
            <p className="meta-line">
              <a href={flag.url} target="_blank" rel="noreferrer">source</a>
              <a href={`/thread/${encodeURIComponent(flag.url_normalized)}`}>thread</a>
            </p>
            {status === 'open' ? (
              <p className="meta-line">
                <button onClick={() => removeComment(flag.comment_id)}>Remove comment</button>
                <button onClick={() => reviewFlag(flag.id, 'resolved')}>Resolve</button>
                <button onClick={() => reviewFlag(flag.id, 'dismissed')}>Dismiss</button>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {!loading && !error && items.length === 0 ? <p className="muted">No flags in this state.</p> : null}
    </section>
  )
}
