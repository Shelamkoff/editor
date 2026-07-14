import { el } from '../core/dom.js'
import { sanitizeUrl } from '../shared/sanitize/sanitizeUrl.js'
import {
  ICON_LINK, ICON_CHECK, ICON_UNLINK,
  removeEmptyInlineTags,
  saveSelectionOffsets,
  restoreSelectionOffsets,
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
  createBackButton,
} from './utils.js'

/**
 * Return every link touched by a range. The walk root is deliberately the
 * contenteditable (or the common editor root for a cross-block selection),
 * rather than the range's common ancestor: the latter can be the link itself,
 * and querySelectorAll() never includes the element it is called on.
 *
 * Keeping detection, active-state rendering, and unlinking on this single
 * query prevents the three code paths from disagreeing about the selection.
 *
 * @param {Range} range
 * @returns {HTMLAnchorElement[]}
 */
function getIntersectingLinks(range) {
  const walkRoot = getWalkRoot(range)
  if (!walkRoot) return []

  const candidates = []
  if (walkRoot.matches('a')) candidates.push(walkRoot)
  candidates.push(...walkRoot.querySelectorAll('a'))

  return candidates.filter((candidate) => {
    try {
      return range.intersectsNode(candidate)
    } catch {
      return false
    }
  })
}

/**
 * Create the link inline tool with a drill-down URL input panel.
 * @param {string} linkPlaceholder — i18n placeholder for the input
 * @param {string} linkLabel — i18n label for the tool
 * @param {{ apply?: string, unlink?: string }} [actionLabels]
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createLinkTool(linkPlaceholder, linkLabel, actionLabels = {}, cbs = null) {
  return {
    type: 'link',
    title: linkLabel,
    icon: ICON_LINK,
    tag: 'a',
    shortcut: 'Mod+K',
    getTitle(active) {
      return active ? (actionLabels.unlink || 'Unlink') : linkLabel
    },

    getIcon(active) {
      return active ? ICON_UNLINK : ICON_LINK
    },

    isActive(selection) {
      const range = cbs?.range || selection?.range
      if (!range) {
        const sel = window.getSelection()
        if (sel?.anchorNode) return !!sel.anchorNode.parentElement?.closest('a')
        return false
      }
      return getIntersectingLinks(range).length > 0
    },

    toggle(selection) {
      // Toggle: if links exist in selection — remove them all
      const actualRange = cbs?.range || selection?.range
      if (!actualRange) return
      const saved = saveSelectionOffsets(actualRange)

      const walkRoot = getWalkRoot(actualRange)
      if (!walkRoot) return

      for (const link of getIntersectingLinks(actualRange)) {
        const parent = link.parentNode
        while (link.firstChild) parent?.insertBefore(link.firstChild, link)
        link.remove()
      }

      normalizeAfterEdit(getContentEditable(actualRange), walkRoot)

      restoreSelectionOffsets(cbs, saved)
    },

    /**
     * Render the drill-down panel with URL input, apply, unlink buttons.
     * Returns null when active (links in selection) — signals toggle behavior instead.
     * @param {import('../types').InlineToolActionContext} ctx
     * @returns {HTMLElement | null}
     */
    renderActions(ctx) {
      // When links exist, return null to trigger toggle() (remove links)
      const currentSel = window.getSelection()
      if (currentSel?.anchorNode) {
        const range = cbs?.range || (currentSel.rangeCount ? currentSel.getRangeAt(0) : null)
        if (range && getIntersectingLinks(range).length > 0) return null
      }

      const panel = el('div', 'oe-inline-toolbar__panel oe-inline-toolbar__panel--link')

      const backBtn = createBackButton(ctx)

      // URL input
      const input = /** @type {HTMLInputElement} */ (el('input', 'oe-inline-toolbar__link-input', {
        type: 'url',
        placeholder: linkPlaceholder,
      }))
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          applyLink()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          ctx.close()
        }
      })
      // Prevent input events from bubbling to wireInputTracking
      // (typing a URL is not a document content change).
      input.addEventListener('input', (e) => e.stopPropagation())

      // Apply button
      const applyLabel = actionLabels.apply || 'Apply'
      const applyBtn = el('button', 'oe-inline-tool oe-inline-tool--apply', { type: 'button' })
      applyBtn.innerHTML = ICON_CHECK
      applyBtn.addEventListener('mouseenter', () => ctx.showTooltip(applyBtn, applyLabel))
      applyBtn.addEventListener('mouseleave', () => ctx.hideTooltip())
      applyBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        applyLink()
      })

      // Unlink button
      const unlinkLabel = actionLabels.unlink || 'Unlink'
      const unlinkBtn = el('button', 'oe-inline-tool oe-inline-tool--unlink', { type: 'button' })
      unlinkBtn.innerHTML = ICON_UNLINK
      unlinkBtn.addEventListener('mouseenter', () => ctx.showTooltip(unlinkBtn, unlinkLabel))
      unlinkBtn.addEventListener('mouseleave', () => ctx.hideTooltip())
      unlinkBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      unlinkBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        removeLink()
      })

      // Check if already inside a link
      const sel = window.getSelection()
      const existingAnchor = sel?.anchorNode?.parentElement?.closest('a')
      if (existingAnchor) {
        input.value = existingAnchor.getAttribute('href') || ''
        unlinkBtn.style.display = ''
      } else {
        unlinkBtn.style.display = 'none'
      }

      function applyLink() {
        const url = input.value.trim()
        if (!url) return

        ctx.restoreSelection()

        // Use cross-block range if available
        const sel = window.getSelection()
        const actualRange = cbs?.range || (sel && sel.rangeCount ? sel.getRangeAt(0) : null)
        if (!actualRange) return

        const saved = saveSelectionOffsets(actualRange)

        ctx.mutate(() => {
          // Wrap each text node in the range with an <a> tag
          const walkRoot = getWalkRoot(actualRange)
          if (walkRoot) {
            const targets = collectTextTargets(walkRoot, actualRange)
            for (let i = targets.length - 1; i >= 0; i--) {
              const t = targets[i]
              if (!t) continue
              const { node, startOffset, endOffset } = t
              let targetNode = node
              if (endOffset < node.length) node.splitText(endOffset)
              if (startOffset > 0) targetNode = /** @type {Text} */ (node.splitText(startOffset))

              // Skip if already inside a link
              if (targetNode.parentElement?.closest('a')) continue

              const anchor = document.createElement('a')
              anchor.href = sanitizeUrl(url)
              anchor.rel = 'noopener noreferrer'
              anchor.target = '_blank'
              targetNode.parentNode?.insertBefore(anchor, targetNode)
              anchor.appendChild(targetNode)
            }
            normalizeAfterEdit(getContentEditable(actualRange), walkRoot)
          }

          restoreSelectionOffsets(cbs, saved)
        })
        ctx.close()
      }

      function removeLink() {
        ctx.restoreSelection()
        const s = window.getSelection()
        const anchor = s?.anchorNode?.parentElement?.closest('a')
        ctx.mutate(() => {
          if (anchor) {
            const parent = anchor.parentNode
            const fragment = document.createDocumentFragment()
            while (anchor.firstChild) {
              fragment.appendChild(anchor.firstChild)
            }
            anchor.replaceWith(fragment)
            removeEmptyInlineTags(parent)
          }
        })
        ctx.close()
      }

      panel.appendChild(backBtn)
      panel.appendChild(input)
      panel.appendChild(applyBtn)
      panel.appendChild(unlinkBtn)

      // Focus input after panel is mounted
      requestAnimationFrame(() => input.focus())

      return panel
    },
  }
}
