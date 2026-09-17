import { setTrustedHtml } from '../../core/sanitize.js'
import { CSS } from './css.js'
import { LAYOUT_ICONS } from './icons.js'
import { ALL_LAYOUTS } from './layout.js'
import { applyGalleryStyles } from './styles.js'

/**
 * @typedef {Object} SettingsDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} syncCaptions
 * @property {() => void} reRender   re-render the filled view (after layout change)
 * @property {(operation: () => void) => void} mutate
 */

/**
 * Build the settings dropdown panel: layout grid + lightbox options + styles.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
export function buildSettingsPanel(wrapper, state, deps) {
  const ownerDocument = wrapper.ownerDocument
  const signal = /** @type {AbortController} */ (state.abortController).signal

  const panel = ownerDocument.createElement('div')
  panel.className = CSS.dropdownPanel
  panel.addEventListener('click', (e) => e.stopPropagation())

  const form = ownerDocument.createElement('div')
  form.className = CSS.styleForm

  form.appendChild(buildLayoutGroup(wrapper, state, deps, signal, ownerDocument))
  form.appendChild(buildLightboxGroup(state, deps, signal, ownerDocument))
  form.appendChild(buildStylesGroup(wrapper, state, deps, signal, ownerDocument))

  panel.appendChild(form)
  return panel
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildLayoutGroup(wrapper, state, deps, signal, ownerDocument) {
  const group = createGroup(deps.t('layout', 'Layout'), ownerDocument)

  const grid = ownerDocument.createElement('div')
  grid.className = CSS.layoutGrid

  for (const layout of ALL_LAYOUTS) {
    const layoutLabel = layout === 'auto'
      ? deps.t('layoutAuto', 'Automatic layout')
      : layout === 'masonry'
        ? deps.t('layoutMasonry', 'Masonry layout')
        : layout === 'triptych'
          ? deps.t('layoutTriptych', 'Triptych layout')
          : `${deps.t('layoutTemplate', 'Layout template')} ${layout}`
    const btn = ownerDocument.createElement('button')
    btn.type = 'button'
    btn.className = `${CSS.layoutBtn}${state.data.layout === layout ? ` ${CSS.layoutBtnActive}` : ''}`
    setTrustedHtml(btn, LAYOUT_ICONS[layout] || '')
    btn.title = layoutLabel
    btn.setAttribute('aria-label', layoutLabel)
    btn.setAttribute('aria-pressed', String(state.data.layout === layout))
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', () => {
      deps.mutate(() => {
        deps.syncCaptions()
        state.data.layout = layout
        deps.reRender()
      })
    }, { signal })
    grid.appendChild(btn)
  }
  group.appendChild(grid)
  return group
}

/**
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildLightboxGroup(state, deps, signal, ownerDocument) {
  const opts = state.data.options
  const group = createGroup(deps.t('lightbox', 'Lightbox'), ownerDocument)

  const makeSwitch = (/** @type {string} */ label, /** @type {string} */ key, /** @type {boolean} */ defaultVal) => {
    const row = ownerDocument.createElement('div')
    row.className = CSS.switchRow
    const lbl = ownerDocument.createElement('span')
    lbl.className = CSS.switchLabel
    lbl.textContent = label
    const btn = ownerDocument.createElement('button')
    btn.type = 'button'
    btn.className = `${CSS.switch}${(opts[key] ?? defaultVal) ? ` ${CSS.switchActive}` : ''}`
    btn.setAttribute('aria-label', label)
    btn.setAttribute('aria-pressed', String(Boolean(opts[key] ?? defaultVal)))
    btn.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    btn.addEventListener('click', () => {
      deps.mutate(() => {
        opts[key] = !(opts[key] ?? defaultVal)
        btn.classList.toggle(CSS.switchActive)
        btn.setAttribute('aria-pressed', String(Boolean(opts[key])))
      })
    }, { signal })
    row.append(lbl, btn)
    return row
  }

  group.appendChild(makeSwitch(deps.t('optNavigation', 'Navigation'), 'navigation', true))
  group.appendChild(makeSwitch(deps.t('optLoop', 'Loop'), 'loop', true))
  group.appendChild(makeSwitch(deps.t('optZoom', 'Zoom'), 'zoom', true))
  group.appendChild(makeSwitch(deps.t('optCaptions', 'Captions'), 'captions', true))
  group.appendChild(makeSwitch(deps.t('optThumbnails', 'Thumbnails'), 'thumbnails', false))
  group.appendChild(makeSwitch(deps.t('optFullscreen', 'Fullscreen'), 'fullscreen', true))

  // Autoplay interval
  const autoplayRow = ownerDocument.createElement('div')
  autoplayRow.className = CSS.styleRow
  const autoplayLbl = ownerDocument.createElement('label')
  autoplayLbl.className = CSS.styleLabel
  const autoplaySpan = ownerDocument.createElement('span')
  autoplaySpan.textContent = deps.t('optAutoplay', 'Autoplay')
  const autoplayInput = ownerDocument.createElement('input')
  autoplayInput.type = 'text'
  autoplayInput.className = CSS.styleInput
  autoplayInput.placeholder = deps.t('autoplayDelayPlaceholder', 'ms (e.g. 3000)')
  autoplayInput.value = opts.autoplayInterval ? String(opts.autoplayInterval) : ''
  autoplayInput.addEventListener('input', () => {
    deps.mutate(() => {
      const val = parseInt(autoplayInput.value, 10)
      if (val > 0) opts.autoplayInterval = val
      else delete opts.autoplayInterval
    })
  }, { signal })
  autoplayLbl.append(autoplaySpan, autoplayInput)
  autoplayRow.appendChild(autoplayLbl)
  group.appendChild(autoplayRow)

  return group
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {SettingsDeps} deps
 * @param {AbortSignal} signal
 */
function buildStylesGroup(wrapper, state, deps, signal, ownerDocument) {
  const group = createGroup(deps.t('styles', 'Styles'), ownerDocument)
  const styles = state.data.styles

  const makeStyleInput = (/** @type {string} */ key, /** @type {string} */ value) => {
    const input = ownerDocument.createElement('input')
    input.type = 'text'
    input.className = CSS.styleInput
    input.value = value || ''
    input.addEventListener('input', () => {
      deps.mutate(() => {
        if (input.value) styles[key] = input.value
        else delete styles[key]
        applyGalleryStyles(wrapper, state)
      })
    }, { signal })
    if (key === 'gap') {
      input.addEventListener('change', () => {
        if (state.data.layout === 'masonry') deps.reRender()
      }, { signal })
    }
    return input
  }

  const makeRow = (/** @type {string} */ label, /** @type {HTMLElement} */ input) => {
    const row = ownerDocument.createElement('div')
    row.className = CSS.styleRow
    const lbl = ownerDocument.createElement('label')
    lbl.className = CSS.styleLabel
    const span = ownerDocument.createElement('span')
    span.textContent = label
    lbl.append(span, input)
    row.appendChild(lbl)
    return row
  }

  group.appendChild(makeRow(deps.t('styleGap', 'Gap'), makeStyleInput('gap', styles.gap)))
  group.appendChild(makeRow(deps.t('styleRadius', 'Radius'), makeStyleInput('borderRadius', styles.borderRadius)))
  group.appendChild(makeRow(deps.t('styleHeight', 'Height'), makeStyleInput('height', styles.height)))

  return group
}

/** @param {string} title @returns {HTMLElement} */
function createGroup(title, ownerDocument) {
  const group = ownerDocument.createElement('div')
  group.className = CSS.styleGroup
  const titleEl = ownerDocument.createElement('div')
  titleEl.className = CSS.styleGroupTitle
  titleEl.textContent = title
  group.appendChild(titleEl)
  return group
}
