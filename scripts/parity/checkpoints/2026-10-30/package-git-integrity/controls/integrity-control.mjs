import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const [helperPath, inputPath] = process.argv.slice(2)
const source = await readFile(helperPath)
const { getPinnedGitDependencies, assertConsumerGitDependencies } = await import(`data:text/javascript;base64,${source.toString('base64')}`)
const { manifest, projectLock } = JSON.parse(await readFile(inputPath, 'utf8'))
const name = '@shelamkoff/carousel'
const original = { ...projectLock.packages[`node_modules/${name}`] }
const changedIntegrity = `sha512-${Buffer.alloc(64).toString('base64')}`
projectLock.packages[`node_modules/${name}`].integrity = changedIntegrity
const pins = getPinnedGitDependencies(manifest, projectLock)
const consumerLock = { packages: {
  '': { dependencies: { [manifest.name]: 'file:./rector.tgz' } },
  [`node_modules/${manifest.name}`]: { dependencies: { ...manifest.dependencies } },
  [`node_modules/${name}`]: original,
} }
let acceptedConsumer = true
let error = null
try { assertConsumerGitDependencies(manifest, consumerLock, pins) } catch (failure) {
  acceptedConsumer = false
  error = failure.message
}
const observations = {
  pinCarriesLockedIntegrity: pins[0].integrity === changedIntegrity,
  consumerDiffersFromProjectIntegrityAccepted: acceptedConsumer,
  originalIntegrity: original.integrity,
  changedIntegrity,
  resolved: original.resolved,
  error,
}
console.log(JSON.stringify(observations))
assert.equal(observations.pinCarriesLockedIntegrity, true, 'pinned provenance must retain the actual lock SRI')
assert.equal(acceptedConsumer, false, 'a consumer with another SRI must be rejected')
assert.match(error, /consumer integrity differs/)
