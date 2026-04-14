'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiRequest } from '../lib/api'

export default function ThreadTagsClient({ url }) {
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadTags() {
    try {
      const data = await apiGet('/tags', { url })
      setTags(data.tags || [])
    } catch {
      // Silent fallback when tags are unavailable.
    }
  }

  useEffect(() => {
    loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  async function submitTag() {
    setError('')
    setMessage('')
    const token = typeof window !== 'undefined'
      ? (window.localStorage.getItem('babbleWebsiteToken') || '').trim()
      : ''
    const tag = tagInput.trim().toLowerCase()
    if (!token) {
      setError('Log in in Website Account first to submit tags.')
      return
    }
    if (!tag) {
      setError('Tag is required.')
      return
    }
    try {
      const data = await apiRequest('/tags', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { url, tag }
      })
      setTags(data.tags || [])
      setTagInput('')
      setMessage('Tag added.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="tag-panel">
      <h2>Tags</h2>
      <p className="meta-line">
        {tags.length ? tags.map((t) => <span key={t.tag} className="tag-chip">#{t.tag} ({t.votes})</span>) : <span className="muted">No tags yet.</span>}
      </p>
      <div className="search-form">
        <input
          className="search-input"
          type="text"
          placeholder="Add tag (e.g. politics)"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
        />
        <p className="meta-line">
          <button onClick={submitTag}>Add tag</button>
        </p>
      </div>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p>{error}</p> : null}
    </section>
  )
}
