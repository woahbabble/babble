'use client'

import { useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

export default function AdminDashboardClient() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [flags, setFlags] = useState([])
  const [users, setUsers] = useState([])
  const [threads, setThreads] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [threadQuery, setThreadQuery] = useState('')

  const canRun = useMemo(() => token.trim().length > 0, [token])
  const adminHeaders = useMemo(() => ({ 'x-admin-token': token.trim() }), [token])

  async function run(action) {
    if (!canRun) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function loadFlags(status = 'open') {
    return run(async () => {
      const data = await apiRequest('/admin/flags', {
        searchParams: { status, page: 1, page_size: 50 },
        headers: adminHeaders
      })
      setFlags(data.items || [])
      setMessage(`Loaded ${status} reports.`)
    })
  }

  function loadUsers(shadowOnly = false) {
    return run(async () => {
      const data = await apiRequest('/admin/users', {
        searchParams: { shadow_only: shadowOnly ? 1 : 0, q: userQuery },
        headers: adminHeaders
      })
      setUsers(data.users || [])
      setMessage(`Loaded ${data.users?.length || 0} users.`)
    })
  }

  function loadThreads() {
    return run(async () => {
      const data = await apiRequest('/admin/threads', {
        searchParams: { q: threadQuery },
        headers: adminHeaders
      })
      setThreads(data.threads || [])
      setMessage(`Loaded ${data.threads?.length || 0} threads.`)
    })
  }

  function restoreUser(userId) {
    return run(async () => {
      await apiRequest(`/admin/users/${userId}/restore`, {
        method: 'POST',
        headers: adminHeaders,
        body: { reputation: 25 }
      })
      setMessage(`Restored user ${userId}.`)
      await loadUsers(true)
    })
  }

  function exileThread(urlNormalized) {
    return run(async () => {
      await apiRequest('/admin/threads/exile', {
        method: 'POST',
        headers: adminHeaders,
        body: { url_normalized: urlNormalized }
      })
      setMessage(`Exiled ${urlNormalized} to The Pit.`)
      await loadThreads()
    })
  }

  function restoreThread(urlNormalized) {
    return run(async () => {
      await apiRequest('/admin/threads/restore', {
        method: 'POST',
        headers: adminHeaders,
        body: { url_normalized: urlNormalized }
      })
      setMessage(`Restored ${urlNormalized} from The Pit.`)
      await loadThreads()
    })
  }

  function reviewFlag(flagId, status) {
    return run(async () => {
      await apiRequest(`/admin/flags/${flagId}/review`, {
        method: 'POST',
        headers: adminHeaders,
        body: { status }
      })
      setMessage(`Flag #${flagId} marked ${status}.`)
      await loadFlags('open')
    })
  }

  return (
    <section>
      <h1>Admin Dashboard</h1>
      <p className="muted">Reports, user reputation/shadow state, and thread pit controls.</p>
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
        <button onClick={() => loadFlags('open')} disabled={!canRun || loading}>Load open reports</button>
        <button onClick={() => loadUsers(true)} disabled={!canRun || loading}>Load shadow-banned users</button>
        <button onClick={() => loadThreads()} disabled={!canRun || loading}>Load threads</button>
      </p>
      {loading ? <p className="muted">Loading...</p> : null}
      {error ? <p>{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <h2>Reports</h2>
      <ul className="thread-list">
        {flags.map((flag) => (
          <li key={flag.id} className="thread-item">
            <p className="comment-body">{flag.comment_body}</p>
            <p className="meta-line">
              <span>#{flag.id}</span>
              <span>@{flag.comment_author}</span>
              <span>reason: {flag.reason}</span>
              <span>{new Date(flag.created_at).toLocaleString()}</span>
            </p>
            <p className="meta-line">
              <a href={`/thread/${encodeURIComponent(flag.url_normalized)}?controversial=1`}>thread</a>
              <button onClick={() => reviewFlag(flag.id, 'resolved')}>Resolve</button>
              <button onClick={() => reviewFlag(flag.id, 'dismissed')}>Dismiss</button>
            </p>
          </li>
        ))}
      </ul>

      <h2>Users</h2>
      <div className="search-form">
        <input
          className="search-input"
          type="text"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
          placeholder="Filter users by username/email"
        />
        <p className="meta-line">
          <button onClick={() => loadUsers(false)} disabled={!canRun || loading}>Search users</button>
          <button onClick={() => loadUsers(true)} disabled={!canRun || loading}>Shadow-banned only</button>
        </p>
      </div>
      <ul className="thread-list">
        {users.map((user) => (
          <li key={user.id} className="thread-item">
            <p className="meta-line">
              <span>@{user.username}</span>
              <span>{user.email}</span>
              <span>rep {user.reputation}</span>
              <span>{user.is_shadow_banned ? 'shadow-banned' : 'active'}</span>
              <span>{user.is_deleted ? 'deleted' : ''}</span>
            </p>
            {user.is_shadow_banned ? (
              <p className="meta-line">
                <button onClick={() => restoreUser(user.id)}>Restore user</button>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2>Threads</h2>
      <div className="search-form">
        <input
          className="search-input"
          type="text"
          value={threadQuery}
          onChange={(e) => setThreadQuery(e.target.value)}
          placeholder="Filter threads by URL"
        />
        <p className="meta-line">
          <button onClick={() => loadThreads()} disabled={!canRun || loading}>Search threads</button>
        </p>
      </div>
      <ul className="thread-list">
        {threads.map((thread) => (
          <li key={thread.url_normalized} className="thread-item">
            <p className="comment-body">{thread.url_normalized}</p>
            <p className="meta-line">
              <span>{thread.comment_count} comments</span>
              <span>{thread.pit_comment_count} pit</span>
              {thread.archive_url ? <a href={thread.archive_url} target="_blank" rel="noreferrer">archive</a> : null}
            </p>
            <p className="meta-line">
              <button onClick={() => exileThread(thread.url_normalized)}>Exile to The Pit</button>
              <button onClick={() => restoreThread(thread.url_normalized)}>Restore thread</button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
