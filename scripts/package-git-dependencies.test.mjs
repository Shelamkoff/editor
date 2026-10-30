import test from 'node:test'
import assert from 'node:assert/strict'
import { assertConsumerGitDependencies, assertGitArtifactIntegrity, getPinnedGitDependencies } from './package-git-dependencies.mjs'

const name = '@example/widget'
const commit = '0123456789abcdef0123456789abcdef01234567'
const spec = `git+https://github.com/example/widget.git#${commit}`
const resolved = `git+ssh://git@github.com/example/widget.git#${commit}`
// A fixed gzip-compressed tar containing package/package.json. Its SRI was
// calculated independently; assertions never obtain their expected hash from
// the verification helper or npm's reported metadata.
const tarball = Buffer.from('H4sIAAAAAAACA+3NvwrCMBCA8cw+hdwsaSJtBidfJWgoVZuG/lFBfHejDoKziOD3W77jbrjkN3tfhyI9q3dDF9WHmcyV5aPZe42pqtd831vrlk7NjfqCaRh9n9+r/3SR6NsgK1mHs2/TIRSnZluHURZyDP3QdDHfrDbayHWmAAAAAAAAAAAAAAAAAAC/4gaeO8jPACgAAA==', 'base64')
const integrity = 'sha512-g28lG5voHaXRtacgFmbJU3f5hkEFXy7glkLLYPm7wxwvdjHUjdix81xehQLGrMdzgA/8MJvxO0KL0VxnMst7Gg=='
const otherIntegrity = 'sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=='
const pin = { name, spec, commit, resolved, version: '1.0.0', integrity }

function fixture() {
  const manifest = { name: '@example/editor', dependencies: { [name]: spec, ordinary: '^2.0.0' } }
  const projectLock = { packages: {
    '': { dependencies: { ...manifest.dependencies } },
    [`node_modules/${name}`]: { version: '1.0.0', resolved, integrity },
  } }
  const consumerLock = { packages: {
    '': { dependencies: { '@example/editor': 'file:../editor.tgz' } },
    'node_modules/@example/editor': { dependencies: { ...manifest.dependencies } },
    [`node_modules/${name}`]: { version: '1.0.0', resolved, integrity },
  } }
  return { manifest, projectLock, consumerLock }
}

test('package gate stages only full Git commits present in the published manifest and project lock', () => {
  const { manifest, projectLock } = fixture()
  assert.deepEqual(getPinnedGitDependencies(manifest, projectLock), [pin])
})

test('package gate rejects mutable or abbreviated Git pins before fetching', () => {
  for (const revision of ['main', 'v1.0.0', commit.slice(0, 8), '']) {
    const { manifest, projectLock } = fixture()
    manifest.dependencies[name] = `git+https://github.com/example/widget.git#${revision}`
    projectLock.packages[''].dependencies[name] = manifest.dependencies[name]
    assert.throws(() => getPinnedGitDependencies(manifest, projectLock), /full immutable Git commit/)
  }
})

test('package gate rejects a published Git declaration absent from the project lock', () => {
  const { manifest, projectLock } = fixture()
  projectLock.packages[''].dependencies[name] = '^1.0.0'
  assert.throws(() => getPinnedGitDependencies(manifest, projectLock), /differs from the project lock/)
})

test('package gate rejects a lock resolved at another Git commit', () => {
  const { manifest, projectLock } = fixture()
  projectLock.packages[`node_modules/${name}`].resolved = resolved.replace(commit, 'a'.repeat(40))
  assert.throws(() => getPinnedGitDependencies(manifest, projectLock), /differs from the published pin/)
})

test('package gate rejects missing, malformed or non-sha512 locked integrity', () => {
  for (const value of [undefined, '', 'sha512-invalid', integrity.replace('sha512-', 'sha256-'), integrity.replace(/==$/, 'A=')]) {
    const { manifest, projectLock } = fixture()
    projectLock.packages[`node_modules/${name}`].integrity = value
    assert.throws(() => getPinnedGitDependencies(manifest, projectLock), /valid locked sha512 integrity/)
  }
})

test('packed Git archive must match the locked sha512 in both metadata and actual bytes', () => {
  assert.equal(assertGitArtifactIntegrity(pin, { integrity }, tarball), integrity)
})

test('packed Git archive rejects missing or mismatched npm integrity metadata', () => {
  for (const value of [undefined, otherIntegrity]) {
    assert.throws(() => assertGitArtifactIntegrity(pin, { integrity: value }, tarball), /metadata integrity differs/)
  }
})

test('packed Git archive rejects tampered tgz bytes even when npm reports the expected integrity', () => {
  const tampered = Buffer.from(tarball)
  tampered[40] ^= 1
  assert.throws(() => assertGitArtifactIntegrity(pin, { integrity }, tampered), /archive bytes differ/)
})

test('changing only the lock SRI cannot accept the original artifact or consumer', () => {
  const { manifest, projectLock, consumerLock } = fixture()
  projectLock.packages[`node_modules/${name}`].integrity = otherIntegrity
  const changedPins = getPinnedGitDependencies(manifest, projectLock)
  assert.throws(() => assertGitArtifactIntegrity(changedPins[0], { integrity }, tarball), /metadata integrity differs/)
  assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, changedPins), /consumer integrity differs/)
})

test('consumer provenance accepts the unchanged transitive Git edge and locked artifact', () => {
  const { manifest, consumerLock } = fixture()
  assert.doesNotThrow(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]))
})

test('consumer provenance rejects rewriting the installed package Git declaration to a file', () => {
  const { manifest, consumerLock } = fixture()
  manifest.dependencies[name] = 'file:../widget.tgz'
  assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /published Git edge changed/)
})

test('consumer provenance rejects rewriting the package lock Git edge to a file', () => {
  const { manifest, consumerLock } = fixture()
  consumerLock.packages['node_modules/@example/editor'].dependencies[name] = 'file:../widget.tgz'
  assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /published Git edge changed/)
})

test('consumer provenance rejects a same-name direct tarball override', () => {
  const { manifest, consumerLock } = fixture()
  consumerLock.packages[''].dependencies[name] = 'file:../widget.tgz'
  assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /not a direct override/)
})

test('consumer provenance rejects a file substitute, another repository or another commit', () => {
  for (const substitute of [
    'file:../widget.tgz',
    resolved.replace('example/widget', 'another/widget'),
    resolved.replace(commit, 'a'.repeat(40)),
  ]) {
    const { manifest, consumerLock } = fixture()
    consumerLock.packages[`node_modules/${name}`].resolved = substitute
    assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /locked Git artifact/)
  }
})

test('consumer provenance rejects a wrong version or a linked dependency', () => {
  for (const change of [{ version: '9.0.0' }, { link: true }]) {
    const { manifest, consumerLock } = fixture()
    Object.assign(consumerLock.packages[`node_modules/${name}`], change)
    assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /locked Git artifact/)
  }
})

test('consumer provenance rejects missing or mismatched installed Git integrity', () => {
  for (const value of [undefined, otherIntegrity]) {
    const { manifest, consumerLock } = fixture()
    consumerLock.packages[`node_modules/${name}`].integrity = value
    assert.throws(() => assertConsumerGitDependencies(manifest, consumerLock, [pin]), /consumer integrity differs/)
  }
})
