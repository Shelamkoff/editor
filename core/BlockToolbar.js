// @ts-check
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { Tooltip } from './Tooltip.js'
import { positionPopup } from '../shared/editorDom.js'
import {
  ICON_BACK,
  ICON_CHEVRON_RIGHT,
  ICON_DELETE,
  ICON_DOWN,
  ICON_DRAG,
  ICON_DUPLICATE,
  ICON_PLUS,
  ICON_SWITCH,
  ICON_UP,
} from './icons.js'

export class BlockToolbar {
  #root
  #runtime
  #registry
  #view
  #selection
  #inlineCommands
  #translate
  #t
  #toolbar
  #tooltip
  #toolbox
  #settings
  #backdrop
  #plus
  #settingsButton
  #currentId = null
  #bookmark = null
  #filterThreshold
  #destroyed = false
  #documentClick
  #viewportChange
  /** @type {number | null} */
  #positionFrame = null
  /** @type {ResizeObserver | null} */
  #resizeObserver = null
  #toolboxParent = null
  #toolboxQuery = ''
  #settingsView = 'main'
  #toolboxVersion = 0
  #settingsVersion = 0

  constructor({ root, runtime, registry, view, selection, inlineCommands, translate, t, filterThreshold = 7 }) {
    if (!Number.isSafeInteger(filterThreshold) || filterThreshold < 0) {
      throw new RangeError('Toolbox filter threshold must be a non-negative safe integer')
    }
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#view = view
    this.#selection = selection
    this.#inlineCommands = inlineCommands
    this.#filterThreshold = filterThreshold
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

    this.#backdrop = document.createElement('div')
    this.#backdrop.className = 'oe-offcanvas-backdrop'
    this.#backdrop.setAttribute('aria-hidden', 'true')
    this.#backdrop.addEventListener('click', () => {
      this.closeToolbox()
      this.closeSettings()
    })

    root.append(this.#toolbar, this.#toolbox, this.#settings, this.#backdrop)
    this.#buildToolbox()
    this.#toolbox.addEventListener('keydown', event => this.#menuKeydown(event, this.#toolbox))
    this.#settings.addEventListener('keydown', event => this.#menuKeydown(event, this.#settings))

    this.#tooltip = new Tooltip(root)
    for (const button of [this.#plus, this.#settingsButton]) {
      this.#tooltip.bind(button, () => button.getAttribute('aria-label') ?? '')
    }

    this.#plus.addEventListener('mousedown', () => {
      this.#bookmark = this.#selection.capture()
    })
    this.#settingsButton.addEventListener('mousedown', () => {
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
    this.#viewportChange = () => this.refresh()
    document.defaultView?.addEventListener('resize', this.#viewportChange)
    const ResizeObserverCtor = document.defaultView?.ResizeObserver
    if (ResizeObserverCtor) {
      this.#resizeObserver = new ResizeObserverCtor(() => this.refresh())
      this.#resizeObserver.observe(root)
    }
  }

  get dragHandle() {
    return this.#settingsButton
  }

  showFor(blockId) {
    if (this.#destroyed || this.#runtime.readOnly) return
    if (!this.#runtime.get(blockId)) return
    if (this.#currentId !== blockId) {
      this.#tooltip.hide()
      this.closeToolbox()
      this.closeSettings()
    }
    const previous = this.#currentId ? this.#view.element(this.#currentId) : null
    previous?.classList?.remove('oe-block--focused')
    this.#currentId = blockId
    const element = this.#view.element(blockId)
    if (!element) return
    element.classList.add('oe-block--focused')
    this.#toolbar.style.display = ''
    this.refresh()
  }

  refresh() {
    if (this.#destroyed || this.#runtime.readOnly || this.#toolbar.style.display === 'none') return
    const block = this.#currentId ? this.#view.element(this.#currentId) : null
    if (!block) {
      this.hide()
      return
    }
    this.#position(block)
    if (this.#toolbox.style.display !== 'none') this.#positionPopup(this.#toolbox)
    if (this.#settings.style.display !== 'none') this.#positionPopup(this.#settings)
    // Geometry includes the projection's visual transform until its animation ends.
    const moving = this.#root.getAnimations?.({ subtree: true }).some(animation =>
      (animation.playState === 'running' || animation.pending)
      && Number.isFinite(animation.effect?.getComputedTiming().endTime),
    )
    if (moving && this.#positionFrame === null) {
      this.#positionFrame = this.#root.ownerDocument.defaultView?.requestAnimationFrame(() => {
        this.#positionFrame = null
        this.refresh()
      }) ?? null
    }
  }

  #cancelPositionFrame() {
    if (this.#positionFrame === null) return
    this.#root.ownerDocument.defaultView?.cancelAnimationFrame(this.#positionFrame)
    this.#positionFrame = null
  }

  setReadOnly(value) {
    if (value) {
      this.hide()
      return
    }
    if (this.#currentId) this.showFor(this.#currentId)
  }

  hide() {
    this.#cancelPositionFrame()
    this.#tooltip.hide()
    const current = this.#currentId ? this.#view.element(this.#currentId) : null
    current?.classList?.remove('oe-block--focused')
    this.#toolbar.style.display = 'none'
    this.closeToolbox()
    this.closeSettings()
  }

  openToolbox() {
    if (this.#runtime.readOnly) return
    this.#bookmark = this.#selection.capture() ?? this.#bookmark
    this.closeSettings()
    this.#toolboxQuery = ''
    this.#buildToolbox()
    this.#toolbox.style.display = ''
    this.#toolbox.classList.add('oe-toolbox--open')
    this.#plus.setAttribute('aria-expanded', 'true')
    this.#positionPopup(this.#toolbox)
    this.#syncBackdrop()
    this.#toolbox.focus({ preventScroll: true })
  }

  closeToolbox() {
    this.#toolboxVersion++
    this.#toolbox.style.display = 'none'
    this.#toolbox.classList.remove('oe-toolbox--open')
    this.#plus.setAttribute('aria-expanded', 'false')
    this.#syncBackdrop()
  }

  openSettings() {
    if (this.#runtime.readOnly || !this.#currentId) return
    this.#bookmark = this.#selection.capture() ?? this.#bookmark
    this.closeToolbox()
    this.#buildSettings()
    this.#settings.style.display = ''
    this.#settings.classList.add('oe-settings-menu--open')
    this.#settingsButton.setAttribute('aria-expanded', 'true')
    this.#positionPopup(this.#settings)
    this.#syncBackdrop()
    this.#settings.focus({ preventScroll: true })
  }

  closeSettings() {
    this.#settingsVersion++
    this.#settings.style.display = 'none'
    this.#settings.classList.remove('oe-settings-menu--open')
    this.#settingsButton.setAttribute('aria-expanded', 'false')
    this.#syncBackdrop()
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#cancelPositionFrame()
    this.#resizeObserver?.disconnect()
    this.#root.ownerDocument.removeEventListener('click', this.#documentClick, true)
    this.#root.ownerDocument.defaultView?.removeEventListener('resize', this.#viewportChange)
    this.#tooltip.destroy()
    this.#toolbar.remove()
    this.#toolbox.remove()
    this.#settings.remove()
    this.#backdrop.remove()
  }

  #label(scope, type, label) {
    if (!label) return type
    const key = `${scope}.${type}.${label.key}`
    const translated = this.#translate(key, label.fallback)
    return translated === key ? label.fallback : translated
  }

  #buildToolbox(direction = 'none') {
    const document = this.#root.ownerDocument
    this.#toolboxVersion++
    this.#toolboxParent = null
    this.#toolbox.replaceChildren()
    this.#applyDirection(this.#toolbox, direction)
    const count = this.#registry.blockTypes.length + this.#registry.inlineTypes.length
    if (count > this.#filterThreshold) {
      const filter = document.createElement('li')
      filter.className = 'oe-toolbox__filter'
      filter.setAttribute('role', 'none')
      const input = document.createElement('input')
      input.className = 'oe-toolbox__filter-input'
      input.type = 'text'
      input.placeholder = this.#t('toolbox.search', 'Search')
      input.value = this.#toolboxQuery
      input.addEventListener('input', () => {
        this.#toolboxQuery = input.value
        this.#filterToolbox(input.value)
      })
      filter.append(input)
      this.#toolbox.append(filter)
    }

    for (const type of this.#registry.blockTypes) {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) continue
      const variants = definition.toolbox ?? []
      const item = this.#toolboxItem(
        type,
        this.#label('plugin', type, definition.label),
        definition.icon,
        () => variants.length ? this.#showToolboxVariants(type) : this.#insertBlock(type),
      )
      if (variants.length) {
        this.#addArrow(item, 'oe-toolbox__arrow')
        item.dataset.search += '\0' + variants.map(variant => this.#label('plugin', type, variant.label)).join('\0').toLocaleLowerCase()
      }
      this.#toolbox.append(item)
    }

    for (const type of this.#registry.inlineTypes) {
      const definition = this.#registry.getInlineDefinition(type)
      if (!definition) continue
      const item = this.#toolboxItem(
        type,
        this.#label('inlinePlugin', type, definition.label),
        definition.icon,
        () => this.#insertInline(type),
        true,
      )
      this.#toolbox.append(item)
    }

    this.#filterToolbox(this.#toolboxQuery)
  }

  #showToolboxVariants(type) {
    const definition = this.#registry.getBlockDefinition(type)
    if (!definition?.toolbox?.length) return
    this.#toolboxVersion++
    this.#toolboxParent = type
    this.#toolbox.replaceChildren()
    this.#applyDirection(this.#toolbox, 'forward')
    const back = this.#toolboxItem('', this.#t('block.back', 'Back'), ICON_BACK, () => {
      this.#buildToolbox('back')
      this.#positionPopup(this.#toolbox)
      this.#toolbox.querySelector(`[data-plugin-type="${CSS.escape(type)}"]`)?.focus()
    })
    back.dataset.menuBack = 'true'
    this.#toolbox.append(back)
    for (const variant of definition.toolbox) {
      const item = this.#toolboxItem(type, this.#label('plugin', type, variant.label), variant.icon ?? definition.icon, () => this.#insertBlock(type, variant.id))
      item.dataset.toolboxItem = variant.id
      this.#toolbox.append(item)
    }
    this.#toolbox.scrollTop = 0
    this.#positionPopup(this.#toolbox)
    back.focus({ preventScroll: true })
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
    const version = this.#toolboxVersion
    const generation = this.#runtime.generation
    const ownerId = this.#currentId
    const owner = ownerId ? this.#view.element(ownerId) : null
    item.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#destroyed || this.#runtime.readOnly || version !== this.#toolboxVersion || generation !== this.#runtime.generation) return
      if (ownerId && owner !== this.#view.element(ownerId)) return
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
      this.#mutate('block.convert', () => this.#runtime.convert(currentId, { type, ...(toolboxItemId ? { toolboxItemId } : {}) }), () => currentId)
      id = currentId
    } else {
      const definition = this.#registry.getBlockDefinition(type)
      let data
      if (toolboxItemId) {
        const item = definition?.toolbox?.find(candidate => candidate.id === toolboxItemId)
        data = definition?.schema.createDefault()
        if (item?.configure) data = item.configure(data, { createId: prefix => this.#runtime.createDataId(prefix) })
      }
      const index = currentId ? this.#view.indexOf(currentId) + 1 : this.#runtime.size
      id = this.#mutate('block.insert', () => this.#runtime.insert(type, data, index), result => result)
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

    const index = currentId ? this.#view.indexOf(currentId) + 1 : this.#runtime.size
    const id = this.#runtime.insert(this.#registry.defaultBlockType, undefined, index)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    queueMicrotask(() => {
      this.#view.focus(id, { offset: 'start' })
      this.#inlineCommands.insert(type)
      this.showFor(id)
    })
  }

  #buildSettings(direction = 'none') {
    const document = this.#root.ownerDocument
    this.#settingsVersion++
    this.#settingsView = 'main'
    this.#settings.replaceChildren()
    this.#applyDirection(this.#settings, direction)
    const id = this.#currentId
    if (!id) return
    const record = this.#runtime.get(id)
    if (!record) return
    const index=this.#runtime.indexOf(id)

    this.#settings.append(
      this.#settingsItem(this.#t('block.moveUp','Move up'),ICON_UP,()=>this.#move(id,index-1),index===0),
      this.#settingsItem(this.#t('block.moveDown','Move down'),ICON_DOWN,()=>this.#move(id,index+1),index===this.#runtime.size-1),
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
            this.#mutate('block.settings', () => this.#runtime.update(id, current => ({
              data: settings.apply(current.data, action.id, { createId: prefix => this.#runtime.createDataId(prefix) }),
            })), () => id)
            this.#view.reconcileInteraction()
            this.#view.setCurrent(id)
            this.closeSettings()
            queueMicrotask(() => this.#view.focus(id))
          },
          action.disabled === true,
          false,
          action.active === true,
        ))
      }
      if (actions.length) this.#settings.append(this.#separator())
    } else if (settings?.kind === 'panel') {
      const shell = document.createElement('li')
      shell.className = 'oe-settings-menu__panel'
      shell.setAttribute('role', 'none')
      const version = this.#settingsVersion
      const generation = this.#runtime.generation
      const owner = this.#view.element(id)
      const isCurrent = () => !this.#destroyed && !this.#runtime.readOnly
        && version === this.#settingsVersion && generation === this.#runtime.generation
        && this.#runtime.get(id)?.type === record.type && owner === this.#view.element(id)
      let panelData = record.data
      let panel
      try {
        panel = settings.render({
          ownerDocument: document,
          t: label => this.#label('plugin', record.type, label),
          getData: () => {
            if (isCurrent()) panelData = this.#runtime.get(id).data
            return panelData
          },
          updateData: producer => {
            if (!isCurrent()) return
            if (typeof producer !== 'function') throw new TypeError('Settings panel updateData requires a producer')
            this.#runtime.update(id, current => ({ data: producer(current.data) }))
            if (!isCurrent()) return
            panelData = this.#runtime.get(id).data
            this.#view.reconcileInteraction()
            this.#view.setCurrent(id)
          },
        })
        const HTMLElementCtor = document.defaultView?.HTMLElement ?? globalThis.HTMLElement
        if (!HTMLElementCtor || !(panel instanceof HTMLElementCtor)) {
          throw new TypeError(`Settings panel for "${record.type}" must return an HTMLElement`)
        }
      } catch (error) {
        if (version === this.#settingsVersion) this.#settingsVersion++
        throw error
      }
      if (!isCurrent()) return
      shell.appendChild(panel)
      this.#settings.append(shell, this.#separator())
    }

    this.#settings.append(this.#settingsItem(
      this.#t('block.duplicate', 'Duplicate'),
      ICON_DUPLICATE,
      () => this.#duplicate(id),
    ))

    if (this.#registry.blockTypes.length > 1) {
      const convert = this.#settingsItem(this.#t('block.convertTo', 'Convert to'), ICON_SWITCH, () => this.#showConversionTypes())
      convert.dataset.menuConvert = 'true'
      this.#addArrow(convert, 'oe-settings-menu__arrow')
      this.#settings.append(convert)
    }

    this.#settings.append(
      this.#separator(),
      this.#settingsItem(this.#t('block.delete', 'Delete'), ICON_DELETE, () => {
        const focusId = this.#mutate('block.remove', () => this.#runtime.remove(id), result => result)
        this.#view.reconcileInteraction()
        this.#currentId = focusId ?? this.#view.currentId
        this.closeSettings()
        if (this.#currentId) queueMicrotask(() => this.#view.focus(this.#currentId))
      }, false, true),
    )
  }

  #showConversionTypes() {
    const id = this.#currentId
    const record = id ? this.#runtime.get(id) : null
    if (!record) return
    this.#settingsVersion++
    this.#settingsView = 'convert'
    this.#settings.replaceChildren()
    this.#applyDirection(this.#settings, 'forward')
    const back = this.#settingsItem(this.#t('block.back', 'Back'), ICON_BACK, () => {
      this.#buildSettings('back')
      this.#positionPopup(this.#settings)
      this.#settings.querySelector('[data-menu-convert]')?.focus()
    })
    back.dataset.menuBack = 'true'
    this.#settings.append(back, this.#separator())
    const crossBlock = this.#bookmark?.anchor.blockId !== this.#bookmark?.focus.blockId
    for (const type of this.#registry.blockTypes) {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) continue
      const current = type === record.type
      const item = this.#settingsItem(this.#label('plugin', type, definition.label), definition.icon, () => {
        try {
          const result = this.#mutate('block.convert', () => {
            const bookmark = this.#bookmark
            if (bookmark) {
              const anchor = this.#view.indexOf(bookmark.anchor.blockId)
              const focus = this.#view.indexOf(bookmark.focus.blockId)
              const owner = this.#view.indexOf(id)
              if (anchor >= 0 && focus >= 0 && owner >= Math.min(anchor, focus) && owner <= Math.max(anchor, focus)) {
                return this.#runtime.convertLogicalSelection(bookmark, { type })
              }
            }
            this.#runtime.convert(id, { type })
            return { focusId: id }
          }, result => result?.focusId)
          if (!result) return
          this.#view.reconcileInteraction()
          this.#view.setCurrent(result.focusId)
          this.closeSettings()
          queueMicrotask(() => this.#view.focus(result.focusId, { offset: 'start' }))
        } catch {}
      }, current && !crossBlock, false, current)
      item.dataset.pluginType = type
      this.#settings.append(item)
    }
    this.#settings.scrollTop = 0
    this.#positionPopup(this.#settings)
    back.focus({ preventScroll: true })
  }

  #addArrow(item, className) {
    item.setAttribute('aria-haspopup', 'menu')
    const arrow = this.#root.ownerDocument.createElement('span')
    arrow.className = className
    setTrustedHtml(arrow, ICON_CHEVRON_RIGHT)
    item.append(arrow)
  }

  #applyDirection(menu, direction) {
    const prefix = menu === this.#toolbox ? 'oe-toolbox' : 'oe-settings-menu'
    menu.classList.toggle(`${prefix}--forward`, direction === 'forward')
    menu.classList.toggle(`${prefix}--back`, direction === 'back')
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
    const version = this.#settingsVersion
    const generation = this.#runtime.generation
    const ownerId = this.#currentId
    const owner = ownerId ? this.#view.element(ownerId) : null
    if (!disabled) item.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#destroyed || this.#runtime.readOnly || version !== this.#settingsVersion || generation !== this.#runtime.generation) return
      if (ownerId && owner !== this.#view.element(ownerId)) return
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
    if (to < 0 || to >= this.#runtime.size) return
    const bookmark = this.#bookmark ?? this.#selection.capture()
    if (bookmark) this.#selection.restore(bookmark)
    this.#runtime.interact('block.move', () => this.#runtime.move(id, to), () => bookmark)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    this.showFor(id)
    // Rebuild boundary actions while keeping the menu and author caret usable.
    this.openSettings()
  }

  #duplicate(id) {
    const record = this.#runtime.get(id)
    if (!record) return
    const index = this.#view.indexOf(id)
    const duplicate = this.#mutate('block.duplicate', () => this.#runtime.insert(record.type, record.data, index + 1, {
      tunes: record.tunes,
      inline: record.inline,
    }), result => result)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(duplicate)
    this.closeSettings()
    queueMicrotask(() => {
      this.#view.focus(duplicate)
      this.showFor(duplicate)
    })
  }

  #mutate(name, operation, focusId) {
    if (this.#bookmark) this.#selection.restore(this.#bookmark)
    return this.#runtime.interact(name, operation, result => {
      const id = focusId(result)
      const field = id ? this.#view.fields(id)[0] : null
      if (!id || !this.#view.element(id)) return null
      const point = { blockId: id, fieldKey: field?.key ?? '', offset: 0 }
      return { anchor: point, focus: { ...point } }
    })
  }

  #syncBackdrop() {
    const open = this.#toolbox.classList.contains('oe-toolbox--open')
      || this.#settings.classList.contains('oe-settings-menu--open')
    this.#backdrop.classList.toggle('oe-offcanvas-backdrop--visible', open)
    this.#backdrop.setAttribute('aria-hidden', String(!open))
  }

  #position(block) {
    if (this.#root.classList.contains('oe-editor--mobile')) {
      if (this.#toolbar.parentElement !== block) block.append(this.#toolbar)
      for (const property of ['position', 'top', 'bottom', 'left', 'right']) this.#toolbar.style[property] = ''
      return
    }
    if (this.#toolbar.parentElement !== this.#root) this.#root.append(this.#toolbar)
    const rootRect = this.#root.getBoundingClientRect()
    const blockRect = block.getBoundingClientRect()
    this.#toolbar.style.position = 'absolute'
    this.#toolbar.style.top = `${Math.max(0, blockRect.top - rootRect.top)}px`
    this.#toolbar.style.left = 'auto'
    const viewportWidth = this.#root.ownerDocument.defaultView?.innerWidth ?? Infinity
    this.#toolbar.style.right = `${Math.max(rootRect.right - blockRect.right - 52, rootRect.right - viewportWidth + 8)}px`
  }

  #positionPopup(popup) {
    if (this.#root.classList.contains('oe-editor--mobile')) {
      for (const property of ['position', 'top', 'bottom', 'left', 'right']) popup.style[property] = ''
      return
    }
    const rootRect = this.#root.getBoundingClientRect()
    const toolbarRect = this.#toolbar.getBoundingClientRect()
    popup.style.position = 'absolute'
    const viewportWidth = this.#root.ownerDocument.defaultView?.innerWidth ?? Infinity
    const left = Math.max(8, Math.min(toolbarRect.right - popup.offsetWidth, viewportWidth - popup.offsetWidth - 8))
    popup.style.left = `${left - rootRect.left}px`
    popup.style.right = 'auto'
    positionPopup(popup, toolbarRect, rootRect, { gap: 6 })
  }

  #menuKeydown(event, menu) {
    if (event.target?.closest?.('input, textarea, select') && !['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return
    const items = [...menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')].filter(item => item.style.display !== 'none')
    if (!items.length && event.key !== 'Escape') return
    const current = menu.ownerDocument.activeElement
    const index = items.indexOf(current)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = index < 0 ? 0 : (index + direction + items.length) % items.length
      items[next]?.focus?.()
    } else if ((event.key === 'Escape' || event.key === 'ArrowLeft') && ((menu === this.#toolbox && this.#toolboxParent) || (menu === this.#settings && this.#settingsView === 'convert'))) {
      event.preventDefault()
      menu.querySelector('[data-menu-back]')?.click()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus?.()
    } else if (event.key === 'ArrowRight' && current?.getAttribute('aria-haspopup') === 'menu') {
      event.preventDefault()
      current.click()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.closeToolbox()
      this.closeSettings()
      if (menu === this.#settings) this.#settingsButton.focus()
      else this.#plus.focus()
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault()
      items[index]?.click?.()
    }
  }
}
