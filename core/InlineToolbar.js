// @ts-check
import { handleMenuKeydown } from '../plugin-kit/index.js'
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'

function matchesShortcut(combo, event) {
  if (!combo || typeof combo !== 'string') return false
  const parts = combo.split('+')
  const key = parts.at(-1)?.toLowerCase()
  if (!key || String(event.key ?? '').toLowerCase() !== key) return false
  const mod = event.ctrlKey === true || event.metaKey === true
  if (parts.includes('Mod') !== mod) return false
  if (parts.includes('Shift') !== (event.shiftKey === true)) return false
  if (parts.includes('Alt') !== (event.altKey === true)) return false
  return true
}

function cloneBookmark(bookmark) {
  if (!bookmark?.anchor || !bookmark?.focus) return null
  return {
    anchor: { ...bookmark.anchor },
    focus: { ...bookmark.focus },
  }
}

export class InlineToolbar {
  #root
  #runtime
  #registry
  #reconciler
  #selection
  #view
  #tools
  #element
  #buttonsPanel
  #actions = null
  #buttons = new Map()
  #range = null
  #blockId = null
  #fieldKey = null
  #destroyed = false
  #readOnly = false
  #onSelectionChange
  #documentClick

  #typeSelect
  #typeName
  #typeDropdown
  #typeVersion = 0
  #typeBookmark = null

  #controlDivider
  #controlSelect
  #controlLabel
  #controlDropdown
  #controlVersion = 0
  #controlBookmark = null
  #controlBlockId = null

  constructor({ root, runtime, registry, reconciler, selection, view, tools = [] }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#tools = [...tools]
    this.#readOnly = runtime.readOnly

    const document = root.ownerDocument
    this.#element = document.createElement('div')
    this.#element.className = 'oe-inline-toolbar'
    this.#element.style.display = 'none'
    this.#buttonsPanel = document.createElement('div')
    this.#buttonsPanel.className = 'oe-inline-toolbar__panel'
    this.#element.append(this.#buttonsPanel)
    root.append(this.#element)

    this.#typeSelect = document.createElement('button')
    this.#typeSelect.type = 'button'
    this.#typeSelect.className = 'oe-inline-toolbar__type-select'
    this.#typeSelect.setAttribute('aria-haspopup', 'menu')
    this.#typeSelect.setAttribute('aria-expanded', 'false')
    this.#typeName = document.createElement('span')
    this.#typeName.className = 'oe-inline-toolbar__type-name'
    const chevron = document.createElement('span')
    chevron.className = 'oe-inline-toolbar__type-chevron'
    chevron.textContent = '▾'
    this.#typeSelect.append(this.#typeName, chevron)
    this.#buttonsPanel.append(this.#typeSelect)

    this.#typeDropdown = document.createElement('ul')
    this.#typeDropdown.className = 'oe-inline-toolbar__type-dropdown'
    this.#typeDropdown.setAttribute('role', 'menu')
    this.#typeDropdown.style.display = 'none'
    this.#element.append(this.#typeDropdown)

    this.#controlDivider = document.createElement('span')
    this.#controlDivider.className = 'oe-inline-toolbar__divider'
    this.#controlDivider.hidden = true
    this.#controlSelect = document.createElement('button')
    this.#controlSelect.type = 'button'
    this.#controlSelect.className = 'oe-inline-toolbar__level-select'
    this.#controlSelect.setAttribute('aria-haspopup', 'menu')
    this.#controlSelect.setAttribute('aria-expanded', 'false')
    this.#controlSelect.hidden = true
    this.#controlLabel = document.createElement('span')
    this.#controlLabel.className = 'oe-inline-toolbar__level-label'
    this.#controlSelect.append(this.#controlLabel)
    this.#buttonsPanel.append(this.#controlDivider, this.#controlSelect)

    this.#controlDropdown = document.createElement('div')
    this.#controlDropdown.className = 'oe-inline-toolbar__level-dropdown'
    this.#controlDropdown.setAttribute('role', 'menu')
    this.#controlDropdown.style.display = 'none'
    this.#element.append(this.#controlDropdown)

    this.#typeSelect.addEventListener('mousedown', event => {
      event.preventDefault()
      this.#typeBookmark = cloneBookmark(this.#selection.capture())
    })
    this.#typeSelect.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#typeDropdown.style.display === 'none') this.#openTypeDropdown()
      else this.#closeTypeDropdown()
    })
    this.#typeDropdown.addEventListener('keydown', event => {
      handleMenuKeydown(event, this.#typeDropdown, {
        onEscape: () => {
          this.#closeTypeDropdown()
          this.#typeSelect.focus()
        },
        itemSelector: '[role="menuitem"]:not([style*="display: none"])',
      })
    })

    this.#controlSelect.addEventListener('mousedown', event => {
      event.preventDefault()
      this.#controlBookmark = cloneBookmark(this.#selection.capture())
    })
    this.#controlSelect.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#controlDropdown.style.display === 'none') this.#openControlDropdown()
      else this.#closeControlDropdown()
    })
    this.#controlDropdown.addEventListener('keydown', event => {
      handleMenuKeydown(event, this.#controlDropdown, {
        onEscape: () => {
          this.#closeControlDropdown()
          this.#controlSelect.focus()
        },
        itemSelector: '[role="menuitem"]',
      })
    })

    for (const tool of this.#tools) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'oe-inline-tool'
      button.dataset.tool = tool.type
      button.title = tool.title ?? tool.type
      setTrustedHtml(button, tool.icon)
      button.addEventListener('mousedown', event => {
        event.preventDefault()
        event.stopPropagation()
      })
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        this.openTool(tool.type)
      })
      this.#buttonsPanel.append(button)
      this.#buttons.set(tool.type, button)

      tool.onMount?.(button, {
        mutate: (range, operation) => this.#mutate(range, operation, tool.type),
      })
    }

    this.#onSelectionChange = () => this.#refreshFromSelection()
    document.addEventListener('selectionchange', this.#onSelectionChange)
    this.#documentClick = event => {
      if (this.#element.contains(event.target)) return
      this.#closeTypeDropdown()
      this.#closeControlDropdown()
    }
    document.addEventListener('mousedown', this.#documentClick, true)
  }

  setReadOnly(value) {
    this.#readOnly = value === true
    this.#typeVersion++
    this.#controlVersion++
    if (this.#readOnly) this.hide()
  }

  handleShortcut(event) {
    if (this.#readOnly || event.defaultPrevented) return false
    const tool = this.#tools.find(candidate => matchesShortcut(candidate.shortcut, event))
    if (!tool) return false
    if (!this.#resolveFormattingSelection()) return false
    event.preventDefault?.()
    this.openTool(tool.type)
    return true
  }

  openTool(type) {
    if (this.#readOnly || this.#destroyed) return false
    const tool = this.#tools.find(candidate => candidate.type === type)
    if (!tool) return false
    const selection = this.#resolveFormattingSelection()
    if (!selection) return false
    const allowed = this.#allowedTools(selection.blockId)
    if (allowed && !allowed.has(type)) return false

    if (tool.renderActions) {
      const range = selection.range.cloneRange()
      const panel = tool.renderActions({
        range,
        mutate: operation => this.#mutate(range, operation, tool.type),
        restoreSelection: () => this.#restoreNativeRange(range),
        close: () => this.#closeActions(),
        showTooltip: (anchor, label) => anchor.setAttribute('title', label),
        hideTooltip: () => {},
      })
      if (panel) {
        this.#closeActions()
        this.#actions = panel
        this.#buttonsPanel.style.display = 'none'
        this.#element.append(panel)
        this.#show(selection)
        return true
      }
    }

    this.#mutate(selection.range, () => tool.toggle(selection), tool.type)
    this.#updateActiveStates()
    return true
  }

  show() {
    const selection = this.#resolveSelection()
    if (selection) this.#show(selection)
  }

  hide() {
    this.#range = null
    this.#blockId = null
    this.#fieldKey = null
    this.#element.style.display = 'none'
    this.#closeActions()
    this.#closeTypeDropdown()
    this.#closeControlDropdown()
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    const document = this.#root.ownerDocument
    document.removeEventListener('selectionchange', this.#onSelectionChange)
    document.removeEventListener('mousedown', this.#documentClick, true)
    this.#typeVersion++
    this.#controlVersion++
    this.#closeActions()
    for (const tool of this.#tools) tool.destroy?.()
    this.#element.remove()
  }

  #refreshFromSelection() {
    if (this.#readOnly || this.#destroyed) return
    if (this.#element.contains(this.#root.ownerDocument.activeElement)) return
    const selection = this.#resolveSelection()
    if (!selection) {
      this.hide()
      return
    }
    this.#show(selection)
  }

  #resolveSelection() {
    const native = this.#root.ownerDocument.defaultView?.getSelection()
    if (!native || native.isCollapsed || native.rangeCount === 0) return null
    const range = native.getRangeAt(0)
    if (!this.#root.contains(range.startContainer) || !this.#root.contains(range.endContainer)) return null
    const bookmark = this.#selection.capture()
    if (!bookmark?.anchor || !bookmark?.focus) return null
    const start = this.#reconciler.resolveEditableTarget(range.startContainer)
    const end = this.#reconciler.resolveEditableTarget(range.endContainer)
    if (!start || !end) return null
    return {
      range,
      bookmark,
      blockId: bookmark.focus.blockId,
      fieldKey: bookmark.anchor.blockId === bookmark.focus.blockId
        && bookmark.anchor.fieldKey === bookmark.focus.fieldKey
        ? bookmark.focus.fieldKey
        : null,
      sameBlock: bookmark.anchor.blockId === bookmark.focus.blockId,
      sameField: bookmark.anchor.blockId === bookmark.focus.blockId
        && bookmark.anchor.fieldKey === bookmark.focus.fieldKey,
      text: native.toString(),
    }
  }

  #resolveFormattingSelection() {
    const selection = this.#resolveSelection()
    if (!selection?.sameField) return null
    const definition = this.#registry.getBlockDefinition(this.#runtime.get(selection.blockId)?.type)
    if (!definition?.capabilities?.formatting?.inlineTools) return null
    return selection
  }

  #allowedTools(blockId) {
    const record = this.#runtime.get(blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const policy = definition?.capabilities?.formatting?.inlineTools
    if (policy === true) return null
    return Array.isArray(policy) ? new Set(policy) : new Set()
  }

  #show(selection) {
    this.#range = selection.range.cloneRange()
    this.#blockId = selection.blockId
    this.#fieldKey = selection.fieldKey
    const record = this.#runtime.get(selection.blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    this.#typeName.textContent = definition
      ? this.#label('plugin', definition.type, definition.label)
      : ''
    this.#typeSelect.hidden = this.#registry.blockTypes.length < 2

    const formatting = selection.sameField
      && definition?.capabilities?.formatting?.inlineTools
      ? selection
      : null
    const allowed = formatting ? this.#allowedTools(selection.blockId) : new Set()
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button) continue
      button.hidden = !formatting || (allowed ? !allowed.has(tool.type) : false)
    }
    if (formatting) this.#updateActiveStates(formatting)
    this.#updateBlockControls(selection)
    this.#position(selection.range)
    this.#element.style.display = 'flex'
  }

  #label(scope, type, label) {
    if (!label) return type
    const fallback = label.fallback ?? type
    const key = `${scope}.${type}.${label.key}`
    return fallback || key
  }

  #position(range) {
    const rect = range.getBoundingClientRect()
    const rootRect = this.#root.getBoundingClientRect()
    this.#element.style.position = 'absolute'
    this.#element.style.top = `${Math.max(0, rect.top - rootRect.top - 44)}px`
    this.#element.style.left = `${Math.max(0, rect.left - rootRect.left + rect.width / 2)}px`
  }

  #updateActiveStates(resolved) {
    const selection = resolved ?? this.#resolveFormattingSelection()
    if (!selection) return
    const allowed = this.#allowedTools(selection.blockId)
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button || (allowed && !allowed.has(tool.type))) continue
      let active = false
      try { active = tool.isActive(selection) === true } catch {}
      button.classList.toggle('oe-inline-tool--active', active)
      if (tool.getIcon) setTrustedHtml(button, tool.getIcon(active))
      const title = tool.getTitle?.(active) ?? tool.title
      if (title) button.title = title
    }
  }

  #openTypeDropdown() {
    if (this.#readOnly || this.#destroyed) return
    const bookmark = cloneBookmark(this.#typeBookmark ?? this.#selection.capture())
    if (!bookmark) return
    this.#typeBookmark = bookmark
    this.#closeControlDropdown()
    const version = ++this.#typeVersion
    this.#typeDropdown.replaceChildren()

    if (this.#registry.blockTypes.length > 7) {
      const filter = this.#root.ownerDocument.createElement('li')
      filter.className = 'oe-inline-toolbar__type-filter'
      filter.setAttribute('role', 'none')
      const input = this.#root.ownerDocument.createElement('input')
      input.className = 'oe-inline-toolbar__type-filter-input'
      input.type = 'text'
      input.placeholder = 'Search'
      input.addEventListener('input', () => {
        if (version !== this.#typeVersion) return
        const query = input.value.trim().toLocaleLowerCase()
        for (const item of this.#typeDropdown.querySelectorAll('.oe-inline-toolbar__type-item')) {
          item.style.display = !query || (item.dataset.search ?? '').includes(query) ? '' : 'none'
        }
      })
      filter.append(input)
      this.#typeDropdown.append(filter)
    }

    const currentType = this.#runtime.get(bookmark.focus.blockId)?.type
    for (const type of this.#registry.blockTypes) {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) continue
      const item = this.#root.ownerDocument.createElement('li')
      item.className = 'oe-inline-toolbar__type-item'
      if (type === currentType) item.classList.add('oe-inline-toolbar__type-item--active')
      item.dataset.pluginType = type
      const labelText = this.#label('plugin', type, definition.label)
      item.dataset.search = `${type}\0${labelText}`.toLocaleLowerCase()
      item.setAttribute('role', 'menuitem')
      item.tabIndex = -1
      const icon = this.#root.ownerDocument.createElement('span')
      icon.className = 'oe-inline-toolbar__type-item-icon'
      setTrustedHtml(icon, definition.icon ?? '')
      const label = this.#root.ownerDocument.createElement('span')
      label.className = 'oe-inline-toolbar__type-item-label'
      label.textContent = labelText
      item.append(icon, label)
      item.addEventListener('mousedown', event => event.preventDefault())
      item.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        if (version !== this.#typeVersion || this.#readOnly || this.#destroyed) return
        this.#convertType(bookmark, type)
      })
      this.#typeDropdown.append(item)
    }
    this.#typeDropdown.style.display = ''
    this.#typeSelect.setAttribute('aria-expanded', 'true')
  }

  #closeTypeDropdown() {
    this.#typeVersion++
    this.#typeDropdown.style.display = 'none'
    this.#typeSelect.setAttribute('aria-expanded', 'false')
    this.#typeDropdown.replaceChildren()
    this.#typeBookmark = null
  }

  #convertType(bookmark, type) {
    this.#closeTypeDropdown()
    let result
    try {
      result = this.#runtime.convertLogicalSelection(bookmark, { type })
    } catch {
      return
    }
    if (!result) return
    this.#view.reconcileInteraction()
    this.#view.setCurrent(result.focusId)
    queueMicrotask(() => this.#view.focus(result.focusId, { offset: 'start' }))
  }

  #updateBlockControls(selection) {
    this.#controlVersion++
    this.#controlDropdown.style.display = 'none'
    this.#controlDropdown.replaceChildren()
    this.#controlSelect.setAttribute('aria-expanded', 'false')
    this.#controlBookmark = null
    this.#controlBlockId = null

    if (!selection.sameBlock) {
      this.#controlSelect.hidden = true
      this.#controlDivider.hidden = true
      return
    }
    const record = this.#runtime.get(selection.blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const capability = definition?.capabilities?.inlineControls
    if (capability?.kind !== 'actions') {
      this.#controlSelect.hidden = true
      this.#controlDivider.hidden = true
      return
    }
    const actions = capability.actions(record.data, {
      ownerDocument: this.#root.ownerDocument,
      t: label => label.fallback,
    })
    const active = actions.find(action => action.active) ?? actions[0]
    if (!active) {
      this.#controlSelect.hidden = true
      this.#controlDivider.hidden = true
      return
    }
    this.#controlBlockId = selection.blockId
    this.#controlLabel.textContent = /^h[2-6]$/.test(active.id)
      ? active.id.toUpperCase()
      : active.label.fallback
    this.#controlSelect.hidden = false
    this.#controlDivider.hidden = false
  }

  #openControlDropdown() {
    if (this.#readOnly || this.#destroyed || !this.#controlBlockId) return
    const record = this.#runtime.get(this.#controlBlockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const capability = definition?.capabilities?.inlineControls
    if (!record || capability?.kind !== 'actions') return
    const bookmark = cloneBookmark(this.#controlBookmark ?? this.#selection.capture())
    if (!bookmark) return
    this.#controlBookmark = bookmark
    this.#closeTypeDropdown()
    const blockId = this.#controlBlockId
    const version = ++this.#controlVersion
    this.#controlDropdown.replaceChildren()
    const actions = capability.actions(record.data, {
      ownerDocument: this.#root.ownerDocument,
      t: label => label.fallback,
    })
    for (const action of actions) {
      const item = this.#root.ownerDocument.createElement('button')
      item.type = 'button'
      item.className = 'oe-inline-toolbar__type-item'
      item.setAttribute('role', 'menuitem')
      if (/^h([2-6])$/.test(action.id)) item.dataset.level = action.id.slice(1)
      if (action.active) item.classList.add('oe-inline-toolbar__type-item--active')
      if (action.icon) {
        const icon = this.#root.ownerDocument.createElement('span')
        icon.className = 'oe-inline-toolbar__type-item-icon'
        setTrustedHtml(icon, action.icon)
        item.append(icon)
      }
      const label = this.#root.ownerDocument.createElement('span')
      label.textContent = action.label.fallback
      item.append(label)
      item.disabled = action.disabled === true
      item.addEventListener('mousedown', event => event.preventDefault())
      item.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        if (
          version !== this.#controlVersion
          || this.#readOnly
          || this.#destroyed
          || this.#runtime.get(blockId)?.type !== record.type
        ) return
        this.#runtime.update(blockId, current => ({
          data: capability.apply(current.data, action.id, {
            createId: prefix => this.#runtime.createDataId(prefix),
          }),
        }))
        this.#view.reconcileInteraction()
        this.#closeControlDropdown()
        queueMicrotask(() => {
          this.#selection.restore(bookmark)
          this.show()
        })
      })
      this.#controlDropdown.append(item)
    }
    this.#controlDropdown.style.display = ''
    this.#controlSelect.setAttribute('aria-expanded', 'true')
  }

  #closeControlDropdown() {
    this.#controlVersion++
    this.#controlDropdown.style.display = 'none'
    this.#controlSelect.setAttribute('aria-expanded', 'false')
    this.#controlDropdown.replaceChildren()
    this.#controlBookmark = null
  }

  #mutate(range, operation, type) {
    if (this.#readOnly || this.#destroyed) return undefined
    const start = this.#reconciler.resolveEditableTarget(range.startContainer)
    const end = this.#reconciler.resolveEditableTarget(range.endContainer)
    if (!start || !end || start.blockId !== end.blockId) return undefined
    const bookmark = this.#selection.capture()
    let result
    this.#runtime.syncBlockFromProjection(start.blockId, () => {
      result = operation()
    }, {
      origin: 'user',
      name: `inline.${type}`,
    })
    const nextBookmark = this.#selection.capture() ?? bookmark
    queueMicrotask(() => {
      if (nextBookmark) this.#selection.restore(nextBookmark)
      this.show()
    })
    return result
  }

  #restoreNativeRange(range) {
    const selection = this.#root.ownerDocument.defaultView?.getSelection()
    if (!selection) return
    try {
      selection.removeAllRanges()
      selection.addRange(range)
    } catch {}
  }

  #closeActions() {
    if (!this.#actions) {
      this.#buttonsPanel.style.display = ''
      return
    }
    this.#actions.remove()
    this.#actions = null
    this.#buttonsPanel.style.display = ''
  }
}
