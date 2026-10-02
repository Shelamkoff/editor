// @ts-check
import { delimiterDataSchema } from '../../shared/blockSchemas/delimiter.js'

const editorStyles = new URL('./delimiter.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h2"/><path d="M17 12h2"/><path d="M11 12h2"/></svg>'

/** @returns {import('../../plugin-kit/types').BlockPluginDefinition<Record<string, never>>} */
export function createDelimiterPlugin() {
  return Object.freeze({
    type: 'delimiter',
    label: Object.freeze({ key: 'title', fallback: 'Delimiter' }),
    icon: ICON,
    styles: Object.freeze([editorStyles]),
    schema: delimiterDataSchema,
    capabilities: Object.freeze({
      empty: Object.freeze({ isEmpty: () => false }),
    }),
    setup() {
      let destroyed = false
      return {
        create(_initial, context) {
          if (destroyed) throw new Error('Delimiter runtime is destroyed')
          const element = context.ownerDocument.createElement('hr')
          element.className = 'oe-delimiter'
          element.contentEditable = 'false'
          element.tabIndex = -1
          let instanceDestroyed = false
          return {
            element,
            read: () => ({}),
            setReadOnly() {},
            focus() {
              if (!instanceDestroyed) element.focus()
            },
            destroy() {
              instanceDestroyed = true
            },
          }
        },
        destroy() {
          destroyed = true
        },
      }
    },
  })
}
