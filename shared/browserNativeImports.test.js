import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const editorRoot = fileURLToPath(new URL('..', import.meta.url))
const runtimeExtensions = new Set(['.js', '.mjs'])
const runtimeRoots = ['core', 'inline-plugins', 'inline-tools', 'locale', 'plugins', 'renderer', 'shared']
const packageJson = JSON.parse(await readFile(join(editorRoot, 'package.json'), 'utf8'))
const declaredRuntimePackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
])

async function collectRuntimeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      // Developer-only Node scripts are not part of the browser runtime graph.
      if (entry.name === 'benchmarks' || entry.name === 'tests') continue
      files.push(...await collectRuntimeFiles(path))
    } else if (
      runtimeExtensions.has(extname(entry.name))
      && !entry.name.endsWith('.test.js')
    ) {
      files.push(path)
    }
  }

  return files
}

async function collectEditorRuntimeFiles() {
  const files = [join(editorRoot, 'index.js')]
  for (const root of runtimeRoots) files.push(...await collectRuntimeFiles(join(editorRoot, root)))
  return files
}

function collectImportSpecifiers(source) {
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s+[^;\n]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  const specifiers = []

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(executableSource)) !== null) {
      specifiers.push(match[1])
    }
  }

  return specifiers
}

function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/', 1)[0]
}

test('editor runtime imports only declared packages', async () => {
  const files = await collectEditorRuntimeFiles()
  const violations = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const specifier of collectImportSpecifiers(source)) {
      if (
        !specifier.startsWith('.')
        && !specifier.startsWith('/')
        && !declaredRuntimePackages.has(packageName(specifier))
      ) {
        violations.push({
          file: relative(editorRoot, file),
          specifier,
        })
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('editor relative import graph has no cycles', async () => {
  const files = await collectEditorRuntimeFiles()
  const fileSet = new Set(files)
  const graph = new Map()

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const dependencies = []
    for (const specifier of collectImportSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue
      const dependency = resolve(dirname(file), specifier)
      if (fileSet.has(dependency)) dependencies.push(dependency)
    }
    graph.set(file, dependencies)
  }

  const state = new Map()
  const stack = []
  const cycles = []

  function visit(file) {
    const currentState = state.get(file) ?? 0
    if (currentState === 2) return
    if (currentState === 1) {
      const start = stack.indexOf(file)
      cycles.push([
        ...stack.slice(start),
        file,
      ].map(item => relative(editorRoot, item)))
      return
    }

    state.set(file, 1)
    stack.push(file)
    for (const dependency of graph.get(file) ?? []) {
      visit(dependency)
    }
    stack.pop()
    state.set(file, 2)
  }

  for (const file of files) visit(file)

  assert.deepEqual(cycles, [])
})
