import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDeclarations } from './generate-declarations.mjs'

const editorRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distRoot = join(editorRoot, 'dist')
const sourceRoots = ['core', 'inline-plugins', 'inline-tools', 'locale', 'plugins', 'renderer', 'shared']

async function walk(directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) await walk(absolute, result)
    else result.push(absolute)
  }
  return result
}

function isPublishableSource(path) {
  const normalized = path.replaceAll('\\', '/')
  return !normalized.includes('/tests/')
    && !normalized.includes('/benchmarks/')
    && !normalized.endsWith('.test.js')
    && ['.js', '.css', '.md'].includes(extname(path))
}

async function copyRuntime() {
  for (const root of sourceRoots) {
    const sourceRoot = join(editorRoot, root)
    for (const source of await walk(sourceRoot)) {
      if (!isPublishableSource(source)) continue
      const destination = join(distRoot, relative(editorRoot, source))
      await mkdir(dirname(destination), { recursive: true })
      await cp(source, destination)
    }
  }
  await cp(join(editorRoot, 'index.js'), join(distRoot, 'index.js'))
}

async function writeStyleEntrypoints() {
  const stylesRoot = join(distRoot, 'styles')
  await mkdir(stylesRoot, { recursive: true })
  await writeFile(join(stylesRoot, 'editor.css'), [
    "@import '../core/themes/variables.css';",
    "@import '../core/themes/light.css';",
    "@import '../core/themes/dark.css';",
    '',
  ].join('\n'), 'utf8')
}

await rm(distRoot, { recursive: true, force: true })
await mkdir(distRoot, { recursive: true })
const declarations = await generateDeclarations(distRoot)
if (declarations.sourceDiagnostics > 0) {
  throw new Error(`Declaration generation reported ${declarations.sourceDiagnostics} source diagnostics:\n${declarations.sourceDiagnosticDetails.join('\n')}`)
}
await copyRuntime()
await writeStyleEntrypoints()

console.log(JSON.stringify({ ...declarations, dist: relative(editorRoot, distRoot) }))
