import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Count distinct descriptor return identities separately from clean timings.
// No core owner is cached or instrumented; this is only the built-in producer.
const [root, output] = process.argv.slice(2)
assert(root && output, 'Provide a source checkout and an output JSON path')
const sourcePath = resolve(root, 'plugins/table/index.js')
const source = await readFile(sourcePath)
const { createServer } = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')))
const { findChrome } = await import(pathToFileURL(resolve(root, 'tests/browser/environment.mjs')))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const server = await createServer({ configFile: false, root, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { host: '127.0.0.1', port: 0 } })
await server.listen()
let browser
try {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = server.resolvedUrls.local[0]
  await page.route(origin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }))
  await page.goto(origin)
  const result = await page.evaluate(async () => {
    const { createTablePlugin } = await import('/plugins/table/index.js')
    const instances = []
    for (const size of [2, 20]) {
      const data = { withHeadings: false, rows: Array.from({ length: size }, (_, row) => ({
        id: 'row-' + row, cells: Array.from({ length: size }, (_, cell) => ({ id: 'cell-' + cell, text: '<b>Cell</b>' })),
      })) }
      const instance = createTablePlugin({ injectStyles: false }).setup().create(data, { ownerDocument: document, isReadOnly: () => false })
      document.body.append(instance.element)
      const arrays = new Set(), descriptors = new Set()
      for (let repeat = 0; repeat < 100; repeat++) {
        const fields = instance.editableFields()
        if (!Object.isFrozen(fields) || fields.length !== size * size) throw new Error('Invalid immutable descriptor array')
        arrays.add(fields)
        for (const field of fields) {
          if (!Object.isFrozen(field) || !instance.element.contains(field.element) || field.mode !== 'rich-text') throw new Error('Invalid field descriptor')
          descriptors.add(field)
        }
      }
      instances.push({ rows: size, columns: size, queries: 100, distinctReturnedArrays: arrays.size, distinctReturnedDescriptors: descriptors.size })
      instance.destroy(); instance.element.remove()
      if (instance.editableFields().length) throw new Error('Destroyed Table retained editable descriptors')
    }
    return instances
  })
  assert.equal(result.length, 2)
  assert.deepEqual(errors, [], 'Unexpected browser error')
  assert.deepEqual(await readFile(sourcePath), source, 'Table source changed during observation')
  const record = {
    kind: 'Distinct immutable descriptor return identities; allocation lower bound, no latency or heap claim',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    node: process.version, browser: browser.version(), observations: result,
  }
  await writeFile(output, JSON.stringify(record, null, 2) + '\n')
  console.log(JSON.stringify(record))
} finally { await browser?.close(); await server.close() }
