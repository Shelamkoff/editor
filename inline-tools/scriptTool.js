import {
  toggleTag,
  removeEmptyInlineTags,
  saveSelectionOffsets,
  restoreSelectionOffsets,
  createBackButton,
  getWalkRoot,
} from './utils.js'

const ICON_SUP = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/><path d="M21 11h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -1"/></svg>'
const ICON_SUB = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/><path d="M21 20h-4l3.5 -4a1.73 1.73 0 0 0 -3.5 -1"/></svg>'
const ICON_NONE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l8 10m-8 0l8 -10"/></svg>'

/**
 * Detect which script mode the selection is in.
 * @returns {'sup' | 'sub' | 'none'}
 */
function getCurrentScript() {
  const sel = window.getSelection()
  if (!sel?.anchorNode) return 'none'
  const node = sel.anchorNode.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (sel.anchorNode)
    : sel.anchorNode.parentElement
  if (node?.closest('sup')) return 'sup'
  if (node?.closest('sub')) return 'sub'
  return 'none'
}

/**
 * Remove all <sup> and <sub> tags that intersect the range by unwrapping them.
 * Walks up to the contenteditable to ensure we find wrapping tags.
 * @param {Range} range
 */
function removeAllScriptTags(range) {
  // Use the contenteditable (or common editor root for cross-block ranges),
  // not commonAncestorContainer. The common ancestor can itself be <sup> or
  // <sub>, and querySelectorAll() does not include the receiver element.
  const root = getWalkRoot(range)
  if (!root) return

  const tags = []
  if (root.matches('sup, sub')) tags.push(root)
  tags.push(...root.querySelectorAll('sup, sub'))
  for (const tag of tags) {
    if (!range.intersectsNode(tag)) continue
    if (tag.closest('[data-inline-plugin]')) continue
    const parent = tag.parentNode
    if (!parent) continue
    while (tag.firstChild) parent.insertBefore(tag.firstChild, tag)
    tag.remove()
  }

  // Clean up empty inline tags and normalize
  removeEmptyInlineTags(root)
}

/**
 * Create combined superscript/subscript tool with a dropdown panel.
 * @param {{ sup: string, sub: string, none: string }} labels
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createScriptTool(labels, cbs = null) {
  const modes = [
    { tag: 'sup', icon: ICON_SUP, title: labels.sup, key: 'sup' },
    { tag: 'sub', icon: ICON_SUB, title: labels.sub, key: 'sub' },
    { tag: '',    icon: ICON_NONE, title: labels.none, key: 'none' },
  ]

  return {
    type: 'script',
    title: labels.sup,
    icon: ICON_SUP,

    getIcon() {
      const c = getCurrentScript()
      return c === 'sub' ? ICON_SUB : ICON_SUP
    },

    getTitle() {
      const c = getCurrentScript()
      if (c === 'sup') return labels.sup
      if (c === 'sub') return labels.sub
      return labels.sup
    },

    isActive() {
      return getCurrentScript() !== 'none'
    },

    toggle() {
      // no-op: opens renderActions panel
    },

    renderActions(ctx) {
      const panel = document.createElement('div')
      panel.className = 'oe-inline-toolbar__panel oe-inline-toolbar__script-panel'

      panel.appendChild(createBackButton(ctx))

      const current = getCurrentScript()

      for (const mode of modes) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'oe-inline-tool'
        btn.innerHTML = mode.icon
        if (current === mode.key && mode.key !== 'none') btn.classList.add('oe-inline-tool--active')

        btn.addEventListener('mouseenter', () => ctx.showTooltip(btn, mode.title))
        btn.addEventListener('mouseleave', () => ctx.hideTooltip())
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          ctx.restoreSelection()

          const sel = window.getSelection()
          if (!sel || !sel.rangeCount) { ctx.close(); return }
          // Use cross-block range if available (native range is clipped to one contenteditable)
          const range = cbs?.range || sel.getRangeAt(0)

          const saved = saveSelectionOffsets(range)

          ctx.mutate(() => {
            // Step 1: Always remove ALL existing sup/sub tags in range
            removeAllScriptTags(range)

            // Restore selection after DOM cleanup (normalize invalidates range)
            restoreSelectionOffsets(cbs, saved)

            // Step 2: If target is different from current (not toggling off), wrap with new tag
            if (mode.tag && mode.key !== current) {
              const newRange = (saved.crossOffsets ? cbs?.range : null) || (sel.rangeCount ? sel.getRangeAt(0) : null)
              if (newRange) {
                toggleTag(mode.tag, newRange)
              }
            }
          })

          ctx.close()
        })
        panel.appendChild(btn)
      }

      return panel
    },
  }
}
