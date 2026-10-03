// @ts-check
import {
  CLIPBOARD_FRAGMENT_MIME,
  createClipboardFragment,
  decodeClipboardFragment,
  encodeClipboardFragment,
  transferBlockFromRecord,
} from './ClipboardFragment.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'
import { prepareHtmlImport } from './HtmlImportRouter.js'

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
  #inlineCommands
  #controller
  #task = null
  #taskAnchorId = null
  #diagnostics

  constructor({ root, runtime, registry, reconciler, selection, view, crossSelection = null, inlineCommands = null, diagnostics = null }) {
    this.#root = root
    this.#runtime = runtime
    this.#registry = registry
    this.#reconciler = reconciler
    this.#selection = selection
    this.#view = view
    this.#crossSelection = crossSelection
    this.#inlineCommands = inlineCommands
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
    const name = event?.name
    if (
      event?.origin === 'history'
      || name === 'document.render'
      || name === 'document.clear'
    ) {
      this.#task.abort()
      return
    }
    const anchorId = this.#taskAnchorId
    if (!anchorId) return
    const changes = event?.changes ?? []
    if (changes.some(change => (
      change.kind === 'document.replace'
      || (change.kind === 'block.remove' && change.block?.id === anchorId)
    ))) this.#task.abort()
  }

  #onCopy(event) {
    if (event.defaultPrevented || !event.clipboardData) return
    const ownerDocument = this.#root.ownerDocument

    if (this.#crossSelection?.active) {
      event.preventDefault()
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
          template.innerHTML = /** @type {any} */ (toTrustedHtml(fragment, ownerDocument))
          plain.push(template.content.textContent ?? '')
        }
        const fragment = createClipboardFragment(records.map(record => ({
          kind: 'block',
          block: transferBlockFromRecord(record),
        })))
        event.clipboardData.setData('text/html', html.join(''))
        event.clipboardData.setData('text/plain', plain.join('\n'))
        event.clipboardData.setData(CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment(fragment))
        return
      }

      const parts = this.#runtime.exportLogicalClipboardParts(this.#crossSelection.bookmark)
      if (!parts) return
      const fragment = createClipboardFragment(parts.map(part => part.kind === 'block'
        ? { kind: 'block', block: transferBlockFromRecord(part.block) }
        : { kind: 'rich-text', html: part.html, inline: part.inline }))
      event.clipboardData.setData(CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment(fragment))
      event.clipboardData.setData('text/plain', this.#crossSelection.text())
      const range = this.#crossSelection.range
      if (range) {
        const container = ownerDocument.createElement('div')
        container.appendChild(range.cloneContents())
        stripClipboardProjection(container)
        event.clipboardData.setData('text/html', container.innerHTML)
      }
      return
    }

    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner || owner.mode !== 'rich-text') return
    const range = selectionRange(this.#selection.capture(), owner)
    if (!range || range.start === range.end) return

    let fragment
    try {
      fragment = this.#runtime.exportRichTextFragment(
        owner.blockId, owner.fieldKey, range,
      )
    } catch {
      return
    }
    event.preventDefault()
    const privateFragment = createClipboardFragment([{
      kind: 'rich-text',
      html: fragment.html,
      inline: fragment.inline,
    }])
    const template = ownerDocument.createElement('template')
    template.innerHTML = /** @type {any} */ (toTrustedHtml(fragment.html, ownerDocument))
    event.clipboardData.setData('text/html', fragment.html)
    event.clipboardData.setData('text/plain', template.content.textContent ?? '')
    event.clipboardData.setData(CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment(privateFragment))
  }

  #onCut(event) {
    if (this.#runtime.readOnly || event.defaultPrevented || !event.clipboardData) return

    if (this.#crossSelection?.active) {
      const whole = this.#crossSelection.wholeBlockIds
      let fragment
      if (whole.length) {
        const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
        fragment = createClipboardFragment(records.map(record => ({
          kind: 'block',
          block: transferBlockFromRecord(record),
        })))
      } else {
        const parts = this.#runtime.exportLogicalClipboardParts(this.#crossSelection.bookmark)
        if (!parts) {
          event.preventDefault()
          return
        }
        fragment = createClipboardFragment(parts.map(part => part.kind === 'block'
          ? { kind: 'block', block: transferBlockFromRecord(part.block) }
          : { kind: 'rich-text', html: part.html, inline: part.inline }))
      }

      event.preventDefault()
      event.clipboardData.setData(CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment(fragment))
      event.clipboardData.setData('text/plain', this.#crossSelection.text())
      const range = this.#crossSelection.range
      if (range) {
        const container = this.#root.ownerDocument.createElement('div')
        container.appendChild(range.cloneContents())
        stripClipboardProjection(container)
        event.clipboardData.setData('text/html', container.innerHTML)
      }
      if (whole.length) this.#crossSelection.removeWholeBlocks()
      else this.#crossSelection.replace({ kind: 'text', text: '' })
      return
    }

    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner || owner.mode !== 'rich-text') return
    const range = selectionRange(this.#selection.capture(), owner)
    if (!range || range.start === range.end) return
    let fragment
    try {
      fragment = this.#runtime.exportRichTextFragment(
        owner.blockId, owner.fieldKey, range,
      )
    } catch {
      return
    }

    event.preventDefault()
    const privateFragment = createClipboardFragment([{
      kind: 'rich-text',
      html: fragment.html,
      inline: fragment.inline,
    }])
    const template = this.#root.ownerDocument.createElement('template')
    template.innerHTML = /** @type {any} */ (toTrustedHtml(fragment.html, this.#root.ownerDocument))
    event.clipboardData.setData('text/html', fragment.html)
    event.clipboardData.setData('text/plain', template.content.textContent ?? '')
    event.clipboardData.setData(CLIPBOARD_FRAGMENT_MIME, encodeClipboardFragment(privateFragment))
    this.#runtime.replaceRichText(
      owner.blockId,
      owner.fieldKey,
      range,
      { kind: 'text', text: '' },
    )
    this.#view.reconcileInteraction()
  }

  #onPaste(event) {
    if (this.#runtime.readOnly || event.defaultPrevented) return
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      return this.#applyPaste(event)
    } catch (error) {
      this.#diagnostics?.emit('paste.failed', {
        operation: 'clipboard.paste',
        errorName: this.#diagnostics.errorName(error),
      })
      throw error
    } finally {
      if (startedAt && this.#diagnostics && !this.#task) {
        const durationMs = this.#diagnostics.now() - startedAt
        if (durationMs >= this.#diagnostics.threshold('pasteMs')) {
          this.#diagnostics.emit('paste.slow', { operation: 'clipboard.paste', durationMs })
        }
      }
    }
  }

  #applyPaste(event) {
    const data = event.clipboardData
    if (!data) return

    const privatePayload = data.getData(CLIPBOARD_FRAGMENT_MIME)
    if (privatePayload) {
      event.preventDefault()
      let fragment
      try {
        fragment = decodeClipboardFragment(privatePayload)
      } catch (error) {
        this.#diagnostics?.emit('paste.failed', {
          operation: 'clipboard.private-fragment',
          errorName: this.#diagnostics.errorName(error),
        })
        return
      }

      if (this.#crossSelection?.active) {
        // Composite target replacement is handled only by the canonical
        // selection-fragment path. Never fall back to lossy HTML/plain data.
        return
      }

      const owner = this.#reconciler.resolveEditableTarget(event.target)
      if (!owner) return
      const range = selectionRange(this.#selection.capture(), owner)
      if (!range) return

      try {
        const result = this.#runtime.insertClipboardParts(
          owner.blockId,
          owner.fieldKey,
          range,
          fragment.parts,
        )
        this.#view.reconcileInteraction()
        this.#view.setCurrent(result.blockId)
        queueMicrotask(() => this.#view.focus(result.blockId, { offset: 'end' }))
      } catch (error) {
        this.#diagnostics?.emit('paste.failed', {
          operation: 'clipboard.private-fragment',
          errorName: this.#diagnostics.errorName(error),
        })
      }
      return
    }

    if (this.#crossSelection?.active) {
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
    if (!html && text && this.#inlineCommands?.pasteText?.(text, {
      blockId: owner.blockId,
      fieldKey: owner.fieldKey,
      range,
    })) {
      event.preventDefault()
      return
    }

    if (html) {
      let plan
      try {
        plan = prepareHtmlImport(html, {
          ownerDocument: this.#root.ownerDocument,
          registry: this.#registry,
          currentType: this.#runtime.get(owner.blockId)?.type ?? null,
          createId: prefix => this.#runtime.createDataId(prefix),
        })
      } catch (error) {
        event.preventDefault()
        this.#diagnostics?.emit('paste.failed', {
          operation: 'clipboard.html-import',
          errorName: this.#diagnostics.errorName(error),
        })
        return
      }

      if (plan) {
        event.preventDefault()
        if (plan.kind === 'inline') {
          this.#runtime.replaceRichText(
            owner.blockId,
            owner.fieldKey,
            range,
            { kind: 'html', html: plan.html },
          )
          this.#view.reconcileInteraction()
          this.#view.setCurrent(owner.blockId)
          queueMicrotask(() => this.#view.focus(owner.blockId, {
            fieldKey: owner.fieldKey,
          }))
          return
        }

        const inserted = this.#runtime.insertLocalBlocks(owner.blockId, plan.blocks, {
          replaceEmpty: range.start === 0 && range.end === 0,
          name: 'clipboard.html-import',
        })
        this.#view.reconcileInteraction()
        const last = inserted.at(-1)
        if (last) {
          this.#view.setCurrent(last)
          queueMicrotask(() => this.#view.focus(last, { offset: 'end' }))
        }
        return
      }
    }

    const input = { kind: /** @type {'text'} */ ('text'), text }
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
      { kind: 'text', text },
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
      } catch (error) {
        this.#diagnostics?.emit('paste.failed', {
          operation: `clipboard.accepts:${type}`,
          errorName: this.#diagnostics.errorName(error),
        })
      }
    }
    return null
  }

  #beginAsync(owner, range, items) {
    this.#task?.abort()
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
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
