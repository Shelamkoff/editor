import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const editorRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workRoot = resolve(editorRoot, '..')
const sourceRoots = ['core', 'inline-plugins', 'inline-tools', 'locale', 'plugins', 'renderer', 'shared']
const excludedSegments = new Set(['tests', 'benchmarks', 'runtime', 'node_modules'])
const handwrittenRuntimeDeclarations = new Set([
  'index.d.ts',
  'core/index.d.ts',
  'inline-plugins/mention/index.d.ts',
])
const declarationDependencySpecifiers = new Map([
  ['../../../cropper/src/index.js', '@shelamkoff/cropper'],
])

function assertInsideEditor(path, label) {
  const rel = relative(editorRoot, path)
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || resolve(path) === editorRoot) {
    throw new Error(`${label} must be a child of the editor workspace: ${path}`)
  }
}

async function walk(directory, predicate, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!excludedSegments.has(entry.name)) await walk(absolute, predicate, result)
    } else if (predicate(absolute)) {
      result.push(absolute)
    }
  }
  return result
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || diagnostic.start === undefined) return message
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `${relative(editorRoot, diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`
}

function normalizeSpecifiers(source) {
  const addJs = specifier => {
    if (!specifier.startsWith('.')) return specifier
    const clean = specifier.split(/[?#]/, 1)[0]
    return extname(clean) ? specifier : `${specifier}.js`
  }
  return source
    .replace(/(from\s+["'])([^"']+)(["'])/g, (_, before, specifier, after) => `${before}${addJs(specifier)}${after}`)
    .replace(/(import\(["'])([^"']+)(["']\))/g, (_, before, specifier, after) => `${before}${addJs(specifier)}${after}`)
}

function normalizePackageBoundaries(source) {
  let output = source
  for (const [local, published] of declarationDependencySpecifiers) {
    output = output.replaceAll(local, published)
  }
  return output
}

async function copyTypeOnlyFacades(outputRoot) {
  const declarations = []
  for (const root of sourceRoots) {
    declarations.push(...await walk(join(editorRoot, root), path => path.endsWith('.d.ts')))
  }
  for (const declaration of [
    join(editorRoot, 'index.d.ts'),
    join(editorRoot, 'types.d.ts'),
    join(editorRoot, 'I18n.d.ts'),
  ]) {
    declarations.push(declaration)
  }

  for (const declaration of declarations) {
    const runtime = declaration.slice(0, -5) + '.js'
    let hasRuntime = false
    try { hasRuntime = (await stat(runtime)).isFile() } catch {}
    const relativeDeclaration = relative(editorRoot, declaration).replaceAll('\\', '/')
    if (hasRuntime && !handwrittenRuntimeDeclarations.has(relativeDeclaration)) continue

    const destination = join(outputRoot, relative(editorRoot, declaration))
    await mkdir(dirname(destination), { recursive: true })
    await cp(declaration, destination)
  }
}

async function assertNoShadowDeclarations() {
  const declarations = []
  for (const root of sourceRoots) {
    declarations.push(...await walk(join(editorRoot, root), path => path.endsWith('.d.ts')))
  }
  declarations.push(join(editorRoot, 'index.d.ts'))

  const shadows = []
  for (const declaration of declarations) {
    const runtime = declaration.slice(0, -5) + '.js'
    let hasRuntime = false
    try { hasRuntime = (await stat(runtime)).isFile() } catch {}
    const relativeDeclaration = relative(editorRoot, declaration).replaceAll('\\', '/')
    if (hasRuntime && !handwrittenRuntimeDeclarations.has(relativeDeclaration)) {
      shadows.push(relativeDeclaration)
    }
  }

  if (shadows.length > 0) {
    throw new Error([
      'Generated declarations must not be stored beside JavaScript sources.',
      'JSDoc is the source of runtime declarations; generated files belong in dist only:',
      ...shadows.map(path => `- ${path}`),
    ].join('\n'))
  }
}

async function addTypeOnlyPrelude(declaration, source, emittedEditorRoot) {
  const relativeDeclaration = relative(emittedEditorRoot, declaration)
    .replaceAll('\\', '/')
  const pluginMatch = relativeDeclaration.match(/^plugins\/([^/]+)\/index\.d\.ts$/)
  if (!pluginMatch) return source

  const localeKeys = join(editorRoot, 'plugins', pluginMatch[1], 'locale', 'keys.d.ts')
  try {
    if ((await stat(localeKeys)).isFile()) return `import type {} from './locale/keys.js'\n${source}`
  } catch {}
  return source
}

export async function generateDeclarations(outputDirectory) {
  const outputRoot = resolve(outputDirectory)
  assertInsideEditor(outputRoot, 'Declaration output')
  const temporaryParent = resolve(editorRoot, '.package-tmp')
  assertInsideEditor(temporaryParent, 'Declaration temporary parent')
  await mkdir(temporaryParent, { recursive: true })
  const temporaryRoot = await mkdtemp(join(temporaryParent, 'declarations-'))
  assertInsideEditor(temporaryRoot, 'Declaration temporary output')
  try {
    await assertNoShadowDeclarations()
    await rm(outputRoot, { recursive: true, force: true })

    const roots = []
    for (const root of sourceRoots) {
      roots.push(...await walk(join(editorRoot, root), path => path.endsWith('.js') && !path.endsWith('.test.js')))
    }

    const program = ts.createProgram(roots, {
      allowJs: true,
      checkJs: false,
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmitOnError: false,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      rootDir: workRoot,
      outDir: temporaryRoot,
    })
    const emitResult = program.emit()
    const errors = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics]
      .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    if (emitResult.emitSkipped) {
      throw new Error(`Declaration generation failed:\n${errors.map(formatDiagnostic).join('\n')}`)
    }

    const emittedEditorRoot = join(temporaryRoot, 'editor')
    const emitted = await walk(emittedEditorRoot, path => path.endsWith('.d.ts'))
    for (const declaration of emitted) {
      const destination = join(outputRoot, relative(emittedEditorRoot, declaration))
      await mkdir(dirname(destination), { recursive: true })
      const withTypePrelude = await addTypeOnlyPrelude(
        declaration,
        await readFile(declaration, 'utf8'),
        emittedEditorRoot,
      )
      const normalized = normalizeSpecifiers(normalizePackageBoundaries(withTypePrelude))
      await writeFile(destination, normalized, 'utf8')
    }
    await copyTypeOnlyFacades(outputRoot)
    return {
      runtimeDeclarations: emitted.length,
      sourceDiagnostics: errors.length,
      sourceDiagnosticDetails: errors.map(formatDiagnostic),
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputFlag = process.argv.indexOf('--out')
  if (outputFlag < 0) {
    throw new Error('Declaration output is required. Use --out <directory>.')
  }
  const output = process.argv[outputFlag + 1]
  if (!output || output.startsWith('--')) throw new Error('--out requires a directory')
  const result = await generateDeclarations(resolve(editorRoot, output))
  if (result.sourceDiagnostics > 0) {
    throw new Error(`Declaration generation reported ${result.sourceDiagnostics} source diagnostics:\n${result.sourceDiagnosticDetails.join('\n')}`)
  }
  console.log(JSON.stringify(result))
}
