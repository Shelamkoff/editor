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
    if (event.defaultPrevented || !event.clipboardData) return
    const ownerDocument = this.#root.ownerDocument

    if (this.#crossSelection?.active) {
      const whole = this.#crossSelection.wholeBlockIds
      if (whole.length) {
        const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
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
    if (this.#runtime.readOnly || event.defaultPrevented || !event.clipboardData) return
    const ownerDocument=this.#root.ownerDocument

    if (this.#crossSelection?.active) {
      const whole = this.#crossSelection.wholeBlockIds
      if (whole.length) {
        const records = whole.map(id => this.#runtime.get(id)).filter(Boolean)
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
        if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
          html:html.join(''),
          text:plain.join('\n'),
        }))return
        event.preventDefault()
        this.#crossSelection.removeWholeBlocks()
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
      const result=this.#runtime.applyPreparedClipboardCut(plan)
      this.#crossSelection.clear()
      this.#view.reconcileInteraction()
      if(result?.blockId){
        this.#view.setCurrent(result.blockId)
        queueMicrotask(()=>this.#view.focus(result.blockId,result.focus??{offset:'start'}))
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
    if(!this.#writeCanonicalClipboard(event.clipboardData,fragment,{
      html,
      text:template.content.textContent??'',
    }))return
    event.preventDefault()
    const result=this.#runtime.applyPreparedClipboardCut(plan)
    this.#view.reconcileInteraction()
    if(result?.blockId){
      this.#view.setCurrent(result.blockId)
      queueMicrotask(()=>this.#view.focus(result.blockId,result.focus??{offset:'start'}))
    }
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
        const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark)
        if(!plan)return
        try {
          const result=this.#runtime.replacePreparedClipboardSlice(plan,fragment.parts)
          if(result){
            this.#crossSelection.clear()
            this.#view.reconcileInteraction()
            this.#view.setCurrent(result.blockId)
            queueMicrotask(()=>this.#view.focus(result.blockId,{offset:'end'}))
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
      const html=data.getData('text/html')
      const text=data.getData('text/plain')
      const plan=this.#runtime.prepareLogicalClipboardSlice(this.#crossSelection.bookmark)
      if(!plan)return

      let parts=null
      if(html){
        try{
          const imported=prepareHtmlImport(html,{
            ownerDocument:this.#root.ownerDocument,
            registry:this.#registry,
            currentType:this.#runtime.get(plan.focus.blockId)?.type??null,
            createId:prefix=>this.#runtime.createDataId(prefix),
          })
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
        const result=this.#runtime.replacePreparedClipboardSlice(plan,parts)
        if(result){
          this.#crossSelection.clear()
          this.#view.reconcileInteraction()
          this.#view.setCurrent(result.blockId)
          queueMicrotask(()=>this.#view.focus(result.blockId,{offset:'end'}))
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
    const generation=this.#runtime.generation
    const revision=this.#runtime.revision
    const selectionKey=JSON.stringify(this.#selection.capture())
    const abort = () => task.abort(this.#controller.signal.reason)
    this.#controller.signal.addEventListener('abort', abort, { once: true, signal: task.signal })

    void (async () => {
      const resolved=[]
      for (const { input, route } of items) {
        if (task.signal.aborted || !this.#runtime.get(owner.blockId)) return
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
        if (task.signal.aborted || !result) return
        resolved.push({type:route.type,result})
      }

      if(
        task.signal.aborted
        ||this.#runtime.generation!==generation
        ||this.#runtime.revision!==revision
        ||JSON.stringify(this.#selection.capture())!==selectionKey
        ||!this.#runtime.get(owner.blockId)
      )return

      try{
        const applied=this.#runtime.applyPasteResults(
          owner.blockId,owner.fieldKey,range,resolved,
        )
        this.#view.reconcileInteraction()
        this.#view.setCurrent(applied.blockId)
        queueMicrotask(()=>this.#view.focus(applied.blockId,{offset:'end'}))
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
