import { Paragraph, Image } from '../../../plugins/index.js'
import { test, make, para, select, paste, assert, equal, pause } from './harness.js'

function selection(editor, mode) {
  const a = editor.blocks.getBlockById('a').contentElement
  const b = editor.blocks.getBlockById('b').contentElement
  select(a, 2, 4)
  if (mode !== 'single') {
    const range = document.createRange(); range.setStart(a.firstChild, 2); range.setEnd(b.firstChild, 3)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    if (mode === 'whole') editor.blocks.selectBlocks(['a', 'b'])
  }
  return a
}
export function register() {
  const loads = [
    ['empty', {}], ['only LF', { 'text/plain': '\n\n' }], ['only CRLF', { 'text/plain': '\r\n\r\n' }],
    ['empty internal array', { 'application/x-rector-editor': '[]' }],
    ['invalid internal JSON', { 'application/x-rector-editor': '{' }],
    ['only HTML metadata', { 'text/html': '<meta charset="utf-8">' }],
  ]
  for (const mode of ['single', 'cross', 'whole']) for (const [label, values] of loads) {
    test(`${label} paste leaves ${mode} selection, data, revision and history unchanged`, async () => {
      let changed = 0
      const editor = make([para('a', 'Alpha', { revision: 'v1' }), para('b', 'Bravo'), para('c', 'Safe')])
      editor.events.on('editor:changed', () => changed++)
      const p = selection(editor, mode); const before = editor.save().blocks
      const native = window.getSelection().getRangeAt(0).cloneRange()
      await paste(p, values)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false); equal(changed, 0)
      const current = window.getSelection().getRangeAt(0)
      assert(current.startContainer === native.startContainer && current.startOffset === native.startOffset)
      assert(current.endContainer === native.endContainer && current.endOffset === native.endOffset)
      if (mode === 'whole') equal(editor.blocks.getSelectedBlocks().map(b => b.id), ['a', 'b'])
    })
  }
  test('unusable HTML uses plain text fallback before replacing a cross-block selection', async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')]); const p = selection(editor, 'cross')
    await paste(p, { 'text/html': '<meta charset="utf-8">', 'text/plain': 'Fallback' })
    equal(editor.save().blocks.map(b => b.data.text), ['AlFallbackvo'])
    editor.undo(); equal(editor.save().blocks.map(b => b.data.text), ['Alpha', 'Bravo']); equal(editor.canUndo, false)
  })
  test('a rejected routed HTML payload falls back without creating an empty block', async () => {
    class Declines extends Paragraph { type = 'declines'; pasteConfig = { tags: ['hr'] }; onPaste() { return null } }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new Declines()] })
    const p = selection(editor, 'cross')
    await paste(p, { 'text/html': '<hr>', 'text/plain': 'X' })
    equal(editor.save().blocks.map(b => b.data.text), ['AlXvo'])
  })
  test('non-text routed content is still a usable paste and its parser runs once', async () => {
    let parsed = 0
    class TaggedImage extends Image {
      pasteConfig = { tags: ['img'] }
      onPaste(event) { parsed++; return { file: { url: event.element.getAttribute('src') }, caption: '' } }
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { plugins: [new Paragraph(), new TaggedImage()] })
    const p = selection(editor, 'cross')
    await paste(p, { 'text/html': '<img src="https://example.test/picture.png">' })
    equal(parsed, 1)
    const image = editor.save().blocks.find(b => b.type === 'image'); assert(image)
    equal(image.data.file.url, 'https://example.test/picture.png')
    editor.undo(); equal(editor.save().blocks.map(b => b.data.text), ['Alpha', 'Bravo'])
  })
  test('plain whitespace is authored text, not an empty clipboard', async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')]); const p = selection(editor, 'cross')
    await paste(p, { 'text/plain': ' ' }); equal(editor.save().blocks.map(b => b.data.text), ['Al vo'])
  })
}

export function registerNative() {
  test('native newline-only Ctrl+V leaves the entire cross-block selection intact', async () => {
    const { copyTestText, nativeClipboardShortcut } = await import('./nativeClipboard.js')
    await copyTestText('\n\n')
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')]); selection(editor, 'cross')
    let pastes = 0, pasted
    editor.rootElement.addEventListener('paste', event => { pastes++; pasted = event.clipboardData.getData('text/plain') }, { once: true })
    await nativeClipboardShortcut('v', 86)
    equal(pastes, 1); equal(pasted, '\n\n')
    equal(editor.save().blocks.map(b => b.data.text), ['Alpha', 'Bravo']); equal(editor.canUndo, false)
  })
}
