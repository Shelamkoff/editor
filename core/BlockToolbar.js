import { convertedSelection, restoreConvertedSelection } from './conversionSelection.js'
// @ts-check
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { Tooltip } from './Tooltip.js'
import { prepareSettingsActions } from './SettingsActions.js'
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

/** @param {any} left @param {any} right */
function sameLogicalSelection(left,right){
  const point=(a,b)=>Boolean(a&&b&&a.blockId===b.blockId&&a.fieldKey===b.fieldKey&&a.offset===b.offset)
  return Boolean(left&&right&&point(left.anchor,right.anchor)&&point(left.focus,right.focus))
}

export class BlockToolbar {
  #root
  #runtime
  #registry
  #view
  #selection
  #selectionPort
  #inlineCommands
  #translate
  #t
  #reportError
  #toolbar
  #tooltip
  #toolbox
  #settings
  #backdrop
  #plus
  #settingsButton
  #currentId = null
  #bookmark = null
  #bookmarkOwner = null
  #pointerTransfer = false
  #filterThreshold
  #destroyed = false
  #documentClick
  #documentMouseDown
  #documentMouseUp
  #documentFocusOut
  #documentFocusIn
  #documentSelectionChange
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

  constructor({ root, runtime, registry, view, selection, selectionPort, inlineCommands, translate, t, filterThreshold = 7, reportError = (_code, _error) => {} }) {
    if (!Number.isSafeInteger(filterThreshold) || filterThreshold < 0) {
      throw new RangeError('Toolbox filter threshold must be a non-negative safe integer')
    }
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#view = view
    this.#selection = selection
    this.#selectionPort = selectionPort
    this.#inlineCommands = inlineCommands
    this.#reportError = reportError
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
      if (this.#destroyed) return
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

    this.#plus.addEventListener('mousedown', event => {
      if (this.#destroyed || event.button !== 0) return
      this.#captureMenuSelection()
    })
    this.#settingsButton.addEventListener('mousedown', event => {
      if (this.#destroyed || event.button !== 0) return
      this.#captureMenuSelection()
      // The custom pointer drag records history before it opens a menu.
      // Keep its author host focused so the engine can capture that caret.
      event.preventDefault()
    })
    this.#plus.addEventListener('click', event => {
      if (this.#destroyed) return
      event.stopPropagation()
      if (this.#toolbox.style.display === 'none') this.openToolbox()
      else this.closeToolbox()
    })
    this.#settingsButton.addEventListener('click', event => {
      if (this.#destroyed) return
      event.stopPropagation()
      if (this.#settings.style.display === 'none') this.openSettings()
      else this.closeSettings()
    })

    // A new author gesture retires the previous capture. Pointer activation
    // owns its interval only while the document, fields and selection match.
    this.#documentMouseDown = event => {
      if (this.#destroyed || this.#toolbox.contains(event.target) || this.#settings.contains(event.target)) return
      this.#bookmarkOwner = null
      this.#pointerTransfer = event.button === 0 && this.#toolbar.contains(event.target)
    }
    this.#documentMouseUp = () => { this.#pointerTransfer = false }
    document.addEventListener('mousedown', this.#documentMouseDown, true)
    document.addEventListener('mouseup', this.#documentMouseUp, true)
    this.#documentFocusOut = event => {
      if (this.#destroyed || ![this.#plus, this.#settingsButton].includes(event.relatedTarget)) return
      // A pointer press already captured its interval. Focus transfer cannot
      // restamp it after a callback changes the document, field or selection.
      if (this.#pointerTransfer || this.#ownsMenuFocus(event.target)) return
      // Logical capture intentionally refuses a focused toolbar button. Take
      // the author interval during its direct focus handoff to this toolbar.
      this.#captureMenuSelection(event.target)
    }
    this.#documentFocusIn = event => {
      if (this.#destroyed || this.#ownsMenuFocus(event.target)) return
      this.#bookmarkOwner = null
      this.closeToolbox()
      this.closeSettings()
    }
    this.#documentSelectionChange = () => {
      if (this.#destroyed || this.#pointerTransfer || this.#ownsMenuFocus(document.activeElement)) return
      this.#captureMenuSelection()
    }
    document.addEventListener('focusout', this.#documentFocusOut)
    document.addEventListener('focusin', this.#documentFocusIn)
    document.addEventListener('selectionchange', this.#documentSelectionChange)
    this.#documentClick = event => {
      if (this.#destroyed) return
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
    if (this.#destroyed) return
    if (value) {
      this.hide()
      return
    }
    if (this.#currentId) this.showFor(this.#currentId)
  }

  hide() {
    if (this.#destroyed) return
    this.#cancelPositionFrame()
    this.#tooltip.hide()
    const current = this.#currentId ? this.#view.element(this.#currentId) : null
    current?.classList?.remove('oe-block--focused')
    this.#toolbar.style.display = 'none'
    this.closeToolbox()
    this.closeSettings()
  }

  openToolbox() {
    if (this.#destroyed || this.#runtime.readOnly) return
    const bookmark = this.#menuBookmark()
    if (this.#bookmark && !bookmark) return
    this.#bookmark = bookmark
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
    if (this.#destroyed || this.#runtime.readOnly || !this.#currentId) return
    const bookmark = this.#menuBookmark()
    if (this.#bookmark && !bookmark) return
    this.#bookmark = bookmark
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
    this.#root.ownerDocument.removeEventListener('mousedown', this.#documentMouseDown, true)
    this.#root.ownerDocument.removeEventListener('mouseup', this.#documentMouseUp, true)
    this.#root.ownerDocument.removeEventListener('focusout', this.#documentFocusOut)
    this.#root.ownerDocument.removeEventListener('focusin', this.#documentFocusIn)
    this.#root.ownerDocument.removeEventListener('selectionchange', this.#documentSelectionChange)
    this.#root.ownerDocument.removeEventListener('click', this.#documentClick, true)
    this.#root.ownerDocument.defaultView?.removeEventListener('resize', this.#viewportChange)
    this.#tooltip.destroy()
    this.#toolbar.remove()
    this.#toolbox.remove()
    this.#settings.remove()
    this.#backdrop.remove()
  }

  #ownsMenuFocus(element) {
    return this.#toolbar.contains(element) || this.#toolbox.contains(element) || this.#settings.contains(element)
  }

  #nativeSelection(element = null) {
    const start = element?.selectionStart
    if (typeof start === 'number') return [element, start, element.selectionEnd, element.selectionDirection]
    const native = this.#root.ownerDocument.defaultView?.getSelection()
    return native ? [native.anchorNode, native.anchorOffset, native.focusNode, native.focusOffset] : []
  }

  #captureMenuSelection(source = this.#root.ownerDocument.activeElement) {
    this.#bookmarkOwner = null
    this.#bookmark = null
    if (this.#destroyed || this.#runtime.readOnly
      || this.#runtime.canAccessFormattingSelection?.() !== true) return
    const generation = this.#runtime.generation, revision = this.#runtime.revision, modeEpoch = this.#runtime.modeEpoch
    const active = this.#root.ownerDocument.activeElement
    const sourceField = this.#currentId
      ? this.#view.fields(this.#currentId).find(field => field.element === source) : null
    let captured = this.#selection.capture()
    if (!captured && source !== active && sourceField?.mode === 'plain-text') {
      // A real input loses activeElement before focusout. Its direct handoff
      // owns these native coordinates; a toolbar button cannot capture them.
      const start = source.selectionStart, end = source.selectionEnd, backward = source.selectionDirection === 'backward'
      if (typeof start === 'number' && typeof end === 'number') captured = {
        anchor: { blockId: this.#currentId, fieldKey: sourceField.key, offset: backward ? end : start },
        focus: { blockId: this.#currentId, fieldKey: sourceField.key, offset: backward ? start : end },
      }
    }
    if (!captured) return
    const bookmark = sourceField?.mode === 'plain-text' ? captured : this.#selectionPort?.bookmark ?? captured
    const native = this.#nativeSelection(source)
    const owners = [bookmark.anchor, bookmark.focus].map(point => {
      const block = this.#view.element(point.blockId)
      const fields = this.#view.fields(point.blockId)
      const field = fields.find(field => field.key === point.fieldKey)
      return { blockId: point.blockId, fieldKey: point.fieldKey, block,
        element: field?.element ?? (point.fieldKey === '' && fields.length === 0 ? block : null) }
    })
    const after = this.#nativeSelection(source)
    if (!owners.every(owner => owner.element?.isConnected && owner.block?.contains(owner.element))
      || !owners.some(owner => owner.element === source)
      || this.#destroyed || this.#runtime.readOnly || this.#runtime.canAccessFormattingSelection?.() !== true
      || active !== this.#root.ownerDocument.activeElement
      || generation !== this.#runtime.generation || revision !== this.#runtime.revision || modeEpoch !== this.#runtime.modeEpoch
      || !native.every((value, index) => value === after[index])) return
    this.#bookmark = bookmark
    this.#bookmarkOwner = {
      generation, revision, modeEpoch, owners, native, source,
    }
  }

  #menuBookmark() {
    // A drag press keeps the author host focused. Its captured interval must
    // still pass validation; do not recapture a retired press on its click.
    if (!this.#bookmark && !this.#ownsMenuFocus(this.#root.ownerDocument.activeElement)) this.#captureMenuSelection()
    const owner = this.#bookmarkOwner
    const active = this.#root.ownerDocument.activeElement
    const owns = () => owner && owner === this.#bookmarkOwner
      && !this.#destroyed && !this.#runtime.readOnly && this.#runtime.canAccessFormattingSelection?.() === true
      && owner.generation === this.#runtime.generation && owner.revision === this.#runtime.revision
      && owner.modeEpoch === this.#runtime.modeEpoch && active === this.#root.ownerDocument.activeElement
    if (!owns()) return null
    const native = this.#nativeSelection(owner.source)
    if (!owner.native.every((value, index) => value === native[index])) return null
    if (!owner.owners.every(field => field.element.isConnected && field.block === this.#view.element(field.blockId)
      && field.block?.contains(field.element)
      && (field.fieldKey === '' ? this.#view.fields(field.blockId).length === 0
        : this.#view.fields(field.blockId).some(current => current.key === field.fieldKey && current.element === field.element)))) return null
    const after = this.#nativeSelection(owner.source)
    return owns() && owner.owners.every(field => field.element.isConnected && field.block?.contains(field.element))
      && owner.native.every((value, index) => value === after[index]) ? this.#bookmark : null
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
        if (this.#destroyed) return
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
    item.addEventListener('mousedown', event => event.preventDefault())
    item.addEventListener('click', event => {
      if (this.#destroyed) return
      event.preventDefault()
      event.stopPropagation()
      if (this.#runtime.readOnly || version !== this.#toolboxVersion || generation !== this.#runtime.generation) return
      if (ownerId && owner !== this.#view.element(ownerId)) return
      if (this.#bookmark && !this.#menuBookmark()) return
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
    const id=this.#mutate('toolbox.block',()=>this.#runtime.insertToolboxBlock(currentId,{type,toolboxItemId}),result=>result)
    if(!id)return
    if(this.#runtime.has(id)){
      this.#view.reconcileInteraction()
      this.#view.setCurrent(id)
    }
    this.closeToolbox()
    this.#deferOwned(id,()=>{
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
      const selection=this.#selection.capture()
      this.#deferOwned(currentId,()=>{
        if(!sameLogicalSelection(selection,this.#selection.capture()))return
        this.#inlineCommands.insert(type)
      })
      return
    }

    const index = currentId ? this.#view.indexOf(currentId) + 1 : this.#runtime.size
    const id = this.#runtime.insert(this.#registry.defaultBlockType, undefined, index)
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    this.#deferOwned(id,()=>{
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
      let prepared = null
      try {
        prepared = prepareSettingsActions(this.#runtime, settings, record.data, {
          ownerDocument: document,
          t: label => this.#label('plugin', record.type, label),
        }, definition.label)
      } catch (error) {
        // The menu was already retired at the start of this rebuild. Omit the
        // failed extension group but keep core move/duplicate/delete controls.
        try { this.#reportError('command.failed', error) } catch {}
      }
      if (prepared) {
        const revision = this.#runtime.revision
        for (const action of prepared.actions) {
          const item = this.#settingsItem(
            action.label,
            action.icon ?? '',
            () => {
              if (revision !== this.#runtime.revision || this.#runtime.get(id)?.type !== record.type) return
              this.#mutate('block.settings', () => this.#runtime.update(id, current => ({
                data: prepared.apply(current.data, action.id, { createId: prefix => this.#runtime.createDataId(prefix) }),
              })), () => id)
              const generation = this.#runtime.generation
              const settledRevision = this.#runtime.revision
              this.#view.reconcileInteraction()
              this.#view.setCurrent(id)
              this.closeSettings()
              const continuation = this.#settingsVersion
              queueMicrotask(() => {
                if (this.#destroyed || this.#runtime.readOnly || continuation !== this.#settingsVersion
                  || generation !== this.#runtime.generation || settledRevision !== this.#runtime.revision
                  || this.#currentId !== id || !this.#runtime.has(id)) return
                this.#view.focus(id)
              })
            },
            action.disabled === true,
            false,
            action.active === true,
          )
          item.dataset.actionId = action.id
          if (typeof action.active === 'boolean') {
            item.setAttribute('role', 'menuitemradio')
            item.setAttribute('aria-checked', String(action.active))
          }
          this.#settings.append(item)
        }
        if (prepared.actions.length) this.#settings.append(this.#separator())
      }
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
        const nextId=focusId ?? this.#view.currentId
        // The surviving neighbor is the owner of the settled removal focus,
        // not the first-block fallback selected during reconciliation.
        // Claim it synchronously before the revocable deferred focus check.
        if(nextId&&this.#runtime.has(nextId))this.#view.setCurrent(nextId)
        this.#currentId=nextId
        this.closeSettings()
        if(nextId)this.#deferOwned(nextId,()=>this.#view.focus(nextId))
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
            // Plain-text inputs (Code, Raw, file names, URLs) have logical
            // caret bookmarks but no rich-text slice. Convert their entire
            // block instead of treating a selected input interval as rich text.
            const richEndpoint = point => this.#view.fields(point.blockId)
              .some(field => field.key === point.fieldKey && field.mode === 'rich-text')
            if (bookmark && richEndpoint(bookmark.anchor) && richEndpoint(bookmark.focus)) {
              const anchor = this.#view.indexOf(bookmark.anchor.blockId)
              const focus = this.#view.indexOf(bookmark.focus.blockId)
              const owner = this.#view.indexOf(id)
              if (anchor >= 0 && focus >= 0 && owner >= Math.min(anchor, focus) && owner <= Math.max(anchor, focus)) {
                return this.#runtime.convertLogicalSelection(bookmark, { type })
              }
            }
            this.#runtime.convert(id, { type })
            return { focusId: id }
          }, result => result?.focusId, result => convertedSelection(result,this.#view))
          if (!result) return
          this.#view.reconcileInteraction()
          this.#view.setCurrent(result.focusId)
          this.closeSettings()
          this.#deferOwned(result.focusId,()=>restoreConvertedSelection(result,this.#view,this.#selectionPort))
        } catch (error) {
          try { this.#reportError('command.failed', error) } catch {}
        }
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
    item.addEventListener('mousedown', event => event.preventDefault())
    if (!disabled) item.addEventListener('click', event => {
      if (this.#destroyed) return
      event.preventDefault()
      event.stopPropagation()
      if (this.#runtime.readOnly || version !== this.#settingsVersion || generation !== this.#runtime.generation) return
      if (ownerId && owner !== this.#view.element(ownerId)) return
      if (this.#bookmark && !this.#menuBookmark()) return
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
    this.#captureMenuSelection()
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
    if(!duplicate)return
    this.#view.reconcileInteraction()
    this.#view.setCurrent(duplicate)
    this.closeSettings()
    this.#deferOwned(duplicate,()=>{
      this.#view.focus(duplicate)
      this.showFor(duplicate)
    })
  }

  /** A queued toolbar action is owned by exactly one settled block revision
   * and mounted block. It must not move focus or issue another edit after
   * replacement, Undo, read-only, destroy or an intervening focus change.
   * @param {string} blockId
   * @param {()=>void} continuation
   */
  #deferOwned(blockId,continuation){
    const generation=this.#runtime.generation
    const revision=this.#runtime.revision
    const modeEpoch=this.#runtime.modeEpoch
    const mounted=this.#view.element(blockId)
    queueMicrotask(()=>{
      if(this.#destroyed||this.#runtime.readOnly
        ||generation!==this.#runtime.generation||revision!==this.#runtime.revision
        ||modeEpoch!==this.#runtime.modeEpoch||!this.#runtime.has(blockId)||!mounted
        ||this.#view.element(blockId)!==mounted||this.#view.currentId!==blockId)return
      continuation()
    })
  }

  #mutate(name, operation, focusId, resolveSelection = null) {
    if (this.#bookmark) {
      if(this.#bookmark.anchor.blockId!==this.#bookmark.focus.blockId)this.#selectionPort?.restore(this.#bookmark)
      else this.#selection.restore(this.#bookmark)
    }
    return this.#runtime.interact(name, operation, result => {
      if(resolveSelection)return resolveSelection(result)
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
    if (this.#destroyed) return
    if (event.target?.closest?.('input, textarea, select') && !['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return
    const items = [...menu.querySelectorAll('[role^="menuitem"]:not(:disabled):not([aria-disabled="true"])')].filter(item => item.style.display !== 'none')
    if (!items.length && event.key !== 'Escape') return
    // Menu-owned keys must not trigger parent editor/document shortcuts.
    const consume = () => {
      event.preventDefault()
      event.stopPropagation?.()
    }
    const current = menu.ownerDocument.activeElement
    const index = items.indexOf(current)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      consume()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = index < 0 ? (direction > 0 ? 0 : items.length - 1)
        : (index + direction + items.length) % items.length
      items[next]?.focus?.()
    } else if ((event.key === 'Escape' || event.key === 'ArrowLeft') && ((menu === this.#toolbox && this.#toolboxParent) || (menu === this.#settings && this.#settingsView === 'convert'))) {
      consume()
      menu.querySelector('[data-menu-back]')?.click()
    } else if (event.key === 'Home' || event.key === 'End') {
      consume()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus?.()
    } else if (event.key === 'ArrowRight' && current?.getAttribute('aria-haspopup') === 'menu') {
      consume()
      current.click()
    } else if (event.key === 'Escape') {
      consume()
      this.closeToolbox()
      this.closeSettings()
      if (menu === this.#settings) this.#settingsButton.focus()
      else this.#plus.focus()
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      consume()
      items[index]?.click?.()
    }
  }
}
