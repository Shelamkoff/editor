// @ts-check
import { setSanitizedHtml } from '../../plugin-kit/index.js'
import { paragraphDataSchema } from '../../shared/blockSchemas/paragraph.js'

const editorStyles = new URL('./paragraph.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l12 0"/><path d="M12 4l0 16"/></svg>'

/**
 * @typedef {Object} ParagraphV2Config
 * @property {string} [placeholder]
 * @property {boolean} [injectStyles=true]
 * @property {string} [css]
 */

/**
 * @param {HTMLElement} element
 * @param {string} html
 */
function projectText(element, html) {
  if (!html) {
    element.textContent = ''
    return
  }

  // Plain text is the hot path and does not need an HTML parser. Any markup
  // or entity-shaped input still goes through the audited sanitizer/TT sink.
  if (!/[<&]/.test(html)) {
    element.textContent = html
    return
  }
  setSanitizedHtml(element, html)
}

/**
 * Create the reusable immutable Paragraph v2 definition.
 *
 * @param {ParagraphV2Config} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{ text: string }>}
 */
export function createParagraphPlugin(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Paragraph configuration must be an object')
  }
  if (config.placeholder !== undefined && typeof config.placeholder !== 'string') {
    throw new TypeError('Paragraph placeholder must be a string')
  }
  if (config.injectStyles !== undefined && typeof config.injectStyles !== 'boolean') {
    throw new TypeError('Paragraph injectStyles must be a boolean')
  }
  if (config.css !== undefined && typeof config.css !== 'string') {
    throw new TypeError('Paragraph css must be a string')
  }

  const snapshot = Object.freeze({ ...config })
  const styles = []
  if (snapshot.injectStyles !== false) styles.push(editorStyles)
  if (snapshot.css) styles.push(snapshot.css)

  const definition = {
    type: 'paragraph',
    label: Object.freeze({ key: 'title', fallback: 'Text' }),
    icon: ICON,
    styles: Object.freeze(styles),
    schema: paragraphDataSchema,

    /**
     * @param {import('../../plugin-kit/types').BlockPluginRuntimeContext} runtimeContext
     * @returns {import('../../plugin-kit/types').BlockPluginRuntime<{ text: string }>}
     */
    setup(runtimeContext) {
      let destroyed = false
      const placeholder = snapshot.placeholder
        ?? (runtimeContext.isDefaultBlock ? runtimeContext.editorPlaceholder : undefined)
        ?? runtimeContext.t('placeholder', '')

      return {
        create(initial, context) {
          if (destroyed) throw new Error('Paragraph runtime is destroyed')
          if (context.signal.aborted) throw new DOMException('Block instance is aborted', 'AbortError')

          const element = context.ownerDocument.createElement('p')
          element.className = 'oe-paragraph'
          element.contentEditable = context.isReadOnly() ? 'false' : 'true'
          if (placeholder) element.dataset.placeholder = placeholder
          projectText(element, initial.text)

          let instanceDestroyed = false

          return {
            element,

            read() {
              const text = typeof element.innerHTML === 'string' && element.innerHTML
                ? element.innerHTML
                : element.textContent ?? ''
              return { text }
            },

            update(next) {
              if (instanceDestroyed) return
              projectText(element, next.text)
            },

            editableFields() {
              return Object.freeze([Object.freeze({
                key: 'text',
                element,
                mode: /** @type {'rich-text'} */ ('rich-text'),
              })])
            },

            setReadOnly(readOnly) {
              if (instanceDestroyed) return
              element.contentEditable = readOnly ? 'false' : 'true'
            },

            focus() {
              if (instanceDestroyed) return
              element.focus()
            },

            destroy() {
              if (instanceDestroyed) return
              instanceDestroyed = true
            },
          }
        },

        destroy() {
          destroyed = true
        },
      }
    },
  }

  return Object.freeze(definition)
}
