import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
const root = process.argv[2] ?? '/tmp/rector-person-repair-20261029'
const { expectedLegacyPersonPlaceholder: adapt } = await import(pathToFileURL(root + '/tests/browser/block-roundtrip-fixture.js'))
const source = [{ id: 'expected-default', type: 'person', data: { persons: [{ avatar: '', name: '', role: '', bio: '', links: [] }] } }]
const options = { legacy: true, caseId: 'BLOCK_PERSON_ROUNDTRIP/default' }
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
const original = structuredClone(source)
freeze(source)
assert.deepEqual(adapt(source, options), [{ id: 'expected-default', type: 'person', data: { persons: [] } }])
assert.deepEqual(source, original)
const cases = [
  ['native X', records => { records[0].data.persons[0].name = 'X' }],
  ['avatar only', records => { records[0].data.persons[0].avatar = 'https://example.test/avatar.png' }],
  ['role only', records => { records[0].data.persons[0].role = '<b>Editor</b>' }],
  ['bio only', records => { records[0].data.persons[0].bio = 'Biography' }],
  ['link only', records => { records[0].data.persons[0].links.push({ type: 'website', url: 'https://example.test/' }) }],
  ['multiple blank profiles', records => { records[0].data.persons.push(structuredClone(records[0].data.persons[0])) }],
  ['no profile', records => { records[0].data.persons = [] }],
  ['current profile ID', records => { records[0].data.persons[0].id = 'person-0' }],
  ['whitespace name', records => { records[0].data.persons[0].name = ' ' }],
  ['inline payload', records => { records[0].inline = { x: { type: 'mention', data: { id: 'ada', name: 'Ada' } } } }],
  ['explicit empty sidecar map', records => { records[0].inline = {} }],
  ['explicit undefined sidecar map', records => { records[0].inline = undefined }],
  ['unknown profile content', records => { records[0].data.persons[0].extra = 'kept' }],
  ['unknown data content', records => { records[0].data.extra = 'kept' }],
  ['another block type', records => { records[0].type = 'custom-person' }],
  ['multiple blocks', records => { records.push(structuredClone(records[0])) }],
  ['candidate source', () => {}, { legacy: false }],
  ['populated case', () => {}, { caseId: 'BLOCK_PERSON_ROUNDTRIP/populated' }],
  ['similar future case', () => {}, { caseId: 'BLOCK_PERSON_ROUNDTRIP/default-extra' }],
]
for (const [name, mutate, changedOptions] of cases) {
  const input = structuredClone(source); mutate(input); const before = structuredClone(input); freeze(input)
  assert.strictEqual(adapt(input, { ...options, ...changedOptions }), input, name)
  assert.deepEqual(input, before, name + ' mutated the expectation')
}
const summary = { positive: 1, negative: cases.map(([name]) => name), negativeCount: cases.length, status: 'PASS', root }
writeFileSync('/tmp/rector-person-merged-placeholder-controls.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
