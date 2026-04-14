import fs from 'fs/promises'
import path from 'path'
import { cache } from 'react'

const blocklistPath = path.join(process.cwd(), 'data', 'nsfw-blocklist.txt')

const getBlocklist = cache(async function getBlocklist() {
  try {
    const raw = await fs.readFile(blocklistPath, 'utf8')
    const hosts = raw
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('#'))
    return new Set(hosts)
  } catch {
    return new Set()
  }
})

export function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function hostMatches(candidateHost, blockedHost) {
  return candidateHost === blockedHost || candidateHost.endsWith(`.${blockedHost}`)
}

export async function isNsfwUrl(url) {
  const host = getHostname(url)
  if (!host) return false
  const blocklist = await getBlocklist()
  for (const blockedHost of blocklist) {
    if (hostMatches(host, blockedHost)) return true
  }
  return false
}
