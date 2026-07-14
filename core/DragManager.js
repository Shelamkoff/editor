import { el } from './dom.js'
import { EditorEvent } from './editorEvents.js'

export class DragManager {
  /** @type {HTMLElement} */
  #rootEl

  /** @type {import('./types').IBlockManager} */
  #blocks

  /** @type {HTMLElement} */
  #dragHandle

  /** @type {import('./types').IEventBus} */
  #events

  /** @type {import('./types').IBlock | null} */
  #draggingBlock = null

  /** @type {HTMLElement} */
  #dropIndicator

  /** @type {number} */
  #dropIndex = -1

  /** @type {boolean} */
  #isDragging = false

  /** @type {boolean} track if mousedown handled the current interaction */
  #mouseDownHandled = false

  /** @type {number} */
  #startX = 0

  /** @type {number} */
  #startY = 0

  /** @type {number} */
  #threshold

  /**
   * @param {HTMLElement} rootEl
   * @param {import('./types').IBlockManager} blocks
   * @param {HTMLElement} dragHandle
   * @param {import('./types').IEventBus} events
   * @param {{ threshold: number }} [tuning]
   */
  constructor(rootEl, blocks, dragHandle, events, tuning) {
    this.#rootEl = rootEl
    this.#blocks = blocks
    this.#dragHandle = dragHandle
    this.#events = events
    this.#threshold = tuning?.threshold ?? 5

    this.#dropIndicator = el('div', 'oe-drop-indicator')
    this.#dropIndicator.style.display = 'none'
    rootEl.appendChild(this.#dropIndicator)

    this.#dragHandle.addEventListener('mousedown', this.#onMouseDown)
    // Capture-phase click: stop propagation to prevent BlockSettingsMenu
    // from closing the menu that was just opened by the mouseup callback
    this.#dragHandle.addEventListener('click', this.#onClick, true)
  }

  /**
   * Clean up.
   */
  destroy() {
    if (this.#isDragging && this.#draggingBlock) {
      this.#draggingBlock.element.classList.remove('oe-block--dragging')
      this.#draggingBlock = null
      this.#isDragging = false
      this.#dragHandle.style.cursor = ''
      document.body.style.cursor = ''
    }

    this.#dragHandle.removeEventListener('mousedown', this.#onMouseDown)
    this.#dragHandle.removeEventListener('click', this.#onClick, true)
    this.#dropIndicator.remove()
    document.removeEventListener('mousemove', this.#onMouseMove)
    document.removeEventListener('mouseup', this.#onMouseUp)
  }

  /**
   * Fallback: handle click when mousedown wasn't fired.
   * Skipped if mousedown already handled the interaction.
   * @param {MouseEvent} e
   */
  #onClick = (e) => {
    // Always stop propagation on the drag handle click
    // to prevent BlockSettingsMenu from closing a just-opened menu
    e.stopPropagation()
    if (this.#mouseDownHandled) {
      this.#mouseDownHandled = false
    }
  }

  /**
   * @param {MouseEvent} e
   */
  #onMouseDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    this.#mouseDownHandled = true
    this.#startX = e.clientX
    this.#startY = e.clientY
    this.#isDragging = false

    document.addEventListener('mousemove', this.#onMouseMove)
    document.addEventListener('mouseup', this.#onMouseUp)
  }

  /**
   * @param {MouseEvent} e
   */
  #onMouseMove = (e) => {
    if (!this.#isDragging) {
      const dx = Math.abs(e.clientX - this.#startX)
      const dy = Math.abs(e.clientY - this.#startY)
      if (dx + dy < this.#threshold) return

      // Threshold exceeded — start drag (only if more than 1 block)
      if (this.#blocks.getBlockCount() <= 1) return
      this.#isDragging = true
      this.#startDrag()
    }

    this.#updateDragPosition(e)
  }

  /**
   * @param {MouseEvent} _e
   */
  #onMouseUp = (_e) => {
    document.removeEventListener('mousemove', this.#onMouseMove)
    document.removeEventListener('mouseup', this.#onMouseUp)

    if (this.#isDragging) {
      this.#endDrag()
    } else {
      // No drag — the mousedown was just a click on the handle.
      // Announce via event bus so Toolbar (or any listener) can open its menu.
      this.#events.emit(EditorEvent.DRAG_HANDLE_CLICKED)
    }

    this.#isDragging = false
  }

  #startDrag() {
    const block = this.#blocks.getCurrentBlock()
    if (!block) return

    this.#draggingBlock = block
    block.element.classList.add('oe-block--dragging')
    this.#dragHandle.style.cursor = 'grabbing'
    document.body.style.cursor = 'grabbing'
  }

  /**
   * @param {MouseEvent} e
   */
  #updateDragPosition(e) {
    if (!this.#draggingBlock) return

    const editorRect = this.#rootEl.getBoundingClientRect()
    const children = []
    for (let index = 0; index < this.#blocks.getBlockCount(); index++) {
      const block = this.#blocks.getBlockByIndex(index)
      if (block) children.push(block.element)
    }

    let closestIndex = children.length
    let closestDist = Infinity

    for (let i = 0; i < children.length; i++) {
      const child = /** @type {HTMLElement} */ (children[i])
      const rect = child.getBoundingClientRect()
      const midY = rect.top + rect.height / 2

      const dist = Math.abs(e.clientY - midY)
      if (dist < closestDist) {
        closestDist = dist
        closestIndex = e.clientY < midY ? i : i + 1
      }
    }

    this.#dropIndex = closestIndex

    this.#dropIndicator.style.display = ''

    if (closestIndex < children.length) {
      const refRect = /** @type {HTMLElement} */ (children[closestIndex]).getBoundingClientRect()
      this.#dropIndicator.style.top = `${refRect.top - editorRect.top - 2}px`
    } else if (children.length > 0) {
      const lastRect = /** @type {HTMLElement} */ (children[children.length - 1]).getBoundingClientRect()
      this.#dropIndicator.style.top = `${lastRect.bottom - editorRect.top + 2}px`
    }
  }

  #endDrag() {
    this.#dropIndicator.style.display = 'none'
    this.#dragHandle.style.cursor = ''
    document.body.style.cursor = ''

    if (this.#draggingBlock) {
      this.#draggingBlock.element.classList.remove('oe-block--dragging')

      const fromIndex = this.#blocks.getBlockIndex(this.#draggingBlock.id)
      const toIndex = this.#dropIndex

      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex && toIndex !== fromIndex + 1) {
        this.#blocks.move(fromIndex, toIndex)
      }

      this.#draggingBlock = null
      this.#dropIndex = -1
    }
  }
}
