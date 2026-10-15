import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { el } from '../shared/editorDom.js'
import { sanitizeUrl } from '../shared/sanitize/sanitizeUrl.js'
import {
  createSelectionPortBinding,
  ICON_LINK, ICON_CHECK, ICON_UNLINK,
  removeEmptyInlineTags,
  getContentEditable,
  getWalkRoot,
  collectTextTargets,
  normalizeAfterEdit,
  createBackButton,
} from './utils.js'

const ELEMENT_NODE = 1

/** Widget-owned hyperlinks are UI, not authored link formatting.
 * @param {Node | null | undefined} node
 * @returns {HTMLAnchorElement | null}
 */
function authoredAnchor(node) {
  const element = node?.nodeType === ELEMENT_NODE ? /** @type {Element} */ (node) : node?.parentElement
  const anchor = element?.closest('a')
  return anchor && !anchor.closest('[data-inline-plugin]') ? /** @type {HTMLAnchorElement} */ (anchor) : null
}

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

  /** @type {HTMLAnchorElement[]} */
  const candidates = []
  if (walkRoot.tagName === 'A') candidates.push(/** @type {HTMLAnchorElement} */ (walkRoot))
  candidates.push(...walkRoot.querySelectorAll('a'))

  return candidates.filter((candidate) => {
    if (candidate.closest('[data-inline-plugin]')) return false
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
 * @returns {import('./types').InlineTool}
 */
export function createLinkTool(linkPlaceholder, linkLabel, actionLabels = {}) {
  const selection = createSelectionPortBinding()
  const cbs = selection.port
  return {
    type: 'link',
    bindSelectionPort: selection.bind,
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
      if (!range) return false
      return getIntersectingLinks(range).length > 0
    },

    toggle(selection) {
      // Toggle: if links exist in selection — remove them all
      const actualRange = cbs?.range || selection?.range
      if (!actualRange) return
      const bookmark = cbs.capture(actualRange)
      if (!bookmark) return

      const walkRoot = getWalkRoot(actualRange)
      if (!walkRoot) return

      for (const link of getIntersectingLinks(actualRange)) {
        const parent = link.parentNode
        while (link.firstChild) parent?.insertBefore(link.firstChild, link)
        link.remove()
      }

      normalizeAfterEdit(getContentEditable(actualRange), walkRoot)

      if (!cbs.restore(bookmark)) {
        throw new Error('Formatting selection became unavailable after unlinking')
      }
    },

    /**
     * Render the drill-down panel with URL input, apply, unlink buttons.
     * Returns null when active (links in selection) — signals toggle behavior instead.
     * @param {import('./types').InlineToolActionContext} ctx
     * @returns {HTMLElement | null}
     */
    renderActions(ctx) {
      const ownerDocument = ctx.range.startContainer.ownerDocument
      const ownerWindow = ownerDocument.defaultView
      // When links exist, return null to trigger toggle() (remove links)
      const currentSel = ownerWindow?.getSelection?.() ?? null
      if (currentSel?.anchorNode) {
        const range = cbs?.range || (currentSel.rangeCount ? currentSel.getRangeAt(0) : null)
        if (range && getIntersectingLinks(range).length > 0) return null
      }

      const panel = el('div', 'oe-inline-toolbar__panel oe-inline-toolbar__panel--link', undefined, ownerDocument)

      const backBtn = createBackButton(ctx)

      // URL input
      const input = /** @type {HTMLInputElement} */ (el('input', 'oe-inline-toolbar__link-input', {
        type: 'url',
        placeholder: linkPlaceholder,
      }, ownerDocument))
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
      const applyBtn = el('button', 'oe-inline-tool oe-inline-tool--apply', { type: 'button' }, ownerDocument)
      applyBtn.setAttribute('aria-label', applyLabel)
      setTrustedHtml(applyBtn, ICON_CHECK)
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
      const unlinkBtn = el('button', 'oe-inline-tool oe-inline-tool--unlink', { type: 'button' }, ownerDocument)
      unlinkBtn.setAttribute('aria-label', unlinkLabel)
      setTrustedHtml(unlinkBtn, ICON_UNLINK)
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
      const sel = ownerWindow?.getSelection?.() ?? null
      const existingAnchor = authoredAnchor(sel?.anchorNode)
      if (existingAnchor) {
        input.value = existingAnchor.getAttribute('href') || ''
        unlinkBtn.style.display = ''
      } else {
        unlinkBtn.style.display = 'none'
      }

      function applyLink() {
        const url = input.value.trim()
        if (!url) return
        const current = ctx.range
        const bookmark = current ? cbs.capture(current) : null
        if (!bookmark) return

        let applied = false
        ctx.mutate(range => {
          const walkRoot = getWalkRoot(range)
          if (!walkRoot) return
          // Apply only to the authorized current range, never an earlier DOM
          // range captured before a URL input or a subsequent document change.
          const targets = collectTextTargets(walkRoot, range)
          for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i]
            if (!t) continue
            const { node, startOffset, endOffset } = t
            let targetNode = node
            if (endOffset < node.length) node.splitText(endOffset)
            if (startOffset > 0) targetNode = /** @type {Text} */ (node.splitText(startOffset))

            if (targetNode.parentElement?.closest('a')) continue
            const anchor = targetNode.ownerDocument.createElement('a')
            anchor.href = sanitizeUrl(url)
            anchor.rel = 'noopener noreferrer'
            anchor.target = '_blank'
            targetNode.parentNode?.insertBefore(anchor, targetNode)
            anchor.appendChild(targetNode)
          }
          normalizeAfterEdit(getContentEditable(range), walkRoot)
          if (!cbs.restore(bookmark)) {
            throw new Error('Formatting selection became unavailable after link application')
          }
          applied = true
        })
        if (applied) ctx.close()
      }

      function removeLink() {
        const current = ctx.range
        const bookmark = current ? cbs.capture(current) : null
        if (!bookmark) return
        let applied = false
        ctx.mutate(range => {
          const anchor = authoredAnchor(range.startContainer)
          if (anchor) {
            const parent = anchor.parentNode
            const fragment = anchor.ownerDocument.createDocumentFragment()
            while (anchor.firstChild) fragment.appendChild(anchor.firstChild)
            anchor.replaceWith(fragment)
            removeEmptyInlineTags(parent)
          }
          if (!cbs.restore(bookmark)) {
            throw new Error('Formatting selection became unavailable after link removal')
          }
          applied = true
        })
        if (applied) ctx.close()
      }

      panel.appendChild(backBtn)
      panel.appendChild(input)
      panel.appendChild(applyBtn)
      panel.appendChild(unlinkBtn)

      // Focus input after panel is mounted in the same browsing context.
      if (ownerWindow?.requestAnimationFrame) ownerWindow.requestAnimationFrame(() => input.focus())
      else queueMicrotask(() => input.focus())

      return panel
    },
  }
}
