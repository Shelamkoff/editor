import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { verifyEmbedPreviewTimeout } from './embed-preview-timeout-verification.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: repo })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const candidateSha = process.argv[3] ?? git('rev-parse', 'HEAD').toString().trim()
const fixtureSha256 = digest(git('show', `${candidateSha}:tests/browser/embed-preview-parity-fixture.js`))
let reportPath = process.argv[2], raw, rawExitCode = null
if (reportPath) {
  const bytes = await readFile(reportPath)
  raw = reportPath.endsWith('.gz') ? gunzipSync(bytes) : bytes
} else {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./embed-preview-timeout.mjs', import.meta.url))],
    { cwd: repo, env: process.env, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  const output = resolve(process.env.EDITOR_RESULTS_DIR ?? join(repo, 'test-results/embed-preview-timeout'))
  await mkdir(output, { recursive: true })
  reportPath = join(output, 'preview-timeout-raw.json')
  raw = result.stdout
  await writeFile(reportPath, raw)
  await writeFile(join(output, 'preview-timeout-raw.stderr.log'), result.stderr)
  rawExitCode = result.status
  assert.equal(result.signal, null, 'Raw comparison was terminated')
  assert.equal(rawExitCode, 1, 'The raw oracle must retain its historical failures')
}
const verified = verifyEmbedPreviewTimeout(JSON.parse(raw.toString()), { candidateSha, fixtureSha256 })
console.log(JSON.stringify({ ...verified, rawExitCode, reportPath, rawSha256: digest(raw),
  note: 'Raw verdicts are retained. Only the four exact historical observations are recognized; candidate exceptions are forbidden.' }, null, 2))
