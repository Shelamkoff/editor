import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const runnerPath = '/tmp/rector-image-rich-roundtrip-20261029/scripts/parity/block-roundtrip.mjs'
const rawPath = '/tmp/rector-image-rich-raw2.json'
const runner = await readFile(runnerPath, 'utf8')
const prefix = runner.slice(0, runner.indexOf("const repo = fileURLToPath(new URL('../../', import.meta.url))"))
const { classifyImageRichDifference: classify } = await import('data:text/javascript;base64,'
  + Buffer.from(prefix + '\nexport { classifyImageRichDifference }\n').toString('base64'))
const rawBytes = await readFile(rawPath)
const raw = JSON.parse(rawBytes)
const clone = value => structuredClone(value)
const classified = [], rejected = [], counts = {}
for (const source of raw.results) {
  for (const entry of source.cases) {
    for (const failure of entry.failures) {
      const classification = classify(source.source, entry, failure)
      assert.ok(classification, JSON.stringify({ source: source.source, id: entry.id, failure }))
      classified.push({ source: source.source, id: entry.id, phase: failure.phase, property: failure.property, classification })
      counts[classification] = (counts[classification] ?? 0) + 1
      const reject = (name, change) => {
        const input = { source: source.source, entry: clone(entry), failure: clone(failure) }
        change(input)
        assert.equal(classify(input.source, input.entry, input.failure), null,
          JSON.stringify({ control: name, id: entry.id, phase: failure.phase, property: failure.property }))
        rejected.push(name)
      }
      reject('candidate', input => { input.source = 'candidate' })
      reject('other-source', input => { input.source = 'another-reference' })
      reject('other-id', input => { input.entry.id += '-other' })
      reject('other-known-id', input => { input.entry.id = entry.id.endsWith('unwrapped-control')
        ? 'BLOCK_IMAGE_ROUNDTRIP/populated-widgets' : 'BLOCK_IMAGE_ROUNDTRIP/populated-widgets-unwrapped-control' })
      reject('other-phase', input => { input.failure.phase = 'dispose' })
      reject('other-property', input => { input.failure.property = 'unknown-field' })
      reject('other-status', input => { input.failure.status = 'PASS' })
      reject('different-actual', input => { input.failure.actual = { unrelated: true } })
      reject('different-expected', input => { input.failure.expected = { unrelated: true } })
      reject('healthy-pair', input => { input.failure.actual = input.failure.expected })
      reject('incomplete', input => { input.entry.completedPhases.pop() })
      reject('additional-incomplete', input => { input.entry.incompletePhases = [...(input.entry.incompletePhases ?? []), 'foreign-phase'] })
      reject('wrong-record', input => { input.entry.phases[0].blocks[0].data.text = 'Changed prefix' })
      reject('wrong-mode', input => { input.entry.phases[0].readOnly = true })
      reject('wrong-history', input => {
        input.entry.observations.find(item => item.phase === 'load' && item.property === 'historyState').actual.canUndo = true
      })
      if (['fixtureCaret', 'nativeSelection'].includes(failure.property)) {
        reject('wrong-native-owner', input => {
          input.entry.phases.find(item => item.phase === failure.phase).selectionOwner.anchor.offset++
        })
      }
    }
  }
}
assert.equal(classified.length, 139)
assert.equal(classified.filter(entry => entry.source === 'v1').length, 132)
assert.equal(classified.filter(entry => entry.source === 'spec-baseline').length, 7)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const output = { scope: 'Offline sensitivity of the exact two Image widget-caption historical classifiers. No browser rerun or current capability acceptance is implied.',
  runnerPath, runnerSha256: digest(runner), rawPath, rawSha256: digest(rawBytes),
  sourceSha256: digest(await readFile(new URL(import.meta.url))), classifiedVectors: classified.length,
  rejectedVectors: rejected.length, rejectionClasses: Object.fromEntries([...new Set(rejected)].map(name => [name, rejected.filter(value => value === name).length])),
  classifications: counts, allChecksPassed: true }
await writeFile('/tmp/rector-image-rich-classifier-sensitivity.json', JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output, null, 2))
