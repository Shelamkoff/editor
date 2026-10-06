import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const proof = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(proof, '../..')
const target = path.join(root, 'test-results/refactor-equivalence-2026-10-05/v1-oracle')
const snapshot = JSON.parse(await fs.readFile(path.join(proof, 'v1-source-snapshot.json'), 'utf8'))
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const normalized = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n')
if (snapshot.fileCount !== 240 || Object.keys(snapshot.files).length !== 240) throw new Error('Historical source set is incomplete')
let created = 0
for (const [name, expected] of Object.entries(snapshot.files)) {
  const destination = path.resolve(target, name)
  if (!destination.startsWith(target + path.sep) || !/\.(js|css)$/.test(name)) throw new Error('Invalid historical source path: ' + name)
  let bytes
  try { bytes = await fs.readFile(destination) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    bytes = execFileSync('git', ['show', snapshot.revision + ':' + name], { cwd: root, maxBuffer: 16777216 })
    if (hash(bytes) !== expected.gitSha256 || hash(normalized(bytes)) !== expected.normalizedLFsha256) throw new Error('Git source hash differs: ' + name)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, bytes, { flag: 'wx' })
    created++
  }
  if (hash(normalized(bytes)) !== expected.normalizedLFsha256) throw new Error('Existing historical source differs: ' + name)
}
process.stdout.write(JSON.stringify({ revision: snapshot.revision, sources: 240, created, validated: 240 }) + '\n')
