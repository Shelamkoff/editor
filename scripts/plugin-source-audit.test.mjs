import test from 'node:test'
import assert from 'node:assert/strict'
import { auditRuntimeDependencies } from './plugin-source-audit.mjs'

for (const declaration of [
  "import '../../core/DocumentRuntime.js'",
  "import { value } from '../../core/DocumentRuntime.js'",
  "export { value } from '../../core/DocumentRuntime.js'",
  "const load = () => import('../../core/DocumentRuntime.js')",
]) test('dependency audit rejects private core edge: ' + declaration, () => {
  const sources = new Map([['plugins/custom/index.js', declaration], ['core/DocumentRuntime.js', 'export const value = 1']])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden extension dependency/)
})

for (const file of ['inline-tools/custom.js', 'renderer/custom.js', 'shared/custom.js', 'plugin-kit/custom.js', 'core/LogicalRangePlans.js']) {
  test('dependency audit rejects forbidden direction from ' + file, () => {
    const sources = new Map([[file, "export { value } from '../core/DocumentRuntime.js'"], ['core/DocumentRuntime.js', 'export const value = 1']])
    assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden/)
  })
}

test('dependency audit rejects a cycle through a literal dynamic import and re-export', () => {
  const sources = new Map([['shared/a.js', "export const load = () => import('./b.js')"], ['shared/b.js', "export * from './a.js'"]])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /Runtime dependency cycle/)
})

test('dependency audit accepts neutral preparation dependencies', () => {
  const sources = new Map([['core/LogicalRangePlans.js', "import { value } from '../shared/safe.js'"], ['shared/safe.js', 'export const value = 1']])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

test('renderer cannot depend on editor preparation modules', () => {
  const sources = new Map([['renderer/custom.js', "import '../core/CanonicalTransforms.js'"], ['core/CanonicalTransforms.js', 'export const value = 1']])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden renderer dependency/)
})
