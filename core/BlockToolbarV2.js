// @ts-check
import { setTrustedHtml } from '../plugin-kit/index.js'
import {
  ICON_DELETE,
  ICON_DOWN,
  ICON_DRAG,
  ICON_DUPLICATE,
  ICON_PLUS,
  ICON_SWITCH,
  ICON_UP,
} from './icons.js'

export class BlockToolbarV2 {
  #root
  #runtime
  #registry
  #view
  #selection
  #inlineCommands
  #translate
  #t
  #toolbar
  #toolbox
  #settings
  #plus
  #settingsButton
  #currentId = null
  #bookmark = null
  #destroyed = false
  #documentClick

  constructor({ root, runtime, registry, view, selection, inlineCommands, translate, t }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#view = view
    this.#selection = selection
    this.#inlineCommands = inlineCommands
    this.#translate = typeof translate === 'function' ? translate : (_key, fallback = '') => fallback
    this.#t = typeof t === 'function' ? t : (_key, fallback = '') => fallback

    const document = root.ownerDocument
    this.#toolbar = document.createElement('div')
    this.#toolbar.className = 'oe-toolbar'
    this.#toolbar.style.display = 'none'

    this.#plus = document.createElement('button')
    this.#plus.type = 'button'
    this.#plus.className = 'oe-toolbar__btn'
    this.#plus.setAttribute('aria-label', this.#t('toolbar.add', 'Add block'))
    this.#plus.setAttribute('aria-haspopup', 'menu')
    this.#plus.setAttribute('aria-expanded', 'false')
    setTrustedHtml(this.#plus, ICON_PLUS)

    this.#settingsButton = document.createElement('button')
    this.#settingsButton.type = 'button'
    this.#settingsButton.className = 'oe-toolbar__btn oe-toolbar__drag'
    this.#settingsButton.setAttribute('aria-label', this.#t('toolbar.tune', 'Block settings'))
    this.#settingsButton.setAttribute('aria-haspopup', 'menu')
    this.#settingsButton.setAttribute('aria-expanded', 'false')
    setTrustedHtml(this.#settingsButton, ICON_DRAG)

    this.#toolbar.append(this.#plus, this.#settingsButton)

    this.#toolbox = document.createElement('ul')
    this.#toolbox.className = 'oe-toolbox'
    this.#toolbox.setAttribute('role', 'menu')
    this.#toolbox.tabIndex = -1
    this.#toolbox.style.display = 'none'

    this.#settings = document.createElement('ul')
    this.#settings.className = 'oe-settings-menu'
    this.#settings.setAttribute('role', 'menu')
    this.#settings.tabIndex = -1
    this.#settings.style.display = 'none'

    root.append(this.#toolbar, this.#toolbox, this.#settings)
    this.#buildToolbox()

    this.#plus.addEventListener('mousedown', () => {
      this.#bookmark = this.#selection.capture()
    })
    this.#plus.addEventListener('click', event => {
      event.stopPropagation()
      if (this.#toolbox.style.display === 'none') this.openToolbox()
      else this.closeToolbox()
    })
    this.#settingsButton.addEventListener('click', event => {
      event.stopPropagation()
      if (this.#settings.style.display === 'none') this.openSettings()
      else this.closeSettings()
    })

    this.#documentClick = event => {
      const target = event.target
      if (!target || typeof target !== 'object') return
      if (this.#toolbar.contains(target) || this.#toolbox.contains(target) || this.#settings.contains(target)) return
      this.closeToolbox()
      this.closeSettings()
    }
    document.addEventListener('click', this.#documentClick, true)
  }

  showFor(blockId) {
    if (this.#destroyed || this.#runtime.readOnly) return
    if (!this.#runtime.get(blockId)) return
    const previous = this.#currentId ? this.#view.element(this.#currentId) : null
    previous?.classList?.remove('oe-block--focused')
    this.#currentId = blockId
    const element = this.#view.element(blockId)
    if (!element) return
    element.classList.add('oe-block--focused')
    this.#toolbar.style.display = ''
    this.#position(element)
  }

  setReadOnly(value) {
    if (value) {
      this.hide()
      return
    }
    if (this.#currentId) this.showFor(this.#currentId)
  }

  hide() {
    const current = this.#currentId ? this.#view.element(this.#currentId) : null
    current?.classList?.remove('oe-block--focused')
    this.#toolbar.style.display = 'none'
    this.closeToolbox()
    this.closeSettings()
  }

  openToolbox() {
    if (this.#runtime.readOnly) return
    this.closeSettings()
    this.#toolbox.style.display = ''
    this.#plus.setAttribute('aria-expanded', 'true')
    this.#positionPopup(this.#toolbox)
  }

  closeToolbox() {
    this.#toolbox.style.display = 'none'
    this.#plus.setAttribute('aria-expanded', 'false')
  }

  openSettings() {
    if (this.#runtime.readOnly || !this.#currentId) return
    this.closeToolbox()
    this.#buildSettings()
    this.#settings.style.display = ''
    this.#settingsButton.setAttribute('aria-expanded', 'true')
    this.#positionPopup(this.#settings)
  }

  closeSettings() {
    this.#settings.style.display = 'none'
    this.#settingsButton.setAttribute('aria-expanded', 'false')
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#root.ownerDocument.removeEventListener('click', this.#documentClick, true)
    this.#toolbar.remove()
    this.#toolbox.remove()
    this.#settings.remove()
  }

  #label(scope, type, label) {
    if (!label) return type
    const key = `${scope}.${type}.${label.key}`
    const translated = this.#translate(key, label.fallback)
    return translated === key ? label.fallback : translated
  }

  #buildToolbox() {
    const document = this.#root.ownerDocument
    this.#toolbox.replaceChildren()
    const count = this.#registry.blockTypes.length + this.#registry.inlineTypes.length
    if (count > 7) {
      const filter = document.createElement('li')
      filter.className = 'oe-toolbox__filter'
      filter.setAttribute('role', 'none')
      const input = document.createElement('input')
      input.className = 'oe-toolbox__filter-input'
      input.type = 'text'
      input.placeholder = this.#t('toolbox.search', 'Search')
      input.addEventListener('input', () => this.#filterToolbox(input.value))
      filter.append(input)
      this.#toolbox.append(filter)
    }

    for (const type of this.#registry.blockTypes) {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) continue
      const item = this.#toolboxItem(
        type,
        this.#label('plugin', type, definition.label),
        definition.icon,
        () => this.#insertBlock(type),
      )
      const variants = definition.toolbox ?? []
      if (variants.length) {
        const group = document.createElement('span')
        group.className = 'oe-toolbox__variants'
        for (const variant of variants) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'oe-toolbox__variant'
          button.dataset.toolboxItem = variant.id
          button.textContent = this.#label('plugin', type, variant.label)
          button.addEventListener('click', event => {
            event.preventDefault()
            event.stopPropagation()
            this.#insertBlock(type, variant.id)
          })
          group.append(button)
        }
        item.append(group)
      }
      this.#toolbox.append(item)
    }

    for (const type of this.#registry.inlineTypes) {
      const definition = this.#registry.getInlineDefinition(type)
      if (!definition) continue
      const item = this.#toolboxItem(
        type,
        this.#label('inline', type, definition.label),
        definition.icon,
        () => this.#insertInline(type),
        true,
      )
      this.#toolbox.append(item)
    }

    this.#toolbox.addEventListener('keydown', event => this.#menuKeydown(event, this.#toolbox))
  }

  #toolboxItem(type, label, iconHtml, action, inline = false) {
    const document = this.#root.ownerDocument
    const item = document.createElement('li')
    item.className = 'oe-toolbox__item' + (inline ? ' oe-toolbox__item--inline' : '')
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
    item.dataset.pluginType = type
    item.dataset.search = (type + '\0' + label).toLocaleLowerCase()

    const icon = document.createElement('span')
    icon.className = 'oe-toolbox__icon'
    setTrustedHtml(icon, iconHtml ?? '')
    const text = document.createElement('span')
    text.className = 'oe-toolbox__label'
    text.textContent = label
    item.append(icon, text)
    item.addEventListener('click', event => {
      if (event.target?.closest?.('.oe-toolbox__variant')) return
      event.preventDefault()
      event.stopPropagation()
      action()
    })
    return item
  }

  #filterToolbox(query) {
    const value = String(query ?? '').trim().toLocaleLowerCase()
    for (const item of this.#toolbox.querySelectorAll('.oe-toolbox__item')) {
      const element = /** @type {HTMLElement} */ (item)
      element.style.display = !value || (element.dataset.search ?? '').includes(value) ? '' : 'none'
    }
  }

  #insertBlock(type, toolboxItemId) {
    if (this.#runtime.readOnly) return
    const currentId = this.#currentId
    let id
    if (currentId && this.#runtime.isEmpty(currentId)) {
      this.#runtime.convert(currentId, { type, ...(toolboxItemId ? { toolboxItemId } : {}) })
      id = currentId
    } else {
      const definition = this.#registry.getBlockDefinition(type)
      let data
      if (toolboxItemId) {
        const item = definition?.toolbox?.find(candidate => candidate.id === toolboxItemId)
        data = definition?.schema.createDefault()
        if (item?.configure) data = item.configure(data, { createId: prefix => this.#runtime.createDataId(prefix) })
      }
      const index = currentId ? this.#view.indexOf(currentId) + 1 : this.#runtime.list().length
      id = this.#runtime.insert(type, data, index)
    }
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    this.closeToolbox()
    queueMicrotask(() => {
      this.#view.focus(id, { offset: 'start' })
      this.showFor(id)
    })
  }

  #insertInline(type) {
    if (this.#runtime.readOnly) return
    const bookmark = this.#bookmark
    this.closeToolbox()
    if (bookmark && this.#selection.restore(bookmark)) {
      this.#inlineCommands.insert(type)
      return
    }

    const currentId = this.#currentId
    const current = currentId ? this.#runtime.get(currentId) : null
    const definition = current ? this.#registry.getBlockDefinition(current.type) : null
    if (currentId && definition?.schema?.mapRichText) {
      this.#view.focus(currentId, { offset: 'end' })
      queueMicrotask(() => this.#inlineCommands.insert(type))
      return
    }

    const index = currentId ? this.#view.indexOf(currentId) + 1 : this.#runtime.list().length
    const id = this.#runtime.insert(this.#registry.defaultBlockType, undefined, index)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    queueMicrotask(() => {
      this.#view.focus(id, { offset: 'start' })
      this.#inlineCommands.insert(type)
      this.showFor(id)
    })
  }

  #buildSettings() {
    const document = this.#root.ownerDocument
    this.#settings.replaceChildren()
    const id = this.#currentId
    if (!id) return
    const record = this.#runtime.get(id)
    if (!record) return
    const index = this.#view.indexOf(id)
    const records = this.#runtime.list()

    this.#settings.append(
      this.#settingsItem(this.#t('block.moveUp', 'Move up'), ICON_UP, () => this.#move(id, index - 1), index === 0),
      this.#settingsItem(this.#t('block.moveDown', 'Move down'), ICON_DOWN, () => this.#move(id, index + 1), index === records.length - 1),
      this.#separator(),
    )

    const definition = this.#registry.getBlockDefinition(record.type)
    const settings = definition?.capabilities?.settings
    if (settings?.kind === 'actions') {
      const actions = settings.actions(record.data, {
        ownerDocument: document,
        t: label => this.#label('plugin', record.type, label),
      })
      for (const action of actions) {
        this.#settings.append(this.#settingsItem(
          this.#label('plugin', record.type, action.label),
          action.icon ?? '',
          () => {
            this.#runtime.update(id, current => ({
              data: settings.apply(current.data, action.id, { createId: prefix => this.#runtime.createDataId(prefix) }),
            }))
            this.#view.reconcileInteraction()
            this.#view.setCurrent(id)
            this.closeSettings()
          },
          action.disabled === true,
          false,
          action.active === true,
        ))
      }
      if (actions.length) this.#settings.append(this.#separator())
    }

    this.#settings.append(this.#settingsItem(
      this.#t('block.duplicate', 'Duplicate'),
      ICON_DUPLICATE,
      () => this.#duplicate(id),
    ))

    if (this.#registry.blockTypes.length > 1) {
      const convert = this.#settingsItem(this.#t('block.convertTo', 'Convert to'), ICON_SWITCH, () => {})
      convert.classList.add('oe-settings-menu__item--active')
      this.#settings.append(convert)
      for (const type of this.#registry.blockTypes) {
        if (type === record.type) continue
        const target = this.#registry.getBlockDefinition(type)
        if (!target) continue
        this.#settings.append(this.#settingsItem(
          '  ' + this.#label('plugin', type, target.label),
          target.icon,
          () => {
            try {
              this.#runtime.convert(id, { type })
              this.#view.reconcileInteraction()
              this.#view.setCurrent(id)
              this.closeSettings()
              queueMicrotask(() => this.#view.focus(id))
            } catch {}
          },
        ))
      }
    }

    this.#settings.append(
      this.#separator(),
      this.#settingsItem(this.#t('block.delete', 'Delete'), ICON_DELETE, () => {
        this.#runtime.remove(id)
        this.#view.reconcileInteraction()
        this.#currentId = this.#view.currentId
        this.closeSettings()
        if (this.#currentId) queueMicrotask(() => this.#view.focus(this.#currentId))
      }, false, true),
    )
    this.#settings.addEventListener('keydown', event => this.#menuKeydown(event, this.#settings))
  }

  #settingsItem(label, iconHtml, action, disabled = false, danger = false, active = false) {
    const document = this.#root.ownerDocument
    const item = document.createElement('li')
    item.className = 'oe-settings-menu__item'
    if (disabled) item.classList.add('oe-settings-menu__item--disabled')
    if (danger) item.classList.add('oe-settings-menu__item--danger')
    if (active) item.classList.add('oe-settings-menu__item--active')
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
    if (disabled) item.setAttribute('aria-disabled', 'true')

    const icon = document.createElement('span')
    icon.className = 'oe-settings-menu__icon'
    setTrustedHtml(icon, iconHtml ?? '')
    const text = document.createElement('span')
    text.className = 'oe-settings-menu__label'
    text.textContent = label
    item.append(icon, text)
    if (!disabled) item.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      action()
    })
    return item
  }

  #separator() {
    const element = this.#root.ownerDocument.createElement('li')
    element.className = 'oe-settings-menu__separator'
    element.setAttribute('role', 'separator')
    return element
  }

  #move(id, to) {
    if (to < 0 || to >= this.#runtime.list().length) return
    this.#runtime.move(id, to)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    this.closeSettings()
    queueMicrotask(() => {
      this.#view.focus(id)
      this.showFor(id)
    })
  }

  #duplicate(id) {
    const record = this.#runtime.get(id)
    if (!record) return
    const index = this.#view.indexOf(id)
    const duplicate = this.#runtime.insert(record.type, record.data, index + 1, {
      tunes: record.tunes,
      inline: record.inline,
    })
    this.#view.reconcileInteraction()
    this.#view.setCurrent(duplicate)
    this.closeSettings()
    queueMicrotask(() => {
      this.#view.focus(duplicate)
      this.showFor(duplicate)
    })
  }

  #position(block) {
    const rootRect = this.#root.getBoundingClientRect()
    const blockRect = block.getBoundingClientRect()
    this.#toolbar.style.position = 'absolute'
    this.#toolbar.style.top = `${Math.max(0, blockRect.top - rootRect.top)}px`
    this.#toolbar.style.left = `${Math.max(0, blockRect.left - rootRect.left - 52)}px`
  }

  #positionPopup(popup) {
    const rootRect = this.#root.getBoundingClientRect()
    const toolbarRect = this.#toolbar.getBoundingClientRect()
    popup.style.position = 'absolute'
    popup.style.top = `${Math.max(0, toolbarRect.bottom - rootRect.top + 6)}px`
    popup.style.left = `${Math.max(0, toolbarRect.left - rootRect.left)}px`
  }

  #menuKeydown(event, menu) {
    const items = [...menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')]
    if (!items.length) return
    const current = menu.ownerDocument.activeElement
    const index = items.indexOf(current)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = index < 0 ? 0 : (index + direction + items.length) % items.length
      items[next]?.focus?.()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.closeToolbox()
      this.closeSettings()
      this.#plus.focus()
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault()
      items[index]?.click?.()
    }
  }
}
