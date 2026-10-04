import { createEditor } from '../../core/index.js'
import { createListPlugin, createParagraphPlugin, createQuotePlugin, createTablePlugin } from '../../plugins/index.js'

const initialData = {
  version: '2.0.0',
  blocks: [
    { id: 'alpha', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha one' } },
    { id: 'bravo', type: 'paragraph', dataVersion: 2, data: { text: 'Bravo two' } },
    { id: 'charlie', type: 'paragraph', dataVersion: 2, data: { text: 'Charlie three' } },
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
async function activateFieldSelection(harness, start, startOffset, end, endOffset) {
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
  assert(harness.root.classList.contains('oe-editor--cross-selecting'), 'cross-field selection was not activated')
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

function snapshot(editor) {
  const { time, ...document } = editor.save()
  return JSON.stringify(document)
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
  const partialFragment = JSON.parse(copyData.getData('application/x-rector-fragment'))
  assert(partialFragment.version === 2, 'partial copy did not export current private fragment')
  assert(
    partialFragment.parts.map(part => part.kind).join(',') === 'rich-text,block,rich-text',
    'partial composite fragment shape is incorrect',
  )
  assert(partialFragment.parts[0].html.includes('one'), 'partial fragment lost first endpoint content')
  assert(partialFragment.parts[1].block.data.text === 'Bravo two', 'partial fragment lost whole middle block')
  assert(partialFragment.parts[2].html.includes('Charlie'), 'partial fragment lost last endpoint content')
  assert(!JSON.stringify(partialFragment).includes('Alpha '), 'partial fragment leaked unselected start content')
  assert(!JSON.stringify(partialFragment).includes(' three'), 'partial fragment leaked unselected end content')
  assert(copiedText.includes('one') && copiedText.includes('Bravo two') && copiedText.includes('Charlie'), 'partial copy lost selected text')
  assert(!copiedText.includes('Alpha ') && !copiedText.includes(' three'), 'partial copy included unselected text')

  const compositeTarget = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [
      { id: 'target-head', type: 'paragraph', dataVersion: 2, data: { text: 'HEAD__old' } },
      { id: 'target-middle', type: 'paragraph', dataVersion: 2, data: { text: 'REMOVE ME' } },
      { id: 'target-tail', type: 'paragraph', dataVersion: 2, data: { text: 'TAIL___suffix' } },
    ],
  })
  await activateCrossSelection(compositeTarget, 0, 6, 2, 7)
  const compositeBefore = snapshot(compositeTarget.editor)
  const compositePaste = paste(editable(compositeTarget, 0), {
    'application/x-rector-fragment': copyData.getData('application/x-rector-fragment'),
    'text/html': '<p>lossy fallback</p>',
    'text/plain': 'lossy fallback',
  })
  await delay()
  assert(compositePaste.defaultPrevented, 'composite private paste was not owned')
  assert(
    JSON.stringify(texts(compositeTarget.editor)) === JSON.stringify(['HEAD__one', 'Bravo two', 'Charliesuffix']),
    'composite private paste placed endpoint parts incorrectly',
  )
  assert(compositeTarget.editor.blocks.count === 3, 'composite private paste created extra residual blocks')
  assert(!JSON.stringify(compositeTarget.editor.save()).includes('lossy fallback'), 'composite private paste used standard fallback')
  assert(compositeTarget.editor.undo() === true, 'composite private paste is not one history step')
  await delay()
  assert(snapshot(compositeTarget.editor) === compositeBefore, 'composite private paste undo did not restore target')
  compositeTarget.editor.destroy()

  const failedCutHarness = createHarness(sandbox)
  await activateCrossSelection(failedCutHarness)
  const failedCutBefore = snapshot(failedCutHarness.editor)
  const failedCutEvent = new Event('cut', { bubbles: true, cancelable: true })
  Object.defineProperty(failedCutEvent, 'clipboardData', {
    value: {
      setData() { throw new Error('clipboard unavailable') },
      getData() { return '' },
    },
  })
  editable(failedCutHarness, 0).dispatchEvent(failedCutEvent)
  await delay()
  assert(failedCutEvent.defaultPrevented, 'failed clipboard write did not fail closed')
  assert(
    snapshot(failedCutHarness.editor) === failedCutBefore,
    'failed clipboard write deleted source selection',
  )
  failedCutHarness.editor.destroy()

  await activateCrossSelection(copy)
  const cutData = new DataTransfer()
  const cutEvent = new ClipboardEvent('cut', { clipboardData: cutData, bubbles: true, cancelable: true })
  editable(copy, 0).dispatchEvent(cutEvent)
  const cutFragment = JSON.parse(cutData.getData('application/x-rector-fragment'))
  assert(cutFragment.version === 2 && cutFragment.parts.length === 3, 'partial cut did not publish canonical private fragment')
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

  const literalCollision = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [
      {
        id: 'literal-target',
        type: 'paragraph',
        dataVersion: 2,
        data: { text: 'Target {{same}}' },
        inline: {
          same: { type: 'future-inline', dataVersion: 7, data: { owner: 'target' } },
        },
      },
      {
        id: 'literal-source',
        type: 'paragraph',
        dataVersion: 2,
        data: { text: '{{same}} literal' },
      },
    ],
  })
  const literalTarget = editable(literalCollision, 0)
  setCaret(literalTarget, literalTarget.textContent.length)
  assert(key(literalTarget, 'Delete').defaultPrevented, 'literal collision merge was not handled')
  await delay()
  let collisionSaved = literalCollision.editor.save()
  assert(collisionSaved.blocks.length === 1, 'literal collision merge did not remove source block')
  const literalMerged = collisionSaved.blocks[0]
  const literalKeys = Object.keys(literalMerged.inline ?? {})
  assert(literalKeys.length === 1, 'literal collision merge changed sidecar cardinality')
  assert(literalKeys[0] !== 'same', 'linked reference aliased author literal token')
  assert(literalMerged.data.text.includes(`{{${literalKeys[0]}}}`), 'remapped reference token is missing')
  assert(literalMerged.data.text.includes('{{same}} literal'), 'author literal token was rewritten')
  assert(literalMerged.inline[literalKeys[0]].data.owner === 'target', 'remapped opaque payload changed')
  shortcut(editable(literalCollision, 0))
  await delay()
  collisionSaved = literalCollision.editor.save()
  assert(collisionSaved.blocks.length === 2, 'literal collision merge undo was not atomic')
  assert(collisionSaved.blocks[0].inline?.same?.data.owner === 'target', 'literal collision undo did not restore original sidecar')
  shortcut(editable(literalCollision, 0), true)
  await delay()
  collisionSaved = literalCollision.editor.save()
  assert(Object.keys(collisionSaved.blocks[0].inline ?? {})[0] === literalKeys[0], 'literal collision redo changed remapped identity')
  literalCollision.editor.destroy()

  const duplicateReference = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [
      {
        id: 'duplicate-target',
        type: 'paragraph',
        dataVersion: 2,
        data: { text: 'Left {{dup}}' },
        inline: {
          dup: { type: 'future-inline', dataVersion: 7, data: { owner: 'left' } },
        },
      },
      {
        id: 'duplicate-source',
        type: 'paragraph',
        dataVersion: 2,
        data: { text: '{{dup}} Right' },
        inline: {
          dup: { type: 'future-inline', dataVersion: 7, data: { owner: 'right' } },
        },
      },
    ],
  })
  const duplicateTarget = editable(duplicateReference, 0)
  setCaret(duplicateTarget, duplicateTarget.textContent.length)
  assert(key(duplicateTarget, 'Delete').defaultPrevented, 'duplicate reference merge was not handled')
  await delay()
  const duplicateSaved = duplicateReference.editor.save().blocks[0]
  const duplicateKeys = Object.keys(duplicateSaved.inline ?? {})
  assert(duplicateKeys.length === 2, 'duplicate reference merge aliased two payloads')
  assert(duplicateKeys.includes('dup'), 'target reference identity changed without a collision need')
  const remappedDuplicate = duplicateKeys.find(id => id !== 'dup')
  assert(remappedDuplicate, 'source duplicate reference was not remapped')
  assert(duplicateSaved.inline.dup.data.owner === 'left', 'target duplicate payload changed')
  assert(duplicateSaved.inline[remappedDuplicate].data.owner === 'right', 'source duplicate payload was aliased')
  assert(duplicateSaved.data.text.includes('{{dup}}'), 'target duplicate token was lost')
  assert(duplicateSaved.data.text.includes(`{{${remappedDuplicate}}}`), 'source duplicate token was not remapped')
  duplicateReference.editor.destroy()

  const sourceClipboard = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [{
      id: 'copy-source',
      type: 'paragraph',
      dataVersion: 2,
      data: { text: 'Source {{opaque}} literal {{literal}}' },
      inline: {
        opaque: { type: 'future-inline', dataVersion: 7, data: { owner: 'source' } },
      },
    }],
  })
  const sourceField = editable(sourceClipboard, 0)
  selectAllText(sourceField)
  const partialData = new DataTransfer()
  const partialCopyEvent = new ClipboardEvent('copy', {
    clipboardData: partialData,
    bubbles: true,
    cancelable: true,
  })
  sourceField.dispatchEvent(partialCopyEvent)
  assert(partialCopyEvent.defaultPrevented, 'single-field canonical copy was not handled')
  const privateText = partialData.getData('application/x-rector-fragment')
  const privateParsed = JSON.parse(privateText)
  assert(privateParsed.version === 2 && privateParsed.parts.length === 1, 'single-field private fragment is malformed')
  assert(privateParsed.parts[0].kind === 'rich-text', 'single-field copy did not export rich-text part')
  assert(privateParsed.parts[0].inline?.opaque?.data.owner === 'source', 'single-field copy lost opaque sidecar')
  assert(privateParsed.parts[0].html.includes('{{literal}}'), 'single-field copy lost literal placeholder text')

  const targetClipboard = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [{
      id: 'copy-target',
      type: 'paragraph',
      dataVersion: 2,
      data: { text: 'Target {{opaque}} literal {{literal}} ' },
      inline: {
        opaque: { type: 'future-inline', dataVersion: 7, data: { owner: 'target' } },
      },
    }],
  })
  const targetField = editable(targetClipboard, 0)
  setCaret(targetField, targetField.textContent.length)
  const targetBefore = snapshot(targetClipboard.editor)
  const privatePaste = paste(targetField, {
    'application/x-rector-fragment': privateText,
    'text/html': '<b>lossy fallback must not be used</b>',
    'text/plain': 'lossy fallback must not be used',
  })
  await delay()
  assert(privatePaste.defaultPrevented, 'current private fragment paste was not owned')
  const privateSaved = targetClipboard.editor.save().blocks[0]
  const owners = Object.entries(privateSaved.inline ?? {}).map(([id, ref]) => [id, ref.data.owner])
  assert(owners.some(([id, owner]) => id === 'opaque' && owner === 'target'), 'target inline identity was overwritten')
  const sourceEntry = owners.find(([, owner]) => owner === 'source')
  assert(sourceEntry && sourceEntry[0] !== 'opaque', 'source inline collision was not remapped')
  assert(privateSaved.data.text.includes(`{{${sourceEntry[0]}}}`), 'remapped source reference token is missing')
  assert(privateSaved.data.text.includes('{{literal}}'), 'literal placeholder text was rewritten during paste')
  assert(!privateSaved.data.text.includes('lossy fallback'), 'standard fallback won over valid private MIME')
  assert(targetClipboard.editor.undo() === true, 'private rich-text paste is not undoable')
  await delay()
  assert(snapshot(targetClipboard.editor) === targetBefore, 'private rich-text paste undo did not restore target')

  setCaret(targetField, targetField.textContent.length)
  const invalidBefore = snapshot(targetClipboard.editor)
  const invalidPrivate = paste(targetField, {
    'application/x-rector-fragment': JSON.stringify({
      version: 1,
      parts: [{ kind: 'rich-text', html: 'old' }],
    }),
    'text/html': '<p>fallback html</p>',
    'text/plain': 'fallback text',
  })
  await delay()
  assert(invalidPrivate.defaultPrevented, 'invalid private MIME was not rejected explicitly')
  assert(snapshot(targetClipboard.editor) === invalidBefore, 'invalid private MIME fell back to standard representations')

  sourceClipboard.editor.destroy()
  targetClipboard.editor.destroy()

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
  const internal = JSON.parse(wholeCopy.getData('application/x-rector-fragment'))
  assert(internal.version === 2 && internal.parts.length === 3, 'whole-block copy lost current private fragment')
  assert(internal.parts.every(part => part.kind === 'block'), 'whole-block fragment contains non-block parts')
  assert(internal.parts.every(part => !Object.hasOwn(part.block, 'id') && !Object.hasOwn(part.block, 'revision')), 'whole-block fragment leaked producer identity')
  const wholeCut = new DataTransfer()
  allFirst.dispatchEvent(new ClipboardEvent('cut', { clipboardData: wholeCut, bubbles: true, cancelable: true }))
  await delay()
  assert(all.editor.blocks.count === 1 && texts(all.editor)[0] === '', 'whole-block cut did not leave one empty default block')
  shortcut(editable(all, 0))
  await delay()
  assert(all.editor.blocks.count === 3, 'whole-block cut undo was not atomic')
  all.editor.destroy()

  const quoteClipboardSource = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [{
      id: 'quote-source',
      type: 'quote',
      dataVersion: 1,
      data: { text: 'First quote', caption: 'First caption' },
    }],
  }, [createParagraphPlugin({ injectStyles: false }), createQuotePlugin()])
  const quoteSourceText = editable(quoteClipboardSource, 0, '.oe-quote__text')
  const quoteSourceCaption = editable(quoteClipboardSource, 0, '.oe-quote__caption')
  await activateFieldSelection(quoteClipboardSource, quoteSourceText, 2, quoteSourceCaption, 5)
  const quoteCopyData = new DataTransfer()
  quoteSourceText.dispatchEvent(new ClipboardEvent('copy', {
    clipboardData: quoteCopyData, bubbles: true, cancelable: true,
  }))
  const quoteFragment = JSON.parse(quoteCopyData.getData('application/x-rector-fragment'))
  const quotePart = quoteFragment.parts[0]?.block
  assert(
    quoteFragment.version === 2 && quoteFragment.parts.length === 1
      && quoteFragment.parts[0].kind === 'block'
      && quotePart?.type === 'quote',
    'quote clipboard capability did not export one structured block part',
  )
  assert(
    quotePart.data.text === 'rst quote' && quotePart.data.caption === 'First',
    'quote clipboard capability exported the wrong selected fields',
  )

  const quoteCutData = new DataTransfer()
  quoteSourceText.dispatchEvent(new ClipboardEvent('cut', {
    clipboardData: quoteCutData, bubbles: true, cancelable: true,
  }))
  await delay()
  let quoteCutSaved = quoteClipboardSource.editor.save()
  assert(quoteCutSaved.blocks.length === 1, 'same-block multi-field cut split the source block')
  assert(quoteCutSaved.blocks[0].data.text === 'Fi', 'same-block cut lost text prefix')
  assert(quoteCutSaved.blocks[0].data.caption === ' caption', 'same-block cut lost caption suffix')
  assert(quoteClipboardSource.editor.undo() === true, 'same-block multi-field cut is not one history step')
  await delay()
  quoteCutSaved = quoteClipboardSource.editor.save()
  assert(quoteCutSaved.blocks[0].data.text === 'First quote' && quoteCutSaved.blocks[0].data.caption === 'First caption', 'same-block cut undo failed')

  const quoteClipboardTarget = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [{
      id: 'quote-target',
      type: 'quote',
      dataVersion: 1,
      data: { text: 'AAold', caption: 'oldZZ' },
    }],
  }, [createParagraphPlugin({ injectStyles: false }), createQuotePlugin()])
  const quoteTargetText = editable(quoteClipboardTarget, 0, '.oe-quote__text')
  const quoteTargetCaption = editable(quoteClipboardTarget, 0, '.oe-quote__caption')
  await activateFieldSelection(quoteClipboardTarget, quoteTargetText, 2, quoteTargetCaption, 3)
  const quoteTargetBefore = snapshot(quoteClipboardTarget.editor)
  const quotePaste = paste(quoteTargetText, {
    'application/x-rector-fragment': quoteCopyData.getData('application/x-rector-fragment'),
    'text/plain': 'fallback must not win',
  })
  await delay()
  assert(quotePaste.defaultPrevented, 'same-block private fragment paste was not owned')
  const quotePasted = quoteClipboardTarget.editor.save()
  assert(quotePasted.blocks.length === 2, 'structured quote fragment placement did not preserve target remaining')
  assert(
    quotePasted.blocks[0].type === 'quote'
      && quotePasted.blocks[0].data.text === 'AA'
      && quotePasted.blocks[0].data.caption === 'ZZ',
    'quote target remaining diverged from clipboard capability',
  )
  assert(
    quotePasted.blocks[1].type === 'quote'
      && quotePasted.blocks[1].data.text === 'rst quote'
      && quotePasted.blocks[1].data.caption === 'First',
    'structured quote fragment was not inserted as one block',
  )
  assert(quoteClipboardTarget.editor.undo() === true, 'same-block private paste is not one history step')
  await delay()
  assert(snapshot(quoteClipboardTarget.editor) === quoteTargetBefore, 'same-block private paste undo failed')
  quoteClipboardSource.editor.destroy()
  quoteClipboardTarget.editor.destroy()

  const listClipboard=createHarness(sandbox,{
    version:'2.0.0',
    blocks:[{
      id:'list-clipboard',
      type:'list',
      dataVersion:2,
      data:{
        style:'ordered',
        items:[
          {id:'i1',text:'Alpha'},
          {id:'i2',text:'Bravo'},
          {id:'i3',text:'Charlie'},
        ],
      },
    }],
  },[createParagraphPlugin({injectStyles:false}),createListPlugin()])
  const listFields=[...blockRoot(listClipboard,0).querySelectorAll('.oe-list__item')]
  assert(listFields.length===3,'list clipboard fixture fields are missing')
  await activateFieldSelection(listClipboard,listFields[0],2,listFields[1],2)
  const listCopyData=new DataTransfer()
  listFields[0].dispatchEvent(new ClipboardEvent('copy',{
    clipboardData:listCopyData,bubbles:true,cancelable:true,
  }))
  const listFragment=JSON.parse(listCopyData.getData('application/x-rector-fragment'))
  assert(listFragment.version===2&&listFragment.parts.length===1,'list copy fragment is malformed')
  assert(listFragment.parts[0].kind==='block'&&listFragment.parts[0].block.type==='list','list selection did not export local block part')
  assert(listFragment.parts[0].block.data.style==='ordered','list style was lost from clipboard slice')
  assert(
    JSON.stringify(listFragment.parts[0].block.data.items.map(item=>item.text))===JSON.stringify(['pha','Br']),
    'list selected slices are incorrect',
  )

  const listCutData=new DataTransfer()
  listFields[0].dispatchEvent(new ClipboardEvent('cut',{
    clipboardData:listCutData,bubbles:true,cancelable:true,
  }))
  await delay()
  let listSaved=listClipboard.editor.save().blocks[0]
  assert(
    JSON.stringify(listSaved.data.items.map(item=>item.text))===JSON.stringify(['Al','avo','Charlie']),
    'list cut remaining diverged from exported slice',
  )
  assert(listClipboard.editor.undo()===true,'list clipboard cut is not undoable')
  await delay()
  listSaved=listClipboard.editor.save().blocks[0]
  assert(
    JSON.stringify(listSaved.data.items.map(item=>item.text))===JSON.stringify(['Alpha','Bravo','Charlie']),
    'list cut undo did not restore source',
  )
  listClipboard.editor.destroy()

  const tableClipboard=createHarness(sandbox,{
    version:'2.0.0',
    blocks:[{
      id:'table-clipboard',
      type:'table',
      dataVersion:2,
      data:{
        withHeadings:true,
        rows:[
          {id:'r1',cells:[{id:'c11',text:'A1'},{id:'c12',text:'A2'}]},
          {id:'r2',cells:[{id:'c21',text:'B1'},{id:'c22',text:'B2'}]},
        ],
      },
    }],
  },[createParagraphPlugin({injectStyles:false}),createTablePlugin()])
  const tableFields=[...blockRoot(tableClipboard,0).querySelectorAll('.oe-table__cell')]
  assert(tableFields.length===4,'table clipboard fixture cells are missing')
  await activateFieldSelection(
    tableClipboard,
    tableFields[0],0,
    tableFields[3],tableFields[3].textContent.length,
  )
  const tableCopyData=new DataTransfer()
  tableFields[0].dispatchEvent(new ClipboardEvent('copy',{
    clipboardData:tableCopyData,bubbles:true,cancelable:true,
  }))
  const tableFragment=JSON.parse(tableCopyData.getData('application/x-rector-fragment'))
  const tablePart=tableFragment.parts[0]?.block
  assert(tablePart?.type==='table','table selection did not export local block part')
  assert(tablePart.data.withHeadings===true,'table heading flag was lost')
  assert(tablePart.data.rows.length===2&&tablePart.data.rows.every(row=>row.cells.length===2),'table clipboard rectangle is incorrect')
  assert(
    JSON.stringify(tablePart.data.rows.flatMap(row=>row.cells.map(cell=>cell.text)))
      ===JSON.stringify(['A1','A2','B1','B2']),
    'table selected cell values are incorrect',
  )

  const tableCutData=new DataTransfer()
  tableFields[0].dispatchEvent(new ClipboardEvent('cut',{
    clipboardData:tableCutData,bubbles:true,cancelable:true,
  }))
  await delay()
  let tableSaved=tableClipboard.editor.save().blocks[0]
  assert(
    tableSaved.type==='table'
      &&tableSaved.data.rows.flatMap(row=>row.cells).every(cell=>cell.text===''),
    'table cut did not preserve grid while clearing selected intervals',
  )
  assert(tableClipboard.editor.undo()===true,'table clipboard cut is not undoable')
  await delay()
  tableSaved=tableClipboard.editor.save().blocks[0]
  assert(tableSaved.data.rows[1].cells[1].text==='B2','table cut undo did not restore source')
  tableClipboard.editor.destroy()

  const multi = createHarness(sandbox, {
    version: '2.0.0',
    blocks: [
      { id: 'quote-alpha', type: 'quote', dataVersion: 1, data: { text: 'First quote', caption: 'First caption' } },
      { id: 'quote-bravo', type: 'quote', dataVersion: 1, data: { text: 'Second quote', caption: 'Second caption' } },
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
    crossBlockOperations: ['copy', 'cut', 'paste', 'private rich-text roundtrip', 'Backspace', 'Delete', 'outside clear'],
    structuralKeys: ['Enter', 'Backspace merge', 'Delete merge', 'inline collision merge', 'Ctrl+A'],
    focusKeys: ['ArrowUp', 'ArrowDown', 'Tab', 'Shift+Tab'],
    multiField: ['selection', 'list clipboard slice', 'table clipboard slice'],
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
