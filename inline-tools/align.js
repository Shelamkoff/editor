import { el } from '../core/dom.js'
import {
  ICON_ALIGN_LEFT,
  ICON_ALIGN_CENTER,
  ICON_ALIGN_RIGHT,
  ICON_ALIGN_JUSTIFY,
  getBlockContentElement,
  getSelectedBlockElements,
  createBackButton,
} from './utils.js'
import { TEXT_ALIGN_TUNE_ATTRIBUTE } from '../core/constants.js'

const ALIGNMENTS = [
  { value: '',        icon: ICON_ALIGN_LEFT,    key: 'left' },
  { value: 'center',  icon: ICON_ALIGN_CENTER,  key: 'center' },
  { value: 'right',   icon: ICON_ALIGN_RIGHT,   key: 'right' },
  { value: 'justify', icon: ICON_ALIGN_JUSTIFY,  key: 'justify' },
]

/**
 * Create the toolbar control that applies one text alignment to every block
 * participating in the current selection.
 *
 * @param {{ left: string, center: string, right: string, justify: string }} labels
 * @param {import('../types').ICrossBlockSelection | null} [cbs]
 * @returns {import('../types').InlineTool}
 */
export function createAlignTool(labels, cbs = null) {
  /** @type {Record<string, { icon: string, title: string }>} */
  const alignMap = {
    '':        { icon: ICON_ALIGN_LEFT,    title: labels.left },
    'left':    { icon: ICON_ALIGN_LEFT,    title: labels.left },
    'center':  { icon: ICON_ALIGN_CENTER,  title: labels.center },
    'right':   { icon: ICON_ALIGN_RIGHT,   title: labels.right },
    'justify': { icon: ICON_ALIGN_JUSTIFY, title: labels.justify },
  }

  /** Get current alignment from selection */
  function getCurrentAlign() {
    const block = getBlockContentElement()
    return block?.style.textAlign || ''
  }

  /** @param {HTMLElement} blockRoot @param {string} value */
  function setAlignment(blockRoot, value) {
    blockRoot.style.textAlign = value
    blockRoot.setAttribute(TEXT_ALIGN_TUNE_ATTRIBUTE, value)
  }

  return {
    type: 'align',
    title: labels.left,
    icon: ICON_ALIGN_LEFT,
    tag: 'div',

    /** Dynamic icon - reflects current alignment */
    getIcon() {
      const entry = alignMap[getCurrentAlign()] ?? alignMap['']
      return entry?.icon ?? ICON_ALIGN_LEFT
    },

    /** Dynamic label for tooltip */
    getTitle() {
      const entry = alignMap[getCurrentAlign()] ?? alignMap['']
      return entry?.title ?? labels.left
    },

    isActive() {
      const align = getCurrentAlign()
      return !!align && align !== 'left'
    },

    toggle() {
      // no-op: opens renderActions
    },

    renderActions(ctx) {
      const panel = el('div', 'oe-inline-toolbar__panel oe-inline-toolbar__align-panel')

      panel.appendChild(createBackButton(ctx))

      const currentAlign = getCurrentAlign()

      for (const alignment of ALIGNMENTS) {
        const info = /** @type {{ icon: string, title: string }} */ (alignMap[alignment.value] ?? alignMap[''])
        const btn = el('button', 'oe-inline-tool', { type: 'button' })
        btn.innerHTML = alignment.icon
        if (currentAlign === alignment.value || (!currentAlign && alignment.value === '')) {
          btn.classList.add('oe-inline-tool--active')
        }
        btn.addEventListener('mouseenter', () => ctx.showTooltip(btn, info.title))
        btn.addEventListener('mouseleave', () => ctx.hideTooltip())
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          ctx.restoreSelection()

          ctx.mutate(() => {
            const crossBlocks = getSelectedBlockElements(cbs)
            if (crossBlocks) {
              for (const blockEl of crossBlocks) {
                setAlignment(blockEl, alignment.value)
              }
            } else {
              const target = getBlockContentElement()
              if (target) {
                setAlignment(target, alignment.value)
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
