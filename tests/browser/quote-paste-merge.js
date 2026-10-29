import { createParagraphPlugin, createQuotePlugin } from '../../plugins/index.js'
import { findNodeAtOffset, getTextOffset } from '../../shared/textOffset.js'
import { test, make, para, editorRoot, blockElement, editableField, assert, equal } from './regressions/harness.js'
import { dispatchKey } from './native-input-helpers.js'

const quote = (id, text, caption) => ({
  id, type: 'quote', dataVersion: 1, data: { text, caption }, tunes: { textAlign: 'right' },
})
const plugins = () => [createParagraphPlugin(), createQuotePlugin()]

function selectDirected(field, anchorOffset, focusOffset) {
  field.focus()
  const anchor = findNodeAtOffset(field, anchorOffset, 'start')
  const focus = findNodeAtOffset(field, focusOffset, 'end')
  const native = getSelection()
  native.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
  equal([
    getTextOffset(field, native.anchorNode, native.anchorOffset),
    getTextOffset(field, native.focusNode, native.focusOffset),
  ], [anchorOffset, focusOffset], 'The Quote fixture did not establish its directed selection')
}

function checkCaret(editor, id, fieldKey, offset, end = offset) {
  checkFieldRange(editableField(editor, id, `.oe-quote__${fieldKey}`), offset, end)
}

function checkFieldRange(field, offset, end = offset) {
  const native = getSelection()
  equal(document.activeElement, field, 'Quote action lost its author field focus')
  assert(field.contains(native.anchorNode) && field.contains(native.focusNode), 'Quote caret left the expected field')
  equal([
    getTextOffset(field, native.anchorNode, native.anchorOffset),
    getTextOffset(field, native.focusNode, native.focusOffset),
  ], [offset, end], 'Quote action changed its directed native interval')
}

function untouchedNeighbors(editor, before) {
  const prefix = blockElement(editor, 'prefix')
  const suffix = blockElement(editor, 'suffix')
  return () => {
    const blocks = editor.save().blocks
    equal(blocks.find(block => block.id === 'prefix'), before[0], 'Quote action changed its preceding neighbor')
    equal(blocks.find(block => block.id === 'suffix'), before.at(-1), 'Quote action changed its following neighbor')
    equal(blockElement(editor, 'prefix'), prefix, 'Quote action remounted its preceding neighbor')
    equal(blockElement(editor, 'suffix'), suffix, 'Quote action remounted its following neighbor')
  }
}

async function nativeHtmlClipboard(html) {
  // A controlled external clipboard producer supplies exact HTML through a
  // trusted copy event; the editor receives it through the system clipboard.
  const source = document.createElement('textarea')
  source.value = 'External Quote clipboard fixture'
  document.body.append(source)
  let copied = false
  source.addEventListener('copy', event => {
    assert(event.isTrusted, 'Quote clipboard producer did not receive native Copy')
    event.clipboardData.setData('text/html', html)
    event.clipboardData.setData('text/plain', 'Plain fallback must not replace a claimed Quote')
    event.preventDefault()
    copied = true
  }, { once: true })
  try {
    source.focus()
    source.select()
    await dispatchKey('c', 'KeyC', 67, 2)
    assert(copied, 'The system clipboard did not receive the Quote HTML')
  } finally {
    source.remove()
  }
}

for (const backwards of [false, true]) {
  test(`Quote differential: native blockquote paste preserves rich attributions and unrelated blocks / ${backwards ? 'backward' : 'forward'}`, async () => {
    const editor = make([para('prefix', '<b>Before</b>'), para('anchor', 'Anchor'), para('suffix', '<i>After</i>')], { plugins: plugins() })
    const before = editor.save().blocks
    const checkNeighbors = untouchedNeighbors(editor, before)
    await nativeHtmlClipboard(
      '<blockquote><b>Quoted</b><cite><i>First</i></cite></blockquote>'
      + '<blockquote><i>Second quote</i><footer><s>Second</s></footer></blockquote>'
      + '<blockquote><s>Third quote</s><figcaption><code>Third</code></figcaption></blockquote>',
    )
    const target = editableField(editor, 'anchor')
    selectDirected(target, backwards ? 4 : 1, backwards ? 1 : 4)
    let received = false
    editorRoot(editor).addEventListener('paste', event => {
      assert(event.isTrusted, 'Quote Paste was synthesized')
      assert(event.clipboardData.getData('text/html').includes('<blockquote>'), 'System clipboard lost the structural HTML')
      received = true
    }, { once: true })
    await dispatchKey('v', 'KeyV', 86, 2)
    assert(received, 'Native Quote Paste did not reach the editor')
    const after = editor.save().blocks
    equal(after.map(block => block.type), ['paragraph', 'paragraph', 'quote', 'quote', 'quote', 'paragraph'])
    equal(after[1], before[1], 'Structural Quote Paste replaced the selected text in its existing target')
    equal(after.slice(2, 5).map(block => block.data), [
      { text: '<b>Quoted</b>', caption: '<i>First</i>' },
      { text: '<i>Second quote</i>', caption: '<s>Second</s>' },
      { text: '<s>Third quote</s>', caption: '<code>Third</code>' },
    ])
    equal(new Set(after.map(block => block.id)).size, 6, 'Quote Paste reused an existing block ID')
    for (const block of after.slice(2, 5)) {
      equal(editableField(editor, block.id, '.oe-quote__text').innerHTML, block.data.text)
      equal(editableField(editor, block.id, '.oe-quote__caption').innerHTML, block.data.caption)
    }
    checkCaret(editor, after[4].id, 'text', 11)
    checkNeighbors()
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Quote Paste used more than one history entry')
    equal(document.activeElement, editableField(editor, 'anchor'))
    const native = getSelection()
    equal([getTextOffset(target, native.anchorNode, native.anchorOffset), getTextOffset(target, native.focusNode, native.focusOffset)], backwards ? [4, 1] : [1, 4])
    checkNeighbors()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after, 'Quote Paste Redo changed payloads or generated IDs')
    checkCaret(editor, after[4].id, 'text', 11)
    checkNeighbors()
  })
}

for (const [captionCase, leftCaption, rightCaption, mergedCaption] of [
  ['both captions', '<i>First</i>', '<s>Second</s>', '<i>First</i><br><s>Second</s>'],
  ['target caption only', '<i>First</i>', '', '<i>First</i>'],
  ['source caption only', '', '<s>Second</s>', '<s>Second</s>'],
]) {
  for (const key of ['Backspace', 'Delete']) {
    test(`Quote differential: ${key} merges compatible neighbors and replays both rich fields / ${captionCase}`, async () => {
      const editor = make([
        para('prefix', '<b>Before</b>'), quote('left', '<b>Alpha</b>', leftCaption),
        quote('right', '<i>Bravo</i>', rightCaption), para('suffix', '<i>After</i>'),
      ], { plugins: plugins() })
      const before = editor.save().blocks
      const checkNeighbors = untouchedNeighbors(editor, before)
      const backwards = key === 'Backspace'
      const captionOffset = leftCaption ? 5 : 0
      editor.blocks.focus(backwards ? 'right' : 'left', { fieldKey: backwards ? 'text' : 'caption', offset: backwards ? 0 : captionOffset })
      await dispatchKey(key, key, backwards ? 8 : 46)
      const expected = [before[0], {
        ...before[1], data: { text: '<b>Alpha</b><i>Bravo</i>', caption: mergedCaption },
      }, before[3]]
      equal(editor.save().blocks, expected, 'Quote merge lost marks, captions, target ID, tunes or neighbors')
      checkCaret(editor, 'left', 'caption', captionOffset)
      checkNeighbors()
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false, 'Quote merge used more than one history entry')
      checkCaret(editor, backwards ? 'right' : 'left', backwards ? 'text' : 'caption', backwards ? 0 : captionOffset)
      checkNeighbors()
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, expected)
      checkCaret(editor, 'left', 'caption', captionOffset)
      checkNeighbors()
    })
  }
}

for (const key of ['Backspace', 'Delete']) {
  test(`Quote differential: ${key} does not consume an incompatible neighboring Paragraph`, async () => {
    const editor = make([
      para('prefix', '<b>Before</b>'), quote('quote', '<b>Alpha</b>', '<i>Author</i>'), para('suffix', '<i>After</i>'),
    ], { plugins: plugins() })
    const before = editor.save().blocks
    const checkNeighbors = untouchedNeighbors(editor, before)
    const backwards = key === 'Backspace'
    editor.blocks.focus('quote', { fieldKey: backwards ? 'text' : 'caption', offset: backwards ? 0 : 6 })
    await dispatchKey(key, key, backwards ? 8 : 46)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    checkCaret(editor, 'quote', backwards ? 'text' : 'caption', backwards ? 0 : 6)
    checkNeighbors()
  })
}

for (const [key, id, fieldKey, offset] of [
  ['Backspace', 'right', 'caption', 0],
  ['Delete', 'left', 'text', 5],
]) {
  test(`Quote differential: ${key} at an internal field boundary does not merge entire Quotes`, async () => {
    const editor = make([
      quote('left', '<b>Alpha</b>', '<i>First</i>'), quote('right', '<i>Bravo</i>', '<s>Second</s>'),
    ], { plugins: plugins() })
    const before = editor.save().blocks
    editor.blocks.focus(id, { fieldKey, offset })
    await dispatchKey(key, key, key === 'Backspace' ? 8 : 46)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    checkCaret(editor, id, fieldKey, offset)
  })
}

for (const backwards of [false, true]) {
  test(`Quote differential: whole conversion exports rich quotation and caption with one replay / ${backwards ? 'backward' : 'forward'}`, async () => {
    const editor = make([
      para('prefix', '<b>Before</b>'), quote('quote', '<b>Alpha</b> &amp; <i>Bravo</i>', '<s>Author</s>'), para('suffix', '<i>After</i>'),
    ], { plugins: plugins() })
    const before = editor.save().blocks
    const checkNeighbors = untouchedNeighbors(editor, before)
    const caption = editableField(editor, 'quote', '.oe-quote__caption')
    selectDirected(caption, backwards ? 5 : 1, backwards ? 1 : 5)
    editor.blocks.convert('quote', { type: 'paragraph' })
    const expected = [before[0], {
      ...before[1], type: 'paragraph', dataVersion: 2, data: { text: '<b>Alpha</b> &amp; <i>Bravo</i><br><s>Author</s>' },
    }, before[2]]
    equal(editor.save().blocks, expected, 'Whole Quote conversion lost author fields, marks, target identity or tunes')
    equal(editableField(editor, 'quote').innerHTML, expected[1].data.text)
    checkNeighbors()
    // Public host conversion has no UI focus handoff. Enter the editor's
    // history scope explicitly before delivering a physical shortcut.
    editorRoot(editor).focus({ preventScroll: true })
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Whole Quote conversion used more than one history entry')
    checkCaret(editor, 'quote', 'caption', backwards ? 5 : 1, backwards ? 1 : 5)
    checkNeighbors()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, expected)
    checkNeighbors()
  })
}

for (const backwards of [false, true]) {
  test(`Quote differential: conversion imports rich Paragraph text without inventing a caption / ${backwards ? 'backward' : 'forward'}`, async () => {
    const editor = make([
      para('prefix', '<b>Before</b>'),
      para('source', '<b>Alpha</b> &amp; <i>Bravo</i>', { tunes: { textAlign: 'right' } }),
      para('suffix', '<i>After</i>'),
    ], { plugins: plugins() })
    const before = editor.save().blocks
    const checkNeighbors = untouchedNeighbors(editor, before)
    selectDirected(editableField(editor, 'source'), backwards ? 5 : 1, backwards ? 1 : 5)
    editor.blocks.convert('source', { type: 'quote' })
    const expected = [before[0], {
      ...before[1], type: 'quote', dataVersion: 1,
      data: { text: '<b>Alpha</b> &amp; <i>Bravo</i>', caption: '' },
    }, before[2]]
    equal(editor.save().blocks, expected)
    equal(editableField(editor, 'source', '.oe-quote__text').innerHTML, '<b>Alpha</b> &amp; <i>Bravo</i>')
    equal(editableField(editor, 'source', '.oe-quote__caption').innerHTML, '')
    checkNeighbors()
    editorRoot(editor).focus({ preventScroll: true })
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Conversion into Quote used more than one history entry')
    checkFieldRange(editableField(editor, 'source'), backwards ? 5 : 1, backwards ? 1 : 5)
    checkNeighbors()
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, expected)
    checkNeighbors()
  })
}
