import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { generateDeclarations } from '../scripts/generate-declarations.mjs'

const editorRoot = new URL('../', import.meta.url)
const declarationRoot = new URL(`.package-tmp/declaration-tests-${process.pid}/`, editorRoot)
await generateDeclarations(fileURLToPath(declarationRoot))
const consumerRoot = new URL('consumer-tests/', declarationRoot)
await mkdir(consumerRoot, { recursive: true })

for (const file of ['core-consumer.ts', 'plugin-kit-consumer.ts', 'public-consumer.ts']) {
  const source = await readFile(new URL(`tests/types/${file}`, editorRoot), 'utf8')
  await writeFile(
    new URL(file, consumerRoot),
    source
      .replaceAll('../../.package-tmp/declaration-tests/', '../'),
    'utf8',
  )
}

const commonCompilerOptions = {
  target: 'ES2022',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  baseUrl: '.',
  strict: true,
  noEmit: true,
  skipLibCheck: false,
}
await Promise.all([
  writeFile(new URL('tsconfig.nodenext.json', consumerRoot), JSON.stringify({
    compilerOptions: {
      ...commonCompilerOptions,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
    },
    include: ['core-consumer.ts', 'plugin-kit-consumer.ts', 'public-consumer.ts'],
  }, null, 2)),
  writeFile(new URL('tsconfig.bundler.json', consumerRoot), JSON.stringify({
    compilerOptions: {
      ...commonCompilerOptions,
      module: 'ESNext',
      moduleResolution: 'Bundler',
    },
    include: ['core-consumer.ts', 'plugin-kit-consumer.ts', 'public-consumer.ts'],
  }, null, 2)),
])
after(async () => rm(fileURLToPath(declarationRoot), { recursive: true, force: true }))

const publicPairs = [
  ['core/index.js', 'core/index.d.ts'],
  ['plugin-kit/index.js', 'plugin-kit/index.d.ts'],
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
    ?? fileURLToPath(new URL('node_modules/typescript/bin/tsc', editorRoot))
  const configs = [
    new URL('tsconfig.nodenext.json', consumerRoot),
    new URL('tsconfig.bundler.json', consumerRoot),
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

test('public editor and renderer derive document shapes from the neutral shared contract', async () => {
  const [publicTypes, rendererTypes, sharedTypes] = await Promise.all([
    readFile(new URL('core/publicTypes.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('renderer/types.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('shared/documentTypes.d.ts', declarationRoot), 'utf8'),
  ])

  assert.doesNotMatch(publicTypes, /from ['"]\.\.\/renderer\//)
  assert.match(publicTypes, /from ['"]\.\.\/shared\/documentTypes\.js['"]/)
  assert.match(rendererTypes, /from ['"]\.\.\/shared\/documentTypes\.js['"]/)
  assert.match(sharedTypes, /export interface EditorOutputData/)
  assert.match(sharedTypes, /export interface EditorBlockData/)
  assert.match(sharedTypes, /export interface EditorInlineWidget/)
  assert.match(sharedTypes, /version:\s*'2\.0\.0'/)
  assert.match(sharedTypes, /dataVersion:\s*number/)
})

test('async preset declarations require the current document envelope', async () => {
  const [pluginAsync, rendererAsync] = await Promise.all([
    readFile(new URL('plugins/async.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('renderer/renderers/async.d.ts', declarationRoot), 'utf8'),
  ])
  for (const source of [pluginAsync, rendererAsync]) {
    assert.match(source, /version:\s*["']2\.0\.0["']/)
    assert.match(source, /blocks:\s*readonly/)
    assert.doesNotMatch(source, /blocks\?:/)
  }
})

test('public editor declarations expose only the v2 model API', async () => {
  const [coreEntry, publicTypes, rootTypes] = await Promise.all([
    readFile(new URL('core/index.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('core/publicTypes.d.ts', declarationRoot), 'utf8'),
    readFile(new URL('types.d.ts', declarationRoot), 'utf8'),
  ])

  assert.doesNotMatch(coreEntry, /EditorFacade|BlockManager|UndoManager|CommandDispatcher|InlinePluginRegistry|DocumentMode|DocumentMigration/)
  assert.match(coreEntry, /createEditor\(config:[\s\S]*EditorConfig\):[\s\S]*IEditor/)
  assert.match(publicTypes, /readonly blocks:\s*EditorBlocksApi/)
  assert.doesNotMatch(publicTypes, /DocumentMode|documentMode|DocumentMigration|documentVersionPolicy|validationMode|migrations/)
  assert.match(publicTypes, /insert\(input:\s*InsertBlockInput/)
  assert.match(publicTypes, /update\(id:\s*string,[\s\S]*BlockUpdate/)
  assert.match(publicTypes, /insertInlinePlugin\(type:\s*string/)
  assert.match(publicTypes, /export interface TransactionCommitted/)
  assert.match(publicTypes, /readonly sequence:\s*number/)
  assert.match(publicTypes, /'document:changed':\s*Pick<TransactionCommitted, 'origin' \| 'action' \| 'changes'>/)
  assert.match(publicTypes, /on<K extends keyof EditorEventMap>/)
  assert.doesNotMatch(publicTypes, /record:\s*Transaction/)
  assert.doesNotMatch(publicTypes, /rootElement|contentElement|EditorBlockView|IBlockManager|ISelectionManager/)
  assert.match(rootTypes, /core\/publicTypes\.js/)
  assert.match(rootTypes, /plugin-kit\/types\.js/)
})
