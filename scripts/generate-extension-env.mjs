import fs from 'fs/promises'
import path from 'path'

const root = process.cwd()
const apiUrl = process.env.API_URL || process.env.BABBLE_API_BASE || 'https://babble.local:3001/api'
const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000'

const output = `// Auto-generated. Do not edit manually.\n` +
`globalThis.BABBLE_RUNTIME_CONFIG = {\n` +
`  API_URL: ${JSON.stringify(apiUrl)},\n` +
`  WEBSITE_URL: ${JSON.stringify(websiteUrl)}\n` +
`}\n`

const outPath = path.join(root, 'extension', 'env.js')
await fs.writeFile(outPath, output, 'utf8')
console.log(`Wrote ${outPath}`)
