// @ts-check
import { handleMenuKeydown } from '../plugin-kit/index.js'
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { Tooltip } from './Tooltip.js'
import { shortcutKey } from '../shared/shortcutKey.js'

const INLINE_TOOL_OWNERS = new WeakMap()

function matchesShortcut(combo, event) {
  if (!combo || typeof combo !== 'string') return false
  const parts = combo.split('+')
  const key = parts.at(-1)?.toLowerCase()
  if (!key || shortcutKey(event) !== key) return false
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
  #selectionPort
  #view
  #tools
  #buttonIcons = new Map()
  #translate
  #tooltip
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
  #onMouseUp
  #pendingDragSelection = false
  #documentClick
  #selectionVersion = 0

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

  constructor({ root, runtime, registry, reconciler, selection, selectionPort = null, view, tools = [], translate = (_key, fallback = '') => fallback }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#selectionPort = selectionPort
    this.#view = view
    this.#tools = [...tools]
    this.#translate = translate
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
      if (!tool || typeof tool !== 'object') throw new TypeError('Inline tools must be objects')
      if (INLINE_TOOL_OWNERS.has(tool)) {
        throw new Error(`Inline tool instance is already mounted: ${tool.type ?? 'unknown'}`)
      }
    }
    for (const tool of this.#tools) INLINE_TOOL_OWNERS.set(tool, this)

    this.#tooltip = new Tooltip(root)
    try {
    for (const tool of this.#tools) {
      tool.bindSelectionPort?.(this.#selectionPort)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'oe-inline-tool'
      button.dataset.tool = tool.type
      button.setAttribute('aria-label', tool.title ?? tool.type)
      this.#tooltip.bind(button, () => button.getAttribute('aria-label') ?? tool.type, tool.shortcut)
      setTrustedHtml(button, tool.icon)
      this.#buttonIcons.set(tool.type, tool.icon)
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
    } catch (error) {
      this.#tooltip.destroy()
      for (const tool of this.#tools) {
        try { tool.bindSelectionPort?.(null) } catch {}
        if (INLINE_TOOL_OWNERS.get(tool) === this) INLINE_TOOL_OWNERS.delete(tool)
      }
      throw error
    }

    this.#onSelectionChange = () => {
      if (this.#element.contains(document.activeElement)) return
      this.#selectionVersion++
      this.#refreshFromSelection()
    }
    document.addEventListener('selectionchange', this.#onSelectionChange)
    this.#onMouseUp = () => {
      if (!this.#pendingDragSelection) return
      this.#pendingDragSelection = false
      this.#refreshFromSelection()
    }
    document.addEventListener('mouseup', this.#onMouseUp)
    this.#documentClick = event => {
      if (this.#element.contains(event.target)) return
      this.#closeTypeDropdown()
      this.#closeControlDropdown()
    }
    document.addEventListener('mousedown', this.#documentClick, true)
  }

  setReadOnly(value) {
    this.#readOnly = value === true
    this.#selectionVersion++
    this.#typeVersion++
    this.#controlVersion++
    if (this.#readOnly) this.hide()
  }

  handleShortcut(event) {
    if (this.#readOnly || event.defaultPrevented) return false
    const tool = this.#tools.find(candidate => matchesShortcut(candidate.shortcut, event))
    if (!tool) return false
    if (!this.#resolveFormattingSelection()) {
      if (!this.#selectionPort?.active) return false
      // Browser formatting must not partially edit an ineligible mixed range.
      event.preventDefault?.()
      return true
    }
    event.preventDefault?.()
    this.openTool(tool.type)
    return true
  }

  openTool(type) {
    if (this.#readOnly || this.#destroyed) return false
    this.#tooltip.hide()
    const tool = this.#tools.find(candidate => candidate.type === type)
    if (!tool) return false
    const selection = this.#resolveFormattingSelection()
    if (!selection) return false
    const allowed = this.#allowedTools(selection.blockIds)
    if (allowed && !allowed.has(type)) return false

    if (tool.renderActions) {
      const range = selection.range.cloneRange()
      const lease = this.#selectionVersion
      let panelBookmark = cloneBookmark(selection.bookmark)
      const panel = tool.renderActions({
        range,
        mutate: operation => {
          const result = this.#mutate(range, operation, tool.type, lease)
          panelBookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture() ?? panelBookmark)
          return result
        },
        getTextAlign: () => lease === this.#selectionVersion
          ? this.#runtime.getTextAlign(selection.blockIds)
          : 'mixed',
        setTextAlign: value => lease === this.#selectionVersion
          ? this.#runtime.setTextAlign(selection.blockIds, value)
          : false,
        restoreSelection: () => {
          if (lease === this.#selectionVersion) this.#restoreSelection(panelBookmark, range)
        },
        close: () => {
          this.#closeActions()
          if (lease !== this.#selectionVersion) return
          this.#restoreSelection(panelBookmark, range)
          this.show()
        },
        backLabel: this.#translate('block.back', 'Back'),
        showTooltip: (anchor, label, shortcut) => this.#tooltip.show(anchor, label, shortcut),
        hideTooltip: () => this.#tooltip.hide(),
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

    this.#mutate(selection.range, () => tool.toggle(selection), tool.type, this.#selectionVersion)
    this.#updateActiveStates()
    return true
  }

  show() {
    const selection = this.#resolveSelection()
    if (selection) this.#show(selection)
  }

  hide() {
    this.#tooltip.hide()
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
    document.removeEventListener('mouseup', this.#onMouseUp)
    document.removeEventListener('mousedown', this.#documentClick, true)
    this.#typeVersion++
    this.#controlVersion++
    this.#selectionVersion++
    this.#closeActions()
    for (const tool of this.#tools) {
      tool.bindSelectionPort?.(null)
      tool.destroy?.()
      if (INLINE_TOOL_OWNERS.get(tool) === this) INLINE_TOOL_OWNERS.delete(tool)
    }
    this.#tooltip.destroy()
    this.#element.remove()
  }

  #refreshFromSelection() {
    if (this.#readOnly || this.#destroyed) return
    if (this.#selectionPort?.dragging) {
      // A toolbar above the growing range can intercept the next mouse move.
      this.#pendingDragSelection = true
      this.hide()
      return
    }
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
    let stored = this.#selectionPort?.range ?? null
    const nativeRange = (
      native && !native.isCollapsed && native.rangeCount > 0
        ? native.getRangeAt(0)
        : null
    )
    const ownsNativeRange = nativeRange
      && this.#root.contains(nativeRange.startContainer)
      && this.#root.contains(nativeRange.endContainer)
    const range = this.#selectionPort?.wholeBlockIds?.length
      ? stored
      : ownsNativeRange ? nativeRange : stored
    if (!range || range.collapsed) return null
    if (!this.#root.contains(range.startContainer) || !this.#root.contains(range.endContainer)) return null

    const start = this.#reconciler.resolveEditableTarget(range.startContainer)
    const end = this.#reconciler.resolveEditableTarget(range.endContainer)
    if (!start || !end) return null

    if (
      ownsNativeRange
      && (start.blockId !== end.blockId || start.fieldKey !== end.fieldKey)
      && this.#selectionPort?.activate
    ) {
      this.#selectionPort.activate(range)
    } else if (ownsNativeRange && stored) {
      this.#selectionPort?.deactivate?.()
      stored = null
    }

    const bookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture())
    if (!bookmark?.anchor || !bookmark?.focus) return null
    const blockIds = this.#blockIdsBetween(bookmark.anchor.blockId, bookmark.focus.blockId)
    if (!blockIds.length) return null

    return {
      range: (this.#selectionPort?.range ?? range).cloneRange(),
      bookmark,
      blockIds,
      blockId: bookmark.anchor.blockId,
      fieldKey: bookmark.anchor.blockId === bookmark.focus.blockId
        && bookmark.anchor.fieldKey === bookmark.focus.fieldKey
        ? bookmark.focus.fieldKey
        : null,
      sameBlock: bookmark.anchor.blockId === bookmark.focus.blockId,
      sameField: bookmark.anchor.blockId === bookmark.focus.blockId
        && bookmark.anchor.fieldKey === bookmark.focus.fieldKey,
      text: native?.toString?.() ?? range.toString(),
    }
  }

  #blockIdsBetween(leftId,rightId){
    const left=this.#runtime.indexOf(leftId)
    const right=this.#runtime.indexOf(rightId)
    if(left<0||right<0)return []
    const from=Math.min(left,right)
    const to=Math.max(left,right)
    return this.#runtime.ids().slice(from,to+1)
  }

  #isBackward(bookmark) {
    const { anchor, focus } = bookmark
    if (anchor.blockId !== focus.blockId) {
      return this.#runtime.indexOf(anchor.blockId) > this.#runtime.indexOf(focus.blockId)
    }
    if (anchor.fieldKey !== focus.fieldKey) {
      const fields = this.#reconciler.getEditableFields(anchor.blockId)
      return fields.findIndex(field => field.key === anchor.fieldKey)
        > fields.findIndex(field => field.key === focus.fieldKey)
    }
    return anchor.offset > focus.offset
  }

  #formattingBlockIds(range, blockIds) {
    const result = []
    for (const id of blockIds) {
      const record = this.#runtime.get(id)
      const definition = record ? this.#registry.getBlockDefinition(record.type) : null
      if (!definition?.capabilities?.formatting?.inlineTools) return null

      const fields = this.#reconciler.getEditableFields(id)
      const touched = fields.filter(field => {
        try { return range.intersectsNode(field.element) } catch { return false }
      })
      if (!touched.length || touched.some(field => field.mode !== 'rich-text')) return null
      result.push(id)
    }
    return result
  }

  #resolveFormattingSelection(resolved = null) {
    const selection = resolved ?? this.#resolveSelection()
    if (!selection) return null
    const blockIds = this.#formattingBlockIds(selection.range, selection.blockIds)
    return blockIds ? { ...selection, blockIds } : null
  }

  #allowedTools(blockIds) {
    /** @type {Set<string> | null} */
    let allowed = null
    for (const id of blockIds) {
      const record = this.#runtime.get(id)
      const definition = record ? this.#registry.getBlockDefinition(record.type) : null
      const policy = definition?.capabilities?.formatting?.inlineTools
      if (policy === true) continue
      const current = new Set(Array.isArray(policy) ? policy : [])
      if (allowed === null) allowed = current
      else allowed = new Set([...allowed].filter(type => current.has(type)))
    }
    return allowed
  }

  #show(selection) {
    this.#tooltip.hide()
    this.#range = selection.range.cloneRange()
    this.#blockId = selection.blockId
    this.#fieldKey = selection.fieldKey
    const record = this.#runtime.get(selection.blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    this.#typeName.textContent = definition
      ? this.#label('plugin', definition.type, definition.label)
      : ''
    this.#typeSelect.hidden = this.#registry.blockTypes.length < 2

    const formatting = this.#resolveFormattingSelection(selection)
    const allowed = formatting ? this.#allowedTools(formatting.blockIds) : new Set()
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button) continue
      button.hidden = !formatting || (allowed ? !allowed.has(tool.type) : false)
    }
    if (formatting) this.#updateActiveStates(formatting)
    this.#updateBlockControls(selection)
    this.#element.style.display = 'flex'
    this.#position(selection.range)
  }

  #label(scope, type, label) {
    if (!label) return type
    const fallback = label.fallback ?? type
    const key = `${scope}.${type}.${label.key}`
    const value = this.#translate(key, fallback)
    return value === key ? fallback : value
  }

  #position(range) {
    const rect = range.getBoundingClientRect()
    const rootRect = this.#root.getBoundingClientRect()
    const width = this.#element.offsetWidth
    const height = this.#element.offsetHeight
    const viewportWidth = this.#root.ownerDocument.defaultView?.innerWidth ?? rootRect.right
    const minLeft = Math.max(4, rootRect.left + 4)
    const maxLeft = Math.min(viewportWidth - 4, rootRect.right - 4) - width
    const left = Math.max(minLeft, Math.min(rect.left + rect.width / 2 - width / 2, maxLeft))
    const below = rect.top < height + 16
    this.#element.style.position = 'absolute'
    this.#element.style.top = `${(below ? rect.bottom : rect.top) - rootRect.top}px`
    this.#element.style.left = `${left + width / 2 - rootRect.left}px`
    this.#element.style.transform = below ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)'
    this.#element.style.marginTop = below ? '8px' : '-8px'
  }

  #updateActiveStates(resolved) {
    const selection = resolved ?? this.#resolveFormattingSelection()
    if (!selection) return
    const allowed = this.#allowedTools(selection.blockIds)
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button || (allowed && !allowed.has(tool.type))) continue
      let active = false
      try { active = tool.isActive(selection) === true } catch {}
      button.classList.toggle('oe-inline-tool--active', active)
      if (tool.getIcon) {
        const icon = tool.getIcon(active)
        if (this.#buttonIcons.get(tool.type) !== icon) {
          setTrustedHtml(button, icon)
          this.#buttonIcons.set(tool.type, icon)
        }
      }
      const title = tool.getTitle?.(active) ?? tool.title
      if (title) button.setAttribute('aria-label', title)
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
      input.placeholder = this.#translate('toolbox.search', 'Search...')
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

    const currentType = this.#runtime.get(bookmark.anchor.blockId)?.type
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
      t: label => this.#label('plugin', record.type, label),
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
      : this.#label('plugin', record.type, active.label)
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
      t: label => this.#label('plugin', record.type, label),
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
      label.textContent = this.#label('plugin', record.type, action.label)
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
        this.#runtime.interact('block.inline-control', () => this.#runtime.update(blockId, current => ({
          data: capability.apply(current.data, action.id, {
            createId: prefix => this.#runtime.createDataId(prefix),
          }),
        })), () => bookmark)
        this.#view.reconcileInteraction()
        this.#closeControlDropdown()
        queueMicrotask(() => {
          this.#restoreSelection(bookmark)
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

  #mutate(range, operation, type, lease = this.#selectionVersion) {
    if (this.#readOnly || this.#destroyed || lease !== this.#selectionVersion) return undefined
    const start = this.#reconciler.resolveEditableTarget(range.startContainer)
    const end = this.#reconciler.resolveEditableTarget(range.endContainer)
    if (!start || !end) return undefined
    const blockIds = this.#blockIdsBetween(start.blockId, end.blockId)
    const formattingIds = this.#formattingBlockIds(range, blockIds)
    if (!formattingIds) return undefined
    const allowed = this.#allowedTools(formattingIds)
    if (allowed && !allowed.has(type)) return undefined

    const bookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture())
    let result
    try {
      result = this.#runtime.syncBlocksFromProjection(formattingIds, () => {
        result = operation()
        return result
      }, {
        origin: 'user',
        name: `inline.${type}`,
        preserveSourceProjection: formattingIds.length === 1,
      })
    } catch (error) {
      if (bookmark) this.#restoreSelection(bookmark, range)
      throw error
    }

    const nextBookmark = cloneBookmark(
      this.#selectionPort?.bookmark ?? this.#selection.capture() ?? bookmark,
    )
    if (bookmark && nextBookmark && this.#isBackward(bookmark) !== this.#isBackward(nextBookmark)) {
      const anchor = nextBookmark.anchor
      nextBookmark.anchor = nextBookmark.focus
      nextBookmark.focus = anchor
    }
    if (nextBookmark) this.#restoreSelection(nextBookmark, range)
    this.show()
    return result
  }

  #restoreSelection(bookmark, range = null) {
    if (bookmark && typeof this.#selectionPort?.restore === 'function') {
      if (this.#selectionPort.restore(bookmark)) return
    }
    if (bookmark && this.#selection.restore(bookmark)) return
    if (range) this.#restoreNativeRange(range)
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
    this.#tooltip.hide()
    if (!this.#actions) {
      this.#buttonsPanel.style.display = ''
      return
    }
    this.#actions.remove()
    this.#actions = null
    this.#buttonsPanel.style.display = ''
  }
}
