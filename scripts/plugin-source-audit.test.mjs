import test from 'node:test'
import assert from 'node:assert/strict'
import { auditRuntimeDependencies } from './plugin-source-audit.mjs'

test('neutral JSDoc data types cannot depend on renderer contracts', () => {
  const sources = new Map([
    ['shared/canonical.js', "/** @typedef {import('../renderer/types.js').RendererConfig} Canonical */\nexport {}"],
    ['renderer/types.d.ts', 'export interface RendererConfig {}'],
  ])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden shared type dependency on renderer\/types\.d\.ts/)
})

test('neutral JSDoc typeof queries cannot acquire editing runtime contracts', () => {
  const sources = new Map([
    ['shared/canonical.js', "/** @type {typeof import('../core/DocumentRuntime.js')} */\nexport const runtime = null"],
    ['core/DocumentRuntime.js', 'export class DocumentRuntime {}'],
  ])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden shared type dependency on core\/DocumentRuntime\.js/)
})

for (const declaration of [
  "import type { RendererConfig } from '../renderer/types.js'",
  "export type { RendererConfig } from '../renderer/types.js'",
  "export type Config = import('../renderer/types').RendererConfig",
]) test('neutral declaration types reject renderer ownership: ' + declaration, () => {
  const sources = new Map([['shared/canonical.d.ts', declaration], ['renderer/types.d.ts', 'export interface RendererConfig {}']])
  assert.deepEqual(auditRuntimeDependencies(sources), ['shared/canonical.d.ts:1: forbidden shared type dependency on renderer/types.d.ts'])
})

test('JSDoc import tags are type dependencies', () => {
  const sources = new Map([
    ['shared/canonical.js', "/** @import { RendererConfig } from '../renderer/types.js' */\nexport {}"],
    ['renderer/types.d.ts', 'export interface RendererConfig {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), ['shared/canonical.js:1: forbidden shared type dependency on renderer/types.d.ts'])
})

test('declaration import-equals aliases cannot hide an editing-runtime type dependency', () => {
  const sources = new Map([
    ['shared/canonical.d.ts', "import type Runtime = require('../core/DocumentRuntime.js'); export type Canonical = Runtime.DocumentRuntime"],
    ['core/DocumentRuntime.d.ts', 'export declare class DocumentRuntime {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), ['shared/canonical.d.ts:1: forbidden shared type dependency on core/DocumentRuntime.d.ts'])
})

test('type-only cycles and runtime paths completed only by JSDoc are not runtime cycles', () => {
  const sources = new Map([
    ['shared/a.d.ts', "import type { B } from './b.js'; export interface A { value: B }"],
    ['shared/b.d.ts', "export type { A } from './a.js'; export interface B {}"],
    ['shared/runtime.js', "import './reader.js'; export const value = 1"],
    ['shared/reader.js', "/** @type {typeof import('./runtime.js')} */\nexport const captured = null"],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

test('ordinary comments, documentation examples and string literals are not dependency edges', () => {
  const source = `// import '../core/DocumentRuntime.js'
/* @type {import('../renderer/types.js').RendererConfig} */
/** Example: import('../core/DocumentRuntime.js') is forbidden in executable code.
 * @example import('../renderer/types.js')
 */
export const text = "import('../core/DocumentRuntime.js')"
`
  assert.deepEqual(auditRuntimeDependencies(new Map([['shared/comments.js', source]])), [])
})

test('runtime imports cannot be satisfied by a type-only facade', () => {
  const sources = new Map([['shared/runtime.js', "import './types.js'"], ['shared/types.d.ts', 'export interface Data {}']])
  assert.deepEqual(auditRuntimeDependencies(sources), ['shared/runtime.js:1: unresolved runtime dependency shared/types.js'])
})

test('unresolved JSDoc type imports fail independently of runtime imports', () => {
  const sources = new Map([['shared/runtime.js', "/** @typedef {import('./missing.js').Data} Data */\nexport {}"]])
  assert.deepEqual(auditRuntimeDependencies(sources), ['shared/runtime.js:1: unresolved type dependency shared/missing.js'])
})

for (const [file, declaration] of [
  ['core/publicTypes.d.ts', "import type { BlockType } from '../renderer/types.js'"],
  ['core/reader.js', "/** @typedef {import('../renderer/types.js').BlockType} BlockType */\nexport {}"],
  ['plugins/async.js', "/** @typedef {import('../renderer/types.js').BlockType} BlockType */\nexport {}"],
  ['plugins/async.d.ts', "export type { BlockType } from '../renderer/types.js'"],
]) test('canonical core and loader vocabulary cannot come from renderer: ' + file, () => {
  const sources = new Map([[file, declaration], ['renderer/types.d.ts', "export type BlockType = 'paragraph'"]])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden (editor|extension) type dependency on renderer\/types\.d\.ts/)
})

test('Mention and Color companion renderer contracts remain legitimate type dependencies', () => {
  const sources = new Map([
    ['inline-plugins/mention/widget.js', "/** @returns {import('../../renderer/types').InlineWidgetRenderer} */\nexport function widget() {}"],
    ['inline-plugins/mention/index.d.ts', "import type { InlineWidgetRenderer } from '../../renderer/types.js'; export declare const widget: InlineWidgetRenderer"],
    ['inline-plugins/color.js', "/** @returns {import('../renderer/types').InlineWidgetRenderer} */\nexport function widget() {}"],
    ['renderer/types.d.ts', "import type { EditorBlockData } from '../shared/documentTypes.js'; export interface InlineWidgetRenderer {}"],
    ['shared/documentTypes.d.ts', 'export interface EditorBlockData {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

test('pure clipboard preparation types remain neutral in source and generated declarations', () => {
  const sources = new Map([
    ['core/ClipboardPlans.js', "/** @typedef {import('./ClipboardFragment.js').ClipboardPart} Part */\nimport './ClipboardFragment.js'"],
    ['core/ClipboardFragment.js', "import '../shared/jsonData.js'; export const encode = value => value"],
    ['core/ClipboardFragment.d.ts', "import type { EditorBlockData } from '../shared/documentTypes.js'; export type ClipboardPart = EditorBlockData"],
    ['shared/documentTypes.d.ts', 'export interface EditorBlockData {}'],
    ['shared/jsonData.js', 'export {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
  sources.set('core/ClipboardFragment.d.ts', "import type { DocumentRuntime } from './DocumentRuntime.js'")
  sources.set('core/DocumentRuntime.js', 'export class DocumentRuntime {}')
  assert.match(auditRuntimeDependencies(sources).join('\n'), /forbidden preparation type dependency on core\/DocumentRuntime\.js/)
})

for (const [file, declaration, target] of [
  ['core/host.js', "import '@shelamkoff/rector/core'", 'core/index.js'],
  ['core/host.d.ts', "export type { Value } from '@shelamkoff/rector/shared/value'", 'shared/value.d.ts'],
  ['renderer/host.js', "const load = () => import('@shelamkoff/rector/renderer/async')", 'renderer/async.js'],
  ['renderer/host.d.ts', "export type Module = typeof import('@shelamkoff/rector/renderer/async')", 'renderer/async.d.ts'],
]) test('self-package imports cannot use an unpublished route even when source exists: ' + declaration, () => {
  const sources = new Map([[file, declaration], [target, 'export {}']])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /unpublished self-package dependency/)
})

test('a published type-only self-package entry is unavailable to runtime imports', () => {
  const sources = new Map([['core/host.js', "import '@shelamkoff/rector/types'"], ['types.d.ts', 'export interface Value {}']])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /no runtime export for self-package dependency/)
})

test('canonical self-package type, kit, wildcard plugin and async renderer routes resolve to their sources', () => {
  const sources = new Map([
    ['core/host.d.ts', "import type { Value } from '@shelamkoff/rector/types'"],
    ['types.d.ts', 'export interface Value {}'],
    ['plugins/custom/index.js', "import '@shelamkoff/rector/plugin-kit'"],
    ['plugin-kit/index.js', 'export {}'],
    ['plugins/custom/types.d.ts', "export type Module = typeof import('@shelamkoff/rector/plugins/paragraph')"],
    ['plugins/paragraph/index.js', 'export {}'],
    ['renderer/host.js', "const load = () => import('@shelamkoff/rector/renderer/renderers/async')"],
    ['renderer/renderers/async.js', 'export {}'],
  ])
  assert.deepEqual(auditRuntimeDependencies(sources), [])
})

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
  "import '@shelamkoff/rector/plugins/missing'",
]) test('dependency audit rejects unresolved extensionless runtime edge: ' + declaration, () => {
  const sources = new Map([['plugins/custom/index.js', declaration]])
  assert.match(auditRuntimeDependencies(sources).join('\n'), /unresolved runtime dependency/)
})

test('dependency audit resolves existing extensionless files and ignores non-JavaScript assets', () => {
  const sources = new Map([
    ['core/host.js', "import './helper'; import './host.css'; export { value } from '@shelamkoff/rector/plugin-kit'"],
    ['core/helper.js', 'export {}'],
    ['plugin-kit/index.js', 'export const value = 1'],
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
