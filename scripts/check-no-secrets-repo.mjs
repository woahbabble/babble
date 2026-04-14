import { execSync } from 'child_process'
import fs from 'fs'

const ignoredPaths = [
  '.env.example',
  'website/.env.local.example',
  'website/data/nsfw-blocklist.txt'
]

const suspiciousContentPatterns = [
  /BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY/,
  /x-admin-token\s*:\s*[a-z0-9._-]{8,}/i
]

function listTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' }).trim()
  if (!output) return []
  return output.split('\n').map((line) => line.trim()).filter(Boolean)
}

function shouldIgnore(path) {
  return ignoredPaths.includes(path)
}

function isLikelyText(content) {
  return !content.includes('\u0000')
}

function main() {
  const files = listTrackedFiles()
  const violations = []

  for (const path of files) {
    if (shouldIgnore(path)) continue
    let content = ''
    try {
      content = fs.readFileSync(path, 'utf8')
    } catch {
      continue
    }
    if (!content || !isLikelyText(content)) continue
    for (const pattern of suspiciousContentPatterns) {
      if (pattern.test(content)) {
        violations.push({ path, pattern: String(pattern) })
        break
      }
    }
  }

  if (!violations.length) {
    console.log('Repository secret scan passed.')
    return
  }

  console.error('Repository secret scan failed.\n')
  for (const violation of violations) {
    console.error(`  - ${violation.path} matched ${violation.pattern}`)
  }
  process.exit(1)
}

main()
