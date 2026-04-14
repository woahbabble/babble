'use client'

import { useEffect } from 'react'

export default function TokenBridgeClient() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || hash.length < 2) return
    const params = new URLSearchParams(hash.slice(1))
    const token = params.get('babble_token')
    const bridgedTheme = params.get('babble_theme')

    if (bridgedTheme) {
      window.localStorage.setItem('babbleTheme', bridgedTheme)
      document.documentElement.setAttribute('data-theme', bridgedTheme)
      params.delete('babble_theme')
    }

    if (token) {
      window.localStorage.setItem('babbleWebsiteToken', token)
      window.sessionStorage.setItem('babbleBridgeImportedAt', String(Date.now()))
      params.delete('babble_token')
    }

    if (!token && !bridgedTheme) return

    const nextHash = params.toString()
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`
    window.history.replaceState(null, '', nextUrl)
  }, [])

  return null
}
