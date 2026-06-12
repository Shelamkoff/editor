import { sanitizeHtml } from '../../core/sanitize.js'
import { resolvePath } from '../../shared/resolvePath.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'

const editorStyles = resolvePath('./table.css', import.meta.url)

// Tabler icon: table
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"/><path d="M3 10h18"/><path d="M10 3v18"/></svg>'

// Tabler icons for settings
const ICON_ROW_ADD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1z"/><path d="M12 15l0 4"/><path d="M10 17l4 0"/></svg>'
const ICON_ROW_DEL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1z"/><path d="M10 17l4 0"/></svg>'
const ICON_COL_ADD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-16a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1z"/><path d="M17 10l0 4"/><path d="M15 12l4 0"/></svg>'
const ICON_COL_DEL = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1 -1v-16a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1z"/><path d="M15 12l4 0"/></svg>'
const ICON_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"/><path d="M3 10h18"/><path d="M10 3v7"/></svg>'


export class Table extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles]
  type = 'table'
  icon = ICON
  inlineTools = true

  pasteConfig = {
    tags: ['table'],
  }

  /** @returns {string} */
  get title() {
    return this._t('title', 'Table')
  }

  /**
   * @param {{ content?: string[][], withHeadings?: boolean }} data
   * @returns {HTMLElement}
   */
  render(data) {
    const rows = data.content?.length || 3
    const cols = data.content?.[0]?.length || 3
    const withHeadings = data.withHeadings ?? false

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
        const text = data.content?.[r]?.[c] || ''
        if (text) {
          cell.innerHTML = sanitizeHtml(text)
        }
        tr.appendChild(cell)
      }
      table.appendChild(tr)
    }

    // Tab navigation between cells
    table.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        this.#navigateCell(table, e.shiftKey ? -1 : 1)
      }
      // Prevent Enter from creating new block — insert <br> instead
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const br = document.createElement('br')
          range.insertNode(br)
          range.setStartAfter(br)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
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

    // Trigger undo/redo snapshot
    const ce = element.querySelector('[contenteditable="true"]')
    if (ce) ce.dispatchEvent(new InputEvent('input', { bubbles: true }))

    return null
  }

  /**
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
   * @param {{ content?: string[][] }} data
   * @returns {boolean}
   */
  validate(data) {
    return Array.isArray(data.content) && data.content.length > 0
  }

  /**
   * @param {HTMLElement} element
   * @returns {{ text: string }}
   */
  exportData(element) {
    const table = element.querySelector('table')
    return { text: table?.textContent?.trim() || '' }
  }

  /**
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

    const content = []
    let withHeadings = false
    const rows = table.querySelectorAll('tr')
    for (const tr of rows) {
      const row = []
      for (const cell of tr.querySelectorAll('td, th')) {
        row.push(cell.innerHTML.trim())
        if (cell.tagName === 'TH') withHeadings = true
      }
      if (row.length > 0) content.push(row)
    }
    if (content.length === 0) return null
    return { content, withHeadings }
  }

  // ── Private — table operations ─────────────────────────────────────────────

  /**
   * Toggle header row (th ↔ td for first row).
   * @param {HTMLElement} wrapper
   * @param {HTMLTableElement} table
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
   */
  #deleteRow(table) {
    if (table.rows.length <= 1) return
    table.deleteRow(table.rows.length - 1)
  }

  /**
   * Add a column at the end.
   * @param {HTMLTableElement} table
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
   */
  #navigateCell(table, direction) {
    const cells = /** @type {HTMLElement[]} */ ([...table.querySelectorAll('td, th')])
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const activeCell = /** @type {HTMLElement | null} */ (
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (sel.anchorNode).closest('td, th')
        : sel.anchorNode?.parentElement?.closest('td, th')
    )

    if (!activeCell) {
      cells[0]?.focus()
      return
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
    }
  }
}
