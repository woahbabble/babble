import { execSync } from 'child_process'

const blockedPaths = [
  /^\.env$/,
  /^\.env\./,
  /^website\/\.env\.local$/,
  /^website\/\.env\./,
  /\.pem$/i,
  /^babble\.db$/,
  /^packages\.microsoft\.gpg$/
]

const allowedPaths = new Set(['.env.example', 'website/.env.local.example'])
const suspiciousContentPatterns = [
  /BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY/,
  /jwt/i,
  /babble[-_ ]?dev[-_ ]?secret/i,
  /x-admin-token/i
]

function getStagedFiles() {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim()
  if (!output) return []
  return output.split('\n').map((line) => line.trim()).filter(Boolean)
}

function readStagedFile(path) {
  try {
    return execSync(`git show :${JSON.stringify(path)}`, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

function isBlockedPath(path) {
  if (allowedPaths.has(path)) return false
  return blockedPaths.some((pattern) => pattern.test(path))
}

function main() {
  const stagedFiles = getStagedFiles()
  const pathViolations = stagedFiles.filter(isBlockedPath)

  const contentViolations = []
  for (const path of stagedFiles) {
    if (path.startsWith('website/data/nsfw-blocklist')) continue
    const content = readStagedFile(path)
    if (!content) continue
    for (const pattern of suspiciousContentPatterns) {
      if (pattern.test(content)) {
        contentViolations.push({ path, pattern: String(pattern) })
        break
      }
    }
  }

  if (!pathViolations.length && !contentViolations.length) {
    console.log('Secret check passed.')
    return
  }

  console.error('Secret safety check failed.\n')
  if (pathViolations.length) {
    console.error('Blocked staged paths:')
    for (const file of pathViolations) {
      console.error(`  - ${file}`)
    }
  }
  if (contentViolations.length) {
    console.error('\nPotential secret-like content found:')
    for (const violation of contentViolations) {
      console.error(`  - ${violation.path} matched ${violation.pattern}`)
    }
  }
  process.exit(1)
}

main()
