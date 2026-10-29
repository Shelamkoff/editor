import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const path = '/tmp/rector-embed-pageerror-attribution-20261029/scripts/parity/block-roundtrip.mjs'
const source = await readFile(path, 'utf8')
const start = source.indexOf('// These fixed values recognize only captured historical Embed failures.')
const end = source.indexOf("const repo = fileURLToPath(", start)
const classify = new Function(source.slice(start, end) + '\nreturn classifyEmbedPageErrors')()
const raw = JSON.parse(await readFile('/tmp/rector-embed-pageerror-attribution-raw.json', 'utf8'))
const baseline = raw.results.find(result => result.source === 'spec-baseline')
const origin = baseline.errors[0].match(/http:\/\/[^/]+/)[0]
const args = { source: baseline.source, cases: baseline.cases, errors: baseline.errors, pageErrors: baseline.pageErrors, origin }
const run = ({source, cases, errors, pageErrors, origin}) => classify(source, cases, errors, pageErrors, origin)
const accepted = run(args)
assert.equal(accepted.classifiedPageErrors.length, 1)
assert.equal(accepted.unexpectedErrors.length + accepted.unexpectedPageErrors.length, 0)
assert.equal(baseline.errors.length, 1)
assert.equal(baseline.pageErrors.length, 1)
const controls = {
 candidate: input => {input.source = 'candidate'},
 unknownSource: input => {input.source = 'unknown'},
 origin: input => {input.origin = 'http://127.0.0.1:1'},
 sourceContext: input => {input.pageErrors[0].source = 'v1'},
 caseContext: input => {input.pageErrors[0].caseId = 'BLOCK_EMBED_ROUNDTRIP/populated'},
 phaseContext: input => {input.pageErrors[0].phase = 'undo'},
 errorName: input => {input.pageErrors[0].name = 'TypeError'},
 errorMessage: input => {input.pageErrors[0].message += '!'},
 errorStack: input => {input.pageErrors[0].stack += '!'},
 changedMatchingStackPair: input => {input.pageErrors[0].stack += '!'; input.errors[0] += '!'},
 duplicateWindowError: input => {input.pageErrors.push(structuredClone(input.pageErrors[0]))},
 duplicatePlaywrightError: input => {input.errors.push(input.errors[0])},
 orphanWindowError: input => {input.errors = []},
 orphanPlaywrightError: input => {input.pageErrors = []},
 missingFailure: input => {input.cases[0].failures.pop()},
 duplicateFailureProperty: input => {input.cases[0].failures[10] = structuredClone(input.cases[0].failures[0])},
 changedHistoryFailure: input => {input.cases[0].failures.find(item => item.property === 'historyState').actual.canUndo = true},
 changedHistoryObservation: input => {input.cases[0].observations.find(item => item.phase === 'redo' && item.property === 'historyState').actual.canUndo = true},
 changedCanonicalSnapshot: input => {input.cases[0].phases.find(item => item.phase === 'redo').blocks[1].data.caption += '!'},
 changedNativeOwner: input => {input.cases[0].phases.find(item => item.phase === 'redo').selectionOwner.anchor.offset++},
 incompletePhases: input => {input.cases[0].completedPhases.pop()},
}
for (const [name, change] of Object.entries(controls)) {
 const input = structuredClone(args)
 change(input)
 const result = run(input)
 assert.equal(result.classifiedPageErrors.length, 0, name)
 assert(result.unexpectedErrors.length + result.unexpectedPageErrors.length > 0, name)
}
const result = { runnerSha256: createHash('sha256').update(source).digest('hex'), positive: 'one exact observed e981 unwrapped Redo window/Playwright pair', positiveCount: 1, negativeCount: Object.keys(controls).length, rejectedControls: Object.keys(controls), rawErrorsUnchanged: true }
await writeFile('/tmp/rector-embed-pageerror-classification-check.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
