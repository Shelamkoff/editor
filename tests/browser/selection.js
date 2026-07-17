import { createEditor } from '../../core/index.js'
import { Paragraph, Quote } from '../../plugins/index.js'
import { restoreCrossBlockRange, saveCrossBlockOffsets } from '../../inline-tools/utils.js'

const initialData = {
  version: 'browser-selection',
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

function createHarness(sandbox) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: structuredClone(initialData),
    tuning: {
      undo: { debounceMs: 0, maxStack: 100 },
      change: { debounceMs: 0 },
      animations: { blockInsertMs: 0, blockMoveMs: 0 },
    },
  })
  return { editor, holder }
}

function textNode(element) {
  const node = element.firstChild
  assert(node?.nodeType === Node.TEXT_NODE, 'expected a direct text node')
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

async function activateCrossSelection(editor, startIndex = 0, startOffset = 6, endIndex = 2, endOffset = 7) {
  const start = editor.blocks.getBlockByIndex(startIndex).contentElement
  const end = editor.blocks.getBlockByIndex(endIndex).contentElement
  const startPoint = pointAt(start, startOffset)
  const endPoint = pointAt(end, endOffset)
  start.focus()
  start.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: startPoint.x,
    clientY: startPoint.y,
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    clientX: endPoint.x,
    clientY: endPoint.y,
  }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  await delay()
  assert(editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'cross-block selection was not activated')
}

function key(target, keyValue, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: keyValue,
    code: options.code || keyValue,
    ctrlKey: !!options.ctrlKey,
    shiftKey: !!options.shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

function shortcut(editor, shiftKey = false) {
  key(editor.rootElement, shiftKey ? 'Z' : 'z', {
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey,
  })
}

function paste(target, values) {
  const data = new DataTransfer()
  for (const [type, value] of Object.entries(values)) data.setData(type, value)
  const event = new ClipboardEvent('paste', {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

async function blockTexts(editor) {
  return editor.save().blocks.map(block => String(block.data.text || ''))
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  const copyHarness = createHarness(sandbox)
  await delay()
  await activateCrossSelection(copyHarness.editor)
  const copyData = new DataTransfer()
  const copyEvent = new ClipboardEvent('copy', { clipboardData: copyData, bubbles: true, cancelable: true })
  copyHarness.editor.blocks.getBlockByIndex(0).contentElement.dispatchEvent(copyEvent)
  const copiedText = copyData.getData('text/plain')
  assert(copyEvent.defaultPrevented, 'partial cross-block copy was not handled')
  assert(copyData.getData('application/x-rector-editor') === '', 'partial copy exported whole-block MIME data')
  assert(copiedText.includes('one') && copiedText.includes('Bravo two') && copiedText.includes('Charlie'), 'partial copy lost selected text')
  assert(!copiedText.includes('Alpha ') && !copiedText.includes(' three'), 'partial copy included unselected text')

  const cutData = new DataTransfer()
  const cutEvent = new ClipboardEvent('cut', { clipboardData: cutData, bubbles: true, cancelable: true })
  copyHarness.editor.blocks.getBlockByIndex(0).contentElement.dispatchEvent(cutEvent)
  await delay()
  assert(copyHarness.editor.blocks.getBlockCount() === 1, 'partial cut did not merge selected blocks')
  assert(copyHarness.editor.blocks.getSelectedBlocks().length === 0, 'partial cut left block selection active')
  const cutText = copyHarness.editor.blocks.getBlockByIndex(0).contentElement.textContent || ''
  assert(cutText.includes('Alpha') && cutText.includes('three'), 'partial cut lost surviving text')
  assert(!/one|Bravo|Charlie/.test(cutText), 'partial cut kept selected text')
  assert((await blockTexts(copyHarness.editor))[0] === cutText, 'partial cut saved a stale cached block')
  shortcut(copyHarness.editor)
  await delay()
  assert(JSON.stringify(await blockTexts(copyHarness.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'partial cut undo was not atomic')
  shortcut(copyHarness.editor, true)
  await delay()
  assert(copyHarness.editor.blocks.getBlockCount() === 1, 'partial cut redo failed')
  copyHarness.editor.destroy()

  for (const deletionKey of ['Backspace', 'Delete']) {
    const harness = createHarness(sandbox)
    await delay()
    await activateCrossSelection(harness.editor)
    const event = key(harness.editor.blocks.getBlockByIndex(0).contentElement, deletionKey)
    await delay()
    assert(event.defaultPrevented, `${deletionKey} did not handle cross-block selection`)
    assert(harness.editor.blocks.getBlockCount() === 1, `${deletionKey} performed a second structural deletion`)
    assert(harness.editor.blocks.getSelectedBlocks().length === 0, `${deletionKey} left selected blocks`)
    shortcut(harness.editor)
    await delay()
    assert(harness.editor.blocks.getBlockCount() === 3, `${deletionKey} undo was not one transaction`)
    harness.editor.destroy()
  }

  const pasteHarness = createHarness(sandbox)
  await delay()
  await activateCrossSelection(pasteHarness.editor)
  const pasteTarget = pasteHarness.editor.blocks.getBlockByIndex(0).contentElement
  const pasteEvent = paste(pasteTarget, { 'text/plain': 'REPLACED' })
  await delay()
  assert(pasteEvent.defaultPrevented, 'paste did not replace the cross-block selection')
  assert(pasteHarness.editor.blocks.getBlockCount() === 1, 'cross-block paste kept or removed an unexpected block')
  assert((await blockTexts(pasteHarness.editor))[0] === 'Alpha REPLACED three', 'cross-block paste lost unselected head or tail text')
  shortcut(pasteHarness.editor)
  await delay()
  assert(JSON.stringify(await blockTexts(pasteHarness.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'cross-block paste undo was not atomic')
  shortcut(pasteHarness.editor, true)
  await delay()
  assert((await blockTexts(pasteHarness.editor))[0] === 'Alpha REPLACED three', 'cross-block paste redo failed')
  pasteHarness.editor.destroy()

  const outsideHarness = createHarness(sandbox)
  await delay()
  await activateCrossSelection(outsideHarness.editor)
  document.querySelector('#outside').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  assert(!outsideHarness.editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'outside click kept cross selection active')
  assert(outsideHarness.editor.blocks.getSelectedBlocks().length === 0, 'outside click kept block selection active')
  outsideHarness.editor.destroy()

  const duplicateFirst = createHarness(sandbox)
  const duplicateSecond = createHarness(sandbox)
  await delay()
  const duplicateStart = duplicateSecond.editor.blocks.getBlockByIndex(0).contentElement
  const duplicateEnd = duplicateSecond.editor.blocks.getBlockByIndex(1).contentElement
  const duplicateRange = document.createRange()
  duplicateRange.setStart(textNode(duplicateStart), 2)
  duplicateRange.setEnd(textNode(duplicateEnd), 3)
  const duplicateOffsets = saveCrossBlockOffsets(duplicateRange)
  assert(duplicateOffsets, 'cross-block offsets were not saved')
  const restoredDuplicateRange = restoreCrossBlockRange(null, duplicateOffsets)
  assert(restoredDuplicateRange, 'cross-block offsets were not restored')
  assert(
    duplicateSecond.editor.rootElement.contains(restoredDuplicateRange.startContainer)
      && !duplicateFirst.editor.rootElement.contains(restoredDuplicateRange.startContainer),
    'cross-block restore escaped to an editor with duplicate block IDs',
  )
  duplicateFirst.editor.destroy()
  duplicateSecond.editor.destroy()

  const multiFieldHolder = document.createElement('section')
  sandbox.appendChild(multiFieldHolder)
  const multiFieldEditor = createEditor({
    holder: multiFieldHolder,
    plugins: [new Paragraph(), new Quote()],
    inlineTools: [],
    data: {
      version: 'browser-selection',
      blocks: [
        { id: 'quote-alpha', type: 'quote', data: { text: 'First quote', caption: 'First caption' } },
        { id: 'quote-bravo', type: 'quote', data: { text: 'Second quote', caption: 'Second caption' } },
      ],
    },
  })
  const firstCaption = multiFieldEditor.blocks.getBlockByIndex(0).contentElement.querySelector('.oe-quote__caption')
  const secondCaption = multiFieldEditor.blocks.getBlockByIndex(1).contentElement.querySelector('.oe-quote__caption')
  assert(firstCaption && secondCaption, 'multi-field selection fixture is missing quote captions')
  const multiFieldRange = document.createRange()
  multiFieldRange.setStart(textNode(firstCaption), 2)
  multiFieldRange.setEnd(textNode(secondCaption), 6)
  const multiFieldOffsets = saveCrossBlockOffsets(multiFieldRange)
  assert(multiFieldOffsets?.startFieldIndex === 1 && multiFieldOffsets?.endFieldIndex === 1, 'cross-block offsets lost their editable field indexes')
  const restoredMultiFieldRange = restoreCrossBlockRange(null, multiFieldOffsets)
  assert(restoredMultiFieldRange, 'multi-field cross-block offsets were not restored')
  assert(firstCaption.contains(restoredMultiFieldRange.startContainer), 'cross-block restore moved the start into the first field')
  assert(secondCaption.contains(restoredMultiFieldRange.endContainer), 'cross-block restore moved the end into the first field')
  multiFieldEditor.destroy()

  const focusHarness = createHarness(sandbox)
  const first = focusHarness.editor.blocks.getBlockByIndex(0).contentElement
  const second = focusHarness.editor.blocks.getBlockByIndex(1).contentElement
  setCaret(first, first.textContent.length)
  assert(key(first, 'ArrowDown').defaultPrevented, 'ArrowDown did not navigate from block end')
  assert(focusHarness.editor.blocks.getCurrentIndex() === 1 && document.activeElement === second, 'ArrowDown focus target is inconsistent')
  setCaret(second, 0)
  assert(key(second, 'ArrowUp').defaultPrevented, 'ArrowUp did not navigate from block start')
  assert(focusHarness.editor.blocks.getCurrentIndex() === 0 && document.activeElement === first, 'ArrowUp focus target is inconsistent')
  const tabEvent = key(first, 'Tab')
  const shiftTabEvent = key(first, 'Tab', { shiftKey: true })
  assert(!tabEvent.defaultPrevented && !shiftTabEvent.defaultPrevented, 'Tab navigation is trapped inside the editor')
  focusHarness.editor.destroy()

  const splitHarness = createHarness(sandbox)
  const splitFirst = splitHarness.editor.blocks.getBlockByIndex(0).contentElement
  setCaret(splitFirst, 6)
  assert(key(splitFirst, 'Enter').defaultPrevented, 'Enter did not split the block')
  await delay()
  assert(splitHarness.editor.blocks.getBlockCount() === 4, 'Enter did not insert one block')
  const splitTexts = await blockTexts(splitHarness.editor)
  assert(splitTexts[0] === 'Alpha' && splitTexts[1] === 'one', 'Enter split saved stale or incorrect content')
  shortcut(splitHarness.editor)
  await delay()
  assert(JSON.stringify(await blockTexts(splitHarness.editor)) === JSON.stringify(['Alpha one', 'Bravo two', 'Charlie three']), 'Enter split undo failed')
  splitHarness.editor.destroy()

  for (const [mergeKey, currentIndex, caretOffset] of [
    ['Backspace', 1, 0],
    ['Delete', 0, 'end'],
  ]) {
    const harness = createHarness(sandbox)
    const block = harness.editor.blocks.getBlockByIndex(currentIndex).contentElement
    setCaret(block, caretOffset === 'end' ? block.textContent.length : caretOffset)
    assert(key(block, mergeKey).defaultPrevented, `${mergeKey} did not merge adjacent paragraphs`)
    await delay()
    assert(harness.editor.blocks.getBlockCount() === 2, `${mergeKey} removed an unexpected number of blocks`)
    shortcut(harness.editor)
    await delay()
    assert(harness.editor.blocks.getBlockCount() === 3, `${mergeKey} merge undo failed`)
    harness.editor.destroy()
  }

  const selectedHarness = createHarness(sandbox)
  const selectedFirst = selectedHarness.editor.blocks.getBlockByIndex(0).contentElement
  const nativeRange = document.createRange()
  nativeRange.selectNodeContents(selectedFirst)
  const nativeSelection = window.getSelection()
  nativeSelection.removeAllRanges()
  nativeSelection.addRange(nativeRange)
  selectedFirst.focus()
  const selectAllEvent = key(selectedFirst, 'a', { code: 'KeyA', ctrlKey: true })
  assert(selectAllEvent.defaultPrevented, 'second Ctrl+A did not select blocks')
  assert(selectedHarness.editor.blocks.getSelectedBlocks().length === 3, 'Ctrl+A block selection is incomplete')
  const blockCopyData = new DataTransfer()
  selectedFirst.dispatchEvent(new ClipboardEvent('copy', { clipboardData: blockCopyData, bubbles: true, cancelable: true }))
  assert(JSON.parse(blockCopyData.getData('application/x-rector-editor')).length === 3, 'whole-block copy lost internal MIME data')
  const blockCutData = new DataTransfer()
  selectedFirst.dispatchEvent(new ClipboardEvent('cut', { clipboardData: blockCutData, bubbles: true, cancelable: true }))
  await delay()
  assert(selectedHarness.editor.blocks.getBlockCount() === 1 && selectedHarness.editor.blocks.getBlockByIndex(0).isEmpty(), 'whole-block cut did not leave one empty block')
  shortcut(selectedHarness.editor)
  await delay()
  assert(selectedHarness.editor.blocks.getBlockCount() === 3, 'whole-block cut undo was not atomic')
  selectedHarness.editor.destroy()

  await delay(50)
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()
  return {
    crossBlockOperations: ['copy', 'cut', 'paste', 'Backspace', 'Delete', 'outside clear'],
    structuralKeys: ['Enter', 'Backspace merge', 'Delete merge', 'Ctrl+A'],
    focusKeys: ['ArrowUp', 'ArrowDown', 'Tab', 'Shift+Tab'],
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
