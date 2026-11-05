import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [reviewer, input, candidate, output] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(input))
mkdirSync(output, { recursive: true })
const review = (path, name) => spawnSync(process.execPath, [reviewer, path, candidate, join(output, name + '-review.json')], { encoding: 'utf8', windowsHide: true })
const healthy = review(input, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)

const row = data => data.results.find(entry => entry.source === 'candidate' && !entry.trustedPolicy)
function item(data, id) {
  const found = row(data).cases.find(entry => entry.id === id)
  assert(found)
  return found
}
function change(data, id, phase, property, mutate) {
  const observation = item(data, id).observations.find(entry => entry.phase === phase && entry.property === property)
  assert(observation)
  const value = structuredClone(observation.actual)
  observation.actual = observation.expected = mutate(value) ?? value
  observation.status = 'PASS'
}

const paste = 'paste/false/false', headedPaste = 'paste/true/true'
const middle = 'convert/middle/false/false', widget = 'convert/widget/true/true'
const cell = 'convert/cell/false/false', empty = 'convert/emptyNeighbors/true/true', whole = 'convert/all/false/false'
const controls = [
  ['wrong-source', data => { data.sources[3].sha = data.sources[2].sha }],
  ['wrong-module', data => { data.sources[3].loaded['plugins/table/index.js'] = '0'.repeat(64) }],
  ['missing-case', data => row(data).cases.pop()],
  ['unenforced-policy', data => { data.results.at(-1).policyEnforced = false }],
  ['page-error', data => row(data).pageErrors.push('unexpected error')],
  ['source-selection-erased', data => change(data, paste, 'paste', 'canonical', blocks => { blocks[0].data.text = 'abcghi' })],
  ['paste-marks-lost', data => change(data, paste, 'paste', 'canonical', blocks => { blocks[1].data.rows[0].cells[0].text = 'Q' })],
  ['paste-header-lost', data => change(data, headedPaste, 'paste', 'canonical', blocks => { blocks[1].data.withHeadings = false })],
  ['synthetic-copy', data => { item(data, paste).nativeEvents[1].trusted = false }],
  ['not-external-html', data => change(data, paste, 'paste', 'clipboard', value => { value.private = true })],
  ['duplicate-row-id', data => { const rows = item(data, paste).rawAfter[1].data.rows; rows[1].id = rows[0].id }],
  ['duplicate-cell-id', data => { const cells = item(data, headedPaste).rawAfter[1].data.rows[0].cells; cells[1].id = cells[0].id }],
  ['mutated-caller', data => change(data, paste, 'redo', 'caller', value => { value.blocks[0].data.text = 'changed' })],
  ['unselected-text-lost', data => change(data, middle, 'convert', 'canonical', blocks => { blocks[1].data.rows[0].cells[1].text = '' })],
  ['unselected-cell-id-changed', data => change(data, middle, 'convert', 'canonical', blocks => { blocks[1].data.rows[1].cells[0].id = 'other' })],
  ['lost-widget-sidecar', data => change(data, widget, 'convert', 'canonical', blocks => { delete blocks[2].inline })],
  ['duplicated-widget-sidecar', data => change(data, widget, 'convert', 'canonical', blocks => { blocks[1].inline = blocks[2].inline })],
  ['blank-table-retained', data => change(data, whole, 'convert', 'canonical', blocks => { blocks.splice(1, 0, item(data, empty).rawAfter[1]) })],
  ['empty-neighbors-erased', data => change(data, empty, 'convert', 'canonical', blocks => { blocks.splice(1, 1) })],
  ['full-cell-format-ghost', data => { item(data, cell).rawAfter[1].data.rows[0].cells[0].text = '<b></b>' }],
  ['whole-table-id-lost', data => { item(data, whole).targetId = 'new-paragraph' }],
  ['extra-action', data => item(data, cell).transactions.push({ action: 'commit', origin: 'user', name: 'selection.convert' })],
  ['raw-redo-changed', data => change(data, whole, 'redo', 'canonical', blocks => { blocks[1].data.text = 'Changed' })],
  ['old-widget-body-invented', data => { const entry = data.results[0].cases.find(entry => entry.id === widget); entry.available = true }],
]
assert.equal(controls.length, 24)
const results = []
for (const [name, mutate] of controls) {
  const corrupted = structuredClone(raw)
  mutate(corrupted)
  const path = join(output, name + '.json')
  const bytes = Buffer.from(JSON.stringify(corrupted))
  writeFileSync(path, bytes)
  const result = review(path, name)
  assert.equal(result.status, 1, name + ' was not rejected: ' + result.stderr)
  writeFileSync(join(output, name + '.stderr'), result.stderr)
  results.push({ name, exitCode: result.status, rawSha256: createHash('sha256').update(bytes).digest('hex') })
}
const report = { group: raw.group, healthyExitCode: healthy.status, results }
writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ group: report.group, controls: results.length, rejected: results.length }))
