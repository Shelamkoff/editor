import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [path, candidate, output] = process.argv.slice(2)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 })
const objectHashes = new Map()
const objectHash = (sha, file) => {
  const key = sha + ':' + file
  if (!objectHashes.has(key)) objectHashes.set(key, hash(git('show', key)))
  return objectHashes.get(key)
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const styles = { width: '180px', minWidth: '120px', maxWidth: '240px', height: '80px', minHeight: '40px', maxHeight: '100px',
  objectFit: 'cover', objectPosition: '20% 30%', borderStyle: 'dashed', borderWidth: '2px', borderColor: '#123456', borderRadius: '7px', backgroundColor: '#ffeecc' }
const specifications = [
  ...['local', 'action', 'upload'].flatMap(source => [false, true].map(populated => ({ kind: 'success', source, populated }))),
  ...['action', 'upload'].flatMap(source => [false, true].flatMap(populated => ['error', 'url-race', 'mode'].map(kind => ({ kind, source, populated })))),
  ...[false, true].map(widgets => ({ kind: 'caption', widgets, populated: true })),
  ...[false, true].map(withBackground => ({ kind: 'appearance', withBackground, populated: true })),
  ...[320, 600].flatMap(width => [false, true].map(withBackground => ({ kind: 'expanded', width, withBackground, populated: true }))),
].map((spec, index) => ({ ...spec, id: `${spec.kind}/${index}` }))

function expectedPhases(spec) {
  const noChange = spec.kind === 'error' || spec.kind === 'success' && spec.source === 'local' && spec.populated
  return ['load', spec.kind === 'caption' ? 'caption-edit' : ['appearance', 'expanded'].includes(spec.kind) ? spec.kind : 'source',
    ...(!noChange ? ['undo', 'redo'] : []), ...(spec.kind === 'caption' ? ['sibling-projection'] : spec.kind === 'expanded' ? ['restored'] : []), 'dispose']
}

function initial(spec, entry) {
  let url = gif
  if (spec.kind === 'expanded') {
    // A deterministic native canvas creates the authored 2x1 input. Verify
    // its actual PNG dimensions independently; never accept a substituted URI.
    url = entry.observations.find(o => o.phase === 'load' && o.property === 'blocks').expected[0].data.file.url
    assert(url.startsWith('data:image/png;base64,'))
    const bytes = Buffer.from(url.split(',')[1], 'base64')
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
    assert.equal(bytes.readUInt32BE(16), 2)
    assert.equal(bytes.readUInt32BE(20), 1)
  }
  return [{ id: 'image', type: 'image', dataVersion: 1, data: { file: { url: spec.populated ? url : '' },
    caption: spec.populated ? '<b>Keep</b>' + (spec.widgets ? ' {{mention}} {{color}}' : '') : '', withBorder: Boolean(spec.populated),
    expanded: false, withBackground: spec.withBackground === true, styles: spec.populated ? structuredClone(styles) : {} },
    ...(spec.widgets ? { inline: { mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      color: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } } : {}),
  }]
}

function model(spec, before, phase, occurrence) {
  const blocks = structuredClone(before)
  if (['load', 'undo', 'restored', 'late-retired'].includes(phase)
    || phase === 'appearance' && occurrence === 0) return blocks
  const value = blocks[0].data
  if (['success', 'url-race', 'mode'].includes(spec.kind)) value.file = { url: spec.source === 'local' ? gif : png }
  if (spec.kind === 'caption') {
    value.caption = spec.widgets ? '<b>Keep</b> {{mention}} {{color}}X' : '<b>KeepX</b>'
    if (phase === 'sibling-projection') value.withBackground = true
  }
  if (spec.kind === 'appearance') value.styles.height = '90px'
  if (spec.kind === 'expanded') value.expanded = true
  return blocks
}

function observationKeys(spec) {
  const keys = []
  const add = (phase, properties) => keys.push(...properties.map(property => phase + '/' + property))
  add('load', ['blocks', 'caller', 'history'])
  if (['success', 'error', 'url-race', 'mode'].includes(spec.kind)) {
    if (spec.kind === 'url-race') add('source', ['cancelled'])
    if (spec.kind === 'mode') {
      add('source', ['cancelled', 'loadingRetired'])
      add('late-retired', ['blocks', 'caller'])
      add('source', ['successorLoading'])
    }
    add('source', ['blocks', 'caller', 'visibleSource', 'loadingSettled', ...(spec.source === 'upload' ? ['uploadFile'] : []), 'transactionCount'])
    if (spec.kind === 'error' || spec.kind === 'success' && spec.source === 'local' && spec.populated) add('source', ['history'])
    else { add('undo', ['blocks', 'history']); add('redo', ['blocks', 'history']) }
  } else if (spec.kind === 'caption') {
    add('caption-edit', ['blocks', 'caller', 'outputSource', 'caption', 'outputAlt'])
    add('undo', ['blocks', 'history']); add('redo', ['blocks', 'history'])
    add('sibling-projection', ['blocks', 'caller', 'sameCaptionHost', 'sameTextHost', 'directedRange', 'outputSource', 'caption', 'outputAlt'])
  } else if (spec.kind === 'appearance') {
    add('appearance', ['blocks', 'caller', 'outputSource', 'caption', 'outputAlt', 'editorStyles', 'outputStyles', 'background', 'blocks', 'caller', 'height'])
    add('undo', ['blocks', 'history']); add('redo', ['blocks', 'history'])
  } else {
    add('expanded', ['blocks', 'caller', 'fillsOwner', 'storedWidths', 'disabledWidths', 'heightRetained'])
    add('undo', ['blocks', 'history']); add('redo', ['blocks', 'history'])
    add('restored', ['blocks', 'caller', 'widthRestored'])
  }
  add('dispose', ['pendingSourceSignalsRetired'])
  return keys
}

export function verify(report, sha = candidate) {
  assert.equal(report.headBefore, sha)
  assert.equal(report.headAfter, sha)
  assert.equal(report.group, 'image-functional')
  assert.equal(report.filter, '')
  assert.deepEqual(report.serverErrors, [])
  assert.equal(report.candidatePass, true)
  assert.deepEqual(report.sources.map(source => source.label), ['v1', 'spec-baseline', 'parent', 'candidate'])
  for (const source of report.sources) {
    assert.equal(git('rev-parse', `${source.sha}^{tree}`).toString().trim(), source.tree)
    for (const [file, digest] of Object.entries(source.loaded)) assert.equal(objectHash(source.sha, file), digest, file)
    assert(source.loaded['plugins/image/index.js'])
  }
  const rows = report.results.filter(row => row.source === 'candidate')
  assert.deepEqual(rows.map(row => row.trustedPolicy), [false, true])
  for (const row of rows) {
    assert.equal(row.policyEnforced, row.trustedPolicy)
    for (const name of ['pageErrors', 'inputErrors', 'externalRequests']) assert.deepEqual(row[name], [])
    assert.deepEqual(row.cases.map(entry => entry.spec), specifications)
    for (const entry of row.cases) {
      assert(!entry.error, entry.error)
      assert.deepEqual(entry.unsupported, [])
      assert.deepEqual(entry.phases, expectedPhases(entry.spec))
      assert.deepEqual(entry.observations.map(o => o.phase + '/' + o.property), observationKeys(entry.spec))
      assert(entry.events.some(event => event.kind === 'click' && event.trusted))
      for (const event of entry.events.filter(event => event.kind === 'click')) assert.equal(event.trusted, true)
      const before = initial(entry.spec, entry)
      const phaseOccurrences = new Map()
      for (const observation of entry.observations) {
        assert.equal(observation.status, 'PASS')
        assert.deepEqual(observation.actual, observation.expected)
        if (observation.property === 'blocks') {
          const count = phaseOccurrences.get(observation.phase) ?? 0
          assert.deepEqual(observation.expected, model(entry.spec, before, observation.phase, count))
          phaseOccurrences.set(observation.phase, count + 1)
        }
        if (observation.property === 'caller') assert.deepEqual(observation.expected, { version: '2.0.0', blocks: before })
        if (observation.property === 'history') assert.deepEqual(observation.expected,
          observation.phase === 'undo' ? [false, true] : observation.phase === 'redo' ? [true, false] : [false, false])
        if (observation.property === 'transactionCount') assert.equal(observation.expected,
          entry.spec.kind === 'error' || entry.spec.kind === 'success' && entry.spec.source === 'local' && entry.spec.populated ? 0 : 1)
        if (observation.property === 'outputSource') assert.equal(observation.expected, before[0].data.file.url)
        if (observation.property === 'caption' || observation.property === 'outputAlt') assert.equal(observation.expected,
          entry.spec.kind === 'caption' ? entry.spec.widgets ? 'Keep @Ada #123456X' : 'KeepX' : 'Keep')
        if (observation.property === 'editorStyles' || observation.property === 'outputStyles') {
          const css = { ...styles, borderColor: 'rgb(18, 52, 86)' }; delete css.backgroundColor
          assert.deepEqual(observation.expected, css)
        }
        if (observation.property === 'background') assert.equal(observation.expected, entry.spec.withBackground ? 'rgb(255, 238, 204)' : '')
        if (observation.property === 'heightRetained') assert.equal(observation.expected, '80px')
        if (observation.property === 'widthRestored') assert.equal(observation.expected, '180px')
        if (observation.property === 'uploadFile') assert.deepEqual(observation.expected,
          Array.from({ length: entry.spec.kind === 'mode' ? 2 : 1 }, () => ({ kind: 'upload', name: 'tiny.gif', type: 'image/gif', size: 42 })))
        const booleans = { cancelled: true, loadingRetired: false, successorLoading: true, loadingSettled: false,
          sameCaptionHost: true, sameTextHost: true, fillsOwner: true, pendingSourceSignalsRetired: true }
        if (Object.hasOwn(booleans, observation.property)) assert.equal(observation.expected, booleans[observation.property])
        if (observation.property === 'directedRange') assert.deepEqual(observation.expected, [true, entry.spec.widgets ? 1 : 5, true, 0])
        if (observation.property === 'storedWidths') assert.deepEqual(observation.expected, ['180px', '120px', '240px'])
        if (observation.property === 'disabledWidths') assert.deepEqual(observation.expected, [true, true, true])
      }
    }
  }
  return { candidate: sha, status: 'PASS', currentExecutions: rows.reduce((n, row) => n + row.cases.length, 0),
    currentObservations: rows.reduce((n, row) => n + row.cases.reduce((m, c) => m + c.observations.length, 0), 0),
    historical: report.results.filter(row => row.source !== 'candidate').map(row => ({ source: row.source,
      differences: row.cases.reduce((n, c) => n + c.observations.filter(o => o.status !== 'PASS').length, 0),
      incompleteBodies: row.cases.filter(c => c.error).map(c => ({ id: c.id, phase: c.failedPhase, error: c.error })) })),
    moduleIdentities: report.sources.reduce((n, source) => n + Object.keys(source.loaded).length, 0) }
}

if (path && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = verify(JSON.parse(readFileSync(path)))
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
