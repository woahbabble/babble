'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'

export default function MyAccountClient() {
  const [tokenInput, setTokenInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const token = useMemo(() => tokenInput.trim(), [tokenInput])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const existing = window.localStorage.getItem('babbleWebsiteToken') || ''
    if (existing) setTokenInput(existing)
  }, [])

  function saveToken() {
    if (typeof window === 'undefined') return
    if (token) window.localStorage.setItem('babbleWebsiteToken', token)
    else window.localStorage.removeItem('babbleWebsiteToken')
    setMessage('Token saved.')
  }

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

  function loadProfile() {
    return run(async () => {
      const data = await apiRequest('/me/profile', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setProfile(data.user)
      setBioInput(data.user.bio || '')
      setMessage('Profile loaded.')
    })
  }

  function saveBio() {
    return run(async () => {
      const data = await apiRequest('/me/profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { bio: bioInput }
      })
      setProfile(data.user)
      setMessage('Bio updated.')
    })
  }

  function resetHistory() {
    const ok = window.confirm('Reset your history? This is irreversible.')
    if (!ok) return
    return run(async () => {
      await apiRequest('/me/reset-history', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      setMessage('History reset complete.')
    })
  }

  function deleteProfile() {
    const ok = window.confirm('Delete your profile? This is irreversible.')
    if (!ok) return
    return run(async () => {
      await apiRequest('/me/profile', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      setProfile(null)
      setMessage('Profile deleted. Clear your local token.')
    })
  }

  return (
    <section>
      <h1>My Account</h1>
      <p className="muted">Manage profile bio and privacy controls.</p>
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
          <button onClick={loadProfile} disabled={loading}>Load profile</button>
        </p>
      </div>

      {profile ? (
        <div className="search-form">
          <p className="meta-line">
            <span>@{profile.username}</span>
            <span>rep {profile.reputation}</span>
            <span>{profile.is_shadow_banned ? 'shadow-banned' : 'active'}</span>
          </p>
          <textarea
            className="search-input"
            style={{ minHeight: 100 }}
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value)}
            placeholder="Your bio"
          />
          <p className="meta-line">
            <button onClick={saveBio} disabled={loading}>Save bio</button>
          </p>
        </div>
      ) : null}

      <h2>Privacy</h2>
      <p className="meta-line">
        <button onClick={resetHistory} disabled={loading}>Reset history</button>
        <button onClick={deleteProfile} disabled={loading}>Delete profile</button>
      </p>

      {error ? <p>{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}
    </section>
  )
}
