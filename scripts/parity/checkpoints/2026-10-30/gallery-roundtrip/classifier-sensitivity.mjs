// Replay only: these controls mutate captured observations, never browser input.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { classifyGalleryDifference } from '../../../gallery-roundtrip-classifiers.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const classifier = await readFile(new URL('../../../gallery-roundtrip-classifiers.mjs', import.meta.url))
const stored = await readFile(new URL('gallery-initial-unclassified.log.gz', import.meta.url))
const raw = gunzipSync(stored), result = JSON.parse(raw)
assert(result.sourceUnchanged && result.sourceIdentityVerified)
const categories = {}, negativeControls = {}
let classified = 0, passingObservationsRejected = 0
function reject(name, source, entry, failure) {
  assert.equal(classifyGalleryDifference(source, entry, failure), null,
    `${name}: ${source}/${entry.id}/${failure.phase}/${failure.property}`)
  negativeControls[name] = (negativeControls[name] ?? 0) + 1
}
for (const { source, cases } of result.results) for (const entry of cases) {
  for (const observation of entry.observations.filter(value => value.status === 'PASS')) {
    assert.equal(classifyGalleryDifference(source, entry, observation), null)
    passingObservationsRejected++
  }
  for (const failure of entry.failures) {
    assert.notEqual(source, 'candidate', 'The captured current Gallery candidate must have no failures')
    const category = classifyGalleryDifference(source, entry, failure)
    assert(category, `${source}/${entry.id}/${failure.phase}/${failure.property}`)
    classified++; categories[category] = (categories[category] ?? 0) + 1
    reject('candidate-source', 'candidate', entry, failure)
    reject('unknown-source', 'unknown', entry, failure)
    reject('opposite-historical-source', source === 'v1' ? 'spec-baseline' : 'v1', entry, failure)
    reject('changed-actual', source, entry, { ...failure, actual: { unexpected: failure.actual } })
    reject('changed-expected', source, entry, { ...failure, expected: { unexpected: failure.expected } })
    reject('changed-property', source, entry, { ...failure, property: 'unrelated-property' })
    reject('changed-phase', source, entry, { ...failure, phase: 'unrelated-phase' })
    reject('changed-status', source, entry, { ...failure, status: failure.status === 'FAIL' ? 'ERROR' : 'FAIL' })
    reject('unknown-case', source, { ...entry, id: entry.id + '-unknown' }, failure)
    reject('completed-phase-mismatch', source, { ...entry, completedPhases: [...entry.completedPhases, 'unexpected'] }, failure)
    reject('incomplete-phase-mismatch', source, { ...entry, incompletePhases: [...(entry.incompletePhases ?? []), 'unexpected'] }, failure)
    reject('missing-phase', source, { ...entry, phases: entry.phases.slice(1) }, failure)
    reject('extra-phase', source, { ...entry, phases: [...entry.phases, entry.phases[0]] }, failure)
    const changedAuthor = structuredClone(entry)
    changedAuthor.phases[0].blocks[0].data.unexpected = 'changed'
    reject('changed-independent-author-record', source, changedAuthor, failure)
    const changedIdentity = structuredClone(entry)
    changedIdentity.phases[0].blocks[0].id = 'foreign-block'
    reject('changed-block-identity', source, changedIdentity, failure)
    const changedImage = structuredClone(entry)
    const gallery = changedImage.phases[0].blocks.find(block => block.type === 'gallery')
    if (gallery.data.images.length) gallery.data.images[1].caption += 'changed second caption'
    else gallery.data.layout = '2'
    reject('changed-independent-gallery-record', source, changedImage, failure)
    const changedSidecars = structuredClone(entry)
    changedSidecars.phases[0].blocks.find(block => block.type === 'gallery').inline = { unrelated: { type: 'mention', data: { id: 'unrelated', name: 'Unrelated' } } }
    reject('changed-independent-sidecars', source, changedSidecars, failure)
    const changedMode = structuredClone(entry)
    changedMode.phases[0].readOnly = !changedMode.phases[0].readOnly
    reject('changed-mode', source, changedMode, failure)
    if (failure.property === 'nativeSelection') {
      const changedOwner = structuredClone(entry)
      changedOwner.phases.find(phase => phase.phase === failure.phase).selectionOwner.active.block = 'foreign-block'
      reject('changed-native-owner', source, changedOwner, failure)
    }
    reject('unpaired-execution-error', source, entry, { phase: failure.phase, property: 'execution', status: 'ERROR', actual: 'Unrelated page error' })
  }
}
console.log(JSON.stringify({
  classifierSha256: hash(classifier),
  input: { file: 'gallery-initial-unclassified.log.gz', storedSha256: hash(stored), rawSha256: hash(raw), productionHead: result.headBefore },
  classified, categories, negativeControls,
  rejected: Object.values(negativeControls).reduce((total, count) => total + count, 0), passingObservationsRejected,
  boundary: 'Offline historical recognizer sensitivity. It does not run the editor, change raw results, grant candidate exceptions, or mark incomplete baseline phases passed.',
}, null, 2))
