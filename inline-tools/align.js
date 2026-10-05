import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import {
  ICON_ALIGN_LEFT,
  ICON_ALIGN_CENTER,
  ICON_ALIGN_RIGHT,
  ICON_ALIGN_JUSTIFY,
  createBackButton,
} from './utils.js'

const ALIGNMENTS = [
  { value: /** @type {'left'} */ ('left'), icon: ICON_ALIGN_LEFT, key: 'left' },
  { value: /** @type {'center'} */ ('center'), icon: ICON_ALIGN_CENTER, key: 'center' },
  { value: /** @type {'right'} */ ('right'), icon: ICON_ALIGN_RIGHT, key: 'right' },
  { value: /** @type {'justify'} */ ('justify'), icon: ICON_ALIGN_JUSTIFY, key: 'justify' },
]

/**
 * Create the model-first alignment control. Alignment belongs to block tunes,
 * never to plugin DOM or data fields.
 *
 * @param {{ left: string, center: string, right: string, justify: string }} labels
 * @returns {import('./types').InlineTool}
 */
export function createAlignTool(labels) {
  const alignMap = {
    left: { icon: ICON_ALIGN_LEFT, title: labels.left },
    center: { icon: ICON_ALIGN_CENTER, title: labels.center },
    right: { icon: ICON_ALIGN_RIGHT, title: labels.right },
    justify: { icon: ICON_ALIGN_JUSTIFY, title: labels.justify },
    mixed: { icon: ICON_ALIGN_LEFT, title: labels.left },
  }
  let lastAlign = /** @type {'left'|'center'|'right'|'justify'|'mixed'} */ ('left')

  return {
    type: 'align',
    title: labels.left,
    icon: ICON_ALIGN_LEFT,
    tag: 'div',

    getIcon() {
      return alignMap[lastAlign]?.icon ?? ICON_ALIGN_LEFT
    },

    getTitle() {
      return alignMap[lastAlign]?.title ?? labels.left
    },

    isActive(selection) {
      if (selection?.textAlign !== undefined) lastAlign = selection.textAlign
      return lastAlign !== 'left' && lastAlign !== 'mixed'
    },

    toggle() {},

    renderActions(ctx) {
      const doc = ctx.range.startContainer.ownerDocument
      const panel = doc.createElement('div')
      panel.className = 'oe-inline-toolbar__panel oe-inline-toolbar__align-panel'
      panel.appendChild(createBackButton(ctx))

      lastAlign = ctx.getTextAlign()
      for (const alignment of ALIGNMENTS) {
        const info = alignMap[alignment.value]
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'oe-inline-tool'
        button.setAttribute('aria-label', info.title)
        setTrustedHtml(button, alignment.icon)
        if (lastAlign === alignment.value) button.classList.add('oe-inline-tool--active')
        button.addEventListener('mouseenter', () => ctx.showTooltip(button, info.title))
        button.addEventListener('mouseleave', () => ctx.hideTooltip())
        button.addEventListener('mousedown', event => {
          event.preventDefault()
          event.stopPropagation()
        })
        button.addEventListener('click', event => {
          event.preventDefault()
          event.stopPropagation()
          const changed = ctx.setTextAlign(alignment.value === 'left' ? null : alignment.value)
          if (changed) lastAlign = alignment.value
          ctx.restoreSelection()
          ctx.close()
        })
        panel.appendChild(button)
      }
      return panel
    },
  }
}
