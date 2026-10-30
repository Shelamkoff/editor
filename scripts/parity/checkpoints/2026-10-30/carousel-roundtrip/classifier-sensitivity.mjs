// Replay only: mutate archived observations, never browser input or product code.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { classifyCarouselDifference } from '../../../carousel-roundtrip-classifiers.mjs'

const inputPath = process.argv[2] ? new URL(process.argv[2], 'file://' + process.cwd() + '/')
  : new URL('four-case-raw.json.gz', import.meta.url)
const stored = await readFile(inputPath), raw = inputPath.pathname.endsWith('.gz') ? gunzipSync(stored) : stored
const result = JSON.parse(raw)
assert(result.sourceUnchanged && result.sourceIdentityVerified)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const categories = {}, negativeControls = {}
let classified = 0, passingObservationsRejected = 0
function reject(name, source, entry, failure) {
  assert.equal(classifyCarouselDifference(source, entry, failure), null,
    `${name}: ${source}/${entry.id}/${failure.phase}/${failure.property}`)
  negativeControls[name] = (negativeControls[name] ?? 0) + 1
}
for (const { source, cases } of result.results) for (const entry of cases.filter(item => item.id.startsWith('BLOCK_CAROUSEL_ROUNDTRIP/'))) {
  for (const observation of entry.observations.filter(value => value.status === 'PASS')) {
    assert.equal(classifyCarouselDifference(source, entry, observation), null)
    passingObservationsRejected++
  }
  for (const failure of entry.failures) {
    assert.notEqual(source, 'candidate', 'Current candidate failures cannot become historical exceptions')
    const category = classifyCarouselDifference(source, entry, failure)
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
    const changedSlide = structuredClone(entry)
    const carousel = changedSlide.phases[0].blocks.find(block => block.type === 'carousel')
    if (carousel.data.slides.length) carousel.data.slides[1].caption += 'changed second caption'
    else carousel.data.options.autoplay = true
    reject('changed-independent-carousel-record', source, changedSlide, failure)
    const changedSidecars = structuredClone(entry)
    changedSidecars.phases[0].blocks.find(block => block.type === 'carousel').inline = { unrelated: { type: 'mention', data: { id: 'unrelated', name: 'Unrelated' } } }
    reject('changed-independent-sidecars', source, changedSidecars, failure)
    const changedMode = structuredClone(entry)
    changedMode.phases[0].readOnly = !changedMode.phases[0].readOnly
    reject('changed-mode', source, changedMode, failure)
    if (failure.property === 'nativeSelection') {
      const changedOwner = structuredClone(entry)
      changedOwner.phases.find(phase => phase.phase === failure.phase).selectionOwner.active.block = 'foreign-block'
      reject('changed-native-owner', source, changedOwner, failure)
    }
    if (source === 'v1' && entry.id.includes('widgets')) {
      reject('changed-reference-capability', source, { ...entry, referenceCapability: { supported: true } }, failure)
    }
    reject('unpaired-execution-error', source, entry, { phase: failure.phase, property: 'execution', status: 'ERROR', actual: 'Unrelated page error' })
  }
}
console.log(JSON.stringify({
  classifierSha256: hash(await readFile(new URL('../../../carousel-roundtrip-classifiers.mjs', import.meta.url))),
  input: { file: inputPath.pathname, storedSha256: hash(stored), rawSha256: hash(raw), productionHead: result.headBefore },
  classified, categories, negativeControls,
  rejected: Object.values(negativeControls).reduce((total, count) => total + count, 0), passingObservationsRejected,
  boundary: 'Offline recognizer sensitivity only. Candidate failures are rejected; incomplete historical phases remain incomplete.',
}, null, 2))
