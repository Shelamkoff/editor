import assert from 'node:assert/strict'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

const result = await build({
  configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), logLevel: 'error',
  build: { write: false, target: 'es2022', rollupOptions: {
    input: fileURLToPath(new URL('../dist/plugins/index.js', import.meta.url)),
    external: id => id.startsWith('@shelamkoff/'), preserveEntrySignatures: 'strict',
  } },
})
const entry = result.output.find(item => item.type === 'chunk' && item.isEntry)
assert.ok(entry, 'missing plugin bundle')
assert.ok(!entry.code.includes('data:text/css'), 'stylesheet data URLs inflate JavaScript and prevent independent caching')
const styles = result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))
assert.ok(styles.length >= 21, 'each block stylesheet must remain a cacheable asset')
console.log(JSON.stringify({ cssAssets: styles.length, inlineStylesheets: false }))
