// @ts-check
import { resolvePath } from '../../../shared/resolvePath.js'
import { getFileIcon, getExtension, formatSize, EXT_COLORS } from '../../../shared/fileUtils.js'

const styles = resolvePath('./styles.css', import.meta.url)

const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
const ICON_FILE_DEFAULT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/></svg>'
const ICON_DL = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5l5-5"/><path d="M12 4v12"/></svg>'

/**
 * @param {Array<{url: string, name: string}>} files
 */
async function downloadArchive(files) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  await Promise.all(files.map(async (f) => {
    try { const res = await fetch(f.url); if (res.ok) zip.file(f.name || 'file', await res.blob()) } catch { /* skip */ }
  }))
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'files.zip'; a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {string} classPrefix
 * @param {Record<string, string>} locale
 * @returns {import('../../types').BlockRenderer<import('../../types').AttachesBlock>}
 */
export function createAttachesRenderer(classPrefix, locale) {
  const cls = classPrefix
  /** @param {string} key @param {string} fallback */
  const t = (key, fallback) => locale?.[key] ?? fallback

  return {
    type: 'attaches',
    styles: [styles],

    render(block, _parseInline) {
      /** @type {Array<{url: string, name: string, size: number, extension: string}>} */
      let files
      if (block.data.file && !block.data.files) {
        const f = /** @type {any} */ (block.data.file)
        files = f.url ? [f] : []
      } else {
        files = /** @type {any[]} */ (block.data.files || []).filter(f => f?.url)
      }

      const variant = /** @type {string} */ (/** @type {any} */ (block.data).variant) || 'f'

      const wrapper = document.createElement('div')
      wrapper.className = `${cls}-attaches`
      if (files.length === 0) return wrapper

      switch (variant) {
        case 'b': renderPills(wrapper, files, cls, t); break
        case 'f': renderNotion(wrapper, files, cls, t); break
        case 'g': renderMaterial(wrapper, files, cls, t); break
        default:
          if (files.length === 1) wrapper.appendChild(buildCardA(files[0], cls, t))
          else wrapper.appendChild(buildGroupA(files, cls, t))
          break
      }

      return wrapper
    },
  }
}

// ── Variant A: Minimal ──────────────────────────────────────────────────────

/**
 * @param {{ url: string, name: string, size: number, extension: string }} file
 * @param {string} cls
 * @param {(key: string, fallback: string) => string} t
 */
function buildCardA(file, cls, t) {
  const card = document.createElement('div')
  card.className = `${cls}-attaches__card`
  card.appendChild(buildIconA(file, cls))

  const info = document.createElement('div')
  info.className = `${cls}-attaches__info`
  const name = document.createElement('div')
  name.className = `${cls}-attaches__name`
  name.textContent = file.name || t('renderer.attaches.file', 'File')
  info.appendChild(name)
  if (file.size) { const m = document.createElement('div'); m.className = `${cls}-attaches__meta`; m.textContent = formatSize(file.size); info.appendChild(m) }
  card.appendChild(info)

  const dl = document.createElement('a')
  dl.className = `${cls}-attaches__download`
  dl.href = file.url; dl.download = file.name || ''; dl.textContent = t('renderer.attaches.download', 'Download')
  card.appendChild(dl)

  return card
}

/** Variant A icon: default file SVG + extension badge */
function buildIconA(/** @type {{ extension: string }} */ file, /** @type {string} */ cls) {
  const wrap = document.createElement('div')
  wrap.className = `${cls}-attaches__icon`
  wrap.innerHTML = ICON_FILE_DEFAULT
  const ext = (file.extension || '').toLowerCase()
  if (ext) {
    const badge = document.createElement('span')
    badge.className = `${cls}-attaches__ext`
    badge.textContent = ext.toUpperCase()
    const color = EXT_COLORS[ext]
    if (color) badge.style.backgroundColor = color
    wrap.appendChild(badge)
  }
  return wrap
}

/**
 * @param {Array<{url: string, name: string, size: number, extension: string}>} files
 * @param {string} cls
 * @param {(key: string, fallback: string) => string} t
 */
function buildGroupA(files, cls, t) {
  const group = document.createElement('div')
  group.className = `${cls}-attaches__group`

  const header = document.createElement('div')
  header.className = `${cls}-attaches__group-header`
  const iconWrap = document.createElement('div')
  iconWrap.className = `${cls}-attaches__icon`
  iconWrap.innerHTML = ICON_FILE_DEFAULT
  const info = document.createElement('div')
  info.className = `${cls}-attaches__info`
  const count = document.createElement('div')
  count.className = `${cls}-attaches__name`
  count.textContent = `${files.length} ${t('renderer.attaches.files', 'files')}`
  info.appendChild(count)
  const meta = document.createElement('div')
  meta.className = `${cls}-attaches__meta`
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0)
  if (totalSize) { const sz = document.createElement('span'); sz.textContent = formatSize(totalSize); meta.appendChild(sz) }
  const archiveLink = document.createElement('a')
  archiveLink.className = `${cls}-attaches__download`
  archiveLink.href = '#'; archiveLink.textContent = t('renderer.attaches.downloadZip', 'Download ZIP')
  archiveLink.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); downloadArchive(files) })
  meta.appendChild(archiveLink)
  info.appendChild(meta)
  const chevron = document.createElement('div')
  chevron.className = `${cls}-attaches__chevron`
  chevron.innerHTML = ICON_CHEVRON
  header.append(iconWrap, info, chevron)

  const body = document.createElement('div')
  body.className = `${cls}-attaches__group-body`
  for (const file of files) {
    const row = document.createElement('div')
    row.className = `${cls}-attaches__row`
    const fname = document.createElement('a')
    fname.className = `${cls}-attaches__row-name`
    fname.href = file.url; fname.download = file.name || ''; fname.textContent = file.name || t('renderer.attaches.file', 'File')
    row.appendChild(fname)
    if (file.size) { const sz = document.createElement('span'); sz.className = `${cls}-attaches__row-size`; sz.textContent = formatSize(file.size); row.appendChild(sz) }
    const dl = document.createElement('a')
    dl.className = `${cls}-attaches__download`
    dl.href = file.url; dl.download = file.name || ''; dl.textContent = t('renderer.attaches.download', 'Download')
    row.appendChild(dl)
    body.appendChild(row)
  }

  header.addEventListener('click', () => {
    body.classList.toggle(`${cls}-attaches__group-body--open`)
    chevron.classList.toggle(`${cls}-attaches__chevron--open`)
  })

  group.append(header, body)
  return group
}

// ── Variant B: Pill ─────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} wrapper
 * @param {Array<{url: string, name: string, size: number, extension: string}>} files
 * @param {string} cls
 * @param {(key: string, fallback: string) => string} t
 */
function renderPills(wrapper, files, cls, t) {
  const container = document.createElement('div')
  container.className = `${cls}-attaches__pills`
  for (const file of files) {
    const pill = document.createElement('a')
    pill.className = `${cls}-attaches__pill`
    pill.href = file.url; pill.download = file.name || ''
    const ic = document.createElement('div')
    ic.className = `${cls}-attaches__pill-icon`
    ic.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/></svg>'
    pill.appendChild(ic)
    const name = document.createElement('span')
    name.textContent = file.name || t('renderer.attaches.file', 'File')
    pill.appendChild(name)
    if (file.size) { const sz = document.createElement('span'); sz.className = `${cls}-attaches__pill-size`; sz.textContent = formatSize(file.size); pill.appendChild(sz) }
    container.appendChild(pill)
  }
  wrapper.appendChild(container)
}

// ── Variant F: Notion ───────────────────────────────────────────────────────

/**
 * @param {HTMLElement} wrapper
 * @param {Array<{url: string, name: string, size: number, extension: string}>} files
 * @param {string} cls
 * @param {(key: string, fallback: string) => string} t
 */
function renderNotion(wrapper, files, cls, t) {
  const table = document.createElement('div')
  table.className = `${cls}-attaches__notion`
  for (const file of files) {
    const row = document.createElement('div')
    row.className = `${cls}-attaches__notion-row`
    const name = document.createElement('a')
    name.className = `${cls}-attaches__notion-name`
    name.href = file.url; name.download = file.name || ''; name.textContent = file.name || t('renderer.attaches.file', 'File')
    row.appendChild(name)
    const ext = (file.extension || '').toUpperCase()
    if (ext) {
      const tag = document.createElement('span')
      tag.className = `${cls}-attaches__notion-tag`
      tag.textContent = ext
      const color = EXT_COLORS[file.extension?.toLowerCase()]
      if (color) { tag.style.backgroundColor = `${color}20`; tag.style.color = color }
      row.appendChild(tag)
    }
    if (file.size) { const sz = document.createElement('span'); sz.className = `${cls}-attaches__notion-size`; sz.textContent = formatSize(file.size); row.appendChild(sz) }
    table.appendChild(row)
  }
  wrapper.appendChild(table)
}

// ── Variant G: Material ─────────────────────────────────────────────────────

/**
 * @param {HTMLElement} wrapper
 * @param {Array<{url: string, name: string, size: number, extension: string}>} files
 * @param {string} cls
 * @param {(key: string, fallback: string) => string} t
 */
function renderMaterial(wrapper, files, cls, t) {
  const stack = document.createElement('div')
  stack.className = `${cls}-attaches__material`
  for (const file of files) {
    const card = document.createElement('div')
    card.className = `${cls}-attaches__material-card`
    const iconWrap = document.createElement('div')
    iconWrap.className = `${cls}-attaches__material-icon`
    iconWrap.innerHTML = getFileIcon(file.extension).svg
    card.appendChild(iconWrap)
    const info = document.createElement('div')
    info.className = `${cls}-attaches__info`
    const name = document.createElement('div')
    name.className = `${cls}-attaches__name`
    name.textContent = file.name || t('renderer.attaches.file', 'File')
    info.appendChild(name)
    if (file.size) { const m = document.createElement('div'); m.className = `${cls}-attaches__meta`; m.textContent = formatSize(file.size); info.appendChild(m) }
    card.appendChild(info)
    const dl = document.createElement('a')
    dl.className = `${cls}-attaches__material-dl`
    dl.href = file.url; dl.download = file.name || ''; dl.innerHTML = ICON_DL
    card.appendChild(dl)
    stack.appendChild(card)
  }
  wrapper.appendChild(stack)
}
