// @ts-check
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'

function stripClipboardProjection(root) {
  for (const element of root.querySelectorAll('button,input,select,textarea,.oe-source-editor,.oe-settings-menu,.oe-toolbar,.oe-toolbox')) {
    element.remove()
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name === 'class'
        || attribute.name === 'contenteditable'
        || attribute.name === 'tabindex'
        || attribute.name === 'role'
        || attribute.name.startsWith('data-')
        || attribute.name.startsWith('aria-')
      ) element.removeAttribute(attribute.name)
    }
  }
  return root
}

function clipboardHtmlFromShell(shell, ownerDocument) {
  const source = shell?.firstElementChild ?? shell
  if (!source) return ''
  const clone = /** @type {HTMLElement} */ (source.cloneNode(true))
  stripClipboardProjection(clone)
  if (
    clone.tagName === 'DIV'
    && clone.childElementCount === 1
    && ![...clone.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim())
  ) return clone.firstElementChild?.outerHTML ?? ''
  return clone.outerHTML
}

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

export class ClipboardController {
  #root
  #runtime
  #registry
  #reconciler
  #selection
  #view
  #crossSelection
  #controller
  #task = null
  #taskAnchorId = null
  #diagnostics

  constructor({ root, runtime, registry, reconciler, selection, view, crossSelection = null, diagnostics = null }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#crossSelection = crossSelection
    this.#diagnostics = diagnostics
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
    this.#taskAnchorId = null
    this.#controller.abort()
  }

  handleTransaction(event) {
    if (!this.#task) return
    const name = event?.record?.name ?? event?.name
    if (
      event?.origin === 'history'
      || name === 'document.render'
      || name === 'document.clear'
      || name === 'document.reset'
    ) {
      this.#task.abort()
      return
    }
    const anchorId = this.#taskAnchorId
    if (!anchorId) return
    const changes = event?.record?.changes ?? event?.changes ?? []
    if (changes.some(change => (
      change.kind === 'document.replace'
      || (change.kind === 'block.remove' && change.block?.id === anchorId)
    ))) this.#task.abort()
  }

  #onCopy(event) {
    if (!this.#crossSelection?.active || event.defaultPrevented || !event.clipboardData) return
    event.preventDefault()
    const ownerDocument = this.#root.ownerDocument
    const whole = this.#crossSelection.wholeBlockIds
    if (whole.length) {
      const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
      const html = []
      const plain = []
      for (const id of whole) {
        const fragment = clipboardHtmlFromShell(this.#reconciler.getElement(id), ownerDocument)
        if (!fragment) continue
        html.push(fragment)
        const template = ownerDocument.createElement('template')
        template.innerHTML = fragment
        plain.push(template.content.textContent ?? '')
      }
      event.clipboardData.setData('text/html', html.join(''))
      event.clipboardData.setData('text/plain', plain.join('\n'))
      event.clipboardData.setData('application/x-rector-editor', JSON.stringify(records))
      return
    }

    event.clipboardData.setData('text/plain', this.#crossSelection.text())
    const range = this.#crossSelection.range
    if (range) {
      const container = ownerDocument.createElement('div')
      container.appendChild(range.cloneContents())
      stripClipboardProjection(container)
      event.clipboardData.setData('text/html', container.innerHTML)
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

    const internal = data.getData('application/x-rector-editor')
    if (internal) {
      let records
      try {
        const parsed = JSON.parse(internal)
        if (!Array.isArray(parsed) || parsed.length === 0) throw new TypeError('Clipboard MIME must be a non-empty array')
        records = parsed
      } catch {
        records = null
      }
      if (records) {
        event.preventDefault()
        try {
          const inserted = this.#runtime.insertExternalBlocks(owner.blockId, records, {
            replaceEmpty: range.start === 0 && range.end === 0,
          })
          this.#view.reconcileInteraction()
          const last = inserted.at(-1)
          if (last) {
            this.#view.setCurrent(last)
            queueMicrotask(() => this.#view.focus(last, { offset: 'end' }))
          }
          return
        } catch (error) {
          const fallbackHtml = data.getData('text/html')
          const fallbackText = data.getData('text/plain')
          if (!fallbackHtml && !fallbackText) return
          this.#runtime.replaceRichText(
            owner.blockId,
            owner.fieldKey,
            range,
            fallbackHtml ? { kind: 'html', html: fallbackHtml } : { kind: 'text', text: fallbackText },
          )
          this.#view.reconcileInteraction()
          this.#view.setCurrent(owner.blockId)
          queueMicrotask(() => this.#view.focus(owner.blockId, { fieldKey: owner.fieldKey }))
          return
        }
      }
    }

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
    const blockRecords = html ? this.#htmlBlockRecords(html) : null
    if (blockRecords) {
      event.preventDefault()
      try {
        const inserted = this.#runtime.insertExternalBlocks(owner.blockId, blockRecords, {
          replaceEmpty: range.start === 0 && range.end === 0,
        })
        this.#view.reconcileInteraction()
        const last = inserted.at(-1)
        if (last) {
          this.#view.setCurrent(last)
          queueMicrotask(() => this.#view.focus(last, { offset: 'end' }))
        }
        return
      } catch {}
    }
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


  #htmlBlockRecords(html) {
    const document = this.#root.ownerDocument
    const template = document.createElement('template')
    template.innerHTML = /** @type {any} */ (toTrustedHtml(String(html ?? ''), document))
    const elements = [...template.content.children]
    if (!elements.length) return null

    const records = []
    const paragraph = this.#registry.getBlockDefinition('paragraph')
    const heading = this.#registry.getBlockDefinition('heading')
    const quote = this.#registry.getBlockDefinition('quote')
    const list = this.#registry.getBlockDefinition('list')

    const appendElement = element => {
      const tag = element.tagName.toLowerCase()
      if ((tag === 'p' || tag === 'div') && element.querySelector(':scope > blockquote')) {
        if (!quote) return false
        const blockquote = element.querySelector(':scope > blockquote')
        const cite = element.querySelector(':scope > cite')
        records.push({
          type: 'quote',
          data: { text: blockquote?.innerHTML ?? '', caption: cite?.innerHTML ?? '' },
        })
        return true
      }
      if (tag === 'p' || tag === 'div') {
        if (!paragraph) return false
        if (tag === 'div' && element.children.length > 1) {
          const nested = [...element.children]
          if (nested.every(child => appendElement(child))) return true
          return false
        }
        records.push({ type: 'paragraph', data: { text: element.innerHTML } })
        return true
      }
      const headingMatch = /^h([2-6])$/.exec(tag)
      if (headingMatch) {
        if (!heading) return false
        records.push({
          type: 'heading',
          data: { text: element.innerHTML, level: Number(headingMatch[1]) },
        })
        return true
      }
      if (tag === 'blockquote') {
        if (!quote) return false
        records.push({ type: 'quote', data: { text: element.innerHTML, caption: '' } })
        return true
      }
      if (tag === 'ul' || tag === 'ol') {
        if (!list) return false
        records.push({
          type: 'list',
          data: {
            style: tag === 'ol' ? 'ordered' : 'unordered',
            items: [...element.querySelectorAll(':scope > li')].map(li => li.innerHTML),
          },
        })
        return true
      }
      return false
    }

    for (const element of elements) {
      if (!appendElement(element)) return null
    }
    return records.length ? records : null
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
    const startedAt = this.#diagnostics?.enabled ? this.#diagnostics.now() : 0
    const AbortControllerCtor = this.#root.ownerDocument.defaultView?.AbortController ?? AbortController
    const task = new AbortControllerCtor()
    this.#task = task
    this.#taskAnchorId = owner.blockId
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
          if (!task.signal.aborted) {
            if (this.#diagnostics) {
              this.#diagnostics.emit('paste.failed', {
                operation: 'clipboard.paste',
                errorName: this.#diagnostics.errorName(error),
              })
            } else {
              console.warn('[Clipboard] paste resolver failed', error)
            }
          }
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
      if (startedAt && this.#diagnostics) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('pasteMs')) {
          this.#diagnostics.emit('paste.slow', { operation: 'clipboard.paste', durationMs })
        }
      }
      if (this.#task === task) {
        this.#task = null
        this.#taskAnchorId = null
      }
    })
  }
}
