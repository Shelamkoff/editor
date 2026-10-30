// Read-only replay of executed historical observations. The full raw traces
// remain archived; mutations below test recognizer rejection, never the editor.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { classifyLinkPollDifference } from '../../../link-poll-roundtrip-classifiers.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const classifier = await readFile(new URL('../../../link-poll-roundtrip-classifiers.mjs', import.meta.url))
const files = ['poll-roundtrip-green-before-core.json.gz', 'link-preview-roundtrip-green-before-final.json.gz']
const inputs = [], categories = {}, negativeControls = {}
let classified = 0, passingObservationsRejected = 0
const reject = (name, source, entry, failure) => {
  assert.equal(classifyLinkPollDifference(source, entry, failure), null, `${name}: ${source}/${entry.id}/${failure.phase}/${failure.property}`)
  negativeControls[name] = (negativeControls[name] ?? 0) + 1
}
for (const file of files) {
  const compressed = await readFile(new URL(file, import.meta.url)), raw = gunzipSync(compressed)
  const result = JSON.parse(raw)
  inputs.push({ file, storedSha256: hash(compressed), rawSha256: hash(raw), head: result.headBefore })
  assert(result.sourceUnchanged && result.sourceIdentityVerified)
  for (const { source, cases } of result.results) for (const entry of cases) {
    for (const observation of entry.observations.filter(item => item.status === 'PASS')) {
      assert.equal(classifyLinkPollDifference(source, entry, observation), null)
      passingObservationsRejected++
    }
    for (const failure of entry.failures) {
      assert.notEqual(source, 'candidate', 'Captured green current traces must contain no candidate failures')
      const category = classifyLinkPollDifference(source, entry, failure)
      assert(category, `${source}/${entry.id}/${failure.phase}/${failure.property}`)
      classified++; categories[category] = (categories[category] ?? 0) + 1
      reject('candidate-source', 'candidate', entry, failure)
      reject('unknown-source', 'unknown', entry, failure)
      reject('opposite-historical-source', source === 'v1' ? 'spec-baseline' : 'v1', entry, failure)
      reject('changed-actual', source, entry, { ...failure, actual: { unexpected: failure.actual } })
      reject('changed-expected', source, entry, { ...failure, expected: { unexpected: failure.expected } })
      reject('changed-property', source, entry, { ...failure, property: 'unexpected-property' })
      reject('changed-phase', source, entry, { ...failure, phase: 'unexpected-phase' })
      reject('changed-status', source, entry, { ...failure, status: failure.status === 'FAIL' ? 'ERROR' : 'FAIL' })
      reject('unknown-case', source, { ...entry, id: entry.id + '-unknown' }, failure)
      reject('completed-phase-mismatch', source, { ...entry, completedPhases: [...entry.completedPhases, 'unexpected'] }, failure)
      reject('incomplete-phase-mismatch', source, { ...entry, incompletePhases: [...(entry.incompletePhases ?? []), 'unexpected'] }, failure)
      reject('missing-phase-observation', source, { ...entry, phases: entry.phases.slice(1) }, failure)
      reject('extra-phase-observation', source, { ...entry, phases: [...entry.phases, entry.phases[0]] }, failure)
      const changedRecord = structuredClone(entry)
      changedRecord.phases[0].blocks[0].data.unexpectedAuthorValue = 'changed'
      reject('changed-independent-author-record', source, changedRecord, failure)
      const changedIdentity = structuredClone(entry)
      changedIdentity.phases[0].blocks[0].id = 'unknown-generated-identity'
      reject('changed-block-identity', source, changedIdentity, failure)
      if (['nativeSelection', 'fixtureCaret', 'foreignFocusPreserved'].includes(failure.property)) {
        const changedOwner = structuredClone(entry)
        changedOwner.phases.find(phase => phase.phase === failure.phase).selectionOwner.active.block = 'foreign-block'
        reject('changed-native-owner', source, changedOwner, failure)
      }
      reject('unpaired-execution-error', source, entry, { phase: failure.phase, property: 'execution', status: 'ERROR', actual: 'Unrelated page error' })
    }
  }
}
console.log(JSON.stringify({ classifierSha256: hash(classifier), inputs, classified, categories,
  negativeControls, rejected: Object.values(negativeControls).reduce((total, count) => total + count, 0),
  passingObservationsRejected,
  boundary: 'Offline recognizer sensitivity only. It does not execute browser/editor behavior or grant candidate exceptions.',
}, null, 2))
