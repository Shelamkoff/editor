import { CSS } from './css.js'

/**
 * @typedef {Object} SlotDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {(index: number) => void} onRemoveImage
 * @property {(from: number, to: number) => void} onSwapImages
 * @property {() => void} syncCaptions
 *   Called before any structural mutation that re-renders — flushes
 *   in-flight contenteditable text into `state.data`.
 * @property {() => import('./state.js').GalleryState | undefined} getState
 *   Indirect access used by drag handlers, since they need the live
 *   `dragIndex` field on state.
 */

/**
 * Build a filled slot with image, caption, remove button, and drag.
 * `index` is the global image index.
 *
 * @param {{ url: string, caption: string }} img
 * @param {number} index
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createFilledSlot(img, index, signal, deps) {
  const slot = document.createElement('div')
  slot.className = `${CSS.slot} ${CSS.slotFilled}`
  slot.dataset.index = String(index)
  slot.draggable = true

  const image = document.createElement('img')
  image.className = CSS.slotImg
  image.src = img.url
  image.alt = img.caption || ''
  image.draggable = false
  image.loading = 'lazy'
  slot.appendChild(image)

  addCaption(
    slot,
    img,
    () => parseInt(slot.dataset.index || slot.dataset.slot || '0', 10),
    signal,
    deps,
  )

  addRemoveBtn(slot, () => {
    const i = parseInt(slot.dataset.index || slot.dataset.slot || '0', 10)
    deps.syncCaptions()
    deps.onRemoveImage(i)
  }, signal)

  attachSlotDrag(slot, index, signal, deps)
  return slot
}

/**
 * @param {number} slotIndex
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createEmptySlot(slotIndex, deps) {
  const slot = document.createElement('div')
  slot.className = `${CSS.slot} ${CSS.slotEmpty}`
  slot.dataset.slot = String(slotIndex)

  const ph = document.createElement('div')
  ph.className = CSS.slotPlaceholder
  ph.textContent = `${deps.t('slot', 'Slot')} ${slotIndex + 1}`
  slot.appendChild(ph)

  return slot
}

/**
 * @param {{ url: string, caption: string }} img
 * @param {number} globalIndex
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 * @returns {HTMLDivElement}
 */
export function createOverflowItem(img, globalIndex, signal, deps) {
  const item = document.createElement('div')
  item.className = CSS.overflowItem
  item.dataset.index = String(globalIndex)
  item.draggable = true

  const imgEl = document.createElement('img')
  imgEl.className = CSS.slotImg
  imgEl.src = img.url
  imgEl.alt = img.caption || ''
  imgEl.loading = 'lazy'
  imgEl.draggable = false
  item.appendChild(imgEl)

  addRemoveBtn(item, () => {
    deps.syncCaptions()
    deps.onRemoveImage(globalIndex)
  }, signal)

  attachSlotDrag(item, globalIndex, signal, deps)
  return item
}

/**
 * Attach external (file from OS) drop to a container.
 *
 * @param {HTMLElement} el
 * @param {AbortSignal} signal
 * @param {(files: File[]) => void} onFiles
 */
export function attachExternalDrop(el, signal, onFiles) {
  el.addEventListener('dragover', (e) => { e.preventDefault() }, { signal })
  el.addEventListener('drop', (e) => {
    e.preventDefault()
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) onFiles(files)
  }, { signal })
}

// ── internal helpers ────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} parent
 * @param {{ url: string, caption: string }} image
 * @param {() => number} getIndex
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 */
function addCaption(parent, image, getIndex, signal, deps) {
  const captionEl = document.createElement('div')
  captionEl.className = CSS.slotCaption
  captionEl.contentEditable = 'true'
  captionEl.dataset.placeholder = deps.t('caption', 'Caption')

  const isEmpty = !image.caption?.trim()
  if (isEmpty) {
    captionEl.setAttribute('data-empty', 'true')
  } else {
    captionEl.textContent = image.caption
  }

  captionEl.addEventListener('input', () => {
    const state = deps.getState()
    if (!state) return
    const idx = getIndex()
    if (state.data.images[idx]) {
      const text = captionEl.textContent?.trim()
      state.data.images[idx].caption = text || ''
    }
    captionEl.textContent?.trim()
      ? captionEl.removeAttribute('data-empty')
      : captionEl.setAttribute('data-empty', 'true')
  }, { signal })
  captionEl.addEventListener('focus', () => captionEl.removeAttribute('data-empty'), { signal })
  captionEl.addEventListener('blur', () => {
    if (!captionEl.textContent?.trim()) {
      captionEl.textContent = ''
      captionEl.setAttribute('data-empty', 'true')
    }
  }, { signal })
  captionEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); captionEl.blur(); return }
    if (e.key === 'Backspace' && !captionEl.textContent?.trim()) {
      e.preventDefault(); e.stopPropagation(); return
    }
    // Let modifier combos (Ctrl+Z, Ctrl+A, etc.) bubble to ShortcutRegistry
    if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
  }, { signal })

  parent.appendChild(captionEl)
}

/**
 * @param {HTMLElement} parent
 * @param {() => void} onRemove
 * @param {AbortSignal} signal
 */
function addRemoveBtn(parent, onRemove, signal) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = CSS.slotRemove
  btn.innerHTML = '&times;'
  btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
  btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove() }, { signal })
  parent.appendChild(btn)
}

/**
 * @param {HTMLElement} el
 * @param {number} index
 * @param {AbortSignal} signal
 * @param {SlotDeps} deps
 */
function attachSlotDrag(el, index, signal, deps) {
  const captionEl = el.querySelector(`.${CSS.slotCaption}`)

  el.addEventListener('dragstart', (e) => {
    if (document.activeElement === captionEl) { e.preventDefault(); return }
    const state = deps.getState()
    if (state) state.dragIndex = index
    el.classList.add(CSS.itemDragging)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    }
  }, { signal })

  el.addEventListener('dragend', () => {
    el.classList.remove(CSS.itemDragging)
    const state = deps.getState()
    if (state) state.dragIndex = -1
    document
      .querySelectorAll(`.${CSS.slotOver}, .${CSS.overflowItemOver}`)
      .forEach((n) => n.classList.remove(CSS.slotOver, CSS.overflowItemOver))
  }, { signal })

  el.addEventListener('dragover', (e) => {
    e.preventDefault()
    const state = deps.getState()
    if (!state || state.dragIndex === -1 || state.dragIndex === index) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    el.classList.add(el.classList.contains(CSS.overflowItem) ? CSS.overflowItemOver : CSS.slotOver)
  }, { signal })

  el.addEventListener('dragleave', () => {
    el.classList.remove(CSS.slotOver, CSS.overflowItemOver)
  }, { signal })

  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove(CSS.slotOver, CSS.overflowItemOver)
    const state = deps.getState()
    if (!state || state.dragIndex === -1 || state.dragIndex === index) return
    deps.syncCaptions()
    deps.onSwapImages(state.dragIndex, index)
    state.dragIndex = -1
  }, { signal })
}
