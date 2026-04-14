import fs from 'fs'
import path from 'path'

const root = process.cwd()
const nextDir = path.join(root, '.next')

try {
  fs.rmSync(nextDir, { recursive: true, force: true })
  console.log(`Removed ${nextDir}`)
} catch (err) {
  console.error(`Failed to remove ${nextDir}: ${err.message}`)
  process.exit(1)
}
