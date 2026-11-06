import { isAbsolute, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

// Keep this metric aligned with the historical report: the static JavaScript
// closure and all emitted CSS, compressed as two separate streams.
export function measureBundleOutput(result, { root, preset, referenceBytes }) {
  if (!Number.isSafeInteger(referenceBytes) || referenceBytes <= 0) {
    throw new Error(`Invalid reference bytes for ${preset}`)
  }
  const results = Array.isArray(result) ? result : [result]
  if (results.length === 0 || results.some(output => !output || !Array.isArray(output.output))) {
    throw new Error(`Invalid build output for ${preset}`)
  }
  const outputs = results.flatMap(output => output.output)
  const filenames = new Set()
  const chunks = new Map()
  const cssAssets = []
  for (const item of outputs) {
    if (!item || typeof item.fileName !== 'string' || item.fileName.length === 0) {
      throw new Error(`Missing output filename for ${preset}`)
    }
    if (filenames.has(item.fileName)) throw new Error(`Duplicate output filename ${item.fileName} for ${preset}`)
    filenames.add(item.fileName)
    if (item.type === 'chunk') {
      if (typeof item.code !== 'string') throw new Error(`Invalid chunk code for ${preset}: ${item.fileName}`)
      for (const property of ['imports', 'dynamicImports']) {
        if (!Array.isArray(item[property]) || [...item[property]].some(id => typeof id !== 'string' || id.length === 0)) {
          throw new Error(`Invalid ${property} for ${preset}: ${item.fileName}`)
        }
      }
      if (!item.modules || typeof item.modules !== 'object' || Array.isArray(item.modules)) {
        throw new Error(`Missing module graph for ${preset}: ${item.fileName}`)
      }
      for (const [id, module] of Object.entries(item.modules)) {
        if (!id || !module || !Number.isSafeInteger(module.renderedLength) || module.renderedLength < 0) {
          throw new Error(`Invalid module measurement for ${preset}: ${id}`)
        }
      }
      chunks.set(item.fileName, item)
    } else if (item.type === 'asset') {
      if (item.fileName.endsWith('.css')) {
        if (typeof item.source !== 'string' && !(item.source instanceof Uint8Array)) {
          throw new Error(`Invalid CSS source for ${preset}: ${item.fileName}`)
        }
        cssAssets.push(item)
      }
    } else {
      throw new Error(`Invalid output type for ${preset}: ${item.fileName}`)
    }
  }
  const entries = [...chunks.values()].filter(chunk => chunk.isEntry === true)
  if (entries.length !== 1) throw new Error(`Expected one entry for ${preset}; received ${entries.length}`)

  const staticChunks = []
  const visited = new Set()
  const externalImports = new Set()
  const dynamicImports = new Set()
  function collect(fileName) {
    if (visited.has(fileName)) return
    visited.add(fileName)
    const chunk = chunks.get(fileName)
    if (!chunk) {
      if (fileName.startsWith('@shelamkoff/')) {
        externalImports.add(fileName)
        return
      }
      throw new Error(`Missing static chunk ${fileName} for ${preset}`)
    }
    staticChunks.push(chunk)
    for (const imported of chunk.dynamicImports) dynamicImports.add(imported)
    for (const imported of chunk.imports) collect(imported)
  }
  collect(entries[0].fileName)

  const staticModules = new Set()
  for (const chunk of staticChunks) {
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (module.renderedLength === 0) continue
      const name = (isAbsolute(id) ? relative(root, id) : id).replaceAll('\\', '/')
      const paragraphForbidden = preset === 'paragraph' && (
        name.startsWith('dist/core/') || (name.startsWith('dist/plugins/') &&
          !name.startsWith('dist/plugins/paragraph/') && !name.startsWith('dist/plugins/shared/'))
      )
      const interactiveForbidden = preset === 'defaultInteractive' && name.startsWith('dist/plugins/')
      if (paragraphForbidden || interactiveForbidden) throw new Error(`${preset} includes forbidden static module: ${name}`)
      staticModules.add(name)
    }
  }

  const code = staticChunks.map(chunk => chunk.code).join('\n')
  cssAssets.sort((a, b) => a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0)
  const css = cssAssets.map(asset => typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source)).join('\n')
  const rawBytes = Buffer.byteLength(code) + Buffer.byteLength(css)
  const gzipBytes = gzipSync(code).byteLength + (css ? gzipSync(css).byteLength : 0)
  return {
    preset,
    rawBytes,
    gzipBytes,
    referenceBytes,
    deltaBytes: gzipBytes - referenceBytes,
    aboveReference: gzipBytes > referenceBytes,
    staticChunks: staticChunks.map(chunk => chunk.fileName),
    staticModules: [...staticModules].sort(),
    externalImports: [...externalImports].sort(),
    dynamicImports: [...dynamicImports].sort(),
    cssAssets: cssAssets.map(asset => asset.fileName),
  }
}
