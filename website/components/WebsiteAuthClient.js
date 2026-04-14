'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('babble-auth-changed'))
  }
}

export default function WebsiteAuthClient() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignup, setIsSignup] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setCurrentUser(window.localStorage.getItem('babbleWebsiteUsername') || '')
  }, [])

  async function submitAuth() {
    setError('')
    setMessage('')
    try {
      const data = await apiRequest(isSignup ? '/auth/signup' : '/auth/login', {
        method: 'POST',
        body: isSignup
          ? { username: username.trim(), email: email.trim(), password }
          : { email: email.trim(), password }
      })
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('babbleWebsiteToken', data.token)
        window.localStorage.setItem('babbleWebsiteUsername', data.username)
        window.localStorage.setItem('babbleWebsiteUserId', String(data.id))
      }
      setCurrentUser(data.username)
      setMessage(isSignup ? 'Account created.' : 'Logged in.')
      setPassword('')
      notifyAuthChanged()
    } catch (err) {
      setError(err.message || 'Auth failed')
    }
  }

  function logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('babbleWebsiteToken')
      window.localStorage.removeItem('babbleWebsiteUsername')
      window.localStorage.removeItem('babbleWebsiteUserId')
    }
    setCurrentUser('')
    setMessage('Logged out.')
    setError('')
    notifyAuthChanged()
  }

  return (
    <section className="tag-panel">
      <h2>Website Account</h2>
      {currentUser ? (
        <p className="meta-line">
          <span>Logged in as @{currentUser}</span>
          <button onClick={logout}>Log out</button>
        </p>
      ) : (
        <>
          {isSignup ? (
            <input
              className="search-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          ) : null}
          <input
            className="search-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="search-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="meta-line">
            <button onClick={submitAuth}>{isSignup ? 'Sign up' : 'Log in'}</button>
            <button onClick={() => setIsSignup((v) => !v)}>
              {isSignup ? 'Have account? Log in' : 'Need account? Sign up'}
            </button>
          </p>
        </>
      )}
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p>{error}</p> : null}
    </section>
  )
}
