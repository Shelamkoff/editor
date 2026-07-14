import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const editorRoot = fileURLToPath(new URL('../', import.meta.url))

// Measure the package boundary consumers receive, not workspace-relative
// sibling sources. The package build also rewrites sibling libraries to their
// published @shelamkoff/* specifiers before Rollup evaluates the entry graph.
await import('../scripts/build-package.mjs')

const viteSpecifier = process.env.EDITOR_VITE_MODULE_PATH
  ? pathToFileURL(process.env.EDITOR_VITE_MODULE_PATH).href
  : process.env.EDITOR_VITE_PATH
    ? new URL('../dist/node/index.js', pathToFileURL(process.env.EDITOR_VITE_PATH)).href
    : 'vite'
const { build } = await import(viteSpecifier)

const KIB = 1024
const budgets = {
  minimal: 8 * KIB,
  full: 64 * KIB,
}

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

const rows = [
  await measurePreset('minimal', fileURLToPath(new URL('../dist/plugins/paragraph/index.js', import.meta.url))),
  await measurePreset('full', fileURLToPath(new URL('../dist/plugins/index.js', import.meta.url))),
]

console.table(rows.map(({ gzipBytes: _gzipBytes, ...row }) => row))

for (const row of rows) {
  const budget = budgets[row.preset]
  if (budget === undefined) throw new Error(`Missing bundle budget for ${row.preset}`)
  if (row.gzipBytes > budget) {
    throw new Error(`${row.preset} entry is ${(row.gzipBytes / KIB).toFixed(1)} KiB gzip; budget is ${(budget / KIB).toFixed(0)} KiB`)
  }
}
