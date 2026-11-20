import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPackage } from '../scripts/build-package.mjs'

const editorRoot = fileURLToPath(new URL('../', import.meta.url))

const viteSpecifier = process.env.EDITOR_VITE_MODULE_PATH
  ? pathToFileURL(process.env.EDITOR_VITE_MODULE_PATH).href
  : process.env.EDITOR_VITE_PATH
    ? new URL('../dist/node/index.js', pathToFileURL(process.env.EDITOR_VITE_PATH)).href
    : 'vite'
const { build } = await import(viteSpecifier)

const KIB = 1024
const budgets = {
  core: 51 * KIB,
  paragraph: 40 * KIB,
  defaultInteractive: 64 * KIB,
  fullPreset: 96 * KIB,
}
// The core size is reported, but is not a completion gate (owner decision, 2026-10-04).
const enforcedPresets = new Set(['paragraph', 'defaultInteractive', 'fullPreset'])

async function measurePreset(preset, input) {
  // Separate builds prevent Rollup from moving code shared by the minimal and
  // full entries into a third chunk and making both entry files look tiny.
  const result = await build({
    configFile: false,
    root: editorRoot,
    logLevel: 'error',
    build: {
      write: false,
      target: 'es2022',
      minify: 'esbuild',
      cssCodeSplit: true,
      rollupOptions: {
        input,
        external: id => id.startsWith('@shelamkoff/'),
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
        },
      },
    },
  })

  const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => output.output)
  const chunks = new Map(outputs.filter(item => item.type === 'chunk').map(chunk => [chunk.fileName, chunk]))
  const entry = outputs.find(item => item.type === 'chunk' && item.isEntry)
  if (!entry) throw new Error(`Vite did not produce an entry for ${preset}`)

  const staticChunks = []
  const visited = new Set()
  function collect(fileName) {
    if (visited.has(fileName)) return
    visited.add(fileName)
    const chunk = chunks.get(fileName)
    if (!chunk) return
    staticChunks.push(chunk)
    for (const imported of chunk.imports) collect(imported)
  }
  collect(entry.fileName)

  const code = staticChunks.map(chunk => chunk.code).join('\n')
  const css = outputs
    .filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))
    // Asset emission follows parallel transform completion. A stable order is
    // required before gzip: identical styles must have an identical report.
    .sort((a, b) => a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0)
    .map(asset => typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source))
    .join('\n')
  const rawBytes = Buffer.byteLength(code) + Buffer.byteLength(css)
  const gzipBytes = gzipSync(code).byteLength + (css ? gzipSync(css).byteLength : 0)

  return {
    preset,
    rawKiB: (rawBytes / KIB).toFixed(1),
    gzipKiB: (gzipBytes / KIB).toFixed(1),
    budgetKiB: (budgets[preset] / KIB).toFixed(0),
    gzipBytes,
  }
}

// Build the published package layout in a private directory inside the
// workspace so Rollup can resolve its dependencies without touching dist/.
const resultsRoot = join(editorRoot, 'test-results')
await mkdir(resultsRoot, { recursive: true })
const buildRoot = await mkdtemp(join(resultsRoot, 'bundle-budget-'))
let rows
try {
  await buildPackage(buildRoot)
  rows = [
    await measurePreset('core', join(buildRoot, 'core/index.js')),
    await measurePreset('paragraph', join(buildRoot, 'plugins/paragraph/index.js')),
    await measurePreset('defaultInteractive', join(buildRoot, 'preset/index.js')),
    await measurePreset('fullPreset', join(buildRoot, 'plugins/index.js')),
  ]
} finally {
  await rm(buildRoot, { recursive: true, force: true })
}

console.table(rows.map(({ gzipBytes: _gzipBytes, ...row }) => row))

// CI passes --enforce. Local runs remain useful as reports without changing failure semantics.
const enforce = process.argv.includes('--enforce')
for (const row of rows) {
  const budget = budgets[row.preset]
  if (budget === undefined) throw new Error(`Missing bundle budget for ${row.preset}`)
  if (row.gzipBytes > budget) {
    const message = `${row.preset} entry is ${(row.gzipBytes / KIB).toFixed(1)} KiB gzip; reference target is ${(budget / KIB).toFixed(0)} KiB`
    if (enforce && enforcedPresets.has(row.preset)) throw new Error(message)
    console.warn(`${message} (informational)`)
  }
}
