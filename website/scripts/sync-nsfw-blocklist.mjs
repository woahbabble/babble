import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SOURCE_URL =
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts'
const outputPath = path.join(__dirname, '..', 'data', 'nsfw-blocklist.txt')
const customPath = path.join(__dirname, '..', 'data', 'nsfw-blocklist.custom.txt')

function isValidHost(host) {
  if (!host || host.includes(' ') || host.length > 253) return false
  if (host === 'localhost') return false
  if (!host.includes('.')) return false
  return /^[a-z0-9.-]+$/.test(host)
}

function parseHosts(content) {
  const hosts = new Set()
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim().toLowerCase()
    if (!line || line.startsWith('#')) continue
    const fields = line.split(/\s+/).filter(Boolean)
    if (fields.length < 2) continue
    const host = fields[1]
    if (!isValidHost(host)) continue
    hosts.add(host)
  }
  return hosts
}

async function readCustomHosts() {
  try {
    const raw = await fs.readFile(customPath, 'utf8')
    return new Set(
      raw
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith('#'))
        .filter(isValidHost)
    )
  } catch {
    return new Set()
  }
}

async function main() {
  const response = await fetch(SOURCE_URL)
  if (!response.ok) {
    throw new Error(`Failed to download source list: HTTP ${response.status}`)
  }
  const sourceText = await response.text()
  const baseHosts = parseHosts(sourceText)
  const customHosts = await readCustomHosts()

  for (const host of customHosts) {
    baseHosts.add(host)
  }

  const sorted = [...baseHosts].sort((a, b) => a.localeCompare(b))
  const output = [
    '# Auto-generated from StevenBlack porn hosts + optional custom additions.',
    `# Source: ${SOURCE_URL}`,
    `# Updated: ${new Date().toISOString()}`,
    ...sorted
  ].join('\n')

  await fs.writeFile(outputPath, `${output}\n`, 'utf8')
  // Ensure custom file exists for user-maintained additions.
  try {
    await fs.access(customPath)
  } catch {
    await fs.writeFile(
      customPath,
      '# Optional custom additions, one hostname per line.\n',
      'utf8'
    )
  }

  console.log(`Synced ${sorted.length} NSFW hostnames to ${outputPath}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
