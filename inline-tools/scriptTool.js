import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { editSelectedAncestors } from './selectedAncestors.js'
import {
  createSelectionPortBinding,
  toggleTag,
  removeEmptyInlineTags,
  createBackButton,
  getWalkRoot,
} from './utils.js'

const ICON_SUP = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/><path d="M21 11h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -1"/></svg>'
const ICON_SUB = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/><path d="M21 20h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -1"/></svg>'
const ELEMENT_NODE = 1

const ICON_NONE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/></svg>'

/**
 * Detect which script mode the selection is in.
 * @param {Range | null} [range]
 * @param {Document | null} [ownerDocument]
 * @returns {'sup' | 'sub' | 'none'}
 */
function getCurrentScript(range = null, ownerDocument = range?.startContainer?.ownerDocument ?? null) {
  const anchorNode = range?.startContainer ?? ownerDocument?.defaultView?.getSelection?.()?.anchorNode ?? null
  if (!anchorNode) return 'none'
  const node = anchorNode.nodeType === ELEMENT_NODE
    ? /** @type {HTMLElement} */ (anchorNode)
    : anchorNode.parentElement
  if (node?.closest('sup')) return 'sup'
  if (node?.closest('sub')) return 'sub'
  return 'none'
}

/**
 * Remove script wrappers only around the selected portion of each text node.
 * Walks up to the contenteditable to ensure we find wrapping tags.
 * @param {Range} range
 */
function removeAllScriptTags(range) {
  // Use the contenteditable (or common editor root for cross-block ranges),
  // not commonAncestorContainer. The common ancestor can itself be <sup> or
  // <sub>, and querySelectorAll() does not include the receiver element.
  const root = getWalkRoot(range)
  if (!root) return

  editSelectedAncestors(range, element => element.matches('sup, sub'), element => {
    element.replaceWith(...element.childNodes)
  })

  // Clean up empty inline tags and normalize
  removeEmptyInlineTags(root)
}

/**
 * Create combined superscript/subscript tool with a dropdown panel.
 * @param {{ sup: string, sub: string, none: string }} labels
 * @returns {import('./types').InlineTool}
 */
export function createScriptTool(labels) {
  const selection = createSelectionPortBinding()
  const cbs = selection.port
  /** @type {Document | null} */
  let ownerDocument = null

  const modes = [
    { tag: 'sup', icon: ICON_SUP, title: labels.sup, key: 'sup' },
    { tag: 'sub', icon: ICON_SUB, title: labels.sub, key: 'sub' },
    { tag: '',    icon: ICON_NONE, title: labels.none, key: 'none' },
  ]

  return {
    type: 'script',
    bindSelectionPort: selection.bind,
    title: labels.sup,
    icon: ICON_SUP,

    getIcon() {
      const c = getCurrentScript(cbs?.range, ownerDocument)
      return c === 'sub' ? ICON_SUB : ICON_SUP
    },

    getTitle() {
      const c = getCurrentScript(cbs?.range, ownerDocument)
      if (c === 'sup') return labels.sup
      if (c === 'sub') return labels.sub
      return labels.sup
    },

    isActive(selection) {
      const range = cbs?.range || selection?.range || null
      if (range?.startContainer?.ownerDocument) ownerDocument = range.startContainer.ownerDocument
      return getCurrentScript(range, ownerDocument) !== 'none'
    },

    toggle() {
      // no-op: opens renderActions panel
    },

    onMount(button) {
      ownerDocument = button.ownerDocument
    },

    destroy() {
      ownerDocument = null
    },

    renderActions(ctx) {
      const initialRange = ctx.range
      if (!initialRange) return null
      const doc = initialRange.startContainer.ownerDocument
      ownerDocument = doc
      const panel = doc.createElement('div')
      panel.className = 'oe-inline-toolbar__panel oe-inline-toolbar__script-panel'

      panel.appendChild(createBackButton(ctx))

      const current = getCurrentScript(initialRange, doc)

      for (const mode of modes) {
        const btn = doc.createElement('button')
        btn.type = 'button'
        btn.className = 'oe-inline-tool'
        btn.setAttribute('aria-label', mode.title)
        setTrustedHtml(btn, mode.icon)
        if (current === mode.key && mode.key !== 'none') btn.classList.add('oe-inline-tool--active')

        btn.addEventListener('mouseenter', () => ctx.showTooltip(btn, mode.title))
        btn.addEventListener('mouseleave', () => ctx.hideTooltip())
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          // The action panel owns a separate selection continuation. Its
          // mounted-button port may already be retired while the panel lives.
          const applied = ctx.mutate(range => {
            // Remove the old wrappers, then reconstruct this same logical
            // author selection before potentially wrapping it with a new mode.
            removeAllScriptTags(range)
            if (!ctx.restoreSelection()) {
              throw new Error('Formatting selection became unavailable after removing script tags')
            }

            if (mode.tag && mode.key !== current) {
              const resolved = ctx.range
              if (!resolved) throw new Error('Script formatting selection is unavailable')
              toggleTag(mode.tag, resolved)
              if (!ctx.restoreSelection()) {
                throw new Error('Formatting selection became unavailable after applying script')
              }
            }
            return true
          })
          if (applied === true) ctx.close()
        })
        panel.appendChild(btn)
      }

      return panel
    },
  }
}
