import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { measureBundleOutput } from '../scripts/bundle-report.mjs'

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

  return measureBundleOutput(result, { root: editorRoot, preset, referenceBytes: budgets[preset] })
}

const rows = [
  await measurePreset('core', fileURLToPath(new URL('../dist/core/index.js', import.meta.url))),
  await measurePreset('paragraph', fileURLToPath(new URL('../dist/plugins/paragraph/index.js', import.meta.url))),
  await measurePreset('defaultInteractive', fileURLToPath(new URL('../dist/preset/index.js', import.meta.url))),
  await measurePreset('fullPreset', fileURLToPath(new URL('../dist/plugins/index.js', import.meta.url))),
]

console.table(rows.map(({ preset, rawBytes, gzipBytes, referenceBytes, deltaBytes, aboveReference }) => ({
  preset,
  rawKiB: (rawBytes / KIB).toFixed(1),
  gzipKiB: (gzipBytes / KIB).toFixed(1),
  budgetKiB: (referenceBytes / KIB).toFixed(0),
  rawBytes,
  gzipBytes,
  referenceBytes,
  deltaBytes,
  aboveReference,
})))

// CI records these reference targets. Explicit local enforcement retains the
// historical preset policy without making feature removal a release condition.
const enforce = process.argv.includes('--enforce')
if (process.env.EDITOR_RESULTS_DIR) {
  await mkdir(process.env.EDITOR_RESULTS_DIR, { recursive: true })
  await writeFile(join(process.env.EDITOR_RESULTS_DIR, 'bundle-size.json'), JSON.stringify({
    schemaVersion: 1,
    mode: enforce ? 'enforce' : 'report',
    scope: 'Minified static JavaScript closure plus all emitted CSS; external @shelamkoff packages and lazy JavaScript are excluded.',
    rows,
  }, null, 2) + '\n')
}
for (const row of rows) {
  const budget = budgets[row.preset]
  if (budget === undefined) throw new Error(`Missing bundle budget for ${row.preset}`)
  if (row.gzipBytes > budget) {
    const message = `${row.preset} entry is ${(row.gzipBytes / KIB).toFixed(1)} KiB gzip; reference target is ${(budget / KIB).toFixed(0)} KiB`
    if (enforce && enforcedPresets.has(row.preset)) throw new Error(message)
    console.warn(`${message} (informational)`)
  }
}
