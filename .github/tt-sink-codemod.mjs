import { readFile, writeFile } from 'node:fs/promises'
import { posix as path } from 'node:path'
import { execFileSync } from 'node:child_process'

const files = execFileSync('git', ['ls-files', '*.js'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter(file => /^(core|plugins|inline-tools|inline-plugins|renderer|shared)\//.test(file))
  .filter(file => !/\.test\.js$/.test(file) && !file.includes('/runtime/'))

function helperModule(file) {
  const target = /^(renderer|shared)\//.test(file)
    ? 'shared/sanitize/sanitizeHtml.js'
    : 'core/sanitize.js'
  let relative = path.relative(path.dirname(file), target)
  if (!relative.startsWith('.')) relative = './' + relative
  return relative
}

function ensureNamedImport(source, file, names) {
  const missing = names.filter(name => !new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(source))
  if (!missing.length) return source
  return `import { ${missing.join(', ')} } from '${helperModule(file)}'\n` + source
}

let changedFiles = 0
for (const file of files) {
  let source = await readFile(file, 'utf8')
  const original = source
  const helpers = new Set()

  // Clearing DOM never needs an HTML parser sink. textContent works on the
  // narrow DOM doubles used by realm/lifecycle tests as well as real Elements.
  source = source.replace(/([A-Za-z_$][\w$.[\]#?]*)\.innerHTML\s*=\s*''/g, (_match, target) => `${target}.textContent = ''`)

  // Existing sanitizeHtml() writes keep the same sanitizer semantics and only
  // change the final sink value type.
  source = source.replace(
    /([A-Za-z_$][\w$.[\]#?]*)\.innerHTML\s*=\s*sanitizeHtml\(([^,\n]+),\s*([^\n)]+)\)/g,
    (_match, target, html) => {
      helpers.add('setSanitizedHtml')
      return `setSanitizedHtml(${target}, ${html.trim()})`
    },
  )

  const trustedMarkers = [
    'ICON', 'icon', 'svg', 'CHECK_SVG', 'LAYOUT_ICONS', 'BRAND_ICONS', 'SOCIAL_ICONS',
    'TEMPLATE_ICONS', 'createSvgIcon', 'result.value', 'highlighted.value', 'loaded.value',
    'placeholderHtml', 'playIcon', 'meta.icon', 'item.icon', 'plugin.icon', 'tool.icon',
    'alignment.icon', 'mode.icon', 'resolved.icon',
  ]

  // One-line library/extension-owned markup: icons, escaped UI labels and
  // syntax-highlighter output. Do not touch ambiguous authored/document HTML.
  source = source.split('\n').map(line => {
    const match = line.match(/^(\s*)([A-Za-z_$][\w$.[\]#?]*)\.innerHTML\s*=\s*(.+)$/)
    if (!match) return line
    const [, indent, target, rhs] = match
    const trimmed = rhs.trim()
    const staticLiteral = (/^(['"]).*\1;?$/.test(trimmed) || /^`[^$]*`;?$/.test(trimmed))
    const escapedTemplate = trimmed.startsWith('`') && trimmed.includes('escapeHtml(')
    const trusted = staticLiteral || escapedTemplate || trustedMarkers.some(marker => trimmed.includes(marker))
    if (!trusted) return line
    helpers.add('setTrustedHtml')
    return `${indent}setTrustedHtml(${target}, ${trimmed.replace(/;$/, '')})`
  }).join('\n')

  source = source.replace(
    /([A-Za-z_$][\w$.[\]#?]*)\.insertAdjacentHTML\((['"](?:afterbegin|beforeend|afterend|beforebegin)['"]),\s*([^\n)]+\.icon)\)/g,
    (_match, target, position, html) => {
      helpers.add('insertTrustedHtml')
      return `insertTrustedHtml(${target}, ${position}, ${html})`
    },
  )

  if (source !== original) {
    source = ensureNamedImport(source, file, [...helpers])
    await writeFile(file, source)
    changedFiles++
    console.log(file)
  }
}
console.log(`updated ${changedFiles} files`)
