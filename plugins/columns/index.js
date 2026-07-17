import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateColumnsData } from '../../shared/blockDataValidators.js'
import { normalizeTextValue } from '../../shared/textFormat.js'
import { mapColumnsTextFields } from '../../shared/mapTextFields.js'

const editorStyles = resolvePath('./columns.css', import.meta.url)

// Tabler icon: columns-2
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3m0 1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M12 3v18"/></svg>'


const LAYOUTS = {
  '1-1':   { cols: 2, grid: '1fr 1fr', label: '50 / 50' },
  '1-2':   { cols: 2, grid: '1fr 2fr', label: '33 / 67' },
  '2-1':   { cols: 2, grid: '2fr 1fr', label: '67 / 33' },
  '1-1-1': { cols: 3, grid: '1fr 1fr 1fr', label: '33 / 33 / 33' },
}
/** @type {(keyof typeof LAYOUTS)[]} */
const LAYOUT_KEYS = ['1-1', '1-2', '2-1', '1-1-1']
// Layout preview icons (small SVGs for selector)
/** @type {Record<string, string>} */
const LAYOUT_ICONS = {
  '1-1':   '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="9" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="10.5" y="0.5" width="9" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '1-2':   '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="6" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="7.5" y="0.5" width="12" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '2-1':   '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="12" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="13.5" y="0.5" width="6" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  '1-1-1': '<svg width="20" height="14" viewBox="0 0 20 14"><rect x="0.5" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="7.17" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="13.83" y="0.5" width="5.67" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
}
/** @type {WeakMap<HTMLElement, { data: { columns: Array<{content: string}>, layout: string } }>} */
const stateMap = new WeakMap()
/** Editable two- or three-column rich-text layout block. */
export class Columns extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'columns'
  icon = ICON
  inlineTools = true
  mapTextFields = mapColumnsTextFields

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Columns')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const layout = LAYOUT_KEYS.includes(/** @type {any} */ (data?.layout)) ? String(data.layout) : '1-1'
    const layoutDef = /** @type {{ cols: number, grid: string, label: string }} */ (LAYOUTS[layout])
    const columns = Array.isArray(data?.columns)
      ? data.columns.map((c) => ({ content: normalizeTextValue(c?.content) }))
      : []

    // Ensure correct number of columns for layout
    while (columns.length < layoutDef.cols) columns.push({ content: '' })
    if (columns.length > layoutDef.cols) columns.length = layoutDef.cols

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-columns')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, { data: { columns, layout } })

    this.#build(wrapper, context)
    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element @returns {{ columns: Array<{ content: string }>, layout: string }}
   */
  save(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return { columns: [], layout: '1-1' }
    return {
      columns: s.data.columns.map((c) => ({ ...c })),
      layout: s.data.layout,
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data @returns {boolean}
   */
  validate(data) {
    return validateColumnsData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element @returns {boolean}
   */
  isEmpty(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return true
    return s.data.columns.every((c) => !c.content.trim())
  }

  /**
   * Extract neutral rich text that can initialize another block type.
   * @param {HTMLElement} element @returns {{ text: string }}
   */
  exportData(element) {
    this.#syncFromDom(element)
    const s = stateMap.get(element)
    if (!s) return { text: '' }
    return { text: s.data.columns.map((c) => c.content).filter(Boolean).join('<br>') }
  }

  /**
   * Release listeners and resources owned by this block element.
   * @param {HTMLElement} element @returns {void}
   */
  destroy(element) {
    stateMap.delete(element)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @param {HTMLElement} wrapper @returns {void} */
  #syncFromDom(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const colEls = wrapper.querySelectorAll('.oe-columns__col')
    colEls.forEach((el, i) => {
      const col = s.data.columns[i]
      if (col) {
        col.content = sanitizeHtml(el.innerHTML?.trim() || '')
      }
    })
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {void}
   */
  #build(wrapper, context) {
    const s = stateMap.get(wrapper)
    if (!s) return
    wrapper.innerHTML = ''

    const layoutDef = /** @type {{ cols: number, grid: string, label: string }} */ (LAYOUTS[s.data.layout] || LAYOUTS['1-1'])

    // Grid container
    const grid = document.createElement('div')
    grid.className = 'oe-columns__grid'
    grid.style.gridTemplateColumns = layoutDef.grid

    for (let i = 0; i < s.data.columns.length; i++) {
      const colData = /** @type {{content: string}} */ (s.data.columns[i])
      const col = document.createElement('div')
      col.className = 'oe-columns__col'
      col.contentEditable = 'true'
      col.dataset.placeholder = `${this._t('colPlaceholder', 'Column')} ${i + 1}`
      if (colData.content) {
        col.innerHTML = sanitizeHtml(colData.content)
      }
      col.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.stopPropagation(); return }
        // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
        if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
      })
      grid.appendChild(col)
    }

    wrapper.appendChild(grid)

    // Layout selector
    const actions = document.createElement('div')
    actions.className = 'oe-columns__actions'

    for (const key of LAYOUT_KEYS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `oe-columns__layout-btn${s.data.layout === key ? ' oe-columns__layout-btn--active' : ''}`
      btn.innerHTML = LAYOUT_ICONS[key] || ''
      btn.title = LAYOUTS[key]?.label || ''
      btn.setAttribute('aria-label', `${this._t('layout', 'Layout')} ${btn.title}`)
      btn.setAttribute('aria-pressed', String(s.data.layout === key))
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', () => {
        context.mutate(() => {
          this.#syncFromDom(wrapper)
          this.#changeLayout(wrapper, key, context)
        })
      })
      actions.appendChild(btn)
    }

    wrapper.appendChild(actions)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {string} newLayout
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {void}
   */
  #changeLayout(wrapper, newLayout, context) {
    const newDef = LAYOUTS[newLayout]
    if (!newDef) return

    const s = stateMap.get(wrapper)
    if (!s) return

    // Adjust columns count
    while (s.data.columns.length < newDef.cols) {
      s.data.columns.push({ content: '' })
    }
    if (s.data.columns.length > newDef.cols) {
      // Merge overflow into last column
      const overflow = s.data.columns.splice(newDef.cols)
      const last = /** @type {{content: string}} */ (s.data.columns[newDef.cols - 1])
      for (const col of overflow) {
        if (col.content.trim()) {
          last.content = last.content ? last.content + '<br>' + col.content : col.content
        }
      }
    }

    s.data.layout = newLayout
    this.#build(wrapper, context)
  }
}
