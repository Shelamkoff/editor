import test from 'node:test'
import assert from 'node:assert/strict'
import { assertConsumerGitDependencies, getPinnedGitDependencies } from './package-git-dependencies.mjs'

const name = '@example/widget'
const commit = '0123456789abcdef0123456789abcdef01234567'
const spec = `git+https://github.com/example/widget.git#${commit}`
const resolved = `git+ssh://git@github.com/example/widget.git#${commit}`
const pin = { name, spec, commit, resolved, version: '1.0.0' }

function fixture() {
  const manifest = { name: '@example/editor', dependencies: { [name]: spec, ordinary: '^2.0.0' } }
  const projectLock = { packages: {
    '': { dependencies: { ...manifest.dependencies } },
    [`node_modules/${name}`]: { version: '1.0.0', resolved },
  } }
  const consumerLock = { packages: {
    '': { dependencies: { '@example/editor': 'file:../editor.tgz' } },
    'node_modules/@example/editor': { dependencies: { ...manifest.dependencies } },
    [`node_modules/${name}`]: { version: '1.0.0', resolved },
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
