import { ColorPicker, parseColorInput } from '@shelamkoff/color-picker'

/**
 * @typedef {{
 *   onApply?: (cssColor: string) => void,
 *   onRemove?: () => void,
 *   onChange?: (cssColor: string) => void,
 *   onFormatChange?: (formatted: string, format: string) => void,
 *   showRemove?: boolean,
 * }} OwnedColorPickerOptions
 */

/**
 * Create the full ColorPicker when its module realm owns the target document.
 * The 1.x picker builds its DOM through the module-global document, so a
 * renderer/editor mounted into another same-origin realm uses a native fallback
 * whose DOM, listeners, and AbortController belong to that target document.
 *
 * @param {Document} ownerDocument
 * @param {OwnedColorPickerOptions} [options]
 * @returns {{ element: HTMLElement, open(color: string, alpha?: number): void, close(): void, destroy(): void }}
 */
export function createOwnedColorPicker(ownerDocument, options = {}) {
  if (ownerDocument === globalThis.document) return new ColorPicker(/** @type {any} */ (options))
  return new NativeRealmColorPicker(ownerDocument, options)
}

class NativeRealmColorPicker {
  /** @param {Document} ownerDocument @param {OwnedColorPickerOptions} options */
  constructor(ownerDocument, options) {
    this.ownerDocument = ownerDocument
    this.options = options
    const view = ownerDocument.defaultView
    const AbortControllerCtor = view?.AbortController ?? AbortController
    this.controller = new AbortControllerCtor()
    this.alpha = 1
    this.hex = '#000000'

    const root = ownerDocument.createElement('div')
    root.className = 'oe-color-dropdown oe-color-dropdown--native-realm'
    root.style.display = 'none'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', 'Color picker')

    const preview = ownerDocument.createElement('span')
    preview.className = 'oe-color-preview'
    this.preview = preview

    const color = ownerDocument.createElement('input')
    color.type = 'color'
    color.className = 'oe-color-native-realm__color'
    color.setAttribute('aria-label', 'Color')
    this.color = color

    const alpha = ownerDocument.createElement('input')
    alpha.type = 'range'
    alpha.className = 'oe-color-native-realm__alpha'
    alpha.min = '0'
    alpha.max = '1'
    alpha.step = '0.01'
    alpha.setAttribute('aria-label', 'Opacity')
    this.alphaInput = alpha

    const text = ownerDocument.createElement('input')
    text.type = 'text'
    text.className = 'oe-color-hex'
    text.setAttribute('aria-label', 'Color value')
    text.spellcheck = false
    this.text = text

    const apply = ownerDocument.createElement('button')
    apply.type = 'button'
    apply.className = 'oe-color-btn oe-color-btn--apply'
    apply.textContent = '✓'
    apply.setAttribute('aria-label', 'Apply color')

    const controls = ownerDocument.createElement('div')
    controls.className = 'oe-color-bottom'
    controls.append(preview, color, alpha, text, apply)

    if (options.showRemove !== false) {
      const remove = ownerDocument.createElement('button')
      remove.type = 'button'
      remove.className = 'oe-color-btn oe-color-btn--remove'
      remove.textContent = '×'
      remove.setAttribute('aria-label', 'Remove color')
      remove.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        options.onRemove?.()
      }, { signal: this.controller.signal })
      controls.appendChild(remove)
    }

    color.addEventListener('input', () => {
      this.hex = color.value
      this.#syncTextAndPreview()
      options.onChange?.(this.#cssColor())
    }, { signal: this.controller.signal })
    alpha.addEventListener('input', () => {
      this.alpha = clampAlpha(Number(alpha.value))
      this.#syncTextAndPreview()
      options.onChange?.(this.#cssColor())
    }, { signal: this.controller.signal })
    text.addEventListener('change', () => {
      const normalized = normalizeColor(text.value, ownerDocument)
      if (!normalized) {
        this.#syncTextAndPreview()
        return
      }
      this.hex = normalized.hex
      this.alpha = normalized.alpha
      this.#syncControls()
      options.onChange?.(this.#cssColor())
    }, { signal: this.controller.signal })
    text.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        const normalized = normalizeColor(text.value, ownerDocument)
        if (normalized) {
          this.hex = normalized.hex
          this.alpha = normalized.alpha
          this.#syncControls()
          options.onApply?.(this.#cssColor())
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        this.close()
      }
    }, { signal: this.controller.signal })
    apply.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      options.onApply?.(this.#cssColor())
    }, { signal: this.controller.signal })

    root.addEventListener('mousedown', (event) => {
      event.stopPropagation()
    }, { signal: this.controller.signal })
    this.element = root
    root.appendChild(controls)
  }

  /** @param {string} color @param {number} [alpha] */
  open(color, alpha) {
    const normalized = normalizeColor(color, this.ownerDocument) ?? { hex: '#000000', alpha: 1 }
    this.hex = normalized.hex
    this.alpha = clampAlpha(alpha ?? normalized.alpha)
    this.#syncControls()
    this.element.style.display = ''
  }

  close() {
    this.element.style.display = 'none'
  }

  destroy() {
    this.controller.abort()
    this.element.remove()
    this.options = {}
  }

  #syncControls() {
    this.color.value = this.hex
    this.alphaInput.value = String(this.alpha)
    this.#syncTextAndPreview()
  }

  #syncTextAndPreview() {
    const css = this.#cssColor()
    this.text.value = css
    this.preview.style.backgroundColor = css
  }

  #cssColor() {
    if (this.alpha >= 1) return this.hex
    const [r, g, b] = hexChannels(this.hex)
    return `rgba(${r}, ${g}, ${b}, ${this.alpha})`
  }
}

/** @param {number} value */
function clampAlpha(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

/** @param {string} hex @returns {[number, number, number]} */
function hexChannels(hex) {
  const value = hex.slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

/** @param {string} value @param {Document} ownerDocument */
function normalizeColor(value, ownerDocument) {
  const source = String(value || '').trim()
  const parsed = parseColorInput(source)
  if (!parsed) return null

  const m6 = source.match(/^#([0-9a-f]{6})$/i)
  if (m6) return { hex: `#${m6[1].toLowerCase()}`, alpha: parsed.a ?? 1 }
  const m3 = source.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (m3) return { hex: `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase(), alpha: parsed.a ?? 1 }
  const m8 = source.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i)
  if (m8) return { hex: `#${m8[1].toLowerCase()}`, alpha: parsed.a ?? 1 }

  const probe = ownerDocument.createElement('span')
  probe.style.color = source
  ;(ownerDocument.body ?? ownerDocument.documentElement).appendChild(probe)
  const computed = (ownerDocument.defaultView ?? globalThis).getComputedStyle(probe).color
  probe.remove()
  const match = computed.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/i)
  if (!match) return null
  const hex = '#' + [match[1], match[2], match[3]]
    .map(channel => Number(channel).toString(16).padStart(2, '0'))
    .join('')
  return { hex, alpha: parsed.a ?? (match[4] === undefined ? 1 : Number(match[4])) }
}
