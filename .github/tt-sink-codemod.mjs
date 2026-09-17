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

function replaceReviewed(source, before, after, file, label) {
  if (!source.includes(before)) return source
  const first = source.indexOf(before)
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${file}: reviewed replacement is ambiguous: ${label}`)
  }
  return source.replace(before, after)
}

const reviewed = {
  'core/splitConvert.js': [
    ['contentEl.innerHTML = selectedHtml', 'setTrustedHtml(contentEl, selectedHtml)', ['setTrustedHtml'], 'selected live DOM fragment'],
  ],
  'core/crossBlockConvert.js': [
    ['container.innerHTML = html', 'setTrustedHtml(container, html)', ['setTrustedHtml'], 'serialized clone used only for content detection'],
  ],
  'core/transferInlineContent.js': [
    ['template.innerHTML = html', 'setTrustedHtml(template, html)', ['setTrustedHtml'], 'editor-owned inline fragment transfer'],
  ],
  'core/inline-toolbar/InlineToolbar.js': [
    ['btn.innerHTML = tool.getIcon(active)', 'setTrustedHtml(btn, tool.getIcon(active))', ['setTrustedHtml'], 'installed inline-tool icon markup'],
  ],
  'core/clipboard/clipboardHtml.js': [
    ['template.innerHTML = source.innerHTML', 'setTrustedHtml(template, source.innerHTML)', ['setTrustedHtml'], 'clone live editor DOM into inert export template'],
    ['element.innerHTML = inline(source, ownerDocument)', 'setTrustedHtml(element, inline(source, ownerDocument))', ['setTrustedHtml'], 'already sanitized inline export'],
    ['template.innerHTML = item.innerHTML', 'setTrustedHtml(template, item.innerHTML)', ['setTrustedHtml'], 'clone live list item into inert export template'],
    ['holder.innerHTML = template.innerHTML', 'setTrustedHtml(holder, template.innerHTML)', ['setTrustedHtml'], 'already inert cloned list content'],
    ["captionSource.innerHTML = typeof data.caption === 'string' ? data.caption : ''", "setSanitizedHtml(captionSource, typeof data.caption === 'string' ? data.caption : '')", ['setSanitizedHtml'], 'persisted image caption remains sanitized'],
  ],
  'core/clipboard/pasteTail.js': [
    ['template.innerHTML = lastBlock.importInlineContent(tail.html, tail.metadata.inline)', 'setTrustedHtml(template, lastBlock.importInlineContent(tail.html, tail.metadata.inline))', ['setTrustedHtml'], 'saved suffix from live editor DOM'],
  ],
  'core/clipboard/rangeClipboard.js': [
    ['copy.innerHTML = transferred.html', 'setTrustedHtml(copy, transferred.html)', ['setTrustedHtml'], 'serialized clone rewritten by transferInlineContent'],
  ],
  'core/clipboard/CrossBlockEditor.js': [
    ['suffix.innerHTML = transferred', 'setTrustedHtml(suffix, transferred)', ['setTrustedHtml'], 'serialized suffix from live editor DOM'],
  ],
  'plugins/embed/index.js': [
    ['st.urlIconEl.innerHTML = ICON_FORMS', 'setTrustedHtml(st.urlIconEl, ICON_FORMS)', ['setTrustedHtml'], 'library-owned service icon'],
    ['btn.innerHTML = html', 'setTrustedHtml(btn, html)', ['setTrustedHtml'], 'installed extension/library action markup'],
  ],
  'plugins/link-preview/index.js': [
    ['st.urlIconEl.innerHTML = ICON_FORMS', 'setTrustedHtml(st.urlIconEl, ICON_FORMS)', ['setTrustedHtml'], 'library-owned service icon'],
  ],
  'plugins/shared/actionBar.js': [
    ['btn.innerHTML = innerHTML', 'setTrustedHtml(btn, innerHTML)', ['setTrustedHtml'], 'installed extension/library action markup'],
  ],
  'plugins/checklist/index.js': [
    ['if (newText) content.innerHTML = newText', 'if (newText) setTrustedHtml(content, newText)', ['setTrustedHtml'], 'selection fragment serialized from live checklist DOM'],
  ],
  'plugins/table/index.js': [
    ['newCell.innerHTML = cell.innerHTML', 'setTrustedHtml(newCell, cell.innerHTML)', ['setTrustedHtml'], 'live table cell DOM transfer'],
  ],
  'plugins/image/settings.js': [
    ['arrow.innerHTML = CHEVRON_DOWN', 'setTrustedHtml(arrow, CHEVRON_DOWN)', ['setTrustedHtml'], 'library-owned chevron icon'],
  ],
  'renderer/renderers/attaches/index.js': [
    ['dl.innerHTML = ICON_DL', 'setTrustedHtml(dl, ICON_DL)', ['setTrustedHtml'], 'library-owned download icon'],
  ],
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

  for (const [before, after, names, label] of reviewed[file] ?? []) {
    const next = replaceReviewed(source, before, after, file, label)
    if (next !== source) for (const name of names) helpers.add(name)
    source = next
  }

  // Multi-line library markup with escaped consumer-visible labels.
  if (file === 'inline-plugins/mention/index.js') {
    source = source.replace(
      /el\.innerHTML = (`\n\s*<div class="oe-mention-avatar-placeholder">\?<\/div>[\s\S]*?<\/div>\n\s*`)/,
      (_match, html) => {
        helpers.add('setTrustedHtml')
        return `setTrustedHtml(el, ${html})`
      },
    )
    source = source.replace(
      /loader\.innerHTML = (`\n\s*<div class="oe-mention-item">[\s\S]*?<\/div>\n\s*`)/,
      (_match, html) => {
        helpers.add('setTrustedHtml')
        return `setTrustedHtml(loader, ${html})`
      },
    )
  }

  if (source !== original) {
    source = ensureNamedImport(source, file, [...helpers])
    await writeFile(file, source)
    changedFiles++
    console.log(file)
  }
}
console.log(`updated ${changedFiles} files`)
