import test from 'node:test'
import assert from 'node:assert/strict'

import { KeyboardRouter } from './KeyboardRouter.js'

class FakeRoot {
  listeners = new Map()
  ownerDocument = { defaultView: { AbortController } }
  addEventListener(type, handler) { this.listeners.set(type, handler) }
}

function harness({ reportError, inlineCommands = null, crossSelection = null, inlineToolbar = null } = {}) {
  const root = new FakeRoot()
  const field = { value: '', parentNode: null }
  const owner = { blockId: 'b', fieldKey: 'text', element: field, mode: 'plain-text' }
  const calls = []
  const records = [
    { id: 'a', type: 'paragraph', data: { text: 'A' } },
    { id: 'b', type: 'paragraph', data: { text: 'B' } },
    { id: 'c', type: 'paragraph', data: { text: 'C' } },
  ]
  const runtime = {
    readOnly: false,
    generation: 1, revision: 1, modeEpoch: 0,
    has: id => records.some(record => record.id === id),
    prepareExtensionValue: operation => operation(),
    prepareShortcutAction: () => null,
    interact(_name, operation) { return operation() },
    indexOf: id => records.findIndex(record => record.id === id),
    idAt: index => records[index]?.id,
    ids: () => records.map(record => record.id),
    list: () => records.map(record => ({ ...record })),
    get: id => records.find(record => record.id === id),
    isEmpty: id => id === 'empty',
    splitBlock(id, fieldKey, range) { calls.push(['split', id, fieldKey, range]); return 'new' },
    exitBlock(id, data) { calls.push(['exit', id, data]); return 'new' },
    mergeAdjacent(left, right) { calls.push(['merge', left, right]); return true },
    remove(id) { calls.push(['remove', id]) },
    convert(id, target) { calls.push(['convert', id, target]) },
    insert(type, data, index) { calls.push(['insert', type, data, index]); return 'new' },
    undo() { calls.push(['undo']); return true },
    redo() { calls.push(['redo']); return true },
  }
  const registry = { defaultBlockType: 'paragraph', getBlockDefinition() { return {} } }
  const reconciler = {
    resolveEditableTarget(target) { return target === field ? owner : null },
    getEditableField(blockId, fieldKey) { return blockId === 'b' && fieldKey === 'text' ? owner : null },
    getEditableFields(blockId) {
      if (blockId === 'a') return [
        { key: 'first', element: { nodeType: 3, textContent: 'First' }, mode: 'rich-text' },
        { key: 'last', element: { nodeType: 3, textContent: 'Last' }, mode: 'rich-text' },
      ]
      return blockId === 'b' ? [{ key: owner.fieldKey, element: owner.element, mode: owner.mode }] : []
    },
  }
  let bookmark = {
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  }
  const selection = { capture: () => bookmark }
  const viewCalls = []
  const mounted = new Map()
  const view = {
    currentId: 'b',
    element(id) {
      if (!mounted.has(id)) mounted.set(id, {})
      return mounted.get(id)
    },
    reconcileInteraction() { viewCalls.push(['reconcile']) },
    setCurrent(id) { this.currentId = id; viewCalls.push(['current', id]) },
    focus(id, target) { viewCalls.push(['focus', id, target]); return true },
    indexOf(id) { return records.findIndex(record => record.id === id) },
  }
  const router = new KeyboardRouter({ root, runtime, registry, reconciler, selection, view,
    inlineCommands,
    inlineToolbar,
    crossSelection,
    ...(reportError ? { reportError } : {}),
  })
  const event = (key, extra = {}) => {
    let prevented = false
    return {
      key,
      target: field,
      preventDefault() { prevented = true },
      get prevented() { return prevented },
      ...extra,
    }
  }
  return { router, runtime, calls, view, viewCalls, event, selection, reconciler, setBookmark: value => { bookmark = value }, field, owner, root, records }
}

test('Enter delegates an editable split to one runtime transaction', () => {
  const { router, calls, event } = harness()
  const e = event('Enter')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['split', 'b', 'text', { start: 1, end: 1 }])
  router.destroy()
})

test('ArrowUp from block start focuses the previous block last editable field', () => {
  const { router, viewCalls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('ArrowUp')
  router.handleKeydown(e)

  assert.equal(e.prevented, true)
  assert.deepEqual(viewCalls.slice(-2), [
    ['current', 'a'],
    ['focus', 'a', { fieldKey: 'last', offset: 'end' }],
  ])
  router.destroy()
})

test('Backspace at field start merges with the preceding block', () => {
  const { router, calls, event, setBookmark } = harness()
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 0 },
  })
  const e = event('Backspace')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'a', 'b'])
  router.destroy()
})

test('Delete at field end merges the following block', () => {
  const { router, calls, event, setBookmark, field } = harness()
  field.value = 'B'
  setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: 1 },
    focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
  })
  const e = event('Delete')
  router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(calls[0], ['merge', 'b', 'c'])
  router.destroy()
})

test('Ctrl/Meta Z, Shift+Z and Y route exclusively through canonical history', () => {
  const { router, calls, event } = harness()
  const ctrlUndo = event('z', { ctrlKey: true })
  router.handleKeydown(ctrlUndo)
  const ctrlRedo = event('z', { ctrlKey: true, shiftKey: true })
  router.handleKeydown(ctrlRedo)
  const metaUndo = event('z', { metaKey: true })
  router.handleKeydown(metaUndo)
  const yRedo = event('y', { ctrlKey: true })
  router.handleKeydown(yRedo)

  for (const handled of [ctrlUndo, ctrlRedo, metaUndo, yRedo]) {
    assert.equal(handled.prevented, true)
  }
  assert.deepEqual(calls.slice(0, 4), [['undo'], ['redo'], ['undo'], ['redo']])
  router.destroy()
})

test('already handled plugin keydown events never execute generic structural logic', () => {
  const { router, calls, event } = harness()
  router.handleKeydown(event('Enter', { defaultPrevented: true }))
  assert.deepEqual(calls, [])
  router.destroy()
})


test('auxiliary controls keep native history ownership; editor chrome owns document history', () => {
  const calls=[]
  const root={
    ownerDocument:{defaultView:{AbortController}},
    addEventListener(){},
    contains(target){return target?.inside===true},
  }
  const runtime={
    readOnly:false,
    prepareExtensionValue:operation=>operation(),
    splitBlock(){throw new Error('auxiliary ownership must not split')},
    mergeAdjacent(){throw new Error('auxiliary ownership must not merge')},
    undo(){calls.push('undo');return true},
    redo(){calls.push('redo');return true},
  }
  const registry={defaultBlockType:'paragraph',getBlockDefinition(){return null}}
  const reconciler={
    resolveEditableTarget(){return null},
    getEditableFields(){return []},
    resolveBlockTarget(){return null},
  }
  const selection={capture:()=>null}
  const view={
    currentId:null,
    element(){return null},
    reconcileInteraction(){},
    setCurrent(){},
    focus(){return false},
  }
  const router=new KeyboardRouter({root,runtime,registry,reconciler,selection,view})

  const target=(selector,inside=true)=>({
    inside,
    closest(query){
      if(selector==='outside')return null
      return query.split(',').map(value=>value.trim()).includes(selector)?this:null
    },
  })
  const event=targetNode=>{
    let prevented=false
    return {
      key:'z',
      ctrlKey:true,
      target:targetNode,
      composedPath(){return [targetNode]},
      preventDefault(){prevented=true},
      get prevented(){return prevented},
    }
  }

  for(const selector of ['input','textarea','select','[data-inline-plugin]']){
    const current=event(target(selector))
    router.handleKeydown(current)
    assert.equal(current.prevented,false,`${selector} shortcut was claimed by editor history`)
  }
  const outside=event(target('outside',false))
  router.handleKeydown(outside)
  assert.equal(outside.prevented,false)
  assert.deepEqual(calls,[])
  for(const selector of ['.oe-toolbar','.oe-inline-toolbar','.oe-toolbox','.oe-settings-menu','.oe-slash-menu']){
    const current=event(target(selector))
    router.handleKeydown(current)
    assert.equal(current.prevented,true,`${selector} did not route document history`)
  }
  assert.deepEqual(calls,Array(5).fill('undo'))
  const nestedInput = target('input')
  nestedInput.closest = query => /input|\.oe-toolbar/.test(query) ? nestedInput : null
  const nestedEvent = event(nestedInput)
  router.handleKeydown(nestedEvent)
  assert.equal(nestedEvent.prevented, false, 'native input inside editor chrome lost native history ownership')
  assert.equal(calls.length, 5)
  router.destroy()
})


test('keyboard split focus is revoked across a read-only round trip without a document change', async () => {
  const h = harness()
  const e = h.event('Enter')
  h.router.handleKeydown(e)
  assert.equal(e.prevented, true)
  h.records.push({ id: 'new', type: 'paragraph', data: { text: '' } })
  // Control-mode changes do not advance document revision; the old command
  // must not regain focus merely because editing was reenabled immediately.
  const revision = h.runtime.revision
  h.runtime.readOnly = true
  h.runtime.modeEpoch++
  h.runtime.readOnly = false
  h.runtime.modeEpoch++
  assert.equal(h.runtime.revision, revision)
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call => call[0] === 'focus'), [])
  h.router.destroy()
})

test('keyboard split still gives the new block focus with unchanged author and mode ownership', async () => {
  const h = harness()
  h.router.handleKeydown(h.event('Enter'))
  h.records.push({ id: 'new', type: 'paragraph', data: { text: '' } })
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call => call[0] === 'focus'),
    [['focus', 'new', { blockId: 'new', offset: 'start' }]])
  h.router.destroy()
})

test('queued keyboard split never overwrites a later user caret inside the new block',async()=>{
  const h=harness()
  assert.equal(h.router.split('b','text',{start:1,end:1}),true)
  h.records.push({id:'new',type:'paragraph',data:{text:'pha'}})
  h.setBookmark({
    anchor:{blockId:'new',fieldKey:'text',offset:2},
    focus:{blockId:'new',fieldKey:'text',offset:2},
  })
  await Promise.resolve()
  assert.deepEqual(h.viewCalls.filter(call=>call[0]==='focus'),[],
    'old split focus stole the later author caret')
  h.router.destroy()
})

for(const key of ['Enter','Backspace','Delete']){
  test('failed empty-block eligibility consumes '+key+' without native or history fallback',()=>{
    const reported=[]
    const h=harness({reportError:error=>reported.push(error.message)})
    if(key==='Backspace'){
      h.setBookmark({
        anchor:{blockId:'b',fieldKey:'text',offset:0},
        focus:{blockId:'b',fieldKey:'text',offset:0},
      })
    }
    if(key==='Delete'){
      h.field.value='B'
      h.setBookmark({
        anchor:{blockId:'b',fieldKey:'text',offset:1},
        focus:{blockId:'b',fieldKey:'text',offset:1},
      })
    }
    h.runtime.isEmpty=()=>{throw new TypeError('Invalid empty block result')}
    const event=h.event(key)
    assert.doesNotThrow(()=>h.router.handleKeydown(event),
      'owned '+key+' leaked a plug-in capability exception')
    assert.equal(event.prevented,true,key+' was allowed to fall through to native editing')
    assert.deepEqual(h.calls,[],key+' mutated the canonical model after failed eligibility')
    assert.deepEqual(reported,['Invalid empty block result'],'error was not reported once')
    h.router.destroy()
  })
}

test('retired KeyboardRouter ignores captured editor shortcuts and does not intercept native keys', () => {
  const { router, calls, event } = harness()
  router.destroy()
  const history = event('z', { ctrlKey: true })
  const split = event('Enter')
  router.handleKeydown(history)
  router.handleKeydown(split)
  assert.equal(history.prevented, false)
  assert.equal(split.prevented, false)
  assert.deepEqual(calls, [], 'destroyed key listener mutated or replayed canonical history')
})

test('retired KeyboardRouter public structural entry points cannot modify document', () => {
  const { router, calls } = harness()
  router.destroy()
  assert.equal(router.split('b', 'text', { start: 0, end: 0 }), false)
  assert.equal(router.exit('b'), false)
  assert.equal(router.appendDefault(), false)
  assert.deepEqual(calls, [])
})


test('undo publication that destroys its keyboard owner does not reconcile retired UI', () => {
  const h = harness()
  h.runtime.undo = () => { h.router.destroy(); return true }
  const key = h.event('z', { ctrlKey: true })
  assert.doesNotThrow(() => h.router.handleKeydown(key))
  assert.equal(key.prevented, true)
  assert.deepEqual(h.viewCalls, [], 'undo accessed the view after editor destruction')
})

for (const method of ['split', 'exit']) {
  test(`${method} keeps a committed block operation but skips UI after synchronous owner teardown`, () => {
    const h = harness()
    if (method === 'split') h.runtime.splitBlock = () => { h.router.destroy(); return 'new' }
    else h.runtime.exitBlock = () => { h.router.destroy(); return 'new' }
    const apply = () => method === 'split'
      ? h.router.split('b', 'text', { start: 1, end: 1 })
      : h.router.exit('b')
    assert.equal(apply(), true)
    assert.deepEqual(h.viewCalls, [], 'retired block command reconciled or focused a detached view')
  })
}

test('appendDefault does not focus a destroyed editor after a successful insertion', () => {
  const h = harness()
  h.runtime.health = 'ready'
  h.runtime.size = h.records.length
  h.runtime.insert = () => { h.router.destroy(); return 'new' }
  assert.equal(h.router.appendDefault(), true)
  assert.deepEqual(h.viewCalls, [], 'retired append tried to focus the unmounted editor')
})

for (const key of ['Backspace', 'Delete']) {
  test(`${key} canonical merge does not reconcile after commit observer destroys editor`, () => {
    const h = harness()
    h.setBookmark({
      anchor: { blockId: 'b', fieldKey: 'text', offset: key === 'Delete' ? 1 : 0 },
      focus: { blockId: 'b', fieldKey: 'text', offset: key === 'Delete' ? 1 : 0 },
    })
    if (key === 'Delete') h.field.value = 'B'
    let merges = 0
    h.runtime.mergeAdjacent = () => { merges++; h.router.destroy(); return true }
    const event = h.event(key)
    assert.doesNotThrow(() => h.router.handleKeydown(event))
    assert.equal(event.prevented, true)
    assert.equal(merges, 1)
    assert.deepEqual(h.viewCalls, [], 'committed merge reached a retired view')
  })
}

test('block shortcut commit observer teardown cannot reconcile a detached view', () => {
  const h = harness()
  h.runtime.prepareShortcutAction = () => ({ kind: 'update', data: { text: 'updated' } })
  h.runtime.update = () => { h.router.destroy(); return true }
  const key = h.event('x')
  assert.doesNotThrow(() => h.router.handleKeydown(key))
  assert.equal(key.prevented, true)
  assert.deepEqual(h.viewCalls, [], 'a successful shortcut updated presentation after destroy')
})


test('cancelled shortcut preparation cannot fall through to another structural command', () => {
  const h = harness()
  h.runtime.prepareShortcutAction = () => { h.router.destroy(); return null }
  h.runtime.isEmpty = () => { throw new Error('retired key must not inspect a block') }
  const event = h.event('Enter')
  assert.doesNotThrow(() => h.router.handleKeydown(event))
  assert.equal(event.prevented, false, 'unowned native key was consumed after editor teardown')
  assert.deepEqual(h.calls, [])
})


function typedPatternHarness({ converted = true, nativeCollapsed = true, word = '#f00', widgetLabel = false, failed = false, retire = null } = {}) {
  const commands = []
  const errors = []
  const h = harness({
    reportError: error => errors.push(error.message),
    inlineCommands: {
      commitTypedPattern(value, target, delimiter) {
        commands.push({ value, target, delimiter })
        if (retire === 'destroy' || retire === 'throw') h.router.destroy()
        if (retire === 'mode') {
          h.runtime.modeEpoch = (h.runtime.modeEpoch ?? 0) + 2
        }
        if (retire === 'throw') throw new Error('matcher failed after teardown')
        if (failed) throw new Error('typed pattern preparation failed')
        return converted
      },
    },
  })
  h.owner.mode = 'rich-text'
  const node = {
    nodeType: 3, data: word, textContent: word,
    parentElement: { closest: selector => widgetLabel && selector === '[data-inline-plugin]' ? {} : null },
    parentNode: h.field, previousSibling: null,
  }
  h.field.nodeType = 1
  h.field.tagName = 'DIV'
  h.field.childNodes = [node]
  h.field.hasAttribute = () => false
  h.field.textContent = word
  h.field.contains = item => item === node
  h.root.ownerDocument.defaultView.getSelection = () => ({
    isCollapsed: nativeCollapsed,
    anchorNode: node,
    anchorOffset: word.length,
  })
  h.setBookmark({
    anchor: { blockId: 'b', fieldKey: 'text', offset: nativeCollapsed ? word.length : 0 },
    focus: { blockId: 'b', fieldKey: 'text', offset: word.length },
  })
  return { ...h, commands, errors }
}

test('typed inline color before Space replaces exactly the preceding word and suppresses native space', () => {
  const h = typedPatternHarness()
  const e = h.event(' ')
  h.router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(h.commands, [{
    value: '#f00',
    target: { blockId: 'b', fieldKey: 'text', range: { start: 0, end: 4 } },
    delimiter: ' ',
  }])
  assert.deepEqual(h.calls, [], 'typed color conversion triggered a separate structural command')
  h.router.destroy()
})

test('typed inline color before Enter wins over block split without appending a newline', () => {
  const h = typedPatternHarness()
  const e = h.event('Enter')
  h.router.handleKeydown(e)
  assert.equal(e.prevented, true)
  assert.deepEqual(h.commands, [{
    value: '#f00',
    target: { blockId: 'b', fieldKey: 'text', range: { start: 0, end: 4 } },
    delimiter: 'Enter',
  }])
  assert.deepEqual(h.calls, [], 'Enter also split the block after converting the word')
  h.router.destroy()
})

test('unmatched typed word leaves Space native and Enter with the normal split handler', () => {
  for (const key of [' ', 'Enter']) {
    const h = typedPatternHarness({ converted: false })
    const e = h.event(key)
    h.router.handleKeydown(e)
    assert.equal(e.prevented, key === 'Enter')
    assert.equal(h.commands.length, 1)
    assert.deepEqual(h.calls.map(call => call[0]), key === 'Enter' ? ['split'] : [])
    h.router.destroy()
  }
})

test('typed matcher never receives text from selected ranges or inline widget labels', () => {
  for (const invalid of [{nativeCollapsed:false},{widgetLabel:true}]) {
    const h = typedPatternHarness(invalid)
    const e = h.event(' ')
    h.router.handleKeydown(e)
    assert.equal(e.prevented, false)
    assert.deepEqual(h.commands, [])
    h.router.destroy()
  }
})

test('typed pattern conversion does not hijack control shortcuts or non-text native selection', () => {
  const h = typedPatternHarness()
  h.router.handleKeydown(h.event(' ', { ctrlKey: true }))
  assert.deepEqual(h.commands, [])
  h.root.ownerDocument.defaultView.getSelection = () => ({
    isCollapsed: true, anchorNode: { nodeType: 1 }, anchorOffset: 1,
  })
  const e = h.event(' ')
  h.router.handleKeydown(e)
  assert.equal(e.prevented, false)
  assert.deepEqual(h.commands, [])
  h.router.destroy()
})


test('typed word recognition respects the last ordinary or nonbreaking space in its text node', () => {
  for (const separator of [' ', '\u00a0']) {
    const h = typedPatternHarness({ word: 'prefix' + separator + '#f00' })
    const event = h.event(' ')
    h.router.handleKeydown(event)
    assert.equal(event.prevented, true)
    assert.deepEqual(h.commands, [{
      value: '#f00',
      target: {
        blockId: 'b', fieldKey: 'text',
        range: { start: 7, end: 11 },
      },
      delimiter: ' ',
    }])
    h.router.destroy()
  }
})

test('a failing typed pattern consumes Enter without a partial model split', () => {
  const h = typedPatternHarness({ failed: true })
  const event = h.event('Enter')
  h.router.handleKeydown(event)
  assert.equal(event.prevented, true)
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.errors, ['typed pattern preparation failed'])
  h.router.destroy()
})


test('typed inline pattern retains v1 Shift+Enter recognition without a native line break', () => {
  const h = typedPatternHarness()
  const event = h.event('Enter', { shiftKey: true })
  h.router.handleKeydown(event)
  assert.equal(event.prevented, true)
  assert.deepEqual(h.commands, [{
    value: '#f00',
    target: { blockId: 'b', fieldKey: 'text', range: { start: 0, end: 4 } },
    delimiter: 'Enter',
  }])
  assert.deepEqual(h.calls, [])
  h.router.destroy()
})


for (const retire of ['destroy','throw']) {
  test('retired typed-pattern owner never consumes a key after ' + retire,()=>{
    const h=typedPatternHarness({retire})
    h.runtime.health='ready'
    const event=h.event('Enter')
    h.router.handleKeydown(event)
    assert.equal(event.prevented,false,'destroyed keyboard owner consumed a captured Enter')
    assert.deepEqual(h.calls,[],'destroyed keyboard owner performed a structural edit')
    if(retire==='throw')assert.deepEqual(h.errors,['matcher failed after teardown'])
    h.router.destroy()
  })
}

test('typed-pattern callback mode epoch change cannot fall through into Enter structural edit',()=>{
  const h=typedPatternHarness({retire:'mode',converted:false})
  h.runtime.health='ready'
  h.runtime.modeEpoch=0
  const event=h.event('Enter')
  h.router.handleKeydown(event)
  assert.equal(event.prevented,false)
  assert.deepEqual(h.calls,[],'old key ran after author edit mode was replaced')
  h.router.destroy()
})
test('an input-mode round trip during shortcut snapshot cannot replay old keyboard history', () => {
  const h = harness()
  const key = h.event('z', { ctrlKey: true })
  Object.defineProperty(key, 'key', {
    configurable: true,
    get() {
      h.runtime.modeEpoch += 2
      return 'z'
    },
  })
  h.router.handleKeydown(key)
  assert.deepEqual(h.calls, [],
    'stale Mod+Z replayed history after the author mode changed during event snapshot')
  assert.equal(key.prevented, false,
    'keyboard captured a native key after losing the original mode lease')
  h.router.destroy()
})

test('Ctrl+A cannot select all after its selection reader destroys the keyboard owner', () => {
  const calls = []
  const crossSelection = {
    active: false,
    wholeBlockIds: [],
    selectAllBlocks() { calls.push('select-all'); return true },
    clear() { calls.push('clear') },
  }
  const h = harness({ crossSelection })
  h.selection.capture = () => {
    h.router.destroy()
    return {
      anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
    }
  }
  const key = h.event('a', { ctrlKey: true })
  h.router.handleKeydown(key)
  assert.deepEqual(calls, [],
    'captured Ctrl+A issued a whole-block selection after its keyboard owner was destroyed')
  assert.equal(key.prevented, false)
  h.router.destroy()
})

test('Ctrl+A cannot overwrite a newer mode decision made during selection capture', () => {
  const calls = []
  const crossSelection = {
    active: false,
    wholeBlockIds: [],
    selectAllBlocks() { calls.push('select-all'); return true },
    clear() { calls.push('clear') },
  }
  const h = harness({ crossSelection })
  h.selection.capture = () => {
    h.runtime.modeEpoch += 2
    return {
      anchor: { blockId: 'b', fieldKey: 'text', offset: 0 },
      focus: { blockId: 'b', fieldKey: 'text', offset: 1 },
    }
  }
  const key = h.event('a', { ctrlKey: true })
  h.router.handleKeydown(key)
  assert.deepEqual(calls, [],
    'Ctrl+A selected blocks using a selection that belonged to a retired mode')
  assert.equal(key.prevented, false)
  h.router.destroy()
})
test('failed inline-toolbar shortcut cannot replay history after its callback replaces edit mode', () => {
  let changeMode
  const h = harness({
    inlineToolbar: {
      handleShortcut() {
        changeMode()
        return false
      },
    },
  })
  changeMode = () => { h.runtime.modeEpoch += 2 }
  h.owner.mode = 'rich-text'
  h.root.contains = node => node === h.field
  h.field.closest = selector => selector === '[contenteditable="true"]' ? h.field : null
  const event = h.event('z', { ctrlKey: true })
  h.router.handleKeydown(event)
  assert.deepEqual(h.calls, [],
    'a toolbar callback retired the key but an old Mod+Z still replayed canonical history')
  assert.equal(event.prevented, false)
  h.router.destroy()
})

test('shortcut selection capture that destroys the owner cannot dispatch a canonical edit', () => {
  const h = harness()
  let reads = 0
  const bookmark = h.selection.capture()
  h.selection.capture = () => {
    if (++reads === 2) h.router.destroy()
    return bookmark
  }
  let attempted = 0
  h.runtime.prepareShortcutAction = () => ({ kind: 'update', data: { text: 'Modified after destroy' } })
  h.runtime.update = () => { attempted++; return true }
  const event = h.event('x')
  h.router.handleKeydown(event)
  assert.equal(reads, 2, 'test did not enter the protected shortcut-selection capture')
  assert.equal(attempted, 0, 'a retired keyboard command still invoked the canonical author update')
  assert.equal(event.prevented, false,
    'retired keyboard event consumed a key it no longer owns')
  h.router.destroy()
})
test('appendDefault does not touch a retired view after cross-selection cleanup destroys the router', () => {
  let h
  let oldToolbarCleanup = 0
  const crossSelection = {
    clear() { h.router.destroy() },
  }
  h = harness({
    crossSelection,
    inlineToolbar: { hide() { oldToolbarCleanup++ } },
  })
  h.runtime.health = 'ready'
  h.runtime.size = h.records.length
  h.runtime.isEmpty = () => true
  assert.equal(h.router.appendDefault(), false)
  assert.equal(oldToolbarCleanup, 0,
    'a destroyed keyboard owner still hid a separate toolbar presentation')
  assert.deepEqual(h.viewCalls, [], 'a destroyed keyboard owner focused an old block')
})

test('undo reconciliation teardown does not focus an already retired keyboard root', () => {
  const h = harness()
  const document = h.root.ownerDocument
  document.body = {}
  document.activeElement = document.body
  h.root.contains = node => node === document.body || node === h.field
  let staleFocuses = 0
  h.root.focus = () => { staleFocuses++ }
  h.view.reconcileInteraction = () => h.router.destroy()
  const event = h.event('z', { ctrlKey: true })
  h.router.handleKeydown(event)
  assert.deepEqual(h.calls, [['undo']], 'test never reached the canonical undo')
  assert.equal(staleFocuses, 0,
    'a detached keyboard owner moved focus after a post-replay observer destroyed it')
})

test('arrow navigation never focuses a block after setCurrent publishes a newer author choice', () => {
  for (const key of ['ArrowUp', 'ArrowDown']) {
    const h = harness()
    const atEnd = key === 'ArrowDown'
    if (atEnd) h.field.value = 'B'
    const offset = atEnd ? 1 : 0
    h.setBookmark({
      anchor: { blockId: 'b', fieldKey: 'text', offset },
      focus: { blockId: 'b', fieldKey: 'text', offset },
    })
    let attemptedFocus = 0
    h.view.setCurrent = id => {
      // A synchronous selection subscriber chooses a different block before
      // the older keydown continuation can call focus().
      h.view.currentId = id === 'a' ? 'c' : 'a'
    }
    h.view.focus = () => { attemptedFocus++; return true }
    h.router.handleKeydown(h.event(key))
    assert.equal(attemptedFocus, 0,
      key + ' stole focus after a newer explicit author selection')
    h.router.destroy()
  }
})
