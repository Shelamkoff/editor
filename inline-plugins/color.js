import { ColorPicker, colorPickerStylesUrl } from '@shelamkoff/color-picker'
import { injectStyleUrls } from '../core/StyleInjector.js'
import { generateInlineId } from '../shared/inlineMarshal.js'
import { normalizeTextValue } from '../shared/textFormat.js'

/**
 * Color swatch inline plugin.
 * Renders as an atomic inline widget: ● #066fd1
 * Click opens a full color picker popup.
 *
 * @returns {import('../types').InlinePlugin}
 */
export function createColorSwatchPlugin() {
  /** @type {import('../core/types').IScopedI18n | null} */
  let i18n = null
  /** @type {{ destroy(): void } | null} */
  let styleHandle = null

  return {
    type: 'color',
    get title() { return i18n?.has('title') ? i18n.t('title') : 'Color' },
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 0 1 0-18c4.97 0 9 3.582 9 8c0 1.06-.474 2.078-1.318 2.828S17.938 15 16.5 15H14a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21"/><circle cx="7.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="12" cy="7.5" r=".5" fill="currentColor"/><circle cx="16.5" cy="10.5" r=".5" fill="currentColor"/></svg>',
    /** @param {import('../core/types').IScopedI18n} _i18n */
    setI18n(_i18n) { i18n = _i18n },
    mount() {
      if (styleHandle) throw new Error('Color swatch plugin is already mounted')
      styleHandle = injectStyleUrls([colorPickerStylesUrl])
    },
    pasteConfig: {
      patterns: [
        /^#[0-9a-fA-F]{3}$/,
        /^#[0-9a-fA-F]{6}$/,
        /^#[0-9a-fA-F]{8}$/,
        /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
        /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/,
        /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/,
        /^hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*[\d.]+\s*\)$/,
      ],
    },
    onPatternMatch(match) {
      return { value: match }
    },

    createWidget(data, id) {
      const value = normalizeTextValue(data.value).trim() || '#4357b4'

      const span = document.createElement('span')
      span.contentEditable = 'false'
      span.setAttribute('data-inline-plugin', 'color')
      span.setAttribute('data-id', id || generateInlineId())
      span.setAttribute('data-value', value)
      span.className = 'oe-ip oe-ip--color'

      const dot = document.createElement('span')
      dot.className = 'oe-ip__dot'
      dot.style.backgroundColor = value

      const label = document.createElement('span')
      label.className = 'oe-ip__label'
      label.textContent = value

      span.appendChild(dot)
      span.appendChild(label)

      return span
    },

    hydrate(element, ctx) {
      element.addEventListener('click', (e) => {
        if (ctx.readOnly) return
        e.preventDefault()
        e.stopPropagation()
        openColorPicker(element, ctx)
      })
    },

    getData(element) {
      return {
        value: element.dataset.value || '#000000',
      }
    },

    destroy() {
      styleHandle?.destroy()
      styleHandle = null
    },
  }
}

/**
 * Normalize any color value to a 6-digit hex string.
 * @param {string} value
 * @returns {string}
 */
function normalizeToHex6(value) {
  // Short hex: #rgb → #rrggbb
  const m3 = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (m3) return '#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]

  // 8-digit hex: strip alpha
  const m8 = value.match(/^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/)
  if (m8) return '#' + m8[1]

  // Already 6-digit hex
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value

  // Non-hex (rgb, hsl, etc.) — convert via DOM
  const temp = document.createElement('span')
  temp.style.color = value
  document.body.appendChild(temp)
  const computed = getComputedStyle(temp).color
  temp.remove()
  const m = computed.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')

  return '#000000'
}

/**
 * @param {HTMLElement} widget
 * @param {import('../types').InlinePluginContext} ctx
 */
function openColorPicker(widget, ctx) {
  const current = normalizeToHex6(widget.dataset.value || '#000000')
  const originalLabel = widget.querySelector('.oe-ip__label')?.textContent ?? current
  let committed = false

  const picker = new ColorPicker({
    onApply(cssColor) {
      const next = normalizeToHex6(cssColor)
      restoreWidget(widget, current, originalLabel)
      ctx.mutate(widget, () => updateWidget(widget, next))
      committed = true
      ctx.hidePopup()
    },
    onChange(cssColor) {
      updateWidget(widget, normalizeToHex6(cssColor))
    },
    onFormatChange(formatted) {
      updateWidgetLabel(widget, formatted)
    },
    showRemove: false,
  })

  const popupContent = picker.element
  // Position picker as static inside popup (popup handles positioning)
  popupContent.style.display = ''
  popupContent.style.position = 'static'
  popupContent.style.transform = 'none'

  picker.open(current, 1)

  ctx.showPopup(widget, popupContent, () => {
    if (!committed) restoreWidget(widget, current, originalLabel)
    picker.destroy()
  })
}

/**
 * @param {HTMLElement} widget
 * @param {string} value
 */
function updateWidget(widget, value) {
  widget.dataset.value = value

  const dot = /** @type {HTMLElement | null} */ (widget.querySelector('.oe-ip__dot'))
  if (dot) dot.style.backgroundColor = value

  const label = widget.querySelector('.oe-ip__label')
  if (label) label.textContent = value

}

/**
 * Restore both the stored color and the human-readable label.
 *
 * @param {HTMLElement} widget
 * @param {string} value
 * @param {string} label
 * @returns {void}
 */
function restoreWidget(widget, value, label) {
  updateWidget(widget, value)
  const labelElement = widget.querySelector('.oe-ip__label')
  if (labelElement) labelElement.textContent = label
}

/**
 * Update only the label text (e.g. when format changes in picker).
 * @param {HTMLElement} widget
 * @param {string} formatted
 */
function updateWidgetLabel(widget, formatted) {
  const label = widget.querySelector('.oe-ip__label')
  if (label) label.textContent = formatted
}
