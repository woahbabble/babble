const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_BABBLE_API_BASE ||
  process.env.BABBLE_API_BASE ||
  'https://babble.local:3001/api'

function shouldAllowInsecureTls(url) {
  const envAllow = process.env.BABBLE_ALLOW_INSECURE_LOCAL_TLS
  const envAllowPublic = process.env.NEXT_PUBLIC_BABBLE_ALLOW_INSECURE_LOCAL_TLS
  const explicitAllow = envAllow === '1' || envAllowPublic === '1'
  const explicitDeny = envAllow === '0' || envAllowPublic === '0'
  if (explicitDeny) return false
  if (url.protocol !== 'https:') return false
  const isLocalHost = ['babble.local', 'localhost', '127.0.0.1'].includes(url.hostname)
  if (!isLocalHost) return false
  if (explicitAllow) return true
  // Dev-safe default: allow self-signed TLS for local hosts unless explicitly denied.
  return process.env.NODE_ENV !== 'production'
}

let insecureTlsEnabled = false

async function doFetch(url, init) {
  if (typeof window === 'undefined' && shouldAllowInsecureTls(url) && !insecureTlsEnabled) {
    // Local dev only: allow self-signed cert for babble.local API.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    insecureTlsEnabled = true
  }
  return fetch(url.toString(), init)
}

export async function apiGet(path, searchParams) {
  const url = new URL(`${API_BASE}${path}`)
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  let response
  try {
    response = await doFetch(url, {
      cache: 'no-store'
    })
  } catch (err) {
    const detail = err?.message || 'network failure'
    throw new Error(`Fetch failed for ${url.origin}. ${detail}`)
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData?.error) message = errorData.error
    } catch {
      // Ignore parse errors and use status message fallback.
    }
    throw new Error(message)
  }

  return response.json()
}

export async function apiRequest(path, { method = 'GET', searchParams, body, headers } = {}) {
  const url = new URL(`${API_BASE}${path}`)
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  let response
  try {
    response = await doFetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })
  } catch (err) {
    const detail = err?.message || 'network failure'
    throw new Error(`Fetch failed for ${url.origin}. ${detail}`)
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData?.error) message = errorData.error
    } catch {
      // Ignore parse errors and use status message fallback.
    }
    throw new Error(message)
  }

  return response.json()
}

export { API_BASE }
