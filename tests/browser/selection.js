import { createEditor } from '../../core/index.js'
import { createParagraphPlugin, createQuotePlugin } from '../../plugins/index.js'

const initialData = {
  version: '2.0.0',
  blocks: [
    { id: 'alpha', type: 'paragraph', data: { text: 'Alpha one' } },
    { id: 'bravo', type: 'paragraph', data: { text: 'Bravo two' } },
    { id: 'charlie', type: 'paragraph', data: { text: 'Charlie three' } },
  ],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createHarness(sandbox, data = initialData, plugins = [createParagraphPlugin({ injectStyles: false })]) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins,
    injectStyles: false,
    data: structuredClone(data),
    changeDebounceMs: 0,
  })
  const root = holder.querySelector('.oe-editor')
  assert(root instanceof HTMLElement, 'editor root is missing')
  return { editor, holder, root }
}

function blockRoot(harness, index) {
  const record = harness.editor.blocks.at(index)
  assert(record, `missing block at index ${index}`)
  const block = [...harness.root.querySelectorAll('.oe-block')]
    .find(element => element.dataset.blockId === record.id)
  assert(block instanceof HTMLElement, `block DOM is missing for ${record.id}`)
  return block
}

function editable(harness, index, selector = null) {
  const block = blockRoot(harness, index)
  if (selector) {
    const field = block.querySelector(selector)
    assert(field instanceof HTMLElement, `editable field ${selector} is missing`)
    return field
  }
  if (block.matches('[contenteditable="true"]')) return block
  const field = block.querySelector('[contenteditable="true"]')
  assert(field instanceof HTMLElement, 'editable field is missing')
  return field
}

function textNode(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode()
  assert(node?.nodeType === Node.TEXT_NODE, 'expected text content')
  return node
}

function setCaret(element, offset) {
  const node = textNode(element)
  element.focus()
  const range = document.createRange()
  range.setStart(node, Math.max(0, Math.min(offset, node.data.length)))
  range.collapse(true)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function selectAllText(element) {
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function pointAt(element, offset) {
  const node = textNode(element)
  const clamped = Math.max(0, Math.min(offset, node.data.length))
  const range = document.createRange()
  if (clamped === 0) {
    range.setStart(node, 0)
    range.setEnd(node, Math.min(1, node.data.length))
  } else {
    range.setStart(node, clamped - 1)
    range.setEnd(node, clamped)
  }
  const rect = range.getBoundingClientRect()
  return {
    x: clamped === 0 ? rect.left + 1 : rect.right - 1,
    y: rect.top + Math.max(1, rect.height / 2),
  }
}

async function activateCrossSelection(harness, startIndex = 0, startOffset = 6, endIndex = 2, endOffset = 7) {
  const start = editable(harness, startIndex)
  const end = editable(harness, endIndex)
  const startPoint = pointAt(start, startOffset)
  const endPoint = pointAt(end, endOffset)
  start.focus()
  start.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, buttons: 1,
    clientX: startPoint.x, clientY: startPoint.y,
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, buttons: 1,
    clientX: endPoint.x, clientY: endPoint.y,
  }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  await delay()
  assert(harness.root.classList.contains('oe-editor--cross-selecting'), 'cross-block selection was not activated')
  assert(harness.editor.blocks.selectedIds().length === 3, 'cross-block selection did not expose selected block ids')
}

function key(target, keyValue, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: keyValue,
    code: options.code || keyValue,
    ctrlKey: !!options.ctrlKey,
    metaKey: !!options.metaKey,
    shiftKey: !!options.shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

function shortcut(target, shiftKey = false) {
  return key(target, shiftKey ? 'Z' : 'z', { code: 'KeyZ', ctrlKey: true, shiftKey })
}

function paste(target, values) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(values)) data.setData(type, value)
  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function texts(editor) {
  return editor.save().blocks.map(block => String(block.data.text ?? ''))
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  const copy = createHarness(sandbox)
  await activateCrossSelection(copy)
  const copyData = new DataTransfer()
  const copyEvent = new ClipboardEvent('copy', { clipboardData: copyData, bubbles: true, cancelable: true })
  editable(copy, 0).dispatchEvent(copyEvent)
  const copiedText = copyData.getData('text/plain')
  assert(copyEvent.defaultPrevented, 'partial cross-block copy was not handled')
  assert(copyData.getData('application/x-rector-editor') === '', 'partial copy exported whole-block MIME data')
  assert(copiedText.includes('one') && copiedText.includes('Bravo two') && copiedText.includes('Charlie'), 'partial copy lost selected text')
  assert(!copiedText.includes('Alpha ') && !copiedText.includes(' three'), 'partial copy included unselected text')

  const cutData = new DataTransfer()
  const cutEvent = new ClipboardEvent('cut', { clipboardData: cutData, bubbles: true, cancelable: true })
  editable(copy, 0).dispatchEvent(cutEvent)
  await delay()
  assert(copy.editor.blocks.count === 1, 'partial cut did not merge selected paragraph range')
  assert(texts(copy.editor)[0] === 'Alpha  three', 'partial cut lost surviving endpoint text')
  shortcut(editable(copy, 0))
  await delay()
  assert(JSON.stringify(texts(copy.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'partial cut undo was not atomic')
  shortcut(editable(copy, 0), true)
  await delay()
  assert(texts(copy.editor)[0] === 'Alpha  three', 'partial cut redo failed')
  copy.editor.destroy()

  for (const deletionKey of ['Backspace', 'Delete']) {
    const harness = createHarness(sandbox)
    await activateCrossSelection(harness)
    const event = key(editable(harness, 0), deletionKey)
    await delay()
    assert(event.defaultPrevented, `${deletionKey} did not consume the cross-block selection`)
    assert(harness.editor.blocks.count === 1, `${deletionKey} did not replace the selected range atomically`)
    shortcut(editable(harness, 0))
    await delay()
    assert(harness.editor.blocks.count === 3, `${deletionKey} undo was not atomic`)
    harness.editor.destroy()
  }

  const pasteHarness = createHarness(sandbox)
  await activateCrossSelection(pasteHarness)
  const pasteEvent = paste(editable(pasteHarness, 0), { 'text/plain': 'REPLACED' })
  await delay()
  assert(pasteEvent.defaultPrevented, 'cross-block paste was not handled')
  assert(pasteHarness.editor.blocks.count === 1, 'cross-block paste left intermediate blocks')
  assert(texts(pasteHarness.editor)[0] === 'Alpha REPLACED three', 'cross-block paste lost head/tail text')
  shortcut(editable(pasteHarness, 0))
  await delay()
  assert(JSON.stringify(texts(pasteHarness.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'cross-block paste undo failed')
  pasteHarness.editor.destroy()

  const outside = createHarness(sandbox)
  await activateCrossSelection(outside)
  document.querySelector('#outside').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  assert(!outside.root.classList.contains('oe-editor--cross-selecting'), 'outside click kept cross selection active')
  assert(outside.editor.blocks.selectedIds().length === 0, 'outside click kept block selection active')
  outside.editor.destroy()

  const focus = createHarness(sandbox)
  const first = editable(focus, 0)
  const second = editable(focus, 1)
  setCaret(first, first.textContent.length)
  assert(key(first, 'ArrowDown').defaultPrevented, 'ArrowDown did not navigate from block end')
  assert(document.activeElement === second, 'ArrowDown focused the wrong block')
  setCaret(second, 0)
  assert(key(second, 'ArrowUp').defaultPrevented, 'ArrowUp did not navigate from block start')
  assert(document.activeElement === first, 'ArrowUp focused the wrong block')
  assert(!key(first, 'Tab').defaultPrevented, 'Tab is trapped inside the editor')
  assert(!key(first, 'Tab', { shiftKey: true }).defaultPrevented, 'Shift+Tab is trapped inside the editor')
  focus.editor.destroy()

  const split = createHarness(sandbox)
  const splitFirst = editable(split, 0)
  setCaret(splitFirst, 6)
  assert(key(splitFirst, 'Enter').defaultPrevented, 'Enter did not split the block')
  await delay()
  assert(split.editor.blocks.count === 4, 'Enter did not create exactly one block')
  assert(JSON.stringify(texts(split.editor).slice(0, 2)) === JSON.stringify(['Alpha ', 'one']), 'Enter split persisted stale data')
  shortcut(editable(split, 0))
  await delay()
  assert(JSON.stringify(texts(split.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'Enter split undo failed')
  split.editor.destroy()

  for (const [mergeKey, index, offset] of [['Backspace', 1, 0], ['Delete', 0, 'end']]) {
    const harness = createHarness(sandbox)
    const field = editable(harness, index)
    setCaret(field, offset === 'end' ? field.textContent.length : offset)
    assert(key(field, mergeKey).defaultPrevented, `${mergeKey} did not merge adjacent paragraphs`)
    await delay()
    assert(harness.editor.blocks.count === 2, `${mergeKey} removed the wrong number of blocks`)
    shortcut(editable(harness, 0))
    await delay()
    assert(harness.editor.blocks.count === 3, `${mergeKey} merge undo failed`)
    harness.editor.destroy()
  }

  const all = createHarness(sandbox)
  const allFirst = editable(all, 0)
  selectAllText(allFirst)
  const selectAll = key(allFirst, 'a', { code: 'KeyA', ctrlKey: true })
  await delay()
  assert(selectAll.defaultPrevented, 'second Ctrl+A did not enter all-block selection mode')
  assert(all.editor.blocks.selectedIds().length === 3, 'all-block selection is incomplete')
  const wholeCopy = new DataTransfer()
  const wholeCopyEvent = new ClipboardEvent('copy', { clipboardData: wholeCopy, bubbles: true, cancelable: true })
  allFirst.dispatchEvent(wholeCopyEvent)
  const internal = JSON.parse(wholeCopy.getData('application/x-rector-editor'))
  assert(Array.isArray(internal) && internal.length === 3, 'whole-block copy lost internal MIME data')
  const wholeCut = new DataTransfer()
  allFirst.dispatchEvent(new ClipboardEvent('cut', { clipboardData: wholeCut, bubbles: true, cancelable: true }))
  await delay()
  assert(all.editor.blocks.count === 1 && texts(all.editor)[0] === '', 'whole-block cut did not leave one empty default block')
  shortcut(editable(all, 0))
  await delay()
  assert(all.editor.blocks.count === 3, 'whole-block cut undo was not atomic')
  all.editor.destroy()

  const multi = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [
      { id: 'quote-alpha', type: 'quote', data: { text: 'First quote', caption: 'First caption' } },
      { id: 'quote-bravo', type: 'quote', data: { text: 'Second quote', caption: 'Second caption' } },
    ],
  }, [createParagraphPlugin({ injectStyles: false }), createQuotePlugin()])
  const firstCaption = editable(multi, 0, '.oe-quote__caption')
  const secondCaption = editable(multi, 1, '.oe-quote__caption')
  const p1 = pointAt(firstCaption, 2)
  const p2 = pointAt(secondCaption, 6)
  firstCaption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1, clientX: p1.x, clientY: p1.y }))
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: p2.x, clientY: p2.y }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
  await delay()
  assert(multi.root.classList.contains('oe-editor--cross-selecting'), 'multi-field endpoints did not preserve field identity')
  multi.editor.destroy()

  await delay(50)
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()
  return {
    crossBlockOperations: ['copy', 'cut', 'paste', 'Backspace', 'Delete', 'outside clear'],
    structuralKeys: ['Enter', 'Backspace merge', 'Delete merge', 'Ctrl+A'],
    focusKeys: ['ArrowUp', 'ArrowDown', 'Tab', 'Shift+Tab'],
    multiField: true,
  }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
