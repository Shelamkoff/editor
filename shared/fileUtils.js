/**
 * Shared file utilities for the Attaches plugin (editor) and its renderer.
 * Icons, extension mapping, size formatting — single source of truth.
 */

// Tabler Icons (24×24) — compact stroke-based file type icons
const _S = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

/** @type {Record<string, string>} */
export const FILE_ICONS = {
  pdf: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M17 18h2"/><path d="M20 15h-3v6"/><path d="M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1"/></svg>`,
  doc: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1"/><path d="M20 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0"/><path d="M12.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -3 0v-3a1.5 1.5 0 0 1 1.5 -1.5"/></svg>`,
  xls: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M4 15l4 6"/><path d="M4 21l4 -6"/><path d="M17 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M11 15v6h3"/></svg>`,
  ppt: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M16.5 15h3"/><path d="M18 15v6"/></svg>`,
  csv: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M7 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0"/><path d="M10 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M16 15l2 6l2 -6"/></svg>`,
  zip: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M16 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6"/><path d="M12 15v6"/><path d="M5 15h3l-3 6h3"/></svg>`,
  sql: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M5 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M18 15v6h2"/><path d="M13 15a2 2 0 0 1 2 2v2a2 2 0 1 1 -4 0v-2a2 2 0 0 1 2 -2"/><path d="M14 20l1.5 1.5"/></svg>`,
  js: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M3 15h3v4.5a1.5 1.5 0 0 1 -3 0"/><path d="M9 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-1"/></svg>`,
  ts: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-1"/><path d="M9 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M3.5 15h3"/><path d="M5 15v6"/></svg>`,
  html: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M2 21v-6"/><path d="M5 15v6"/><path d="M2 18h3"/><path d="M20 15v6h2"/><path d="M13 21v-6l2 3l2 -3v6"/><path d="M7.5 15h3"/><path d="M9 15v6"/></svg>`,
  css: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M8 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0"/><path d="M11 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/><path d="M17 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75"/></svg>`,
  xml: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4"/><path d="M4 15l4 6"/><path d="M4 21l4 -6"/><path d="M19 15v6h3"/><path d="M11 21v-6l2.5 3l2.5 -3v6"/></svg>`,
  json: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M10 13l-1 2l1 2"/><path d="M14 13l1 2l-1 2"/></svg>`,
  image: `<svg ${_S}><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>`,
  audio: `<svg ${_S}><path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M9 17v-13h10v13"/><path d="M9 8h10"/></svg>`,
  video: `<svg ${_S}><path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4"/><path d="M3 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -8"/></svg>`,
  default: `<svg ${_S}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/></svg>`,
}

/** Extension → icon key mapping. @type {Record<string, string>} */
export const EXT_MAP = {
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
  xls: 'xls', xlsx: 'xls',
  ppt: 'ppt', pptx: 'ppt',
  csv: 'csv', tsv: 'csv',
  zip: 'zip', rar: 'zip', '7z': 'zip', tar: 'zip', gz: 'zip',
  sql: 'sql', db: 'sql',
  js: 'js', mjs: 'js', cjs: 'js',
  ts: 'ts', tsx: 'ts',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  xml: 'xml', svg: 'xml',
  json: 'json', jsonl: 'json',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', ico: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', avi: 'video', mov: 'video', mkv: 'video', webm: 'video', wmv: 'video', flv: 'video',
}

/** Extension → badge accent color (only for known doc types). @type {Record<string, string>} */
export const EXT_COLORS = {
  pdf: '#e74c3c',
  doc: '#2b579a', docx: '#2b579a',
  xls: '#217346', xlsx: '#217346',
  ppt: '#d24726', pptx: '#d24726',
  zip: '#f39c12', rar: '#f39c12', '7z': '#f39c12',
}

/**
 * Get the SVG icon for a file extension.
 * @param {string} ext  lowercase extension without dot
 * @returns {{ svg: string, key: string }}
 */
export function getFileIcon(ext) {
  const key = EXT_MAP[ext.toLowerCase()] || 'default'
  return { svg: FILE_ICONS[key] ?? FILE_ICONS['default'] ?? '', key }
}

/**
 * Format bytes into a human-readable size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Extract the extension from a filename.
 * @param {string} filename
 * @returns {string}
 */
export function getExtension(filename) {
  if (!filename) return ''
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : ''
}

/**
 * Format an ISO date string as DD.MM.YYYY.
 * @param {string} [isoString]
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}.${mm}.${yyyy}`
  } catch {
    return ''
  }
}
