import { makeActionBtn as _makeActionBtn, makeSep as _makeSep } from '../shared/actionBar.js'
import { CSS } from './css.js'
import {
  ICON_ADD_IMAGE, ICON_BACK, ICON_CHEVRON_RIGHT, ICON_SETTINGS, ICON_TRASH,
  ICON_UPLOAD, ICON_URL,
} from './icons.js'
import {
  ALL_LAYOUTS, MAX_VISIBLE, classifyOrientation, getSlotsCount,
  pickInitialAutoTemplate, selectAutoTemplate,
} from './layout.js'
import { applyGalleryStyles } from './styles.js'
import { buildSettingsPanel } from './settings.js'
import {
  attachExternalDrop, createEmptySlot, createFilledSlot, createOverflowItem,
} from './slot.js'

/**
 * @typedef {Object} FilledViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} syncCaptions
 * @property {() => import('./state.js').GalleryState | undefined} getState
 * @property {() => void} reRender
 * @property {() => void} renderEmpty
 * @property {() => void} notifyChanged
 * @property {(files: File[]) => void} onFilesDropped
 * @property {() => void} onTriggerFileInput
 * @property {() => void} onPromptUrl
 * @property {() => void} onDeleteAll
 * @property {Array<{ icon: string, label: string, handler: () => Promise<Array<{url: string, alt?: string}> | null> }>} customActions
 * @property {(handler: () => Promise<Array<{url: string, alt?: string}> | null>) => Promise<void>} runCustomAction
 */

/**
 * Render the filled-state Gallery view: template grid (or masonry) +
 * optional overflow row + action bar.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {FilledViewDeps} deps
 */
export function renderFilledView(wrapper, state, deps) {
  state.resetTransient()
  wrapper.innerHTML = ''
  wrapper.classList.add(CSS.filled)

  const signal = /** @type {AbortController} */ (state.abortController).signal

  if (state.data.layout === 'masonry') {
    renderMasonry(wrapper, state, deps, signal)
  } else {
    renderSlotBased(wrapper, state, deps, signal)
  }

  applyGalleryStyles(wrapper, state)
  wrapper.appendChild(renderActions(wrapper, state, deps, signal))
}

/**
 * Masonry: flat grid, all images visible.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 */
function renderMasonry(wrapper, state, deps, signal) {
  const grid = document.createElement('div')
  grid.className = `${CSS.grid} eg--masonry`

  const slotDeps = makeSlotDeps(deps)

  state.data.images.forEach((img, i) => {
    const slot = createFilledSlot(img, i, signal, slotDeps)
    slot.dataset.index = String(i)
    grid.appendChild(slot)
  })

  attachExternalDrop(grid, signal, deps.onFilesDropped)
  wrapper.appendChild(grid)
}

/**
 * Slot-based: fixed template + optional overflow row.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 */
function renderSlotBased(wrapper, state, deps, signal) {
  const layout = state.data.layout
  const images = state.data.images
  const isAuto = layout === 'auto'

  const slotCount = isAuto
    ? Math.min(images.length, MAX_VISIBLE)
    : getSlotsCount(layout)
  const slotImages = images.slice(0, slotCount)
  const overflowImages = images.slice(slotCount)

  const templateName = isAuto ? pickInitialAutoTemplate(slotCount) : layout
  const grid = document.createElement('div')
  grid.className = `${CSS.grid} eg--${templateName}`

  const slotDeps = makeSlotDeps(deps)

  // Auto + 3+ images: refine template after we know orientations.
  if (isAuto && slotCount > 2) {
    const orientations = new Array(slotCount)
    let loadedCount = 0

    const onAllLoaded = () => {
      for (const cls of [...grid.classList]) {
        if (cls.startsWith('eg--')) grid.classList.remove(cls)
      }
      grid.classList.add(`eg--${selectAutoTemplate(slotCount, orientations)}`)
    }

    for (let idx = 0; idx < slotCount; idx++) {
      const img = slotImages[idx]
      if (!img) continue

      const slot = createFilledSlot(img, idx, signal, slotDeps)
      slot.dataset.slot = String(idx)

      const imgEl = /** @type {HTMLImageElement | null} */ (slot.querySelector(`.${CSS.slotImg}`))
      if (imgEl) {
        const onReady = () => {
          orientations[idx] = classifyOrientation(imgEl.naturalWidth, imgEl.naturalHeight)
          loadedCount++
          if (loadedCount >= slotCount) onAllLoaded()
        }
        imgEl.addEventListener('load', onReady, { once: true, signal })
        imgEl.addEventListener('error', onReady, { once: true, signal })
      }
      grid.appendChild(slot)
    }
  } else {
    // Fixed layout — render filled + empty placeholders.
    for (let idx = 0; idx < slotCount; idx++) {
      const img = slotImages[idx]
      if (img) {
        const slot = createFilledSlot(img, idx, signal, slotDeps)
        slot.dataset.slot = String(idx)
        grid.appendChild(slot)
      } else {
        grid.appendChild(createEmptySlot(idx, slotDeps))
      }
    }
  }

  attachExternalDrop(grid, signal, deps.onFilesDropped)
  wrapper.appendChild(grid)

  if (overflowImages.length > 0) {
    const overflow = document.createElement('div')
    overflow.className = CSS.overflow

    overflowImages.forEach((img, oi) => {
      const globalIdx = slotCount + oi
      overflow.appendChild(createOverflowItem(img, globalIdx, signal, slotDeps))
    })

    attachExternalDrop(overflow, signal, deps.onFilesDropped)
    wrapper.appendChild(overflow)
  }
}

/**
 * Build the deps object for slot/overflow builders.
 * Centralizes the bridge from filled-view-level callbacks to slot-level needs.
 *
 * @param {FilledViewDeps} deps
 * @returns {import('./slot.js').SlotDeps}
 */
function makeSlotDeps(deps) {
  return {
    t: deps.t,
    syncCaptions: deps.syncCaptions,
    getState: deps.getState,
    onRemoveImage: (index) => {
      const state = deps.getState()
      if (!state) return
      state.data.images.splice(index, 1)
      if (state.data.images.length === 0) deps.renderEmpty()
      else deps.reRender()
      deps.notifyChanged()
    },
    onSwapImages: (from, to) => {
      const state = deps.getState()
      if (!state) return
      const tmp = state.data.images[from]
      state.data.images[from] = /** @type {any} */ (state.data.images[to])
      state.data.images[to] = /** @type {any} */ (tmp)
      deps.reRender()
      deps.notifyChanged()
    },
  }
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 */
function renderActions(wrapper, state, deps, signal) {
  const actions = document.createElement('div')
  actions.className = CSS.actions

  const settingsDeps = {
    t: deps.t,
    syncCaptions: deps.syncCaptions,
    reRender: deps.reRender,
    notifyChanged: deps.notifyChanged,
  }

  // Settings dropdown
  const dropdown = document.createElement('div')
  dropdown.className = CSS.dropdown

  const settingsBtn = document.createElement('button')
  settingsBtn.type = 'button'
  settingsBtn.className = CSS.actionBtn
  settingsBtn.innerHTML = `${ICON_SETTINGS} ${deps.t('settings', 'Settings')}`

  const panel = buildSettingsPanel(wrapper, state, settingsDeps)

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    dropdown.classList.toggle(CSS.dropdownOpen)
  }, { signal })

  dropdown.append(settingsBtn, panel)

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(/** @type {Node} */ (e.target))) {
      dropdown.classList.remove(CSS.dropdownOpen)
    }
  }, { signal })

  // Main view container (for drill-down hide/show)
  const mainView = document.createElement('div')
  mainView.className = CSS.actionsView
  mainView.style.display = 'contents'

  mainView.appendChild(dropdown)
  mainView.appendChild(makeSep())

  // Add (drill-down)
  const addBtn = makeActionBtn(
    `${ICON_ADD_IMAGE} ${deps.t('addMore', 'Add')} ${ICON_CHEVRON_RIGHT}`,
    () => showAddView(actions, mainView, deps, signal),
    signal,
  )
  addBtn.querySelector('svg:last-child')?.classList.add(CSS.actionChevron)
  mainView.appendChild(addBtn)

  mainView.appendChild(makeSep())

  // Delete all
  const deleteAllBtn = document.createElement('button')
  deleteAllBtn.type = 'button'
  deleteAllBtn.className = `${CSS.actionBtn} ${CSS.actionBtnDanger}`
  deleteAllBtn.innerHTML = ICON_TRASH
  deleteAllBtn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
  deleteAllBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    deps.onDeleteAll()
  }, { signal })
  mainView.appendChild(deleteAllBtn)

  actions.appendChild(mainView)
  return actions
}

/**
 * @param {HTMLElement} actions
 * @param {HTMLElement} mainView
 * @param {FilledViewDeps} deps
 * @param {AbortSignal} signal
 */
function showAddView(actions, mainView, deps, signal) {
  mainView.style.display = 'none'

  const view = document.createElement('div')
  view.className = CSS.actionsView
  view.style.display = 'contents'

  const restore = () => { view.remove(); mainView.style.display = 'contents' }

  view.appendChild(makeActionBtn(
    `${ICON_BACK} ${deps.t('block.back', 'Back')}`,
    restore,
    signal,
  ))
  view.appendChild(makeSep())

  view.appendChild(makeActionBtn(
    `${ICON_UPLOAD} ${deps.t('upload', 'Upload')}`,
    () => { deps.onTriggerFileInput(); restore() },
    signal,
  ))

  for (const action of deps.customActions) {
    view.appendChild(makeActionBtn(
      `${action.icon} ${action.label}`,
      async () => { await deps.runCustomAction(action.handler); restore() },
      signal,
    ))
  }

  view.appendChild(makeActionBtn(
    `${ICON_URL} URL`,
    () => { deps.onPromptUrl(); restore() },
    signal,
  ))

  actions.appendChild(view)
}

/** @param {string} innerHTML @param {() => void} handler @param {AbortSignal} signal */
function makeActionBtn(innerHTML, handler, signal) {
  return _makeActionBtn(CSS.actionBtn, innerHTML, handler, signal)
}

/** @returns {HTMLDivElement} */
function makeSep() {
  return _makeSep(CSS.actionsSep)
}
