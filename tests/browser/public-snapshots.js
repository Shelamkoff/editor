import { publicSnapshotCases, runPublicSnapshotCase } from './public-snapshots-fixture.js'
import { test, assert, equal, run } from './regressions/harness.js'
for (const spec of publicSnapshotCases) test(`Public block snapshots ${spec.id}`, async () => {
  const result = await runPublicSnapshotCase({ spec })
  ;(window.__publicSnapshotResults ??= []).push(result)
  assert(!result.error, result.error)
  equal(result.completedPhases, result.planned, 'Snapshot case did not complete')
  equal(result.diagnostics, [], 'Unexpected snapshot diagnostic'); equal(result.unsupported, [], 'Current public snapshot must be supported')
  equal(result.observations.filter(o => o.status !== 'PASS'), [], 'Snapshot contract failed')
  for (const o of result.observations) equal(o.actual, o.expected, `${o.phase}/${o.property}`)
})
await run()
