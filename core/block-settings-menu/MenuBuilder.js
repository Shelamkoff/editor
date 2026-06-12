import { el } from '../dom.js'
import {
  ICON_BACK, ICON_CHEVRON_RIGHT, ICON_DELETE, ICON_DOWN, ICON_DUPLICATE, ICON_SWITCH, ICON_UP,
} from '../icons.js'

/**
 * @typedef {Object} MenuBuilderDeps
 * @property {import('../types').IBlockManager} blocks
 * @property {Map<string, import('../types').BlockPlugin>} plugins
 * @property {import('../I18n').I18n} i18n
 * @property {import('./BlockActions.js').BlockActions} actions
 * @property {(direction?: 'forward' | 'back' | 'none') => void} rebuildMain
 *   Used by the convert-view back button to redraw the main view.
 */

/**
 * Builds the contents of the block settings menu.
 *
 * Two views:
 *  - Main view: move up/down, plugin settings (e.g. heading levels),
 *    duplicate, convert-to (drill-down), delete.
 *  - Convert view: list of all block types, with the current one marked active.
 *
 * Drill-down direction is conveyed via two CSS classes
 * (`oe-settings-menu--forward`/`--back`) so the menu can animate.
 */
export class MenuBuilder {
  /** @type {HTMLElement} */
  #menuEl

  /** @type {MenuBuilderDeps} */
  #deps

  /**
   * @param {HTMLElement} menuEl
   * @param {MenuBuilderDeps} deps
   */
  constructor(menuEl, deps) {
    this.#menuEl = menuEl
    this.#deps = deps
  }

  /**
   * @param {'forward' | 'back' | 'none'} [direction]
   */
  buildMainView(direction = 'none') {
    this.#menuEl.innerHTML = ''
    this.#applyDirection(direction)

    const blocks = this.#deps.blocks
    const currentIndex = blocks.getCurrentIndex()
    const current = blocks.getCurrentBlock()
    if (!current) return

    const isFirst = currentIndex === 0
    const isLast = currentIndex === blocks.getBlockCount() - 1

    // Move up / Move down — always at the top.
    this.#addItem(this.#deps.i18n.t('block.moveUp'), ICON_UP, () => this.#deps.actions.moveUp(), isFirst)
    this.#addItem(this.#deps.i18n.t('block.moveDown'), ICON_DOWN, () => this.#deps.actions.moveDown(), isLast)

    this.#menuEl.appendChild(el('li', 'oe-settings-menu__separator', { role: 'separator' }))

    // Plugin-specific settings (e.g. heading levels, table operations).
    const plugin = this.#deps.plugins.get(current.type)
    if (plugin?.renderSettings) {
      const settingsItems = plugin.renderSettings(current.contentElement)
      const items = Array.isArray(settingsItems) ? settingsItems : settingsItems ? [settingsItems] : []

      for (const item of items) {
        if (!item) continue
        item.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.#deps.actions.handleSettingsAction(current, plugin, item)
        })
        this.#menuEl.appendChild(item)
      }

      this.#menuEl.appendChild(el('li', 'oe-settings-menu__separator', { role: 'separator' }))
    }

    // Duplicate
    this.#addItem(this.#deps.i18n.t('block.duplicate'), ICON_DUPLICATE, () => this.#deps.actions.duplicate())

    // Convert-to drill-down (only when there are multiple block types).
    if (this.#deps.plugins.size > 1) {
      this.#addDrilldownItem(this.#deps.i18n.t('block.convertTo'), ICON_SWITCH, () => this.buildConvertView())
    }

    this.#menuEl.appendChild(el('li', 'oe-settings-menu__separator', { role: 'separator' }))

    // Delete (danger).
    this.#addItem(this.#deps.i18n.t('block.delete'), ICON_DELETE, () => this.#deps.actions.delete(), false, true)
  }

  buildConvertView() {
    this.#menuEl.innerHTML = ''
    this.#applyDirection('forward')

    const current = this.#deps.blocks.getCurrentBlock()
    if (!current) return

    // Back button.
    this.#addItem(this.#deps.i18n.t('block.back'), ICON_BACK, () => this.#deps.rebuildMain('back'))
    this.#menuEl.appendChild(el('li', 'oe-settings-menu__separator', { role: 'separator' }))

    for (const plugin of this.#deps.plugins.values()) {
      const isActive = plugin.type === current.type
      const item = this.#createItemBtn(plugin.title, plugin.icon, () => {
        this.#deps.actions.convertTo(plugin.type)
      })
      if (isActive) item.classList.add('oe-settings-menu__item--active')
      this.#menuEl.appendChild(item)
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  /**
   * @param {'forward' | 'back' | 'none'} direction
   */
  #applyDirection(direction) {
    if (direction === 'back') {
      this.#menuEl.classList.add('oe-settings-menu--back')
      this.#menuEl.classList.remove('oe-settings-menu--forward')
    } else if (direction === 'forward') {
      this.#menuEl.classList.add('oe-settings-menu--forward')
      this.#menuEl.classList.remove('oe-settings-menu--back')
    } else {
      this.#menuEl.classList.remove('oe-settings-menu--forward', 'oe-settings-menu--back')
    }
  }

  /**
   * @param {string} label
   * @param {string} icon
   * @param {() => void} handler
   * @param {boolean} [disabled]
   * @param {boolean} [danger]
   */
  #addItem(label, icon, handler, disabled = false, danger = false) {
    this.#menuEl.appendChild(this.#createItemBtn(label, icon, handler, disabled, danger))
  }

  /**
   * @param {string} label
   * @param {string} icon
   * @param {() => void} handler
   */
  #addDrilldownItem(label, icon, handler) {
    const item = this.#createItemBtn(label, icon, handler)
    const arrow = el('span', 'oe-settings-menu__arrow')
    arrow.innerHTML = ICON_CHEVRON_RIGHT
    item.appendChild(arrow)
    this.#menuEl.appendChild(item)
  }

  /**
   * @param {string} label
   * @param {string} icon
   * @param {() => void} handler
   * @param {boolean} [disabled]
   * @param {boolean} [danger]
   * @returns {HTMLElement}
   */
  #createItemBtn(label, icon, handler, disabled = false, danger = false) {
    let cls = 'oe-settings-menu__item'
    if (disabled) cls += ' oe-settings-menu__item--disabled'
    if (danger) cls += ' oe-settings-menu__item--danger'

    const btn = el('li', cls, {
      role: 'menuitem',
      tabindex: '-1',
      ...(disabled ? { 'aria-disabled': 'true' } : {}),
    })

    const iconSpan = el('span', 'oe-settings-menu__icon')
    iconSpan.innerHTML = icon
    btn.appendChild(iconSpan)

    const labelSpan = el('span', 'oe-settings-menu__label')
    labelSpan.textContent = label
    btn.appendChild(labelSpan)

    if (!disabled) {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        handler()
      })
    }

    return btn
  }
}
