// Offline sensitivity of the historical recognizers. This does not execute the
// editor, rewrite raw observations or grant candidate exceptions.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { classifyPersonDifference, personCaseIds } from '../../../person-roundtrip-classifiers.mjs'

const path = process.argv[2] ?? new URL('./final-shared57.json.gz', import.meta.url)
const bytes = await readFile(path), raw = String(path).endsWith('.gz') ? gunzipSync(bytes) : bytes
const input = JSON.parse(raw), categories = {}, negativeControls = {}
const hash = value => createHash('sha256').update(value).digest('hex')
let classified = 0, passingObservationsRejected = 0, candidateFailuresRejected = 0
assert(input.sourceUnchanged && input.sourceIdentityVerified)
const reject = (name, source, entry, failure) => {
  assert.equal(classifyPersonDifference(source, entry, failure), null,
    `${name}: ${source}/${entry.id}/${failure.phase}/${failure.property}`)
  negativeControls[name] = (negativeControls[name] ?? 0) + 1
}
for (const { source, cases } of input.results) for (const entry of cases.filter(value => personCaseIds.includes(value.id))) {
  for (const observation of entry.observations.filter(value => value.status === 'PASS')) {
    assert.equal(classifyPersonDifference(source, entry, observation), null)
    passingObservationsRejected++
  }
  for (const failure of entry.failures) {
    if (source === 'candidate') {
      reject('real-candidate-failure', source, entry, failure)
      candidateFailuresRejected++
      continue
    }
    const category = classifyPersonDifference(source, entry, failure)
    assert(category, `${source}/${entry.id}/${failure.phase}/${failure.property}`)
    classified++; categories[category] = (categories[category] ?? 0) + 1
    reject('candidate-source', 'candidate', entry, failure)
    reject('unknown-source', 'unknown', entry, failure)
    reject('opposite-historical-source', source === 'v1' ? 'spec-baseline' : 'v1', entry, failure)
    reject('changed-actual', source, entry, { ...failure, actual: { altered: failure.actual } })
    reject('changed-expected', source, entry, { ...failure, expected: { altered: failure.expected } })
    reject('changed-property', source, entry, { ...failure, property: 'unrelated-property' })
    reject('changed-phase', source, entry, { ...failure, phase: 'unexecuted-phase' })
    reject('changed-status', source, entry, { ...failure, status: failure.status === 'FAIL' ? 'ERROR' : 'FAIL' })
    reject('changed-case', source, { ...entry, id: entry.id + '-unknown' }, failure)
    reject('completed-phase-mismatch', source, { ...entry, completedPhases: [...entry.completedPhases, 'extra'] }, failure)
    reject('incomplete-phase-mismatch', source, { ...entry, incompletePhases: [...(entry.incompletePhases ?? []), 'extra'] }, failure)
    reject('missing-phase', source, { ...entry, phases: entry.phases.slice(1) }, failure)
    reject('duplicate-phase', source, { ...entry, phases: [...entry.phases, entry.phases[0]] }, failure)
    const record = structuredClone(entry)
    record.phases[0].blocks.find(block => block.type === 'person').data.extraAuthorValue = 'changed'
    reject('changed-author-record', source, record, failure)
    const identity = structuredClone(entry)
    identity.phases[0].blocks[0].id = 'different-block-owner'
    reject('changed-identity', source, identity, failure)
    const version = structuredClone(entry)
    version.phases[0].blocks.find(block => block.type === 'person').dataVersion = 99
    reject('changed-wire-version', source, version, failure)
    const mode = structuredClone(entry)
    mode.phases[0].readOnly = !mode.phases[0].readOnly
    reject('changed-mode', source, mode, failure)
    const history = structuredClone(entry)
    history.observations.find(value => value.phase === 'load' && value.property === 'historyState').actual.canUndo = true
    reject('changed-history', source, history, failure)
    const sidecar = structuredClone(entry)
    sidecar.phases[0].blocks.find(block => block.type === 'person').inline = { unrelated: { type: 'mention', data: { id: 'other', name: 'Changed' } } }
    reject('changed-sidecar', source, sidecar, failure)
    if (!entry.id.endsWith('/default')) {
      const hidden = structuredClone(entry)
      hidden.phases[0].blocks.find(block => block.type === 'person').data.persons[1].bio = 'Changed hidden author data'
      reject('changed-hidden-profile', source, hidden, failure)
    }
    if (['nativeSelection', 'fixtureCaret'].includes(failure.property)) {
      const owner = structuredClone(entry)
      owner.phases.find(value => value.phase === failure.phase).selectionOwner.active.block = 'foreign-owner'
      reject('changed-native-owner', source, owner, failure)
      const endpoint = structuredClone(entry)
      endpoint.phases.find(value => value.phase === failure.phase).selectionOwner.focus.offset++
      reject('changed-native-endpoint', source, endpoint, failure)
    }
    reject('unrelated-execution-error', source, entry, { phase: failure.phase, property: 'execution', status: 'ERROR', actual: 'Unrelated error' })
  }
}
console.log(JSON.stringify({
  classifierSha256: hash(await readFile(new URL('../../../person-roundtrip-classifiers.mjs', import.meta.url))),
  input: { path: String(path), storedSha256: hash(bytes), rawSha256: hash(raw), head: input.headBefore },
  classified, categories, negativeControls, rejected: Object.values(negativeControls).reduce((sum, value) => sum + value, 0),
  passingObservationsRejected, candidateFailuresRejected,
  boundary: 'Exact historical observations only; no candidate exceptions, browser input changes or acceptance of incomplete historical phases.',
}, null, 2))
