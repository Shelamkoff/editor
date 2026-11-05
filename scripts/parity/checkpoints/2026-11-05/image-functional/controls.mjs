import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { verify } from './review.mjs'

const [input, candidate, output] = process.argv.slice(2)
const original = JSON.parse(readFileSync(input))
verify(original, candidate)
const current = data => data.results.find(row => row.source === 'candidate')
const observation = (data, property) => current(data).cases.flatMap(c => c.observations).find(o => o.property === property)
const changes = {
  'omitted-case': data => current(data).cases.pop(),
  'duplicated-case': data => { current(data).cases[1] = current(data).cases[0] },
  'omitted-observation': data => current(data).cases[0].observations.pop(),
  'omitted-replay': data => current(data).cases[0].phases.splice(2, 1),
  'changed-candidate': data => { data.headBefore = '0'.repeat(40) },
  'wrong-module-bytes': data => { data.sources.at(-1).loaded['plugins/image/index.js'] = '0'.repeat(64) },
  'unenforced-policy': data => { data.results.find(row => row.trustedPolicy).policyEnforced = false },
  'unexpected-page-error': data => current(data).pageErrors.push('Unexpected error'),
  'untrusted-action': data => { current(data).cases[0].events.find(e => e.kind === 'click').trusted = false },
  'forged-verdict': data => { observation(data, 'loadingSettled').actual = true },
  'forged-loading-model': data => { const o = observation(data, 'loadingSettled'); o.actual = o.expected = true },
  'lost-caption': data => { const o = observation(data, 'outputAlt'); o.actual = o.expected = '' },
  'lost-source': data => { const o = observation(data, 'blocks'); o.actual[0].data.file.url = 'https://invalid.example/lost' },
  'forged-wire-model': data => { const o = observation(data, 'blocks'); delete o.actual[0].dataVersion; delete o.expected[0].dataVersion },
  'lost-widget': data => {
    const o = current(data).cases.find(c => c.spec.widgets).observations.find(o => o.property === 'blocks')
    delete o.actual[0].inline.color; delete o.expected[0].inline.color
  },
  'forged-history': data => { const o = observation(data, 'history'); o.actual = o.expected = [true, false] },
  'forged-styles': data => { const o = observation(data, 'editorStyles'); o.actual.width = o.expected.width = '1px' },
  'forged-range': data => { const o = observation(data, 'directedRange'); o.actual = o.expected = [false, 0, false, 0] },
  'missing-policy-run': data => data.results.pop(),
}
const results = []
for (const [name, change] of Object.entries(changes)) {
  const corrupt = structuredClone(original); change(corrupt)
  assert.throws(() => verify(corrupt, candidate), undefined, name)
  results.push({ name, rejected: true })
}
const report = { status: 'PASS', candidate, rejectedCorruptions: results.length, results }
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
