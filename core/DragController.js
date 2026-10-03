// @ts-check

export class DragController {
  #runtime
  #view
  #handle
  #document
  #dragging = null
  #destroyed = false
  #threshold
  #onPointerDown

  constructor({ runtime, view, handle, threshold = 5 }) {
    if (!handle?.addEventListener) throw new TypeError('DragController requires a drag handle')
    if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError('Drag threshold must be a finite number greater than or equal to 0')
    this.#runtime = runtime
    this.#view = view
    this.#handle = handle
    this.#threshold = threshold
    this.#document = handle.ownerDocument

    this.#onPointerDown = event => {
      if (this.#runtime.readOnly || event.button !== 0) return
      const id = this.#view.currentId
      if (!id) return
      const element = this.#view.element(id)
      if (!element) return
      const startIndex = this.#view.indexOf(id)
      if (startIndex < 0) return

      const state = {
        id,
        element,
        startIndex,
        targetIndex: startIndex,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        suppressClick: false,
      }
      this.#dragging = state

      const move = moveEvent => {
        if (this.#dragging !== state) return
        const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY)
        if (!state.active && distance < this.#threshold) return
        if (!state.active) {
          state.active = true
          state.element.classList?.add('oe-block--dragging')
          this.#document.body?.classList?.add('oe-editor-dragging')
        }
        moveEvent.preventDefault()
        const blocks = this.#view.records()
        let targetIndex = blocks.length - 1
        for (let index = 0; index < blocks.length; index++) {
          const candidate = this.#view.element(blocks[index].id)
          if (!candidate || candidate === state.element) continue
          const rect = candidate.getBoundingClientRect()
          if (moveEvent.clientY < rect.top + rect.height / 2) {
            targetIndex = index
            break
          }
        }
        state.targetIndex = targetIndex
      }

      const finish = finishEvent => {
        this.#document.removeEventListener('pointermove', move, true)
        this.#document.removeEventListener('pointerup', finish, true)
        this.#document.removeEventListener('pointercancel', cancel, true)
        if (this.#dragging !== state) return
        this.#dragging = null
        state.element.classList?.remove('oe-block--dragging')
        this.#document.body?.classList?.remove('oe-editor-dragging')
        if (state.active) {
          finishEvent.preventDefault?.()
          state.suppressClick = true
          if (state.targetIndex !== state.startIndex) {
            this.#runtime.move(state.id, state.targetIndex)
            this.#view.reconcileInteraction()
            this.#view.setCurrent(state.id)
            queueMicrotask(() => this.#view.focus(state.id))
          }
          const swallow = clickEvent => {
            clickEvent.preventDefault()
            clickEvent.stopImmediatePropagation()
            this.#handle.removeEventListener('click', swallow, true)
          }
          this.#handle.addEventListener('click', swallow, true)
        }
      }

      const cancel = () => {
        this.#document.removeEventListener('pointermove', move, true)
        this.#document.removeEventListener('pointerup', finish, true)
        this.#document.removeEventListener('pointercancel', cancel, true)
        if (this.#dragging === state) this.#dragging = null
        state.element.classList?.remove('oe-block--dragging')
        this.#document.body?.classList?.remove('oe-editor-dragging')
      }

      this.#document.addEventListener('pointermove', move, true)
      this.#document.addEventListener('pointerup', finish, true)
      this.#document.addEventListener('pointercancel', cancel, true)
    }

    handle.addEventListener('pointerdown', this.#onPointerDown)
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#handle.removeEventListener('pointerdown', this.#onPointerDown)
    this.#dragging?.element?.classList?.remove('oe-block--dragging')
    this.#document.body?.classList?.remove('oe-editor-dragging')
    this.#dragging = null
  }
}
