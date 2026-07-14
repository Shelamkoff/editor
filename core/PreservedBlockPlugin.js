import { cloneEditorData } from '../shared/cloneEditorData.js'

/**
 * Create an inert plugin for a document block whose implementation is not
 * registered in this editor instance. The block remains removable and
 * reorderable, but its plugin-owned payload is preserved byte-for-byte at the
 * JSON value level instead of being handed to an unrelated default plugin.
 *
 * @param {string} type
 * @param {(type: string) => string} label
 * @returns {import('./types').BlockPlugin}
 */
export function createPreservedBlockPlugin(type, label) {
  /** @type {WeakMap<HTMLElement, Record<string, unknown>>} */
  const dataByElement = new WeakMap()

  return {
    type,
    title: type,
    icon: '',
    inlineTools: false,
    render(data) {
      const element = document.createElement('div')
      element.className = 'oe-unsupported-block'
      element.setAttribute('role', 'note')
      const message = label(type)
      element.setAttribute('aria-label', message)
      element.textContent = message
      dataByElement.set(element, cloneEditorData(data))
      return element
    },
    save(element) {
      return cloneEditorData(dataByElement.get(element) ?? {})
    },
    validate() {
      return true
    },
    destroy(element) {
      dataByElement.delete(element)
    },
  }
}
