'use client'

import { useEffect, useState } from 'react'

const MAX_AGE_MS = 5 * 60 * 1000

export default function BridgeNoticeClient() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem('babbleBridgeImportedAt')
    if (!raw) return
    const ts = Number.parseInt(raw, 10)
    if (!Number.isFinite(ts)) return
    if (Date.now() - ts > MAX_AGE_MS) return
    setVisible(true)
  }, [])

  if (!visible) return null

  return (
    <div className="bridge-notice" role="status">
      Connected from extension. Reporting is ready.
      <button
        className="bridge-notice-close"
        onClick={() => setVisible(false)}
      >
        Dismiss
      </button>
    </div>
  )
}
