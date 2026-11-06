// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
import { InlinePopupHost } from '../../core/InlinePopupHost.js'
import { createMentionPlugin } from './index.js'

class Text {
  constructor(value,ownerDocument){this.data=String(value);this.ownerDocument=ownerDocument;this.nodeType=3;this.parentNode=null}
  get textContent(){return this.data}
  get parentElement(){return this.parentNode}
  remove(){
    if(!this.parentNode)return
    const children=this.parentNode.childNodes
    children.splice(children.indexOf(this),1)
    this.parentNode=null
  }
}

class Element {
  constructor(ownerDocument,tag='div') {
    this.ownerDocument = ownerDocument
    this.nodeType=1
    this.tagName=tag.toUpperCase()
    this.parentNode = null
    this.childNodes = []
    this.style = { removeProperty() {}, setProperty() {} }
    this.classList = { add() {}, remove() {}, toggle() {} }
    this.attributes = new Map()
    this.dataset={}
    this.scrollHeight = 24
    this.scrollWidth = 24
    this.isRoot = false
    this.textContent = ''
  }
  get isConnected() { return this.isRoot || Boolean(this.parentNode?.isConnected) }
  get children() { return this.childNodes }
  get firstChild(){return this.childNodes[0]??null}
  get parentElement(){return this.parentNode}
  get textContent(){return this.childNodes.map(child=>child.textContent).join('')}
  set textContent(value){
    this.replaceChildren(...(String(value)?[new Text(value,this.ownerDocument)]:[]))
  }
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true
    }
    return false
  }
  appendChild(child) {
    child.remove()
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }
  replaceChildren(...children) {
    for (const child of [...this.childNodes]) child.remove()
    for (const child of children) this.appendChild(child)
  }
  remove() {
    if (!this.parentNode) return
    const children = this.parentNode.childNodes
    children.splice(children.indexOf(this), 1)
    this.parentNode = null
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)) }
  getAttribute(key) { return this.attributes.get(key) ?? null }
  removeAttribute(key) { this.attributes.delete(key) }
  closest(selector){
    for(let element=this;element;element=element.parentElement){
      if(selector==='[data-inline-plugin="mention"]'&&element.getAttribute('data-inline-plugin')==='mention')return element
      if(selector==='[contenteditable="true"]'&&element.getAttribute('contenteditable')==='true')return element
    }
    return null
  }
  focus(){
    this.ownerDocument.activeElement=this
    this.ownerDocument.dispatch('focusin',{target:this})
  }
  addEventListener() {}
  querySelector() { return null }
  getBoundingClientRect() {
    return { left: 10, top: 20, bottom: 40, width: 24, height: 20 }
  }
}

function fixture() {
  const pendingTimers = new Map()
  const listeners=new Map()
  const native={
    anchorNode:null,focusNode:null,anchorOffset:0,focusOffset:0,
    get isCollapsed(){return this.anchorNode===this.focusNode&&this.anchorOffset===this.focusOffset},
    get rangeCount(){return this.anchorNode?1:0},
    setBaseAndExtent(anchorNode,anchorOffset,focusNode,focusOffset){Object.assign(this,{anchorNode,anchorOffset,focusNode,focusOffset})},
    removeAllRanges(){this.anchorNode=null;this.focusNode=null},
    addRange(range){this.setBaseAndExtent(range.startContainer,range.startOffset,range.endContainer,range.endOffset)},
  }
  let timerId = 0
  const ownerDocument = {
    defaultView: {
      HTMLElement: Element,
      Node: Element,
      AbortController,
      getSelection:()=>native,
      innerWidth: 1000,
      innerHeight: 800,
      addEventListener() {},
      setTimeout(callback) {
        const id = ++timerId
        pendingTimers.set(id, callback)
        return id
      },
      clearTimeout(id) { pendingTimers.delete(id) },
    },
    documentElement: { clientWidth: 1000 },
    createElement(tag) { return new Element(ownerDocument,tag) },
    createRange(){
      return {
        selectNodeContents(element){this.startContainer=element;this.startOffset=0;this.endContainer=element;this.endOffset=element.childNodes.length},
        setStart(node,offset){this.startContainer=node;this.startOffset=offset},
        setEnd(node,offset){this.endContainer=node;this.endOffset=offset},
        collapse(){this.endContainer=this.startContainer;this.endOffset=this.startOffset},
        toString(){return this.endContainer.textContent.slice(0,this.endOffset)},
      }
    },
    addEventListener(type,handler,options={}){
      const list=listeners.get(type)??[]
      list.push(handler);listeners.set(type,list)
      options.signal?.addEventListener('abort',()=>ownerDocument.removeEventListener(type,handler),{once:true})
    },
    removeEventListener(type,handler){listeners.set(type,(listeners.get(type)??[]).filter(value=>value!==handler))},
    dispatch(type,event){for(const handler of [...(listeners.get(type)??[])])handler(event)},
  }
  const root = ownerDocument.createElement('div')
  root.isRoot = true
  const anchor = ownerDocument.createElement('p')
  anchor.setAttribute('contenteditable','true')
  root.appendChild(anchor)
  const host = new InlinePopupHost({ root })
  const controller = new AbortController()
  const runtime = createMentionPlugin({ debounceDelay: 20 }).setup({
    ownerDocument,
    signal: controller.signal,
    t: (_key, fallback) => fallback,
    showPopup: (field, content, cleanup) => host.showPopup('mention', field, content, cleanup),
  })
  return { root, anchor, host, controller, runtime, pendingTimers,ownerDocument,native,
    listenerCount:type=>(listeners.get(type)??[]).length }
}

test('builtin Mention refreshes search without handing a connected popup back to the host', () => {
  const { root, anchor, host, controller, runtime, pendingTimers } = fixture()
  try {
    for (const query of ['', 'a', 'ab', 'a']) {
      runtime.onTriggerQuery({ anchor, query })
      assert.equal(root.children.length, 2, 'exactly one popup belongs to Mention')
      assert.equal(anchor.getAttribute('aria-expanded'), 'true')
      assert.equal(pendingTimers.size, 1, 'the previous debounced search is retired')
    }
    runtime.onTriggerCancel()
    assert.equal(root.children.length, 1)
    assert.equal(anchor.getAttribute('aria-expanded'), null)
    assert.equal(pendingTimers.size, 0)
  } finally {
    runtime.destroy()
    host.destroy()
    controller.abort()
  }
})

test('Mention replacement does not retain a stale presentation during teardown', () => {
  const { root, anchor, host, controller, runtime } = fixture()
  try {
    runtime.onTriggerQuery({ anchor, query: '' })
    const former = root.children[1]
    runtime.onTriggerQuery({ anchor, query: 'second' })
    assert.notEqual(root.children[1], former, 'the successor owns a fresh surface')
    assert.equal(former.isConnected, false)
    assert.equal(root.children.length, 2)
  } finally {
    runtime.destroy()
    host.destroy()
    controller.abort()
  }
  assert.equal(root.children.length, 1)
})

for(const action of ['backspace','paste','composition']){
  for(const transfer of action==='composition'?['none','outside','field','queued-field']:['none','outside','field']){
    test(`Mention ${action} preserves ${transfer} native caret after label commit`,async()=>{
      const h=fixture(),doc=h.ownerDocument,native=h.native
      const keep=doc.createElement('p'),outside=doc.createElement('input')
      keep.textContent='charlie'
      keep.setAttribute('contenteditable','true')
      outside.selectionStart=1;outside.selectionEnd=3
      h.root.appendChild(keep);h.root.appendChild(outside)
      let data={id:'ada',name:'Ada'},widget,observed=null
      const commits=[]
      const position=()=>({anchorNode:native.anchorNode,anchorOffset:native.anchorOffset,
        focusNode:native.focusNode,focusOffset:native.focusOffset})
      const assertPosition=(expected,message)=>{
        assert.equal(native.anchorNode===expected.anchorNode&&native.focusNode===expected.focusNode,true,message)
        assert.deepEqual([native.anchorOffset,native.focusOffset],[expected.anchorOffset,expected.focusOffset],message)
      }
      const context={
        id:'m',blockId:'a',fieldKey:'text',signal:h.controller.signal,
        isReadOnly:()=>false,getData:()=>({...data}),
        updateData(producer){
          data=producer({...data})
          widget.update(data)
          commits.push({...data})
          if(transfer==='outside')outside.focus()
          if(transfer==='field'){
            keep.focus()
            native.setBaseAndExtent(keep.firstChild,2,keep.firstChild,2)
          }
          observed=position()
        },
        beginTask(){
          const controller=new AbortController()
          return {signal:controller.signal,cancel:()=>controller.abort(),
            commit(producer){context.updateData(producer);return true}}
        },
      }
      widget=h.runtime.create('m',data,context)
      const span=widget.element
      span.setAttribute('data-inline-plugin','mention')
      h.anchor.appendChild(span)
      h.anchor.focus()
      native.setBaseAndExtent(span.firstChild,action==='paste'?2:3,span.firstChild,3)
      const event={target:h.anchor,cancelable:true,defaultPrevented:false,
        preventDefault(){this.defaultPrevented=true},getTargetRanges:()=>[]}
      try{
        if(action==='backspace')doc.dispatch('beforeinput',{...event,inputType:'deleteContentBackward'})
        if(action==='paste')doc.dispatch('paste',{...event,type:'paste',clipboardData:{types:['text/plain'],getData:()=> 'L'}})
        if(action==='composition'){
          doc.dispatch('compositionstart',event)
          span.textContent='@Aña'
          native.setBaseAndExtent(span.firstChild,3,span.firstChild,3)
          doc.dispatch('compositionend',{...event,data:'ñ'})
          if(transfer==='queued-field'){
            keep.focus()
            native.setBaseAndExtent(keep.firstChild,2,keep.firstChild,2)
          }
          await Promise.resolve()
        }
        const name=action==='backspace'?'Aa':action==='paste'?'ALa':'Aña'
        assert.deepEqual(commits,[{id:'ada',name}],'the label edit must commit once')
        assert.equal(span.textContent,'@'+name)
        if(transfer==='none'){
          const offset=action==='backspace'?2:3
          assertPosition({anchorNode:span.firstChild,anchorOffset:offset,focusNode:span.firstChild,focusOffset:offset},
            'an uninterrupted label edit lost its planned native caret')
        }else{
          assertPosition(observed,'the old Mention completion overwrote a newer caret owner')
          assert.equal(doc.activeElement,transfer.endsWith('field')?keep:outside)
          if(transfer==='outside')assert.deepEqual([outside.selectionStart,outside.selectionEnd],[1,3])
        }
      }finally{
        widget.destroy();h.runtime.destroy();h.host.destroy();h.controller.abort()
      }
    })
  }
}

test('Mention runtime teardown releases document focus observation before its enclosing scope aborts',()=>{
  const h=fixture()
  assert.equal(h.listenerCount('focusin'),1)
  h.runtime.destroy()
  assert.equal(h.controller.signal.aborted,false)
  assert.equal(h.listenerCount('focusin'),0,'the document retained the disposed Mention focus owner')
  h.host.destroy()
  h.controller.abort()
})
