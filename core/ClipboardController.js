// @ts-check
import {
  CLIPBOARD_FRAGMENT_MIME,
  createClipboardFragment,
  decodeClipboardFragment,
  encodeClipboardFragment,
  transferBlockFromRecord,
} from './ClipboardFragment.js'
import { escapeHtml } from '../shared/sanitize/escapeHtml.js'
import { toTrustedHtml } from '../shared/sanitize/trustedHtml.js'
import { getTextLength } from '../shared/textOffset.js'
import { editingHostForEvent } from '../shared/editableFields.js'
import { synchronousResult } from '../shared/synchronousResult.js'

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
}function sameBookmark(left,right){
  const samePoint=(a,b)=>(
    a?.blockId===b?.blockId
    &&a?.fieldKey===b?.fieldKey
    &&Number(a?.offset)===Number(b?.offset)
  )
  return !!left&&!!right&&samePoint(left.anchor,right.anchor)&&samePoint(left.focus,right.focus)
}

function sameIds(left,right){
  return Array.isArray(left)&&Array.isArray(right)
    &&left.length===right.length
    &&left.every((id,index)=>id===right[index])
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

  cancelPendingTask() {
    this.#task?.abort()
    this.#task = null
    this.#taskAnchorId = null
  }

  destroy() {
    this.cancelPendingTask()
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

  #writeCanonicalClipboard(data,fragment,{html='',text=''}={}){
    const encoded=encodeClipboardFragment(fragment)
    try{
      data.setData('text/plain',String(text??''))
      if(html)data.setData('text/html',String(html))
      data.setData(CLIPBOARD_FRAGMENT_MIME,encoded)
      return data.getData(CLIPBOARD_FRAGMENT_MIME)===encoded
    }catch{
      return false
    }
  }

  #onCopy(event) {
    if (event.defaultPrevented || !event.clipboardData || !this.#ownsEvent(event)) return
    const ownerDocument = this.#root.ownerDocument

    if (this.#crossSelection?.active) {
      const whole = this.#crossSelection.wholeBlockIds
      if (whole.length) {
        const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark,whole)
        if(!plan)return
        const records=plan.parts.map(part=>part.block)
        const html = []
        const plain = []
        for (const id of whole) {
          const projection = clipboardHtmlFromShell(this.#reconciler.getElement(id), ownerDocument)
          if (!projection) continue
          html.push(projection)
          const template = ownerDocument.createElement('template')
          template.innerHTML = /** @type {any} */ (toTrustedHtml(projection, ownerDocument))
          plain.push(template.content.textContent ?? '')
        }
        const fragment = createClipboardFragment(records.map(record => ({
          kind: 'block',
          block: transferBlockFromRecord(record),
        })))
        if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
          html:html.join(''),
          text:plain.join('\n'),
        }))return
        event.preventDefault()
        return
      }

      const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark)
      if(!plan)return
      const fragment=createClipboardFragment(plan.parts.map(part=>part.kind==='block'
        ?{kind:'block',block:transferBlockFromRecord(part.block)}
        :{kind:'rich-text',html:part.html,inline:part.inline}))
      const range=this.#crossSelection.range
      let html=''
      if(range){
        const container=ownerDocument.createElement('div')
        container.appendChild(range.cloneContents())
        stripClipboardProjection(container)
        html=container.innerHTML
      }
      if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
        html,
        text:this.#crossSelection.text(),
      }))return
      event.preventDefault()
      return
    }

    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner || owner.mode !== 'rich-text') return
    const bookmark=this.#selection.capture()
    const range = selectionRange(bookmark, owner)
    if (!range || range.start === range.end) return
    const plan=this.#runtime.prepareLogicalClipboardSlice(bookmark)
    if(!plan)return
    const fragment=createClipboardFragment(plan.parts.map(part=>part.kind==='block'
      ?{kind:'block',block:transferBlockFromRecord(part.block)}
      :{kind:'rich-text',html:part.html,inline:part.inline}))
    const first=fragment.parts[0]
    const html=first?.kind==='rich-text'?first.html:''
    const template=ownerDocument.createElement('template')
    template.innerHTML=/** @type {any} */(toTrustedHtml(html,ownerDocument))
    if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
      html,
      text:template.content.textContent??'',
    }))return
    event.preventDefault()
  }

  #onCut(event) {
    if (this.#runtime.readOnly || event.defaultPrevented || !event.clipboardData || !this.#ownsEvent(event)) return
    const ownerDocument=this.#root.ownerDocument

    if (this.#crossSelection?.active) {
      const whole = this.#crossSelection.wholeBlockIds
      if (whole.length) {
        const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark,whole)
        if(!plan)return
        const records=plan.parts.map(part=>part.block)
        const html=[]
        const plain=[]
        for(const id of whole){
          const projection=clipboardHtmlFromShell(this.#reconciler.getElement(id),ownerDocument)
          if(!projection)continue
          html.push(projection)
          const template=ownerDocument.createElement('template')
          template.innerHTML=/** @type {any} */(toTrustedHtml(projection,ownerDocument))
          plain.push(template.content.textContent??'')
        }
        const fragment=createClipboardFragment(records.map(record=>({
          kind:'block',
          block:transferBlockFromRecord(record),
        })))
        const generation=this.#runtime.generation
        const revision=this.#runtime.revision
        const selected=[...whole]
        event.preventDefault()
        if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
          html:html.join(''),
          text:plain.join('\n'),
        }))return
        if(
          generation!==this.#runtime.generation
          ||revision!==this.#runtime.revision
          ||!sameIds(selected,this.#crossSelection?.wholeBlockIds)
        )return
        const result=this.#mutateCut(()=>this.#runtime.applyPreparedClipboardCut(plan))
        if(!result)return
        this.#crossSelection.clear()
        this.#view.reconcileInteraction()
        this.#view.setCurrent(result.blockId)
        return
      }

      const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark)
      if(!plan)return
      const fragment=createClipboardFragment(plan.parts.map(part=>part.kind==='block'
        ?{kind:'block',block:transferBlockFromRecord(part.block)}
        :{kind:'rich-text',html:part.html,inline:part.inline}))
      const range=this.#crossSelection.range
      let html=''
      if(range){
        const container=ownerDocument.createElement('div')
        container.appendChild(range.cloneContents())
        stripClipboardProjection(container)
        html=container.innerHTML
      }
      event.preventDefault()
      if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
        html,
        text:this.#crossSelection.text(),
      }))return
      if(!sameBookmark(plan.bookmark,this.#crossSelection?.bookmark))return
      const result=this.#mutateCut(() => this.#runtime.applyPreparedClipboardCut(plan))
      if(!result)return
      this.#crossSelection.clear()
      this.#view.reconcileInteraction()
      if(result?.blockId){
        this.#view.setCurrent(result.blockId)
      }
      return
    }

    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (!owner || owner.mode !== 'rich-text') return
    const bookmark=this.#selection.capture()
    const range = selectionRange(bookmark, owner)
    if (!range || range.start === range.end) return
    const plan=this.#runtime.prepareLogicalClipboardSlice(bookmark)
    if(!plan)return
    const fragment=createClipboardFragment(plan.parts.map(part=>part.kind==='block'
      ?{kind:'block',block:transferBlockFromRecord(part.block)}
      :{kind:'rich-text',html:part.html,inline:part.inline}))
    const first=fragment.parts[0]
    const html=first?.kind==='rich-text'?first.html:''
    const template=ownerDocument.createElement('template')
    template.innerHTML=/** @type {any} */(toTrustedHtml(html,ownerDocument))
    event.preventDefault()
    if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
      html,
      text:template.content.textContent??'',
    }))return
    if(!sameBookmark(plan.bookmark,this.#selection.capture()))return
    const result=this.#mutateCut(() => this.#runtime.applyPreparedClipboardCut(plan))
    if(!result)return
    this.#view.reconcileInteraction()
    if(result?.blockId){
      this.#view.setCurrent(result.blockId)
    }
  }

  #onPaste(event) {
    if (this.#runtime.readOnly || event.defaultPrevented || !this.#ownsEvent(event)) return
    const owner = this.#reconciler.resolveEditableTarget(event.target)
    if (owner?.mode === 'plain-text' && !this.#crossSelection?.active) return
    this.cancelPendingTask()
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    try {
      return this.#applyPaste(event)
    } catch (error) {
      // A proven owned Paste failure must never fall through to native insertion.
      event.preventDefault()
      this.#diagnostics?.emit('paste.failed', {
        operation: 'clipboard.paste',
        errorName: this.#diagnostics.errorName(error),
      })
      return
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

    const privateFormatPresent = Array.from(data.types ?? []).includes(CLIPBOARD_FRAGMENT_MIME)
    if (privateFormatPresent) {
      event.preventDefault()
      let fragment
      try {
        const privatePayload = data.getData(CLIPBOARD_FRAGMENT_MIME)
        fragment = decodeClipboardFragment(privatePayload)
      } catch (error) {
        this.#diagnostics?.emit('paste.failed', {
          operation: 'clipboard.private-fragment',
          errorName: this.#diagnostics.errorName(error),
        })
        return
      }

      if (this.#crossSelection?.active) {
        const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark, this.#crossSelection.wholeBlockIds)
        if(!plan)return
        try {
          const result=this.#mutatePaste(() => this.#runtime.replacePreparedClipboardSlice(plan,fragment.parts))
          if(result){
            this.#crossSelection.clear()
            this.#view.reconcileInteraction()
            this.#view.setCurrent(result.blockId)
          }
        } catch (error) {
          this.#diagnostics?.emit('paste.failed', {
            operation: 'clipboard.private-composite',
            errorName: this.#diagnostics.errorName(error),
          })
        }
        return
      }

      const owner = this.#reconciler.resolveEditableTarget(event.target)
      if (!owner) return
      const range = selectionRange(this.#selection.capture(), owner)
      if (!range) return

      try {
        const result = this.#mutatePaste(() => this.#runtime.insertClipboardParts(
          owner.blockId,
          owner.fieldKey,
          range,
          fragment.parts,
        ))
        this.#view.reconcileInteraction()
        this.#view.setCurrent(result.blockId)
      } catch (error) {
        this.#diagnostics?.emit('paste.failed', {
          operation: 'clipboard.private-fragment',
          errorName: this.#diagnostics.errorName(error),
        })
      }
      return
    }

    if (this.#crossSelection?.active) {
      const html=data.getData('text/html')
      const text=data.getData('text/plain')
      const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark, this.#crossSelection.wholeBlockIds)
      if(!plan)return

      let parts=null
      if(html){
        try{
          const imported=this.#runtime.prepareHtmlImport(html,plan.focus.blockId)
          if(imported?.kind==='inline'){
            parts=[{kind:'rich-text',html:imported.html}]
          }else if(imported?.kind==='blocks'){
            parts=imported.blocks.map(block=>({
              kind:'local-block',
              type:block.type,
              data:block.data,
            }))
          }
        }catch(error){
          event.preventDefault()
          this.#diagnostics?.emit('paste.failed',{
            operation:'clipboard.html-selection',
            errorName:this.#diagnostics.errorName(error),
          })
          return
        }
      }
      if(!parts&&text){
        parts=[{
          kind:'rich-text',
          html:escapeHtml(text).replace(/\r\n?|\n/g,'<br>'),
        }]
      }
      if(!parts?.length)return

      event.preventDefault()
      try{
        const result=this.#mutatePaste(() => this.#runtime.replacePreparedClipboardSlice(plan,parts))
        if(result){
          this.#crossSelection.clear()
          this.#view.reconcileInteraction()
          this.#view.setCurrent(result.blockId)
        }
      }catch(error){
        this.#diagnostics?.emit('paste.failed',{
          operation:'clipboard.selection-paste',
          errorName:this.#diagnostics.errorName(error),
        })
      }
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
    // An owned Paste with no author content is a no-op. In particular it
    // must not turn a selected rich-text range into an empty replacement.
    if (!html && !text) {
      event.preventDefault()
      return
    }
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
        plan = this.#runtime.prepareHtmlImport(html, owner.blockId)
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
          this.#replaceLocal(owner, range, { kind: 'html', html: plan.html })
          return
        }

        const inserted = this.#mutatePaste(() => this.#runtime.insertLocalBlocks(owner.blockId, plan.blocks, {
          replaceEmpty: range.start === 0 && range.end === 0,
          name: 'clipboard.html-import',
        }))
        this.#view.reconcileInteraction()
        const last = inserted.at(-1)
        if (last) {
          this.#view.setCurrent(last)
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

    const lines = text.split(/\r\n?|\n/).filter(line => line.length > 0)
    // v1 Paste ignores newline-only input; do not delete the selected range
    // when no non-empty segment is available after routing/pattern handling.
    if (!lines.length) return
    if (lines.length > 1) {
      const result = this.#mutatePaste(() => this.#runtime.insertClipboardParts(
        owner.blockId, owner.fieldKey, range,
        lines.map(line => ({ kind: 'rich-text', html: escapeHtml(line) })),
      ))
      this.#view.reconcileInteraction()
      this.#view.setCurrent(result.blockId)
      return
    }
    // v1 pastes one meaningful line without leading/trailing empty lines.
    // Keep the earlier pattern/plug-in routing on the full clipboard text,
    // but use the normalized lone segment for ordinary local rich-text Paste.
    this.#replaceLocal(owner, range, { kind: 'text', text: lines[0] })
  }

  #ownsEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : []
    const target = path.find(node => node && typeof node.closest === 'function') ?? event.target
    if (!target || !this.#root.contains(target)) return false
    const owner = this.#reconciler.resolveEditableTarget(target)
    if (owner?.mode === 'plain-text' && (target === owner.element || owner.element.contains(target))) return true
    if (owner?.mode === 'rich-text' && editingHostForEvent(this.#root, target) === owner.element) return true
    return !target.closest?.('input, textarea, select, [contenteditable="true"], [data-inline-plugin]')
  }

  #mutateCut(operation) {
    try {
      const result=this.#runtime.interact('clipboard.cut', operation, result => {
      if (!result?.blockId) return null
      const fields = this.#reconciler.getEditableFields(result.blockId)
      const field = fields.find(field => field.key === result.focus?.fieldKey) ?? fields[0]
      const point = { blockId: result.blockId, fieldKey: field?.key ?? '', offset: result.focus?.offset ?? 0 }
      return { anchor: point, focus: { ...point } }
      })
      if(result?.blockId)this.#scheduleFocus(result.blockId,result.focus??{offset:'start'})
      return result
    } catch(error) {
      this.#diagnostics?.emit('cut.failed',{operation:'clipboard.cut',errorName:this.#diagnostics.errorName(error)})
      return null
    }
  }

  /** @param {string} blockId @param {any} focus @param {AbortSignal|null} [taskSignal] */
  #scheduleFocus(blockId,focus,taskSignal=null) {
    const generation=this.#runtime.generation,revision=this.#runtime.revision
    const modeEpoch=this.#runtime.modeEpoch
    const mounted=this.#view.element?.(blockId)
    // Native focus changes are not author revisions. The logical caret is
    // separately owned by the user and must not be overwritten by a queued
    // clipboard operation after the user moves it within the same field.
    // Composite cross-block selections are deactivated after this scheduler
    // runs; for those, rely on the canonical owner and revision guards.
    const selected=this.#crossSelection?.active ? null : this.#selection.capture()
    queueMicrotask(()=>{
      if(this.#controller.signal.aborted||taskSignal?.aborted||this.#runtime.readOnly
        ||generation!==this.#runtime.generation||revision!==this.#runtime.revision
        ||modeEpoch!==this.#runtime.modeEpoch||!this.#runtime.has(blockId)
        ||(mounted&&this.#view.element?.(blockId)!==mounted)
        ||(this.#view.currentId&&this.#view.currentId!==blockId)
        ||(selected&&!sameBookmark(selected,this.#selection.capture())))return
      this.#view.focus(blockId,focus)
    })
  }

  #mutatePaste(operation) {
    const result=this.#runtime.interact('clipboard.paste', operation, result => {
      const blockId = Array.isArray(result) ? result.at(-1) : result?.blockId
      if (!blockId) return null
      const fields = this.#reconciler.getEditableFields(blockId)
      const field = result?.focus ? fields.find(field => field.key === result.focus.fieldKey) : fields[0]
      const offset = result?.focus?.offset ?? (field?.mode === 'plain-text' ? field.element.value.length
        : field ? getTextLength(field.element) : 0)
      const point = { blockId, fieldKey: result?.focus?.fieldKey ?? field?.key ?? '', offset }
      return { anchor: point, focus: { ...point } }
    })
    const blockId=Array.isArray(result)?result.at(-1):result?.blockId
    if(blockId)this.#scheduleFocus(blockId,result?.focus??{offset:'end'},this.#task?.signal)
    return result
  }

  #replaceLocal(owner, range, replacement) {
    const point = offset => ({ blockId: owner.blockId, fieldKey: owner.fieldKey, offset })
    const result = this.#runtime.interact('clipboard.paste', () => this.#runtime.replaceLogicalRange(
      { anchor: point(range.start), focus: point(range.end) }, replacement,
    ), caret => caret ? { anchor: caret, focus: { ...caret } } : null)
    if (!result) return false
    this.#scheduleFocus(result.blockId,{fieldKey:result.fieldKey,offset:result.offset})
    this.#view.reconcileInteraction()
    this.#view.setCurrent(result.blockId)
    return true
  }


  #route(input, blockId) {
    return this.#runtime.prepareExtensionValue(() => {
      const current = this.#runtime.get(blockId)
      const ordered = current
        ? [current.type, ...this.#registry.blockTypes.filter(type => type !== current.type)]
        : this.#registry.blockTypes

      for (const type of ordered) {
        const definition = this.#registry.getBlockDefinition(type)
        const paste = definition?.capabilities?.paste
        if (!paste) continue
        const accepts = paste.accepts
        if (typeof accepts !== 'function') {
          throw new TypeError(`Paste accepts() for "${type}" must be a function`)
        }
        const accepted = synchronousResult(Reflect.apply(accepts, paste, [input]))
        if (typeof accepted !== 'boolean') {
          throw new TypeError(`Paste accepts() for "${type}" must return a boolean`)
        }
        if (accepted) {
          const resolve = paste.resolve
          if (typeof resolve !== 'function') {
            throw new TypeError(`Paste resolve() for "${type}" must be a function`)
          }
          // Own the selected hook with its original receiver before resolution awaits.
          return Object.freeze({
            type,
            resolve: context => Reflect.apply(resolve, paste, [input, context]),
          })
        }
      }
      return null
    })
  }

  #beginAsync(owner, range, items) {
    this.cancelPendingTask()
    const startedAt = this.#diagnostics ? this.#diagnostics.now() : 0
    const AbortControllerCtor = this.#root.ownerDocument.defaultView?.AbortController ?? AbortController
    const task = new AbortControllerCtor()
    this.#task = task
    this.#taskAnchorId = owner.blockId
    const generation=this.#runtime.generation
    const revision=this.#runtime.revision
    const selectionKey=JSON.stringify(this.#selection.capture())
    const abort = () => task.abort(this.#controller.signal.reason)
    this.#controller.signal.addEventListener('abort', abort, { once: true, signal: task.signal })

    void (async () => {
      const resolved=[]
      for (const { input, route } of items) {
        if (task.signal.aborted || this.#task !== task || this.#runtime.readOnly || !this.#runtime.get(owner.blockId)) return
        let result
        try {
          result = await route.resolve({
            signal: task.signal,
            ownerDocument: this.#root.ownerDocument,
            createId: prefix => {
              if (task.signal.aborted || this.#task !== task || this.#runtime.readOnly) {
                throw new Error('Clipboard paste task is no longer active')
              }
              return this.#runtime.createDataId(prefix)
            },
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
        if (task.signal.aborted || this.#task !== task || this.#runtime.readOnly || !result) return
        resolved.push({type:route.type,result})
      }

      if(
        task.signal.aborted
        ||this.#task!==task
        ||this.#runtime.readOnly
        ||this.#runtime.generation!==generation
        ||this.#runtime.revision!==revision
        ||JSON.stringify(this.#selection.capture())!==selectionKey
        ||!this.#runtime.get(owner.blockId)
      )return

      try{
        const applied=this.#mutatePaste(() => this.#runtime.applyPasteResults(
          owner.blockId,owner.fieldKey,range,resolved,
        ))
        this.#view.reconcileInteraction()
        this.#view.setCurrent(applied.blockId)
      }catch(error){
        if(!task.signal.aborted){
          this.#diagnostics?.emit('paste.failed',{
            operation:'clipboard.paste-commit',
            errorName:this.#diagnostics.errorName(error),
          })
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
