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

for (const declaration of [
  "import './missing'",
  "import { value } from './missing'",
  "export * from './missing'",
  "const load = () => import('./missing')",
  "import '@shelamkoff/rector/shared/missing'",
]) test('dependency audit rejects unresolved extensionless runtime edge: ' + declaration, () => {
  const sources = new Map([['plugins/custom/index.js', declaration]])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /unresolved runtime dependency/)
})

test('dependency audit resolves existing extensionless files and ignores non-JavaScript assets', () => {
  const sources = new Map([
    ['core/host.js', "import './helper'; import './host.css'; export { value } from '@shelamkoff/rector/shared/value'"],
    ['core/helper.js', 'export {}'],
    ['shared/value.js', 'export const value = 1'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

test('preparation may consume the pure current clipboard codec without editor authority', () => {
  const sources = new Map([
    ['core/ClipboardPlans.js', "import { encode } from './ClipboardFragment.js'"],
    ['core/ClipboardFragment.js', "import '../shared/jsonData.js'; export const encode = value => value"],
    ['shared/jsonData.js', 'export {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

for (const owner of ['DocumentRuntime', 'HistoryStore', 'InteractionState']) {
  test(`a codec cannot acquire ${owner} authority by using a preparation filename`, () => {
    const sources = new Map([
      ['core/ClipboardFragment.js', `import './${owner}.js'`],
      [`core/${owner}.js`, 'export {}'],
    ])
    assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden preparation dependency/)
  })
}
