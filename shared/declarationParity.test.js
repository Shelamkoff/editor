import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, readdir, rm } from 'node:fs/promises'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { generateDeclarations } from '../scripts/generate-declarations.mjs'

const editorRoot = new URL('../', import.meta.url)
const declarationRoot = new URL('.package-tmp/declaration-tests/', editorRoot)
await generateDeclarations(fileURLToPath(declarationRoot))
after(async () => rm(fileURLToPath(declarationRoot), { recursive: true, force: true }))

const publicPairs = [
  ['core/index.js', 'core/index.d.ts'],
  ['core/EditorFacade.js', 'core/EditorFacade.d.ts'],
  ['plugins/index.js', 'plugins/index.d.ts'],
  ['plugins/async.js', 'plugins/async.d.ts'],
  ['inline-plugins/color.js', 'inline-plugins/color.d.ts'],
  ['inline-plugins/mention/index.js', 'inline-plugins/mention/index.d.ts'],
  ['renderer/index.js', 'renderer/index.d.ts'],
  ['renderer/async.js', 'renderer/async.d.ts'],
  ['renderer/renderers/index.js', 'renderer/renderers/index.d.ts'],
  ['renderer/renderers/async.js', 'renderer/renderers/async.d.ts'],
  ['shared/blockTypes.js', 'shared/blockTypes.d.ts'],
  ['shared/highlightRuntime.js', 'shared/highlightRuntime.d.ts'],
  ['shared/zipRuntime.js', 'shared/zipRuntime.d.ts'],
]

function declarationUrl(path) {
  return path.startsWith('../')
    ? new URL(path, editorRoot)
    : new URL(path, declarationRoot)
}

async function collectPublicPairs() {
  const pluginEntries = await readdir(new URL('plugins/', editorRoot), { withFileTypes: true })
  const pluginPairs = pluginEntries
    .filter(entry => entry.isDirectory() && entry.name !== 'shared')
    .map(entry => [
      `plugins/${entry.name}/index.js`,
      `plugins/${entry.name}/index.d.ts`,
    ])

  return [...publicPairs, ...pluginPairs]
}

async function collectDeclarationFiles(directory = declarationRoot) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const url = new URL(entry.name, directory)
    if (entry.isDirectory()) {
      files.push(...await collectDeclarationFiles(new URL(`${entry.name}/`, directory)))
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(url)
    }
  }
  return files
}

function runtimeExports(source) {
  const names = new Set()
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:class|function|const|let|var)\s+(\w+)/g)) {
    names.add(match[1])
  }
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}(?:\s+from\s+['"][^'"]+['"])?/g)) {
    for (const entry of match[1].split(',')) {
      const clean = entry.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      if (!clean || clean.startsWith('type ')) continue
      const parts = clean.split(/\s+as\s+/)
      names.add((parts[1] ?? parts[0]).trim())
    }
  }
  return names
}

test('public runtime and declaration exports are identical', async () => {
  for (const [runtimePath, declarationPath] of await collectPublicPairs()) {
    const [runtime, declaration] = await Promise.all([
      readFile(new URL(runtimePath, editorRoot), 'utf8'),
      readFile(declarationUrl(declarationPath), 'utf8'),
    ])
    const runtimeNames = runtimeExports(runtime)
    const declaredNames = runtimeExports(declaration)

    for (const name of runtimeNames) {
      assert.ok(declaredNames.has(name), `${declarationPath} does not declare runtime export ${name}`)
    }
    for (const name of declaredNames) {
      assert.ok(runtimeNames.has(name), `${declarationPath} declares missing runtime export ${name}`)
    }
  }
})

test('declaration imports are valid native ESM specifiers', async () => {
  const violations = []
  const patterns = [
    /\bfrom\s*['"](\.[^'"]+)['"]/g,
    /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ]

  for (const file of await collectDeclarationFiles()) {
    const source = await readFile(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (!/\.(?:[cm]?js|json|css|svg|wasm)$/i.test(match[1])) {
          violations.push(`${file.pathname.slice(declarationRoot.pathname.length)}: ${match[1]}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('public declarations compile for NodeNext and Bundler consumers', () => {
  const compilerPath = process.env.EDITOR_TSC_PATH
    ?? fileURLToPath(new URL('../node_modules/typescript/bin/tsc', editorRoot))
  const configs = [
    new URL('tests/types/tsconfig.nodenext.json', editorRoot),
    new URL('tests/types/tsconfig.bundler.json', editorRoot),
  ]

  for (const config of configs) {
    const result = spawnSync(process.execPath, [
      compilerPath,
      '--project',
      fileURLToPath(config),
    ], {
      cwd: fileURLToPath(editorRoot),
      encoding: 'utf8',
    })

    assert.equal(
      result.status,
      0,
      `${fileURLToPath(config)} failed:\n${result.stdout}${result.stderr}`,
    )
  }
})

test('core and renderer derive document shapes from the neutral shared contract', async () => {
  const [coreTypes, rendererTypes, sharedTypes] = await Promise.all([
    readFile(new URL('core/types.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('renderer/types.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('shared/documentTypes.d.ts', declarationRoot), 'utf8'),
  ])

  assert.doesNotMatch(coreTypes, /from ['"]\.\.\/renderer\//)
  assert.match(coreTypes, /from ['"]\.\.\/shared\/documentTypes\.js['"]/)
  assert.match(rendererTypes, /from ['"]\.\.\/shared\/documentTypes\.js['"]/)
  assert.match(sharedTypes, /export interface EditorOutputData/)
  assert.match(sharedTypes, /export interface EditorBlockData/)
  assert.match(sharedTypes, /export interface EditorInlineWidget/)
})

test('public editor declarations hide composition internals and match block insert data', async () => {
  const [coreEntry, facadeDeclaration, coreTypes] = await Promise.all([
    readFile(new URL('core/index.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('core/EditorFacade.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('core/types.d.ts', declarationRoot), 'utf8'),
  ])

  assert.doesNotMatch(coreEntry, /export\s*\{\s*EditorFacade/)
  assert.match(coreEntry, /createEditor\([\s\S]*?\):\s*import\('\.\/types\.js'\)\.IEditor/)
  assert.doesNotMatch(facadeDeclaration, /captureSnapshotSync/)
  assert.match(coreTypes, /insert\([\s\S]*?inline\?:\s*Record<string,\s*EditorInlineWidget>[\s\S]*?\):\s*IBlock/)
  assert.match(coreTypes, /readonly events:\s*EditorEventSubscriptions/)
})
