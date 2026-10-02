const editorStyles = new URL('./columns.css', import.meta.url).href
export const COLUMNS_STYLES = Object.freeze([editorStyles])

export const COLUMNS_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3m0 1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M12 3v18"/></svg>'

export const COLUMN_LAYOUTS = Object.freeze({
  '1-1': Object.freeze({ cols: 2, grid: '1fr 1fr', label: '50 / 50' }),
  '1-2': Object.freeze({ cols: 2, grid: '1fr 2fr', label: '33 / 67' }),
  '2-1': Object.freeze({ cols: 2, grid: '2fr 1fr', label: '67 / 33' }),
  '1-1-1': Object.freeze({ cols: 3, grid: '1fr 1fr 1fr', label: '33 / 33 / 33' }),
})

export const COLUMN_LAYOUT_KEYS = Object.freeze(['1-1', '1-2', '2-1', '1-1-1'])

export const COLUMN_LAYOUT_ICONS = Object.freeze({
  '1-1': '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="9" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="10.5" y="0.5" width="9" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '1-2': '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="6" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="7.5" y="0.5" width="12" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '2-1': '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="12" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="13.5" y="0.5" width="6" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '1-1-1': '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="7.17" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="13.83" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
})
