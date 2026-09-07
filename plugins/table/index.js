import { editableRange } from '../../core/editableFields.js'
import { tablePasteData } from './paste.js'
import { sanitizeHtml } from '../../core/sanitize.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { validateTableData } from '../../shared/blockDataValidators.js'
import { mapTableTextFields } from '../../shared/mapTextFields.js'

const editorStyles = new URL('./table.css', import.meta.url).href

// Tabler icon: table
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"/><path d="M3 10h18"/><path d="M10 3v18"/></svg>'

// Tabler icons for settings
const ICON_ROW_ADD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1z"/><path d="M12 15l0 4"/><path d="M10 17l4 0"/></svg>'
const ICON_ROW_DEL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1z"/><path d="M10 17l4 0"/></svg>'
const ICON_COL_ADD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-16a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1z"/><path d="M17 10l0 4"/><path d="M15 12l4 0"/></svg>'
const ICON_COL_DEL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-16a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1z"/><path d="M15 12l4 0"/></svg>'
const ICON_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"/><path d="M3 10h18"/><path d="M10 3v7"/></svg>'

/** Editable rich-text table with row, column, and heading controls. */
export class Table extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'table'
  icon = ICON
  inlineTools = true
  mapTextFields = mapTableTextFields
  pasteConfig = {
    tags: ['table'],
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Table')
  }

  /**
   * Create the editable DOM owned by this block instance.
   * @param {{ content?: string[][], withHeadings?: boolean }} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const inputRows = Array.isArray(data?.content)
      ? data.content.filter(Array.isArray)
      : []
    const rows = inputRows.length || 3
    const cols = inputRows.find(row => row.length > 0)?.length || 3
    const withHeadings = data?.withHeadings === true

    const wrapper = document.createElement('div')
    wrapper.classList.add('oe-table-wrapper')
    wrapper.dataset.headings = String(withHeadings)

    const table = document.createElement('table')
    table.classList.add('oe-table')

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr')
      for (let c = 0; c < cols; c++) {
        const isHeader = withHeadings && r === 0
        const cell = document.createElement(isHeader ? 'th' : 'td')
        cell.classList.add('oe-table__cell')
        cell.contentEditable = 'true'
        const candidate = inputRows[r]?.[c]
        const text = typeof candidate === 'string' ? candidate : ''
        if (text) {
          cell.innerHTML = sanitizeHtml(text)
        }
        tr.appendChild(cell)
      }
      table.appendChild(tr)
    }

    // Native Range.deleteContents() may remove TD/TR nodes or leave this
    // editor entirely. Only a range owned by the event's actual cell is safe.
    /** @param {KeyboardEvent | InputEvent} event */
    const insertBreak = event => {
      if (event.defaultPrevented || !event.cancelable || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      const selection = window.getSelection()
      if (!selection?.rangeCount) return
      const range = selection.getRangeAt(0)
      const cell = editableRange(wrapper, range)
      const targetField = event.target instanceof Element
        ? event.target.closest('[contenteditable]') : null
      if (!cell?.matches('td, th') || cell.closest('table') !== table || targetField !== cell) return
      context.mutate(() => {
        range.deleteContents()
        const br = document.createElement('br')
        range.insertNode(br)
        range.setStartAfter(br)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      })
    }
    table.addEventListener('keydown', event => {
      if (event.key === 'Tab' && this.#navigateCell(table, event.shiftKey ? -1 : 1)) {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Enter') insertBreak(event)
    })
    table.addEventListener('beforeinput', event => {
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') insertBreak(event)
    })

    wrapper.appendChild(table)
    return wrapper
  }

  /**
   * Render block settings controls (add/remove row/col, toggle header).
   * @param {HTMLElement} element
   * @returns {HTMLElement[]}
   */
  renderSettings(element) {
    const withHeadings = element.dataset.headings === 'true'
    const t = (/** @type {string} */ key, /** @type {string} */ fallback) => this._t(key, fallback)
    const defs = [
      { icon: ICON_HEADER, label: t('toggleHeader', 'Toggle header'), action: 'header', active: withHeadings },
      { icon: ICON_ROW_ADD, label: t('addRow', 'Add row'), action: 'row-add' },
      { icon: ICON_ROW_DEL, label: t('deleteRow', 'Delete row'), action: 'row-del' },
      { icon: ICON_COL_ADD, label: t('addColumn', 'Add column'), action: 'col-add' },
      { icon: ICON_COL_DEL, label: t('deleteColumn', 'Delete column'), action: 'col-del' },
    ]

    return defs.map(item => {
      const btn = document.createElement('li')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('tabindex', '-1')
      btn.className = 'oe-settings-menu__item'
      if (item.active) btn.classList.add('oe-settings-menu__item--active')

      const ic = document.createElement('span')
      ic.className = 'oe-settings-menu__icon'
      ic.innerHTML = item.icon
      btn.appendChild(ic)

      const lb = document.createElement('span')
      lb.className = 'oe-settings-menu__label'
      lb.textContent = item.label
      btn.appendChild(lb)

      btn.dataset.action = item.action
      return btn
    })
  }

  /**
   * Handle settings action for table operations.
   * @param {HTMLElement} element — the table wrapper
   * @param {string} action
   * @returns {null}
   */
  onSettingsAction(element, action) {
    const table = element.querySelector('table')
    if (!table) return null

    switch (action) {
      case 'header':
        this.#toggleHeader(element, table)
        break
      case 'row-add':
        this.#addRow(table)
        break
      case 'row-del':
        this.#deleteRow(table)
        break
      case 'col-add':
        this.#addColumn(table)
        break
      case 'col-del':
        this.#deleteColumn(table)
        break
    }

    return null
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {{ content: string[][], withHeadings: boolean }}
   */
  save(element) {
    const table = element.querySelector('table')
    if (!table) return { content: [['']], withHeadings: false }

    const content = []
    for (const tr of table.rows) {
      const row = []
      for (const cell of tr.cells) {
        row.push(cell.innerHTML.trim())
      }
      content.push(row)
    }

    return {
      content,
      withHeadings: element.dataset.headings === 'true',
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {{ content?: string[][] }} data
   * @returns {boolean}
   */
  validate(data) {
    return validateTableData(data)
  }

  /**
   * Extract neutral text that can initialize another block type.
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const table = element.querySelector('table')
    if (!table) return { text: '' }
    const rows = [...table.rows].map(row => (
      [...row.cells]
        .map(cell => sanitizeHtml(cell.innerHTML.trim()))
        .filter(Boolean)
        .join(' — ')
    )).filter(Boolean)
    return { text: rows.join('<br>') }
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const table = element.querySelector('table')
    if (!table) return true
    for (const cell of table.querySelectorAll('td, th')) {
      if ((cell.textContent?.trim().length ?? 0) > 0) return false
    }
    return true
  }

  /**
   * Handle pasted table elements.
   * @param {import('../../types').TagPasteEvent} event
   * @returns {{ content: string[][], withHeadings: boolean } | null}
   */
  onPaste(event) {
    if (event.type !== 'tag') return null
    const table = event.element.tagName === 'TABLE'
      ? event.element
      : event.element.querySelector('table')
    if (!table) return null

    return tablePasteData(/** @type {HTMLTableElement} */ (table))
  }

  // ── Private — table operations ─────────────────────────────────────────────

  /**
   * Toggle header row (th ↔ td for first row).
   * @param {HTMLElement} wrapper
   * @param {HTMLTableElement} table
   * @returns {void}
   */
  #toggleHeader(wrapper, table) {
    const firstRow = table.rows[0]
    if (!firstRow) return

    const isHeader = wrapper.dataset.headings === 'true'
    const newIsHeader = !isHeader
    wrapper.dataset.headings = String(newIsHeader)

    const newTag = newIsHeader ? 'th' : 'td'
    for (const cell of [...firstRow.cells]) {
      const newCell = document.createElement(newTag)
      newCell.className = 'oe-table__cell'
      newCell.contentEditable = 'true'
      newCell.innerHTML = cell.innerHTML
      cell.replaceWith(newCell)
    }
  }

  /**
   * Add a row at the end.
   * @param {HTMLTableElement} table
   * @returns {void}
   */
  #addRow(table) {
    const cols = table.rows[0]?.cells.length || 1
    const tr = document.createElement('tr')
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td')
      td.className = 'oe-table__cell'
      td.contentEditable = 'true'
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }

  /**
   * Delete the last row (keep at least 1).
   * @param {HTMLTableElement} table
   * @returns {void}
   */
  #deleteRow(table) {
    if (table.rows.length <= 1) return
    table.deleteRow(table.rows.length - 1)
  }

  /**
   * Add a column at the end.
   * @param {HTMLTableElement} table
   * @returns {void}
   */
  #addColumn(table) {
    const wrapper = /** @type {HTMLElement | null} */ (table.closest('.oe-table-wrapper'))
    const isHeader = wrapper ? wrapper.dataset.headings === 'true' : false

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r]
      if (!row) continue
      const tag = (isHeader && r === 0) ? 'th' : 'td'
      const cell = document.createElement(tag)
      cell.className = 'oe-table__cell'
      cell.contentEditable = 'true'
      row.appendChild(cell)
    }
  }

  /**
   * Delete the last column (keep at least 1).
   * @param {HTMLTableElement} table
   * @returns {void}
   */
  #deleteColumn(table) {
    const cols = table.rows[0]?.cells.length || 0
    if (cols <= 1) return

    for (const row of table.rows) {
      row.deleteCell(row.cells.length - 1)
    }
  }

  /**
   * Navigate to adjacent cell.
   * @param {HTMLTableElement} table
   * @param {number} direction — 1 for forward, -1 for backward
   * @returns {boolean} Whether focus moved to another cell.
   */
  #navigateCell(table, direction) {
    const cells = /** @type {HTMLElement[]} */ ([...table.querySelectorAll('td, th')])
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false

    const activeCell = /** @type {HTMLElement | null} */ (
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (sel.anchorNode).closest('td, th')
        : sel.anchorNode?.parentElement?.closest('td, th')
    )

    if (!activeCell || !table.contains(activeCell)) {
      const first = cells[0]
      if (!first) return false
      first.focus()
      return true
    }

    const idx = cells.indexOf(activeCell)
    const next = cells[idx + direction]
    if (next) {
      next.focus()
      // Place caret at start or end
      const range = document.createRange()
      if (direction > 0) {
        range.setStart(next, 0)
      } else {
        range.selectNodeContents(next)
        range.collapse(false)
      }
      sel.removeAllRanges()
      sel.addRange(range)
      return true
    }
    return false
  }
}
