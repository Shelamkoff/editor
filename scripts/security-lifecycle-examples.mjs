import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const sections = [
  { document: 'docs/guide/security-lifecycle.md', headings: ['Clipboard', 'Extension cleanup', 'Asynchronous persisted updates'] },
  { document: 'docs/ru/guide/security-lifecycle.md', headings: ['Буфер обмена', 'Освобождение ресурсов расширения', 'Асинхронное изменение сохраняемых данных'] },
]
const kinds = ['paste', 'cleanup', 'task']
const contracts = {
  paste: `/** @type {import('@shelamkoff/rector/types').PasteCapability<{text: string}>} */
const checkedExample = textFilePaste;`,
  cleanup: `/** @type {(watch: (element: HTMLElement, signal: AbortSignal) => () => void) => import('@shelamkoff/rector/types').BlockPluginDefinition<{label: string}>['setup']} */
const checkedExample = createLiveBlockSetup;`,
  task: `/** @type {(context: import('@shelamkoff/rector/types').BlockInstanceContext<{label: string, note: string}>, loadLabel: (signal: AbortSignal) => Promise<string>) => Promise<boolean>} */
const checkedExample = refreshLabel;`,
}

/** Extract complete published examples, retaining their guide and line location. */
export function readSecurityLifecycleExamples(root = process.cwd()) {
  const examples = [], errors = []
  for (const { document, headings } of sections) {
    let lines
    try { lines = fs.readFileSync(path.resolve(root, document), 'utf8').split(/\r?\n/) }
    catch (error) { errors.push(`${document}: ${error.message}`); continue }
    for (const [index, heading] of headings.entries()) {
      const section = lines.indexOf(`## ${heading}`)
      let start = -1, end = -1
      if (section >= 0) {
        for (let line = section + 1; line < lines.length; line++) {
          if (start < 0 && /^#{1,2} /.test(lines[line])) break
          if (start < 0 && /^```(?:js|javascript)\s*$/.test(lines[line])) start = line + 1
          else if (start >= 0 && /^```\s*$/.test(lines[line])) { end = line; break }
        }
      }
      if (start < 0 || end < 0) {
        errors.push(`${document}: ${heading} needs a complete JavaScript contract example`)
        continue
      }
      examples.push({ document, heading, kind: kinds[index], line: start + 1, source: lines.slice(start, end).join('\n') })
    }
  }
  return { examples, errors }
}

/** Type-check actual guide text against current public source declarations.
 * Virtual files avoid generated dist and never write into the checkout.
 */
export function checkSecurityLifecycleExamples(root = process.cwd(), input = readSecurityLifecycleExamples(root)) {
  const errors = [...input.errors]
  const files = new Map(input.examples.map((example, index) => [
    path.resolve(root, '.documentation-contract', `security-${index}.mjs`),
    { example, source: `${example.source}\n\n${contracts[example.kind]}\nexport {}\n` },
  ]))
  if (!files.size) return { examples: input.examples, errors }
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true, checkJs: true, strict: true, noEmit: true, skipLibCheck: true,
    baseUrl: path.resolve(root), paths: { '@shelamkoff/rector/types': ['types.d.ts'] },
  }
  const host = ts.createCompilerHost(options)
  const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host)
  host.readFile = filename => files.get(path.resolve(filename))?.source ?? originalRead(filename)
  host.fileExists = filename => files.has(path.resolve(filename)) || originalExists(filename)
  host.getSourceFile = (filename, languageVersion) => {
    const source = host.readFile(filename)
    return source === undefined ? undefined : ts.createSourceFile(filename, source, languageVersion, true)
  }
  const program = ts.createProgram([...files.keys()], options, host)
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const file = diagnostic.file && files.get(path.resolve(diagnostic.file.fileName))
    const position = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : null
    const location = file
      ? `${file.example.document}:${file.example.line + (position?.line ?? 0)}: ${file.example.heading}`
      : diagnostic.file?.fileName ?? 'security lifecycle examples'
    errors.push(`${location}: TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
  }
  return { examples: input.examples, errors }
}
