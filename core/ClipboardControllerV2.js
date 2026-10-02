// @ts-check

function selectionRange(bookmark, owner) {
  const anchor = bookmark?.anchor
  const focus = bookmark?.focus
  if (!anchor || !focus) return null
  if (
    anchor.blockId !== owner.blockId
    || focus.blockId !== owner.blockId
    || anchor.fieldKey !== owner.fieldKey
    || focus.fieldKey !== owner.fieldKey
  ) return null
  return {
    start: Math.min(anchor.offset, focus.offset),
    end: Math.max(anchor.offset, focus.offset),
  }
}

export class ClipboardControllerV2 {
  #root
  #runtime
  #registry
  #reconciler
  #selection
  #view
  #crossSelection
  #controller
  #task = null

  constructor({ root, runtime, registry, reconciler, selection, view, crossSelection = null }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#crossSelection = crossSelection
    const AbortControllerCtor = root.ownerDocument?.defaultView?.AbortController ?? AbortController
    this.#controller = new AbortControllerCtor()
    root.addEventListener('copy', event => this.#onCopy(event), { capture: true, signal: this.#controller.signal })
    root.addEventListener('cut', event => this.#onCut(event), { capture: true, signal: this.#controller.signal })
    root.addEventListener('paste', event => this.#onPaste(event), {
      capture: true,
      signal: this.#controller.signal,
    })
  }

  destroy() {
    this.#task?.abort()
    this.#task = null
    this.#controller.abort()
  }

  #onCopy(event) {
    if (!this.#crossSelection?.active || event.defaultPrevented || !event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', this.#crossSelection.text())
    const whole = this.#crossSelection.wholeBlockIds
    if (whole.length) {
      const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
      event.clipboardData.setData('application/x-rector-editor', JSON.stringify(records))
    }
  }

  #onCut(event) {
    if (this.#runtime.readOnly || !this.#crossSelection?.active || event.defaultPrevented || !event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', this.#crossSelection.text())
    const whole = this.#crossSelection.wholeBlockIds
    if (whole.length) {
      const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
      event.clipboardData.setData('application/x-rector-editor', JSON.stringify(records))
      this.#crossSelection.removeWholeBlocks()
      return
    }
    this.#crossSelection.replace({ kind: 'text', text: '' })
  }

  #onPaste(event) {
    if (this.#runtime.readOnly || event.defaultPrevented) return
    if (this.#crossSelection?.active) {
      const data = event.clipboardData
      if (!data) return
      const html = data.getData('text/html')
      const text = data.getData('text/plain')
      event.preventDefault()
      this.#crossSelection.replace(html ? { kind: 'html', html } : { kind: 'text', text })
      return
    }
    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner) return
    const range = selectionRange(this.#selection.capture(), owner)
    if (!range) return
    const data = event.clipboardData
    if (!data) return

    const files = [...(data.files ?? [])]
    if (files.length) {
      const routed = files
        .map(file => ({ input: { kind: /** @type {'file'} */ ('file'), file }, route: this.#route({ kind: 'file', file }, owner.blockId) }))
        .filter(item => item.route)
      if (!routed.length) return
      event.preventDefault()
      this.#beginAsync(owner, range, routed)
      return
    }

    const html = data.getData('text/html')
    const text = data.getData('text/plain')
    const input = html
      ? { kind: /** @type {'html'} */ ('html'), html }
      : { kind: /** @type {'text'} */ ('text'), text }

    const route = this.#route(input, owner.blockId)
    event.preventDefault()
    if (route) {
      this.#beginAsync(owner, range, [{ input, route }])
      return
    }

    this.#runtime.replaceRichText(
      owner.blockId,
      owner.fieldKey,
      range,
      html ? { kind: 'html', html } : { kind: 'text', text },
    )
    this.#view.reconcileInteraction()
    this.#view.setCurrent(owner.blockId)
    queueMicrotask(() => this.#view.focus(owner.blockId, {
      fieldKey: owner.fieldKey,
      offset: range.start + text.length,
    }))
  }

  #route(input, blockId) {
    const current = this.#runtime.get(blockId)
    const ordered = current
      ? [current.type, ...this.#registry.blockTypes.filter(type => type !== current.type)]
      : this.#registry.blockTypes

    for (const type of ordered) {
      const definition = this.#registry.getBlockDefinition(type)
      const paste = definition?.capabilities?.paste
      if (!paste) continue
      try {
        if (paste.accepts(input)) return { type, definition, paste }
      } catch {}
    }
    return null
  }

  #beginAsync(owner, range, items) {
    this.#task?.abort()
    const AbortControllerCtor = this.#root.ownerDocument.defaultView?.AbortController ?? AbortController
    const task = new AbortControllerCtor()
    this.#task = task
    const abort = () => task.abort(this.#controller.signal.reason)
    this.#controller.signal.addEventListener('abort', abort, { once: true, signal: task.signal })

    void (async () => {
      let anchorId = owner.blockId
      for (const { input, route } of items) {
        if (task.signal.aborted || !this.#runtime.get(anchorId)) return
        let result
        try {
          result = await route.paste.resolve(input, {
            signal: task.signal,
            ownerDocument: this.#root.ownerDocument,
            createId: prefix => this.#runtime.createDataId(prefix),
          })
        } catch (error) {
          if (!task.signal.aborted) console.warn('[Clipboard] paste resolver failed', error)
          return
        }
        if (task.signal.aborted || !result || !this.#runtime.get(anchorId)) return

        if (result.kind === 'rich-text') {
          if (anchorId !== owner.blockId) return
          this.#runtime.replaceRichText(owner.blockId, owner.fieldKey, range, result.replacement)
          this.#view.reconcileInteraction()
          this.#view.setCurrent(owner.blockId)
          queueMicrotask(() => this.#view.focus(owner.blockId, { fieldKey: owner.fieldKey }))
          continue
        }

        if (result.kind === 'block') {
          const current = this.#runtime.get(anchorId)
          if (!current) return
          if (this.#runtime.isEmpty(anchorId)) {
            this.#runtime.replaceBlock(anchorId, route.type, result.data)
          } else {
            const index = this.#runtime.list().findIndex(record => record.id === anchorId)
            anchorId = this.#runtime.insert(route.type, result.data, index + 1)
          }
          this.#view.reconcileInteraction()
          this.#view.setCurrent(anchorId)
          queueMicrotask(() => this.#view.focus(anchorId, { offset: 'end' }))
        }
      }
    })().finally(() => {
      if (this.#task === task) this.#task = null
    })
  }
}
