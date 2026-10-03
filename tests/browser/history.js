import { createEditor } from '../../core/index.js'
import {
  createHeadingPlugin,
  createListPlugin,
  createParagraphPlugin,
  createQuotePlugin,
} from '../../plugins/index.js'

const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function semantic(document) {
  return document.blocks.map(block => ({
    id: block.id,
    type: block.type,
    data: block.data,
    ...(block.tunes ? { tunes: block.tunes } : {}),
    ...(block.inline ? { inline: block.inline } : {}),
  }))
}

function stable(value) {
  return JSON.stringify(value)
}

function createHarness(sandbox, data = {
  version: '2.0.0',
  blocks: [
    { id: 'alpha', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } },
    { id: 'beta', type: 'paragraph', dataVersion: 2, data: { text: 'Beta' } },
  ],
}) {
  const holder = document.createElement('section')
  sandbox.append(holder)
  const editor = createEditor({
    holder,
    injectStyles: false,
    changeDebounceMs: 0,
    plugins: [
      createParagraphPlugin({ injectStyles: false }),
      createHeadingPlugin(),
      createListPlugin(),
      createQuotePlugin(),
    ],
    data: structuredClone(data),
  })
  return { holder, editor }
}

function editable(holder, blockId) {
  const block = holder.querySelector(`[data-block-id="${blockId}"]`)
  assert(block instanceof HTMLElement, `block ${blockId} is not projected`)
  const target = block.matches('[contenteditable="true"]')
    ? block
    : block.querySelector('[contenteditable="true"]')
  assert(target instanceof HTMLElement, `block ${blockId} has no editable field`)
  return target
}

function setCaret(element, offset) {
  element.focus()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  if (!node) {
    node = document.createTextNode('')
    element.append(node)
  }
  const range = document.createRange()
  range.setStart(node, Math.min(offset, node.textContent?.length ?? 0))
  range.collapse(true)
  const selection = getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function selectBetween(startElement, startOffset, endElement, endOffset, { backward = false } = {}) {
  const text = element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    if (!node) {
      node = document.createTextNode('')
      element.append(node)
    }
    return node
  }
  const start = text(startElement)
  const end = text(endElement)
  const selection = getSelection()
  selection.removeAllRanges()
  if (backward && typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(
      end, Math.min(endOffset, end.data.length),
      start, Math.min(startOffset, start.data.length),
    )
  } else {
    const range = document.createRange()
    range.setStart(start, Math.min(startOffset, start.data.length))
    range.setEnd(end, Math.min(endOffset, end.data.length))
    selection.addRange(range)
  }
  startElement.focus()
  document.dispatchEvent(new Event('selectionchange'))
}

async function clickInlineTool(holder, type) {
  await delay()
  const button = holder.querySelector(`.oe-inline-toolbar [data-tool="${type}"]`)
  assert(button instanceof HTMLButtonElement && !button.hidden, `inline tool ${type} is unavailable`)
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  button.click()
  await delay()
}

function pointer(target,type,options={}){
  const event=new PointerEvent(type,{
    pointerId:options.pointerId??1,
    isPrimary:options.isPrimary??true,
    button:options.button??0,
    buttons:options.buttons??(type==='pointerup'||type==='pointercancel'?0:1),
    clientX:options.clientX??0,
    clientY:options.clientY??0,
    bubbles:true,
    cancelable:true,
  })
  target.dispatchEvent(event)
  return event
}

function key(element, key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: options.code ?? key,
    ctrlKey: options.ctrlKey === true,
    metaKey: options.metaKey === true,
    shiftKey: options.shiftKey === true,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  return event
}

async function assertUndoRedo(editor, label, mutate) {
  const before = semantic(editor.save())
  await mutate()
  await delay()
  const after = semantic(editor.save())
  assert(stable(after) !== stable(before), `${label} did not change the document`)
  assert(editor.undo() === true, `${label} undo() returned false`)
  await delay()
  assert(stable(semantic(editor.save())) === stable(before), `${label} undo did not restore the previous document`)
  assert(editor.redo() === true, `${label} redo() returned false`)
  await delay()
  assert(stable(semantic(editor.save())) === stable(after), `${label} redo did not restore the changed document`)
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack ?? event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack ?? String(event.reason)))

  const structural = createHarness(sandbox)
  const { editor, holder } = structural

  await assertUndoRedo(editor, 'native typing', async () => {
    const target = editable(holder, 'alpha')
    target.textContent = 'Alpha edited'
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })

  await assertUndoRedo(editor, 'structural Enter split', async () => {
    const target = editable(holder, 'alpha')
    setCaret(target, 5)
    const event = key(target, 'Enter')
    assert(event.defaultPrevented, 'KeyboardRouter did not own structural Enter')
  })

  editor.render({
    version: '2.0.0',
    blocks: [{
      id: 'quote-format',
      type: 'quote',
      dataVersion: 1,
      data: { text: 'Quote text', caption: 'Quote caption' },
    }],
  })
  const quoteText = holder.querySelector('.oe-block[data-block-id="quote-format"] .oe-quote__text')
  const quoteCaption = holder.querySelector('.oe-block[data-block-id="quote-format"] .oe-quote__caption')
  assert(quoteText instanceof HTMLElement && quoteCaption instanceof HTMLElement, 'quote multi-field fixture is missing')
  selectBetween(quoteText, 0, quoteCaption, quoteCaption.textContent.length)
  const quoteBefore = stable(semantic(editor.save()))
  await clickInlineTool(holder, 'bold')
  const quoteAfter = editor.save().blocks[0]
  assert(quoteAfter.data.text.includes('<b>'), 'same-block multi-field formatting missed quote text')
  assert(quoteAfter.data.caption.includes('<b>'), 'same-block multi-field formatting missed quote caption')
  assert(editor.undo() === true, 'same-block multi-field formatting is not one undoable command')
  await delay()
  assert(stable(semantic(editor.save())) === quoteBefore, 'same-block multi-field undo did not restore the whole block')

  editor.render({
    version: '2.0.0',
    blocks: [
      { id: 'format-a', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha' } },
      { id: 'format-b', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo' } },
    ],
  })
  const formatA = editable(holder, 'format-a')
  const formatB = editable(holder, 'format-b')
  selectBetween(formatA, 0, formatB, formatB.textContent.length)
  const crossBefore = stable(semantic(editor.save()))
  await clickInlineTool(holder, 'bold')
  let formatted = editor.save().blocks
  assert(formatted.every(block => block.data.text.includes('<b>')), 'cross-block formatting did not update every selected block')
  assert(editor.undo() === true, 'cross-block formatting is not one undoable command')
  await delay()
  assert(stable(semantic(editor.save())) === crossBefore, 'cross-block formatting undo was not atomic')

  selectBetween(formatA, 0, formatB, formatB.textContent.length, { backward: true })
  await clickInlineTool(holder, 'align')
  const alignPanel = holder.querySelector('.oe-inline-toolbar__align-panel')
  assert(alignPanel instanceof HTMLElement, 'alignment panel did not open')
  const alignActions = [...alignPanel.querySelectorAll('.oe-inline-tool')]
  assert(alignActions.length >= 5, 'alignment actions are incomplete')
  alignActions[2].click()
  await delay()
  formatted = editor.save().blocks
  assert(formatted.every(block => block.tunes?.textAlign === 'center'), 'alignment was not persisted in tunes for every selected block')
  assert(formatted.every(block => !Object.hasOwn(block.data, 'align')), 'alignment leaked into plugin data')
  assert(editor.undo() === true, 'alignment is not one undoable command')
  await delay()
  assert(editor.save().blocks.every(block => block.tunes?.textAlign === undefined), 'alignment undo did not clear tunes')

  await assertUndoRedo(editor, 'public insert', () => {
    editor.blocks.insert({ type: 'paragraph', dataVersion: 2, data: { text: 'Inserted' } }, 1)
  })

  let movableId = editor.blocks.at(0)?.id
  assert(movableId, 'move fixture has no first block')
  await assertUndoRedo(editor, 'public move', () => {
    editor.blocks.move(movableId, editor.blocks.count - 1)
  })

  const convertibleId = editor.blocks.at(0)?.id
  assert(convertibleId, 'convert fixture has no first block')
  await assertUndoRedo(editor, 'public convert', () => {
    editor.blocks.convert(convertibleId, { type: 'heading', toolboxItemId: 'h3' })
  })

  const removableId = editor.blocks.at(1)?.id
  assert(removableId, 'remove fixture has no removable block')
  await assertUndoRedo(editor, 'public remove', () => {
    editor.blocks.remove(removableId)
  })

  await assertUndoRedo(editor, 'clear', () => editor.clear())

  await assertUndoRedo(editor, 'public render', () => {
    editor.render({
      version: '2.0.0',
      blocks: [
        { id: 'render-heading', type: 'heading', dataVersion: 2, data: { text: 'Rendered', level: 3 } },
        { id: 'render-paragraph', type: 'paragraph', dataVersion: 2, data: { text: 'Document' } },
      ],
    })
  })

  editor.render({
    version: '2.0.0',
    blocks: [{ id: 'toolbar-origin', type: 'paragraph', dataVersion: 2, data: { text: 'Origin' } }],
  })
  editor.blocks.focus('toolbar-origin', { offset: 'end' })
  await delay()
  const plus = holder.querySelector('.oe-toolbar__btn')
  assert(plus instanceof HTMLButtonElement, 'v2 toolbar add button is missing')
  plus.click()
  const headingItem = holder.querySelector('.oe-toolbox__item[data-plugin-type="heading"]')
  assert(headingItem instanceof HTMLElement, 'heading toolbox item is missing')
  headingItem.click()
  await delay()
  assert(editor.blocks.count === 2, 'toolbox did not insert a block after current content')
  assert(editor.blocks.at(1)?.type === 'heading', 'toolbox inserted the wrong block type')
  assert(editor.blocks.currentId === editor.blocks.at(1)?.id, 'toolbox insertion did not become current')
  assert(editor.undo() === true, 'toolbar insertion is not undoable')
  assert(editor.blocks.count === 1, 'toolbar undo did not remove inserted block')
  assert(editor.redo() === true, 'toolbar insertion is not redoable')
  assert(editor.blocks.count === 2, 'toolbar redo did not restore inserted block')

  const shortcutTarget = editable(holder, editor.blocks.at(0).id)
  const beforeShortcutUndo = semantic(editor.save())
  editor.blocks.insert({ type: 'paragraph', dataVersion: 2, data: { text: 'Shortcut' } })
  const afterShortcutInsert = semantic(editor.save())
  const undoEvent = key(shortcutTarget, 'z', { code: 'KeyZ', ctrlKey: true })
  await delay()
  assert(undoEvent.defaultPrevented, 'Mod+Z was not claimed by KeyboardRouter')
  assert(stable(semantic(editor.save())) === stable(beforeShortcutUndo), 'Mod+Z restored the wrong state')
  const redoEvent = key(shortcutTarget, 'z', { code: 'KeyZ', ctrlKey: true, shiftKey: true })
  await delay()
  assert(redoEvent.defaultPrevented, 'Mod+Shift+Z was not claimed by KeyboardRouter')
  assert(stable(semantic(editor.save())) === stable(afterShortcutInsert), 'Mod+Shift+Z restored the wrong state')

  const auxiliary = document.createElement('input')
  auxiliary.value = 'auxiliary'
  holder.querySelector('.oe-editor')?.appendChild(auxiliary)
  auxiliary.focus()
  const auxiliaryBefore = stable(semantic(editor.save()))
  const auxiliaryUndo = key(auxiliary, 'z', { code: 'KeyZ', ctrlKey: true })
  await delay()
  assert(!auxiliaryUndo.defaultPrevented, 'auxiliary native input lost native Mod+Z')
  assert(stable(semantic(editor.save())) === auxiliaryBefore, 'auxiliary Mod+Z changed document history')
  auxiliary.remove()

  const beforeMode = stable(semantic(editor.save()))
  editor.setReadOnly(true)
  assert(editor.readOnly === true, 'setReadOnly(true) did not update the public state')
  assert(holder.querySelector('.oe-editor')?.getAttribute('aria-readonly') === 'true', 'read-only ARIA state is missing')
  assert(!holder.querySelector('[contenteditable="true"]'), 'read-only transition left editable DOM')
  assert(holder.querySelector('.oe-toolbar')?.getAttribute('style')?.includes('display: none'), 'toolbar stayed visible in read-only mode')
  editor.setReadOnly(false)
  assert(editor.readOnly === false, 'setReadOnly(false) did not restore editing')
  assert(stable(semantic(editor.save())) === beforeMode, 'read-only transition changed document data')

  const readOnlyHarness = createHarness(sandbox)
  const readOnlyEditor = readOnlyHarness.editor
  const readOnlyHolder = readOnlyHarness.holder
  const readOnlyTransactions = []
  const readOnlyHistoryEvents = []
  readOnlyEditor.on('transaction:committed', event => readOnlyTransactions.push(event))
  readOnlyEditor.on('history:changed', event => readOnlyHistoryEvents.push(event))
  readOnlyEditor.setReadOnly(true)
  assert(readOnlyEditor.canUndo === false && readOnlyEditor.canRedo === false, 'read-only exposed history commands')

  const readOnlyBefore = stable(semantic(readOnlyEditor.save()))
  const readOnlyShell = readOnlyHolder.querySelector('.oe-block[data-block-id="alpha"]')
  const blockedUndo = key(readOnlyShell, 'z', { code: 'KeyZ', ctrlKey: true })
  await delay()
  assert(!blockedUndo.defaultPrevented, 'read-only KeyboardRouter claimed Mod+Z')
  assert(stable(semantic(readOnlyEditor.save())) === readOnlyBefore, 'read-only keyboard history changed the document')

  const hostInserted = readOnlyEditor.blocks.insert({
    type: 'paragraph',
    data: { text: 'Host insert while read-only' },
  })
  readOnlyEditor.blocks.update(hostInserted, current => ({
    data: { ...current.data, text: 'Host updated while read-only' },
  }))
  readOnlyEditor.blocks.move(hostInserted, 0)
  assert(readOnlyEditor.blocks.at(0)?.id === hostInserted, 'host move was blocked by read-only')
  readOnlyEditor.blocks.remove(hostInserted)

  readOnlyEditor.render({
    version: '2.0.0',
    blocks: [{ id: 'host-render', type: 'paragraph', dataVersion: 2, data: { text: 'Host render' } }],
  })
  assert(readOnlyEditor.save().blocks[0].id === 'host-render', 'host render was blocked by read-only')
  readOnlyEditor.clear()
  assert(readOnlyEditor.blocks.count === 1, 'host clear was blocked by read-only')
  assert(readOnlyEditor.readOnly === true, 'host mutation changed requested read-only state')
  assert(readOnlyEditor.canUndo === false, 'read-only exposed history after host mutations')
  assert(readOnlyTransactions.length > 0, 'read-only host mutations did not publish committed events')
  assert(
    readOnlyTransactions.every(event => event.history.canUndo === false && event.history.canRedo === false),
    'read-only transaction event exposed unavailable history',
  )
  assert(
    readOnlyHistoryEvents.every(event => event.canUndo === false && event.canRedo === false),
    'read-only history event exposed unavailable history',
  )

  readOnlyEditor.setReadOnly(false)
  assert(readOnlyEditor.canUndo === true, 'history did not become available after leaving read-only')
  assert(readOnlyEditor.undo() === true, 'host clear was not undoable after leaving read-only')
  assert(readOnlyEditor.save().blocks[0].id === 'host-render', 'undo after read-only restored wrong host state')
  readOnlyEditor.destroy()

  const dragHarness=createHarness(sandbox,{
    version:'2.0.0',
    blocks:[
      {id:'drag-a',type:'paragraph',dataVersion:2,data:{text:'A'}},
      {id:'drag-b',type:'paragraph',dataVersion:2,data:{text:'B'}},
      {id:'drag-c',type:'paragraph',dataVersion:2,data:{text:'C'}},
    ],
  })
  const dragEditor=dragHarness.editor
  const dragHolder=dragHarness.holder
  dragEditor.blocks.focus('drag-a',{offset:'start'})
  await delay()
  const dragHandle=dragHolder.querySelector('.oe-toolbar__drag')
  assert(dragHandle instanceof HTMLElement,'drag handle is missing')
  const shell=id=>dragHolder.querySelector(`.oe-block[data-block-id="${id}"]`)
  const aShell=shell('drag-a')
  const bShell=shell('drag-b')
  const cShell=shell('drag-c')
  assert(aShell&&bShell&&cShell,'drag fixture shells are missing')
  const aRect=aShell.getBoundingClientRect()
  const bRect=bShell.getBoundingClientRect()
  const cRect=cShell.getBoundingClientRect()
  const bMid=bRect.top+bRect.height/2
  const cMid=cRect.top+cRect.height/2
  const gapY=(bMid+cMid)/2

  pointer(dragHandle,'pointerdown',{
    pointerId:71,
    clientX:aRect.left+1,
    clientY:aRect.top+aRect.height/2,
  })
  const dragMove=pointer(document,'pointermove',{
    pointerId:71,
    clientX:aRect.left+20,
    clientY:gapY,
  })
  assert(dragMove.defaultPrevented,'active drag did not own pointermove')
  pointer(document,'pointerup',{
    pointerId:71,
    clientX:aRect.left+20,
    clientY:gapY,
    buttons:0,
  })
  await delay()
  assert(
    dragEditor.blocks.list().map(block=>block.id).join(',')==='drag-b,drag-a,drag-c',
    'drag gap produced the wrong order',
  )
  assert(shell('drag-a')===aShell&&shell('drag-b')===bShell&&shell('drag-c')===cShell,'drag recreated block DOM identity')
  assert(dragEditor.undo()===true,'drag move did not create one undo step')
  await delay()
  assert(dragEditor.blocks.list().map(block=>block.id).join(',')==='drag-a,drag-b,drag-c','drag undo restored wrong order')
  assert(dragEditor.redo()===true,'drag move redo failed')
  await delay()
  assert(dragEditor.blocks.list().map(block=>block.id).join(',')==='drag-b,drag-a,drag-c','drag redo restored wrong order')

  const firstClick=new MouseEvent('click',{bubbles:true,cancelable:true})
  dragHandle.dispatchEvent(firstClick)
  assert(firstClick.defaultPrevented,'drag gesture did not suppress its synthetic click')
  await delay(5)
  const laterClick=new MouseEvent('click',{bubbles:true,cancelable:true})
  dragHandle.dispatchEvent(laterClick)
  assert(!laterClick.defaultPrevented,'drag click suppression outlived its gesture')

  const foreignBefore=dragEditor.blocks.list().map(block=>block.id).join(',')
  pointer(dragHandle,'pointerdown',{pointerId:81,clientX:1,clientY:1})
  pointer(document,'pointermove',{pointerId:82,clientX:20,clientY:gapY})
  pointer(document,'pointerup',{pointerId:82,clientX:20,clientY:gapY,buttons:0})
  pointer(document,'pointercancel',{pointerId:81,buttons:0})
  await delay()
  assert(dragEditor.blocks.list().map(block=>block.id).join(',')===foreignBefore,'foreign pointer completed a drag')

  pointer(dragHandle,'pointerdown',{pointerId:91,clientX:1,clientY:1})
  pointer(document,'pointermove',{pointerId:91,clientX:30,clientY:gapY})
  dragEditor.setReadOnly(true)
  assert(!document.body.classList.contains('oe-editor-dragging'),'read-only transition left drag session active')
  pointer(document,'pointerup',{pointerId:91,clientX:30,clientY:gapY,buttons:0})
  dragEditor.setReadOnly(false)
  assert(dragEditor.blocks.list().map(block=>block.id).join(',')===foreignBefore,'late pointerup moved a read-only-cancelled drag')
  dragEditor.destroy()

  const eventHarness = createHarness(sandbox)
  const transactionEvents = []
  const documentEvents = []
  const historyEvents = []
  eventHarness.editor.on('transaction:committed', event => transactionEvents.push(event))
  eventHarness.editor.on('document:changed', event => documentEvents.push(event))
  eventHarness.editor.on('history:changed', event => historyEvents.push(event))
  let observerAfterFailure = 0
  eventHarness.editor.on('document:changed', async () => {
    throw new Error('intentional async event observer failure')
  })
  eventHarness.editor.on('document:changed', () => { observerAfterFailure++ })
  const eventInserted = eventHarness.editor.blocks.insert({
    type: 'paragraph',
    data: { text: 'Event insert' },
  })
  assert(transactionEvents.at(-1).action === 'commit', 'insert event action is wrong')
  assert(transactionEvents.at(-1).changes[0].kind === 'block.insert', 'insert event lost forward change')
  assert(!Object.hasOwn(transactionEvents.at(-1), 'record'), 'transaction event still exposes nested record')
  assert(Object.isFrozen(transactionEvents.at(-1)), 'transaction event is mutable')
  assert(Object.isFrozen(transactionEvents.at(-1).changes), 'transaction changes are mutable')
  assert(
    Object.keys(documentEvents.at(-1)).sort().join(',') === 'action,changes,origin',
    'document:changed exposes fields outside its contract',
  )
  assert(historyEvents.at(-1).canUndo === true && historyEvents.at(-1).canRedo === false, 'history event did not expose committed cursor')

  await delay()
  assert(observerAfterFailure > 0, 'failed async event observer prevented later listeners')

  assert(eventHarness.editor.undo() === true, 'event insert undo failed')
  const undoTransaction = transactionEvents.at(-1)
  assert(undoTransaction.action === 'undo', 'undo event action is wrong')
  assert(undoTransaction.changes[0].kind === 'block.remove', 'undo did not publish applied inverse change')
  assert(undoTransaction.changes[0].block.id === eventInserted, 'undo inverse change targets wrong block')

  assert(eventHarness.editor.redo() === true, 'event insert redo failed')
  const redoTransaction = transactionEvents.at(-1)
  assert(redoTransaction.action === 'redo', 'redo event action is wrong')
  assert(redoTransaction.changes[0].kind === 'block.insert', 'redo did not publish forward change')
  eventHarness.editor.destroy()

  const changes = []
  const stop = editor.on('document:changed', event => changes.push(event))
  const inserted = editor.blocks.insert({ type: 'paragraph', dataVersion: 2, data: { text: 'Observed' } })
  await delay()
  assert(changes.length > 0, 'document:changed was not published after mutation')
  assert(changes.at(-1).changes.length > 0, 'document:changed did not carry canonical changes')
  stop()
  editor.blocks.remove(inserted)

  editor.destroy()
  editor.destroy()
  assert(holder.childNodes.length === 0, 'destroy left editor DOM in its holder')

  await delay()
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()

  return {
    historyCases: [
      'native typing',
      'structural Enter split',
      'insert',
      'move',
      'convert',
      'remove',
      'clear',
      'render',
      'toolbar insert',
      'keyboard undo/redo',
      'read-only transition',
      'pointer drag session',
      'read-only host authority',
      'direct/inverse transaction events',
    ],
    publicEvents: ['transaction:committed', 'document:changed', 'history:changed'],
  }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack ?? String(error)
}
