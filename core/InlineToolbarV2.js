// @ts-check
import { setTrustedHtml } from '../plugin-kit/index.js'

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

export class InlineToolbarV2 {
  #root
  #runtime
  #registry
  #reconciler
  #selection
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

  constructor({ root, runtime, registry, reconciler, selection, tools = [] }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
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
  }

  setReadOnly(value) {
    this.#readOnly = value === true
    if (this.#readOnly) this.hide()
  }

  handleShortcut(event) {
    if (this.#readOnly || event.defaultPrevented) return false
    const tool = this.#tools.find(candidate => matchesShortcut(candidate.shortcut, event))
    if (!tool) return false
    if (!this.#resolveSelection()) return false
    event.preventDefault?.()
    this.openTool(tool.type)
    return true
  }

  openTool(type) {
    if (this.#readOnly || this.#destroyed) return false
    const tool = this.#tools.find(candidate => candidate.type === type)
    if (!tool) return false
    const selection = this.#resolveSelection()
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
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#root.ownerDocument.removeEventListener('selectionchange', this.#onSelectionChange)
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
    const start = this.#reconciler.resolveEditableTarget(range.startContainer)
    const end = this.#reconciler.resolveEditableTarget(range.endContainer)
    if (!start || !end || start.blockId !== end.blockId || start.fieldKey !== end.fieldKey) return null
    const definition = this.#registry.getBlockDefinition(this.#runtime.get(start.blockId)?.type)
    if (!definition?.capabilities?.formatting?.inlineTools) return null
    return {
      blockId: start.blockId,
      fieldKey: start.fieldKey,
      range,
      text: native.toString(),
    }
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
    const allowed = this.#allowedTools(selection.blockId)
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button) continue
      button.hidden = allowed ? !allowed.has(tool.type) : false
    }
    this.#updateActiveStates(selection)
    this.#position(selection.range)
    this.#element.style.display = 'flex'
  }

  #position(range) {
    const rect = range.getBoundingClientRect()
    const rootRect = this.#root.getBoundingClientRect()
    this.#element.style.position = 'absolute'
    this.#element.style.top = `${Math.max(0, rect.top - rootRect.top - 44)}px`
    this.#element.style.left = `${Math.max(0, rect.left - rootRect.left + rect.width / 2)}px`
  }

  #updateActiveStates(resolved) {
    const selection = resolved ?? this.#resolveSelection()
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
    queueMicrotask(() => {
      if (bookmark) this.#selection.restore(bookmark)
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
