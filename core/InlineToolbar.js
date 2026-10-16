import { convertedSelection, restoreConvertedSelection } from './conversionSelection.js'
// @ts-check
import { handleMenuKeydown } from '../plugin-kit/index.js'
import { setTrustedHtml } from '../shared/sanitize/sanitizeHtml.js'
import { Tooltip } from './Tooltip.js'
import { prepareSettingsActions } from './SettingsActions.js'
import { InlineToolMounts } from './InlineToolMounts.js'
import { InlineSelectionAuthority } from './InlineSelectionAuthority.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { shortcutKey } from '../shared/shortcutKey.js'

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
    ...(bookmark.conversionCaret ? { conversionCaret: true } : {}),
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
  #toolMounts
  #mountStates = []
  #activeFormattingTool = null
  #expectedOwnSelection = null
  #reportError
  #buttonIcons = new Map()
  #translate
  #tooltip
  #element
  #buttonsPanel
  #actions = null
  #actionsToolType = null
  #panelSelection = null
  #inFormattingMutation = false
  /** @type {((event: KeyboardEvent) => void) | null} */
  #actionKeydown = null
  #actionVersion = 0
  #buttons = new Map()
  #range = null
  #bookmark = null
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

  constructor({ root, runtime, registry, reconciler, selection, selectionPort = null, view, tools = [], translate = (_key, fallback = '') => fallback, reportError = (_code, _error) => {} }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#selectionPort = selectionPort
    this.#view = view
    this.#reportError = reportError
    this.#toolMounts = new InlineToolMounts(tools, runtime, error => this.#reportError('cleanup.failed', error))
    this.#tools = this.#toolMounts.tools
    this.#translate = translate
    this.#readOnly = runtime.readOnly

    try {
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
    const controlChevron = document.createElement('span')
    controlChevron.className = 'oe-inline-toolbar__type-chevron'
    controlChevron.setAttribute('aria-hidden', 'true')
    setTrustedHtml(controlChevron, '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>')
    this.#controlSelect.append(this.#controlLabel, controlChevron)
    this.#buttonsPanel.append(this.#controlDivider, this.#controlSelect)

    this.#controlDropdown = document.createElement('div')
    this.#controlDropdown.className = 'oe-inline-toolbar__level-dropdown'
    this.#controlDropdown.setAttribute('role', 'menu')
    this.#controlDropdown.style.display = 'none'
    this.#element.append(this.#controlDropdown)

    this.#typeSelect.addEventListener('mousedown', event => {
      event.preventDefault()
      if (this.#typeDropdown.style.display === 'none') this.#typeBookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture())
    })
    this.#typeSelect.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#typeDropdown.style.display === 'none') this.#openTypeDropdown()
      else {
        const bookmark = this.#typeBookmark
        this.#closeTypeDropdown()
        this.#restoreSelection(bookmark)
      }
    })
    this.#typeDropdown.addEventListener('keydown', event => {
      handleMenuKeydown(event, this.#typeDropdown, {
        onEscape: () => {
          const bookmark = this.#typeBookmark
          this.#closeTypeDropdown()
          this.#restoreSelection(bookmark)
          this.#typeSelect.focus()
        },
        itemSelector: '[role="menuitem"]:not([style*="display: none"])',
      })
    })

    this.#controlSelect.addEventListener('mousedown', event => {
      event.preventDefault()
      if (this.#controlDropdown.style.display === 'none') this.#controlBookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture())
    })
    this.#controlSelect.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      if (this.#controlDropdown.style.display === 'none') this.#openControlDropdown()
      else {
        const bookmark = this.#controlBookmark
        this.#closeControlDropdown()
        this.#restoreSelection(bookmark)
      }
    })
    this.#controlSelect.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      event.stopPropagation()
      if (this.#controlDropdown.style.display === 'none') this.#openControlDropdown()
      const items = /** @type {HTMLElement[]} */ ([...this.#controlDropdown.querySelectorAll('[role^="menuitem"]:not(:disabled)')])
      const target = event.key === 'ArrowUp' ? items.at(-1) : items[0]
      target?.focus()
    })
    this.#controlDropdown.addEventListener('keydown', event => {
      handleMenuKeydown(event, this.#controlDropdown, {
        onEscape: () => {
          const bookmark = this.#controlBookmark
          this.#closeControlDropdown()
          this.#restoreSelection(bookmark)
          this.#controlSelect.focus()
        },
        itemSelector: '[role^="menuitem"]:not(:disabled)',
      })
    })

    this.#tooltip = new Tooltip(root)
    for (const tool of this.#tools) {
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

      const mount = { active: false, revoked: false, port: null }
      this.#mountStates.push(mount)
      const scoped = new InlineSelectionAuthority({
        root: this.#root,
        runtime: this.#runtime,
        reconciler: this.#reconciler,
        readSelection: () => {
          const native = this.#root.ownerDocument.defaultView?.getSelection()
          const range = native && !native.isCollapsed && native.rangeCount
            ? native.getRangeAt(0) : null
          const current = range && this.#root.contains(range.startContainer)
            && this.#root.contains(range.endContainer) ? range : null
          // A selected range spanning editables has a core-owned logical
          // representation. Native Selection may only expose the clipped
          // focused field, so it must not supersede that authorized range.
          const stored = this.#selectionPort?.range ?? null
          return {
            range: stored ?? current ?? this.#range,
            bookmark: cloneBookmark(this.#selectionPort?.bookmark
              ?? (current ? this.#selection.capture() : this.#bookmark)),
          }
        },
        restoreSelection: bookmark => this.#restoreSelection(bookmark),
        lease: () => this.#selectionVersion,
        canAccess: () => mount.active && !mount.revoked && !this.#readOnly && !this.#destroyed
          && this.#runtime.canAccessFormattingSelection(
            this.#inFormattingMutation && this.#activeFormattingTool === tool.type),
        isMutating: () => this.#inFormattingMutation && this.#activeFormattingTool === tool.type,
      })
      mount.port = scoped

      const port = Object.freeze({
        get range() { return scoped.range },
        capture: range => scoped.capture(range),
        restore: (token, options) => scoped.restore(token, options),
      })
      const mutate = (token, operation) => {
        if (!mount.active || mount.revoked) throw new Error('Inline tool mutation context is not active')
        if (!token || !scoped.isValid(token)) return undefined
        if (typeof operation !== 'function') throw new TypeError('Inline formatting operation must be a function')
        const range = scoped.range
        if (!range || !scoped.restore(token)) return undefined
        const lease = this.#selectionVersion
        return this.#mutate(range, () => operation(scoped.range ?? range), tool.type, lease)
      }
      this.#toolMounts.start(tool, port, button, {
        mutate,
        restoreSelection: token => {
          if (!mount.active || mount.revoked || !token || !scoped.isValid(token)) return false
          return scoped.restore(token)
        },
      }, () => {
        mount.active = false
        mount.revoked = true
        scoped.revoke()
      })
    }

    this.#onSelectionChange = () => {
      if (this.#element.contains(document.activeElement)) return
      // Native selectionchange is queued. A notification for the range we
      // just restored as the result of our own action must not retire it.
      if (this.#matchesExpectedOwnSelection()) return
      this.#expectedOwnSelection = null
      this.#selectionVersion++
      this.#closeActions()
      this.#closeTypeDropdown()
      this.#closeControlDropdown()
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
    for (const mount of this.#mountStates) {
      mount.active = true
      mount.port?.activate()
    }
    } catch (error) {
      this.#releaseResources()
      throw error
    }
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
    if (!tool || this.#buttons.get(tool.type)?.disabled) return false
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
    if (!tool || this.#buttons.get(type)?.disabled) return false
    const selection = this.#resolveFormattingSelection()
    if (!selection) return false
    const allowed = this.#allowedTools(selection.blockIds)
    if (allowed && !allowed.has(type)) return false

    if (tool.renderActions) {
      this.#closeActions()
      const range = selection.range.cloneRange()
      const lease = this.#selectionVersion
      const actionLease = this.#actionVersion
      const generation = this.#runtime.generation
      let expectedRevision = this.#runtime.revision
      let owners = selection.blockIds.map(blockId => ({ blockId, element: this.#view.element(blockId) }))
      const isCurrent = () => !this.#destroyed && !this.#readOnly
        && expectedRevision === this.#runtime.revision
        && lease === this.#selectionVersion && actionLease === this.#actionVersion
        && generation === this.#runtime.generation
        && owners.every(owner => owner.element === this.#view.element(owner.blockId))
      let panelBookmark = cloneBookmark(selection.bookmark)
      let panelRange = range
      const panelPort = new InlineSelectionAuthority({
        root: this.#root,
        runtime: this.#runtime,
        reconciler: this.#reconciler,
        readSelection: () => ({ range: panelRange, bookmark: panelBookmark }),
        restoreSelection: bookmark => this.#restoreSelection(bookmark),
        lease: () => this.#selectionVersion,
        canAccess: () => isCurrent() && this.#runtime.canAccessFormattingSelection(this.#inFormattingMutation),
        isMutating: () => this.#inFormattingMutation,
      })
      panelPort.activate()
      let panelToken = panelPort.capture(range)
      if (!panelToken) {
        panelPort.revoke()
        return false
      }
      this.#panelSelection = panelPort
      const refreshPanelToken = () => {
        if (!isCurrent()) return
        panelBookmark = cloneBookmark(this.#selectionPort?.bookmark ?? this.#selection.capture() ?? panelBookmark)
        panelRange = panelPort.resolveOwnResult(panelBookmark)
        panelToken = panelRange ? panelPort.capture() : null 
      }
      const closePanel = () => {
        if (!isCurrent()) return
        const restored = panelToken && panelPort.restore(panelToken)
        this.#closeActions()
        if (restored) this.show()
      }
      let panel
      try {
        panel = synchronousResult(tool.renderActions({
          get range() { return panelPort.range },
          mutate: operation => {
            if (!isCurrent() || !panelToken || typeof operation !== 'function') return undefined
            const currentRange = panelPort.range
            if (!currentRange) return undefined
            const panelFocus = /** @type {HTMLElement | null} */ (this.#root.ownerDocument.activeElement)
            if (!panelPort.restore(panelToken)) return undefined
            let result
            try {
              result = this.#mutate(currentRange, () => operation(currentRange), tool.type, lease)
            } finally {
              // A synchronous owner-driven range restoration must not let a
              // queued selectionchange retire the panel whose control held focus.
              if (panelFocus?.isConnected && this.#element.contains(panelFocus) && !this.#destroyed) {
                panelFocus.focus({ preventScroll: true })
              }
            }
            if (lease !== this.#selectionVersion || generation !== this.#runtime.generation
              || !selection.blockIds.every(blockId => this.#runtime.has(blockId))) return result
            owners = selection.blockIds.map(blockId => ({ blockId, element: this.#view.element(blockId) }))
            expectedRevision = this.#runtime.revision
            refreshPanelToken()
            return result
          },
          getTextAlign: () => isCurrent() && panelToken && panelPort.isValid(panelToken)
            ? this.#runtime.getTextAlign(selection.blockIds)
            : 'mixed',
          setTextAlign: value => {
            if (!isCurrent() || !panelToken || !panelPort.isValid(panelToken)) return false
            const changed = this.#runtime.setTextAlign(selection.blockIds, value)
            if (changed && lease === this.#selectionVersion && generation === this.#runtime.generation
              && selection.blockIds.every(blockId => this.#runtime.has(blockId))) {
              owners = selection.blockIds.map(blockId => ({ blockId, element: this.#view.element(blockId) }))
              expectedRevision = this.#runtime.revision
              refreshPanelToken()
            }
            return changed
          },
          restoreSelection: () => {
            if (isCurrent() && panelToken) return panelPort.restore(panelToken)
            return false
          },
          close: closePanel,
          backLabel: this.#translate('block.back', 'Back'),
          showTooltip: (anchor, label, shortcut) => {
            if (isCurrent()) this.#tooltip.show(anchor, label, shortcut)
          },
          hideTooltip: () => { if (isCurrent()) this.#tooltip.hide() },
        }), error => this.#reportError('command.failed', error))
      } catch (error) {
        if (actionLease === this.#actionVersion) this.#closeActions()
        throw error
      }
      if (!isCurrent()) {
        if (this.#panelSelection === panelPort) this.#closeActions()
        return false
      }
      if (panel) {
        this.#actionKeydown = event => {
          if (event.defaultPrevented || event.key !== 'Escape' || !isCurrent()) return
          event.preventDefault()
          event.stopPropagation()
          closePanel()
        }
        panel.addEventListener('keydown', this.#actionKeydown)
        this.#actions = panel
        this.#actionsToolType = tool.type
        this.#buttonsPanel.style.display = 'none'
        this.#element.append(panel)
        this.#show(selection)
        if (!panel.contains(panel.ownerDocument.activeElement)) {
          const control = /** @type {HTMLElement | null} */ (panel.querySelector(
            'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
          ) ?? panel.querySelector('button:not(:disabled), [tabindex="0"]'))
          control?.focus({ preventScroll: true })
        }
        return true
      }
      this.#closeActions()
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
    this.#expectedOwnSelection = null
    this.#range = null
    this.#bookmark = null
    this.#blockId = null
    this.#fieldKey = null
    this.#element.style.display = 'none'
    this.#closeActions()
    this.#closeTypeDropdown()
    this.#closeControlDropdown()
  }

  destroy() {
    this.#releaseResources()
  }

  #releaseResources() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#expectedOwnSelection = null
    this.#typeVersion++
    this.#controlVersion++
    this.#selectionVersion++
    for (const mount of this.#mountStates) {
      mount.active = false
      mount.revoked = true
      mount.port?.revoke()
    }

    const errors = []
    const release = operation => {
      try { operation() } catch (error) { errors.push(error) }
    }
    const document = this.#root.ownerDocument
    if (this.#onSelectionChange) release(() => document.removeEventListener('selectionchange', this.#onSelectionChange))
    if (this.#onMouseUp) release(() => document.removeEventListener('mouseup', this.#onMouseUp))
    if (this.#documentClick) release(() => document.removeEventListener('mousedown', this.#documentClick, true))

    // All started tool claims and callbacks are retired before cleanup hooks.
    release(() => this.#toolMounts?.destroy())
    if (this.#tooltip) release(() => this.#closeActions())
    if (this.#tooltip) release(() => this.#tooltip.destroy())
    if (this.#element) release(() => this.#element.remove())
    for (const error of errors) {
      try { this.#reportError('cleanup.failed', error) } catch {}
    }
  }

  /** A compact expected native presentation for the last accepted own
   * formatting result. It never carries persisted data or public authority.
   */
  #rememberOwnSelection() {
    const native = this.#root.ownerDocument.defaultView?.getSelection?.()
    if (!native?.anchorNode || !native.focusNode
      || !this.#root.contains(native.anchorNode)
      || !this.#root.contains(native.focusNode)) {
      this.#expectedOwnSelection = null
      return
    }
    this.#expectedOwnSelection = {
      generation: this.#runtime.generation,
      revision: this.#runtime.revision,
      anchorNode: native.anchorNode,
      anchorOffset: native.anchorOffset,
      focusNode: native.focusNode,
      focusOffset: native.focusOffset,
    }
  }

  #matchesExpectedOwnSelection() {
    const expected = this.#expectedOwnSelection
    if (!expected || expected.generation !== this.#runtime.generation
      || expected.revision !== this.#runtime.revision) return false
    const native = this.#root.ownerDocument.defaultView?.getSelection?.()
    return Boolean(native?.anchorNode && native.focusNode
      && expected.anchorNode === native.anchorNode
      && expected.anchorOffset === native.anchorOffset
      && expected.focusNode === native.focusNode
      && expected.focusOffset === native.focusOffset
      && this.#root.contains(native.anchorNode)
      && this.#root.contains(native.focusNode))
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

    const resolvedRange = this.#selectionPort?.range ?? range
    return {
      range: resolvedRange.cloneRange(),
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
      text: resolvedRange.toString(),
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
    return blockIds ? { ...selection, blockIds, textAlign: this.#runtime.getTextAlign(blockIds) } : null
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
    this.#bookmark = cloneBookmark(selection.bookmark)
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

  /** @param {HTMLElement} menu @param {HTMLElement} trigger */
  #positionDropdown(menu, trigger) {
    const toolbar = this.#element.getBoundingClientRect()
    const anchor = trigger.getBoundingClientRect()
    const window = this.#root.ownerDocument.defaultView
    const margin = 8
    const gap = 4
    menu.style.transform = 'none'
    menu.style.maxHeight = '224px'
    const bounds = menu.getBoundingClientRect()
    const below = Math.max(0, (window?.innerHeight ?? toolbar.bottom) - margin - toolbar.bottom - gap)
    const above = Math.max(0, toolbar.top - margin - gap)
    const useBelow = bounds.height <= below || below >= above
    menu.style.maxHeight = Math.min(224, useBelow ? below : above) + 'px'
    const height = menu.getBoundingClientRect().height
    const left = Math.max(margin, Math.min(anchor.left, (window?.innerWidth ?? toolbar.right) - margin - bounds.width))
    menu.style.left = (left - toolbar.left - this.#element.clientLeft) + 'px'
    menu.style.top = (useBelow ? toolbar.height + gap : -height - gap) - this.#element.clientTop + 'px'
  }

  #updateActiveStates(resolved) {
    const selection = resolved ?? this.#resolveFormattingSelection()
    if (!selection) return
    const allowed = this.#allowedTools(selection.blockIds)
    for (const tool of this.#tools) {
      const button = this.#buttons.get(tool.type)
      if (!button || (allowed && !allowed.has(tool.type))) continue
      try {
        const prepared = this.#runtime.prepareExtensionValue(() => {
          const active = synchronousResult(tool.isActive(selection),
            error => this.#reportError('command.failed', error))
          if (typeof active !== 'boolean') throw new TypeError(`Inline tool "${tool.type}" isActive() must return a boolean`)
          const icon = tool.getIcon
            ? synchronousResult(tool.getIcon(active), error => this.#reportError('command.failed', error))
            : tool.icon
          const title = tool.getTitle
            ? synchronousResult(tool.getTitle(active), error => this.#reportError('command.failed', error))
            : tool.title ?? tool.type
          if (typeof icon !== 'string' || typeof title !== 'string') {
            throw new TypeError(`Inline tool "${tool.type}" presentation must contain strings`)
          }
          return { active, icon, title }
        })

        // The complete value is owned and validated before changing presentation.
        if (this.#buttonIcons.get(tool.type) !== prepared.icon) {
          setTrustedHtml(button, prepared.icon)
          this.#buttonIcons.set(tool.type, prepared.icon)
        }
        button.setAttribute('aria-label', prepared.title)
        button.classList.toggle('oe-inline-tool--active', prepared.active)
        button.disabled = false
      } catch (error) {
        if (this.#actionsToolType === tool.type) this.#closeActions()
        button.classList.remove('oe-inline-tool--active')
        button.disabled = true
        button.hidden = true
        try { this.#reportError('command.failed', error) } catch {}
      }
    }
  }

  #openTypeDropdown() {
    if (this.#readOnly || this.#destroyed) return
    const bookmark = cloneBookmark(this.#typeBookmark ?? this.#selectionPort?.bookmark ?? this.#selection.capture())
    if (!bookmark) return
    this.#typeBookmark = bookmark
    this.#closeControlDropdown()
    const version = ++this.#typeVersion
    const generation = this.#runtime.generation
    const owners = this.#blockIdsBetween(bookmark.anchor.blockId, bookmark.focus.blockId)
      .map(blockId => ({ blockId, element: this.#view.element(blockId) }))
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
        this.#positionDropdown(this.#typeDropdown, this.#typeSelect)
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
        if (version !== this.#typeVersion || generation !== this.#runtime.generation || this.#readOnly || this.#destroyed) return
        if (owners.some(owner => owner.element !== this.#view.element(owner.blockId))) return
        this.#convertType(bookmark, type)
      })
      this.#typeDropdown.append(item)
    }
    this.#typeDropdown.style.display = ''
    this.#positionDropdown(this.#typeDropdown, this.#typeSelect)
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
      if(bookmark.anchor.blockId!==bookmark.focus.blockId)this.#restoreSelection(bookmark)
      result = this.#runtime.interact('selection.convert', () => this.#runtime.convertLogicalSelection(bookmark, { type }), current => convertedSelection(current,this.#view))
    } catch {
      return
    }
    if (!result) return
    this.#view.reconcileInteraction()
    this.#view.setCurrent(result.focusId)
    queueMicrotask(() => restoreConvertedSelection(result,this.#view,this.#selectionPort))
  }

  #disableBlockControls() {
    this.#closeControlDropdown()
    this.#controlBlockId = null
    this.#controlLabel.textContent = ''
    this.#controlSelect.hidden = true
    this.#controlSelect.disabled = true
    this.#controlDivider.hidden = true
    this.#controlSelect.removeAttribute('aria-label')
    this.#controlDropdown.removeAttribute('aria-label')
  }

  #prepareControlActions(record, definition, capability) {
    try {
      return prepareSettingsActions(this.#runtime, capability, record.data, {
        ownerDocument: this.#root.ownerDocument,
        t: label => this.#label('plugin', record.type, label),
      }, definition.label)
    } catch (error) {
      // Failed metadata retires every previous callback of this group, without
      // hiding formatting tools or invoking extension getters during rendering.
      this.#disableBlockControls()
      try { this.#reportError('command.failed', error) } catch {}
      return null
    }
  }

  #updateBlockControls(selection) {
    this.#disableBlockControls()
    const record = this.#runtime.get(selection.blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const capability = definition?.capabilities?.inlineControls
    if (!record || capability?.kind !== 'actions') return
    const prepared = this.#prepareControlActions(record, definition, capability)
    if (!prepared) return
    const active = prepared.actions.find(action => action.active) ?? prepared.actions[0]
    if (!active) return
    this.#controlSelect.setAttribute('aria-label', prepared.label)
    this.#controlBlockId = selection.blockId
    this.#controlLabel.textContent = active.compactLabel ?? active.label
    this.#controlSelect.hidden = false
    this.#controlSelect.disabled = false
    this.#controlDivider.hidden = false
  }

  #openControlDropdown() {
    if (this.#readOnly || this.#destroyed || this.#controlSelect.disabled || !this.#controlBlockId) return
    const blockId = this.#controlBlockId
    const record = this.#runtime.get(blockId)
    const definition = record ? this.#registry.getBlockDefinition(record.type) : null
    const capability = definition?.capabilities?.inlineControls
    if (!record || capability?.kind !== 'actions') {
      this.#disableBlockControls()
      return
    }
    const bookmark = cloneBookmark(this.#controlBookmark ?? this.#selectionPort?.bookmark ?? this.#selection.capture())
    if (!bookmark) return
    const prepared = this.#prepareControlActions(record, definition, capability)
    if (!prepared) return
    if (!prepared.actions.length) {
      this.#disableBlockControls()
      return
    }
    this.#closeControlDropdown()
    this.#controlBookmark = bookmark
    this.#closeTypeDropdown()
    const version = this.#controlVersion
    const generation = this.#runtime.generation
    const revision = this.#runtime.revision
    const lease = this.#selectionVersion
    const owner = this.#view.element(blockId)
    const fragment = this.#root.ownerDocument.createDocumentFragment()
    for (const action of prepared.actions) {
      const item = this.#root.ownerDocument.createElement('button')
      item.type = 'button'
      item.className = 'oe-inline-toolbar__type-item'
      item.dataset.actionId = action.id
      item.setAttribute('role', 'menuitem')
      if (typeof action.active === 'boolean') {
        item.setAttribute('role', 'menuitemradio')
        item.setAttribute('aria-checked', String(action.active))
      }
      if (action.active) item.classList.add('oe-inline-toolbar__type-item--active')
      if (action.icon) {
        const icon = this.#root.ownerDocument.createElement('span')
        icon.className = 'oe-inline-toolbar__type-item-icon'
        setTrustedHtml(icon, action.icon)
        item.append(icon)
      }
      const label = this.#root.ownerDocument.createElement('span')
      label.textContent = action.label
      item.append(label)
      item.disabled = action.disabled === true
      item.addEventListener('mousedown', event => event.preventDefault())
      item.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        if (
          action.disabled === true
          || version !== this.#controlVersion
          || generation !== this.#runtime.generation
          || revision !== this.#runtime.revision
          || lease !== this.#selectionVersion
          || owner !== this.#view.element(blockId)
          || this.#readOnly
          || this.#destroyed
          || this.#runtime.get(blockId)?.type !== record.type
        ) return
        if (bookmark.anchor.blockId !== bookmark.focus.blockId || bookmark.anchor.fieldKey !== bookmark.focus.fieldKey) this.#restoreSelection(bookmark)
        this.#runtime.interact('block.inline-control', () => this.#runtime.update(blockId, current => ({
          data: prepared.apply(current.data, action.id, {
            createId: prefix => this.#runtime.createDataId(prefix),
          }),
        })), () => bookmark)
        const settledRevision = this.#runtime.revision
        this.#view.reconcileInteraction()
        this.#closeControlDropdown()
        const continuation = this.#controlVersion
        queueMicrotask(() => {
          if (this.#destroyed || this.#readOnly || generation !== this.#runtime.generation
            || settledRevision !== this.#runtime.revision || lease !== this.#selectionVersion
            || continuation !== this.#controlVersion || !this.#runtime.has(blockId)) return
          this.#restoreSelection(bookmark)
          this.show()
        })
      })
      fragment.append(item)
    }
    this.#controlDropdown.setAttribute('aria-label', prepared.label)
    this.#controlDropdown.replaceChildren(fragment)
    this.#controlDropdown.style.display = ''
    this.#positionDropdown(this.#controlDropdown, this.#controlSelect)
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

    const toolbarOwnsFocus = this.#element.contains(this.#root.ownerDocument.activeElement)
    const bookmark = cloneBookmark(this.#selectionPort?.bookmark
      ?? (toolbarOwnsFocus ? this.#bookmark : null) ?? this.#selection.capture())
    let result
    try {
      result = this.#runtime.syncBlocksFromProjection(formattingIds, () => {
        this.#inFormattingMutation = true
        const previousTool = this.#activeFormattingTool
        this.#activeFormattingTool = type
        try {
          result = operation()
          return result
        } finally {
          this.#activeFormattingTool = previousTool
          this.#inFormattingMutation = false
        }
      }, {
        origin: 'user',
        name: `inline.${type}`,
        selectionBefore: bookmark,
        preserveSourceProjection: formattingIds.length === 1,
      })
    } catch (error) {
      if (bookmark) this.#restoreSelection(bookmark)
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
    if (nextBookmark) this.#restoreSelection(nextBookmark)
    this.show()
    this.#rememberOwnSelection()
    return result
  }

  #restoreSelection(bookmark) {
    if (!bookmark?.anchor || !bookmark?.focus) return false
    if (typeof this.#selectionPort?.restore === 'function'
      && this.#selectionPort.restore(bookmark)) return true
    return this.#selection.restore(bookmark) === true
  }


  #closeActions() {
    this.#actionVersion++
    this.#panelSelection?.revoke()
    this.#panelSelection = null
    this.#actionsToolType = null
    this.#tooltip.hide()
    if (!this.#actions) {
      this.#buttonsPanel.style.display = ''
      return
    }
    if (this.#actionKeydown) this.#actions.removeEventListener('keydown', this.#actionKeydown)
    this.#actionKeydown = null
    this.#actions.remove()
    this.#actions = null
    this.#buttonsPanel.style.display = ''
  }
}
