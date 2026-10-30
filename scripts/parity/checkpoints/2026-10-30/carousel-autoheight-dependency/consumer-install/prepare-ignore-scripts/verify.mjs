import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const output = await import('@shelamkoff/carousel')
for (const name of ['Carousel','createArrows','createDots','createThumbnails','createKeyboard','createSwipe','createAutoplay']) assert.equal(typeof output[name], 'function', name)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const root = new URL('./node_modules/@shelamkoff/carousel/dist/', import.meta.url)
const expected = new URL('file:///tmp/rector-carousel-release-backport-20261030/dist/')
const files = {}
async function walk(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative + entry.name
    if (entry.isDirectory()) await walk(new URL(entry.name + '/', directory), name + '/')
    else {
      const bytes = await readFile(new URL(entry.name, directory))
      assert.deepEqual(bytes, await readFile(new URL(name, expected)), name)
      files[name] = hash(bytes)
    }
  }
}
await walk(root)
assert.equal(Object.keys(files).length, 47)
await readFile(new URL(output.carouselStylesUrl))
console.log(JSON.stringify({publicExports: Object.keys(output), comparedDistFiles: Object.keys(files).length, files}, null, 2))
