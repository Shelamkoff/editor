import { CSS } from './css.js'
import { CHEVRON_DOWN, CHECK_ICON } from './icons.js'
import { refreshInlineStyles } from './styles.js'

/**
 * @typedef {Object} SettingsDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {(operation: () => void) => void} mutate
 */

/**
 * Build the settings dropdown panel: a styled form with width/height,
 * object fit/position, expand toggle, background toggle/color, and border.
 *
 * Mutations write directly into `state.data.styles` (or `state.data.expanded`
 * etc.) inside the core-owned mutation boundary so undo/save see each
 * control action immediately.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
export function buildSettingsPanel(wrapper, state, deps) {
  const panel = document.createElement('div')
  panel.className = CSS.dropdownPanel
  panel.addEventListener('click', (e) => e.stopPropagation())
  panel.appendChild(buildStyleForm(wrapper, state, deps))
  return panel
}

/**
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
 * @param {SettingsDeps} deps
 * @returns {HTMLElement}
 */
function buildStyleForm(wrapper, state, deps) {
  const styles = state.data.styles ||= {}
  const signal = /** @type {AbortController} */ (state.abortController).signal
  /** @type {Set<() => void>} */
  const closeSelects = new Set()

  const form = document.createElement('div')
  form.className = CSS.styleForm
  form.addEventListener('click', (e) => e.stopPropagation())

  const onStyleChange = (/** @type {string} */ key, /** @type {string} */ value) => {
    deps.mutate(() => {
      if (value) styles[key] = value
      else delete styles[key]
      refreshInlineStyles(wrapper, state)
    })
  }

  const makeInput = (/** @type {string} */ key, /** @type {string | undefined} */ value) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = CSS.styleInput
    input.value = value || ''
    input.addEventListener('input', () => onStyleChange(key, input.value))
    return input
  }

  const makeColor = (/** @type {string} */ key, /** @type {string | undefined} */ value) => {
    const input = document.createElement('input')
    input.type = 'color'
    input.className = CSS.styleColor
    input.value = value || '#000000'
    input.addEventListener('input', () => onStyleChange(key, input.value))
    return input
  }

  const makeSelect = (/** @type {string} */ key, /** @type {string[]} */ options, /** @type {string | undefined} */ value) => {
    const selectWrapper = document.createElement('div')
    selectWrapper.className = CSS.customSelect

    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = CSS.customSelectTrigger

    const triggerText = document.createElement('span')
    const optionLabel = (/** @type {string} */ option) => deps.t(`value.${option || 'none'}`, option || 'None')
    triggerText.textContent = optionLabel(value || 'none')

    const arrow = document.createElement('span')
    arrow.className = CSS.customSelectArrow
    arrow.innerHTML = CHEVRON_DOWN

    trigger.append(triggerText, arrow)

    const optionsList = document.createElement('div')
    optionsList.className = CSS.customSelectOptions
    optionsList.setAttribute('role', 'listbox')
    trigger.setAttribute('aria-haspopup', 'listbox')
    trigger.setAttribute('aria-expanded', 'false')

    let currentValue = value || ''
    let isOpen = false

    const closeSelect = () => {
      isOpen = false
      selectWrapper.classList.remove(CSS.customSelectOpen)
      trigger.setAttribute('aria-expanded', 'false')
    }
    const openSelect = () => {
      for (const close of closeSelects) {
        if (close !== closeSelect) close()
      }
      isOpen = true
      selectWrapper.classList.add(CSS.customSelectOpen)
      trigger.setAttribute('aria-expanded', 'true')
    }
    closeSelects.add(closeSelect)

    const renderOptions = () => {
      optionsList.innerHTML = ''
      for (const opt of options) {
        const optEl = document.createElement('button')
        optEl.type = 'button'
        optEl.className = CSS.customSelectOption
        const isSelected = opt === currentValue
        if (isSelected) optEl.classList.add(CSS.customSelectOptionSelected)
        optEl.setAttribute('role', 'option')
        optEl.setAttribute('aria-selected', String(isSelected))

        const textSpan = document.createElement('span')
        textSpan.textContent = optionLabel(opt)
        optEl.appendChild(textSpan)

        if (isSelected) {
          const checkSpan = document.createElement('span')
          checkSpan.className = CSS.customSelectCheck
          checkSpan.innerHTML = CHECK_ICON
          optEl.appendChild(checkSpan)
        }

        const selectOption = () => {
          currentValue = opt
          triggerText.textContent = optionLabel(opt)
          onStyleChange(key, opt)
          closeSelect()
          renderOptions()
          trigger.focus()
        }
        optEl.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        optEl.addEventListener('click', selectOption)
        optEl.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeSelect()
            trigger.focus()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const siblings = [...optionsList.querySelectorAll('button')]
            const current = siblings.indexOf(optEl)
            const direction = event.key === 'ArrowDown' ? 1 : -1
            siblings[(current + direction + siblings.length) % siblings.length]?.focus()
          }
        })
        optionsList.appendChild(optEl)
      }
    }
    renderOptions()

    trigger.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      isOpen ? closeSelect() : openSelect()
    })
    trigger.addEventListener('keydown', (event) => {
      if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      if (!isOpen) openSelect()
      optionsList.querySelector('button')?.focus()
    })

    document.addEventListener('mousedown', (e) => {
      if (isOpen && !selectWrapper.contains(/** @type {Node} */ (e.target))) {
        closeSelect()
      }
    }, { signal })

    selectWrapper.append(trigger, optionsList)
    return selectWrapper
  }

  const makeRow = (/** @type {[string, HTMLElement][]} */ ...items) => {
    const row = document.createElement('div')
    row.className = CSS.styleRow
    for (const [labelText, input] of items) {
      const label = document.createElement('label')
      label.className = CSS.styleLabel
      const span = document.createElement('span')
      span.textContent = labelText
      label.append(span, input)
      row.appendChild(label)
    }
    return row
  }

  const makeGroup = (/** @type {string} */ title, /** @type {HTMLElement[]} */ ...rows) => {
    const group = document.createElement('div')
    group.className = CSS.styleGroup
    const titleEl = document.createElement('div')
    titleEl.className = CSS.styleGroupTitle
    titleEl.textContent = title
    group.append(titleEl, ...rows)
    return group
  }

  // ── Form content ──

  const widthInput = makeInput('width', styles.width)
  const minWidthInput = makeInput('minWidth', styles.minWidth)
  const maxWidthInput = makeInput('maxWidth', styles.maxWidth)

  // Expanded switch (only for landscape images)
  if (isLandscape(wrapper)) {
    const expandLabel = deps.t('expand', 'Expand')
    const expRow = document.createElement('div')
    expRow.className = CSS.switchRow

    const expLabel = document.createElement('span')
    expLabel.className = CSS.switchLabel
    expLabel.textContent = expandLabel

    const expSwitch = document.createElement('button')
    expSwitch.type = 'button'
    expSwitch.className = `${CSS.switch}${state.data.expanded ? ` ${CSS.switchActive}` : ''}`
    expSwitch.setAttribute('aria-label', expandLabel)
    expSwitch.setAttribute('aria-pressed', String(state.data.expanded))
    expSwitch.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
    expSwitch.addEventListener('click', () => {
      deps.mutate(() => {
        state.data.expanded = !state.data.expanded
        wrapper.classList.toggle(CSS.expanded, state.data.expanded)
        expSwitch.classList.toggle(CSS.switchActive, state.data.expanded)
        expSwitch.setAttribute('aria-pressed', String(state.data.expanded))
        widthInput.disabled = state.data.expanded
        minWidthInput.disabled = state.data.expanded
        maxWidthInput.disabled = state.data.expanded
        refreshInlineStyles(wrapper, state)
      })
    }, { signal })

    expRow.append(expLabel, expSwitch)
    form.appendChild(expRow)
  }

  if (state.data.expanded) {
    widthInput.disabled = true
    minWidthInput.disabled = true
    maxWidthInput.disabled = true
  }

  form.appendChild(makeGroup(deps.t('dimensions', 'Dimensions'),
    makeRow([deps.t('widthShort', 'W'), widthInput], [deps.t('heightShort', 'H'), makeInput('height', styles.height)]),
    makeRow([deps.t('minWidth', 'Min W'), minWidthInput], [deps.t('minHeight', 'Min H'), makeInput('minHeight', styles.minHeight)]),
    makeRow([deps.t('maxWidth', 'Max W'), maxWidthInput], [deps.t('maxHeight', 'Max H'), makeInput('maxHeight', styles.maxHeight)]),
  ))

  form.appendChild(makeGroup(deps.t('display', 'Display'),
    makeRow([deps.t('fit', 'Fit'), makeSelect('objectFit', ['none', 'cover', 'contain', 'fill', 'scale-down'], styles.objectFit)]),
    makeRow([deps.t('position', 'Position'), makeInput('objectPosition', styles.objectPosition)]),
  ))

  // Background switch
  const bgLabel = deps.t('background', 'Background')
  const bgSwitchRow = document.createElement('div')
  bgSwitchRow.className = CSS.switchRow

  const bgLabelEl = document.createElement('span')
  bgLabelEl.className = CSS.switchLabel
  bgLabelEl.textContent = bgLabel

  const bgSwitch = document.createElement('button')
  bgSwitch.type = 'button'
  bgSwitch.className = `${CSS.switch}${state.data.withBackground ? ` ${CSS.switchActive}` : ''}`
  bgSwitch.setAttribute('aria-label', bgLabel)
  bgSwitch.setAttribute('aria-pressed', String(state.data.withBackground))
  bgSwitch.addEventListener('mousedown', (e) => e.preventDefault(), { signal })
  bgSwitch.addEventListener('click', () => {
    deps.mutate(() => {
      state.data.withBackground = !state.data.withBackground
      wrapper.classList.toggle(CSS.withBackground, state.data.withBackground)
      bgSwitch.classList.toggle(CSS.switchActive, state.data.withBackground)
      bgSwitch.setAttribute('aria-pressed', String(state.data.withBackground))
      bgColorRow.style.display = state.data.withBackground ? '' : 'none'
      refreshInlineStyles(wrapper, state)
    })
  }, { signal })

  bgSwitchRow.append(bgLabelEl, bgSwitch)
  form.appendChild(bgSwitchRow)

  const bgColorRow = makeRow([deps.t('color', 'Color'), makeColor('backgroundColor', styles.backgroundColor)])
  bgColorRow.style.display = state.data.withBackground ? '' : 'none'
  form.appendChild(bgColorRow)

  // Border section
  const borderGroup = document.createElement('div')
  borderGroup.className = CSS.styleGroup

  const borderStyleRow = makeRow([deps.t('border', 'Border'), makeSelect('borderStyle', ['none', 'solid', 'dashed'], styles.borderStyle)])
  borderGroup.appendChild(borderStyleRow)

  const hasBorder = styles.borderStyle && styles.borderStyle !== 'none'
  const borderColorRow = makeRow([deps.t('color', 'Color'), makeColor('borderColor', styles.borderColor)])
  borderColorRow.style.display = hasBorder ? '' : 'none'

  const borderWidthRow = makeRow([deps.t('width', 'Width'), makeInput('borderWidth', styles.borderWidth)])
  borderWidthRow.style.display = hasBorder ? '' : 'none'

  const borderRadiusRow = makeRow([deps.t('radius', 'Radius'), makeInput('borderRadius', styles.borderRadius)])

  borderGroup.append(borderColorRow, borderWidthRow, borderRadiusRow)
  form.appendChild(borderGroup)

  // Listen for borderStyle changes to show/hide color+width
  const borderSelectWrapper = borderStyleRow.querySelector(`.${CSS.customSelect}`)
  if (borderSelectWrapper) {
    state.borderObserver?.disconnect()
    state.borderObserver = new MutationObserver(() => {
      const val = state.data.styles?.borderStyle
      const show = val && val !== 'none'
      borderColorRow.style.display = show ? '' : 'none'
      borderWidthRow.style.display = show ? '' : 'none'
    })
    state.borderObserver.observe(borderSelectWrapper, { attributes: true, attributeFilter: ['class'] })
  }

  return form
}

/**
 * @param {HTMLElement} wrapper
 * @returns {boolean}
 */
function isLandscape(wrapper) {
  const img = /** @type {HTMLImageElement | null} */ (wrapper.querySelector(`.${CSS.image}`))
  if (!img) return false
  return img.naturalWidth > img.naturalHeight
}
