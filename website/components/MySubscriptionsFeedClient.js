'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

export default function MySubscriptionsFeedClient() {
  const [tokenInput, setTokenInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [domainInput, setDomainInput] = useState('')
  const [sort, setSort] = useState('popular')
  const token = useMemo(() => tokenInput.trim(), [tokenInput])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const existing = window.localStorage.getItem('babbleWebsiteToken') || ''
    if (existing) setTokenInput(existing)
  }, [])

  async function run(action) {
    if (!token) {
      setError('Add your token first.')
      return
    }
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

  function saveToken() {
    if (typeof window !== 'undefined') {
      if (token) window.localStorage.setItem('babbleWebsiteToken', token)
      else window.localStorage.removeItem('babbleWebsiteToken')
    }
    setMessage('Token saved.')
  }

  function loadSubscriptions() {
    return run(async () => {
      const data = await apiRequest('/subscriptions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setSubscriptions(data.subscriptions || [])
      setMessage(`Loaded ${data.subscriptions?.length || 0} subscriptions.`)
    })
  }

  function loadFeed() {
    return run(async () => {
      const data = await apiRequest('/feed/subscriptions', {
        searchParams: { include_meta: 1, sort, page: 1, page_size: 50 },
        headers: { Authorization: `Bearer ${token}` }
      })
      setItems(data.items || [])
      setMessage(`Loaded ${data.items?.length || 0} threads.`)
    })
  }

  function subscribe() {
    return run(async () => {
      await apiRequest('/subscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { hostname: domainInput.trim() }
      })
      setDomainInput('')
      await loadSubscriptions()
      await loadFeed()
    })
  }

  function unsubscribe(domain) {
    return run(async () => {
      await apiRequest('/subscribe', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        body: { domain }
      })
      await loadSubscriptions()
      await loadFeed()
    })
  }

  return (
    <section>
      <h1>My Subscriptions</h1>
      <p className="muted">Trending threads from the domains you follow.</p>
      <div className="search-form">
        <input
          className="search-input"
          type="password"
          placeholder="Website token"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        <p className="meta-line">
          <button onClick={saveToken}>Save token</button>
          <button onClick={loadSubscriptions} disabled={loading}>Load subscriptions</button>
          <button onClick={loadFeed} disabled={loading}>Load feed</button>
        </p>
      </div>

      <div className="search-form">
        <p className="meta-line">
          <label>
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option value="popular">Popular</option>
              <option value="active">Active</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
        </p>
        <input
          className="search-input"
          type="text"
          placeholder="Add domain (e.g. bbc.com)"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
        />
        <p className="meta-line">
          <button onClick={subscribe} disabled={loading}>Subscribe</button>
        </p>
      </div>

      {error ? <p>{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <h2>Following</h2>
      <p className="meta-line">
        {subscriptions.map((s) => (
          <span key={s.domain}>
            {s.domain} <button onClick={() => unsubscribe(s.domain)}>x</button>
          </span>
        ))}
      </p>

      <h2>Threads</h2>
      <ol className="thread-list">
        {items.map((item) => (
          <li key={item.url_normalized} className="thread-item">
            <a href={`/thread/${encodeURIComponent(item.url_normalized)}`}>{item.url_normalized}</a>
            <div className="meta-line">
              <span>{item.comment_count} comments</span>
              {typeof item.activity_density === 'number' ? <span>{item.activity_density.toFixed(2)} / hr</span> : null}
              {item.archive_url ? <a href={item.archive_url} target="_blank" rel="noreferrer">archive</a> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
