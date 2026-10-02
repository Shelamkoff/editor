// @ts-check
import { findNodeAtOffset } from '../shared/textOffset.js'
import { setTrustedHtml } from '../plugin-kit/index.js'

function localizedLabel(definition, scope, translate) {
  const label = definition?.label
  if (!label) return definition?.type ?? ''
  const key = `${scope}.${definition.type}.${label.key}`
  const value = translate(key, label.fallback)
  return value === key ? label.fallback : value
}

export class SlashCommandControllerV2 {
  #root
  #runtime
  #registry
  #reconciler
  #selection
  #view
  #inlineCommands
  #translate
  #t
  #document
  #window
  #controller
  #menu
  #session = null
  #items = []
  #filtered = []
  #activeIndex = 0
  #itemsVersion = 0

  constructor({ root, runtime, registry, reconciler, selection, view, inlineCommands, translate, t }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#inlineCommands = inlineCommands
    this.#translate = typeof translate === 'function' ? translate : (_key, fallback = '') => fallback
    this.#t = typeof t === 'function' ? t : (_key, fallback = '') => fallback
    this.#document = root.ownerDocument
    this.#window = this.#document.defaultView

    const AbortControllerCtor = this.#window?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    const signal = this.#controller.signal

    this.#menu = this.#document.createElement('ul')
    this.#menu.className = 'oe-slash-menu'
    this.#menu.setAttribute('role', 'menu')
    this.#menu.style.display = 'none'
    root.appendChild(this.#menu)

    this.#items = this.#buildItems()

    root.addEventListener('input', event => this.#onInput(event), { signal })
    root.addEventListener('keydown', event => this.#onKeydown(event), { capture: true, signal })
    root.addEventListener('focusout', event => this.#onFocusOut(event), { signal })
    this.#document.addEventListener('scroll', () => this.#position(), { capture: true, passive: true, signal })
    this.#window?.addEventListener?.('resize', () => this.#position(), { signal })
  }

  get isOpen() {
    return this.#session !== null
  }

  close() {
    this.#itemsVersion++
    this.#session = null
    this.#filtered = []
    this.#activeIndex = 0
    this.#menu.style.display = 'none'
    this.#menu.replaceChildren()
  }

  destroy() {
    this.close()
    this.#controller.abort()
    this.#menu.remove()
  }

  #buildItems() {
    const result = []
    for (const type of this.#registry.blockTypes) {
      const definition = this.#registry.getBlockDefinition(type)
      if (!definition) continue
      const label = localizedLabel(definition, 'plugin', this.#translate)
      result.push({
        kind: 'block',
        type,
        label,
        icon: definition.icon ?? '',
        search: `${type}\0${label}`.toLocaleLowerCase(),
      })
      for (const variant of definition.toolbox ?? []) {
        const variantLabel = this.#translate(
          `plugin.${type}.${variant.label.key}`,
          variant.label.fallback,
        )
        result.push({
          kind: 'block',
          type,
          toolboxItemId: variant.id,
          label: variantLabel,
          icon: variant.icon ?? definition.icon ?? '',
          search: `${type}\0${variant.id}\0${variantLabel}`.toLocaleLowerCase(),
        })
      }
    }
    for (const type of this.#registry.inlineTypes) {
      const definition = this.#registry.getInlineDefinition(type)
      if (!definition) continue
      const label = localizedLabel(definition, 'inline', this.#translate)
      result.push({
        kind: 'inline',
        type,
        label,
        icon: definition.icon ?? '',
        search: `${type}\0${label}`.toLocaleLowerCase(),
      })
    }
    return result
  }

  #onInput(event) {
    if (this.#runtime.readOnly) {
      this.close()
      return
    }
    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner || owner.mode !== 'rich-text') {
      this.close()
      return
    }
    const bookmark = this.#selection.capture()
    if (
      !bookmark?.anchor
      || !bookmark?.focus
      || bookmark.anchor.blockId !== owner.blockId
      || bookmark.focus.blockId !== owner.blockId
      || bookmark.anchor.fieldKey !== owner.fieldKey
      || bookmark.focus.fieldKey !== owner.fieldKey
      || bookmark.anchor.offset !== bookmark.focus.offset
    ) {
      this.close()
      return
    }

    const native = this.#window?.getSelection?.()
    if (!native?.focusNode || native.rangeCount === 0 || !owner.element.contains(native.focusNode)) {
      this.close()
      return
    }
    const before = this.#textBeforeCaret(owner.element, native.focusNode, native.focusOffset)
    const slash = before.lastIndexOf('/')
    if (slash < 0) {
      this.close()
      return
    }

    const query = before.slice(slash + 1)
    if (/[\r\n]/.test(query)) {
      this.close()
      return
    }
    const end = bookmark.focus.offset
    const start = Math.max(0, end - query.length - 1)
    this.#session = {
      blockId: owner.blockId,
      fieldKey: owner.fieldKey,
      element: owner.element,
      start,
      end,
      query,
    }
    this.#filter(query)
    this.#menu.style.display = ''
    this.#position()
  }

  #onKeydown(event) {
    if (!this.#session) return
    if (!this.#sessionIsCurrent()) {
      this.close()
      return
    }
    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (
      !owner
      || owner.blockId !== this.#session.blockId
      || owner.fieldKey !== this.#session.fieldKey
    ) {
      this.close()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (!this.#filtered.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      this.#activeIndex = (this.#activeIndex + direction + this.#filtered.length) % this.#filtered.length
      this.#render()
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      this.#select(this.#activeIndex)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      const session = this.#session
      this.close()
      this.#runtime.replaceRichText(
        session.blockId,
        session.fieldKey,
        { start: session.start, end: session.end },
        { kind: 'text', text: '' },
      )
      this.#view.reconcileInteraction()
      this.#selection.setCaret(session.blockId, {
        fieldKey: session.fieldKey,
        offset: session.start,
      })
      return
    }
    if (event.key === 'Backspace' && this.#session.query === '') {
      this.close()
    }
  }

  #onFocusOut(event) {
    if (!this.#session) return
    const next = event.relatedTarget
    if (next && (this.#session.element.contains(next) || this.#menu.contains(next))) return
    this.close()
  }

  #filter(query) {
    const value = String(query ?? '').toLocaleLowerCase()
    this.#filtered = value
      ? this.#items.filter(item => item.search.includes(value))
      : [...this.#items]
    this.#activeIndex = Math.min(this.#activeIndex, Math.max(0, this.#filtered.length - 1))
    this.#render()
  }

  #render() {
    const version = ++this.#itemsVersion
    const session = this.#session
    const ownsItems = () => (
      this.#session === session
      && this.#itemsVersion === version
      && this.#sessionIsCurrent()
    )
    this.#menu.replaceChildren()
    if (!this.#filtered.length) {
      const empty = this.#document.createElement('li')
      empty.className = 'oe-slash-menu__empty'
      empty.setAttribute('role', 'none')
      empty.textContent = this.#t('slash.noResults', 'No results')
      this.#menu.appendChild(empty)
      return
    }

    this.#filtered.forEach((item, index) => {
      const element = this.#document.createElement('li')
      element.className = 'oe-slash-menu__item'
      if (index === this.#activeIndex) element.classList.add('oe-slash-menu__item--active')
      element.setAttribute('role', 'menuitem')
      element.tabIndex = -1

      const icon = this.#document.createElement('span')
      icon.className = 'oe-slash-menu__icon'
      setTrustedHtml(icon, item.icon)
      const label = this.#document.createElement('span')
      label.className = 'oe-slash-menu__label'
      label.textContent = item.label
      element.append(icon, label)

      element.addEventListener('mousedown', event => {
        event.preventDefault()
        event.stopPropagation()
        if (ownsItems()) this.#select(index)
      }, { signal: this.#controller.signal })
      element.addEventListener('mouseenter', () => {
        if (!ownsItems()) return
        this.#activeIndex = index
        this.#render()
      }, { signal: this.#controller.signal })
      this.#menu.appendChild(element)
    })
    this.#menu.children[this.#activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }

  #select(index) {
    const session = this.#session
    const item = this.#filtered[index]
    if (!session || !item || !this.#sessionIsCurrent()) return
    this.close()

    if (item.kind === 'inline') {
      const restored = this.#selection.restore({
        anchor: { blockId: session.blockId, fieldKey: session.fieldKey, offset: session.start },
        focus: { blockId: session.blockId, fieldKey: session.fieldKey, offset: session.end },
      })
      if (restored) this.#inlineCommands.insert(item.type)
      return
    }

    const id = this.#runtime.applySlashBlockCommand(
      session.blockId,
      session.fieldKey,
      { start: session.start, end: session.end },
      { type: item.type, ...(item.toolboxItemId ? { toolboxItemId: item.toolboxItemId } : {}) },
    )
    if (!id) return
    this.#view.reconcileInteraction()
    this.#view.setCurrent(id)
    queueMicrotask(() => this.#view.focus(id, { offset: 'start' }))
  }

  #sessionIsCurrent() {
    const session = this.#session
    if (!session || !session.element.isConnected || !this.#root.contains(session.element)) return false
    const field = this.#reconciler.getEditableField(session.blockId, session.fieldKey)
    return field?.element === session.element
  }

  #textBeforeCaret(element, node, offset) {
    const range = this.#document.createRange()
    range.selectNodeContents(element)
    try {
      range.setEnd(node, offset)
      return range.toString()
    } catch {
      return ''
    }
  }

  #position() {
    const session = this.#session
    if (!session || this.#menu.style.display === 'none') return
    const start = findNodeAtOffset(session.element, session.start, 'start')
    const end = findNodeAtOffset(session.element, session.end, 'end')
    const range = this.#document.createRange()
    try {
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
    } catch {
      return
    }
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
    const rootRect = this.#root.getBoundingClientRect()
    const width = this.#menu.offsetWidth || 240
    const viewportWidth = this.#window?.innerWidth ?? rootRect.right
    const left = Math.min(
      Math.max(0, viewportWidth - rootRect.left - width),
      Math.max(0, rect.left - rootRect.left),
    )
    const below = rect.bottom - rootRect.top + 6
    const menuHeight = this.#menu.offsetHeight || 280
    const viewportHeight = this.#window?.innerHeight ?? rootRect.bottom
    const top = rect.bottom + menuHeight <= viewportHeight
      ? below
      : Math.max(0, rect.top - rootRect.top - menuHeight - 6)
    this.#menu.style.left = `${left}px`
    this.#menu.style.top = `${top}px`
  }
}
