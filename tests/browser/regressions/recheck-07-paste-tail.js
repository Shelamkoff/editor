import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { Heading } from '../../../plugins/heading/index.js'
import { Image } from '../../../plugins/image/index.js'
import { Table } from '../../../plugins/table/index.js'
import { test, make, para, select, paste, assert, equal, texts } from './harness.js'

const formats = [
  ['plain text', { 'text/plain': 'X\nY' }],
  ['HTML', { 'text/html': '<p>X</p><p>Y</p>' }],
]

export function register() {
  for (const [format, data] of formats) {
    test(`multiline ${format} places the original suffix after the final inserted paragraph`, async () => {
      const editor = make([para('a', 'abcd'), para('b', 'Untouched')])
      const p = editor.blocks.getBlockByIndex(0).contentElement
      select(p, 2)
      await paste(p, data)
      equal(texts(editor), ['abX', 'Ycd', 'Untouched'])
      const last = editor.blocks.getBlockByIndex(1).contentElement
      const caret = window.getSelection().getRangeAt(0)
      const beforeCaret = document.createRange()
      beforeCaret.selectNodeContents(last)
      beforeCaret.setEnd(caret.startContainer, caret.startOffset)
      equal(beforeCaret.toString(), 'Y', 'caret belongs before the original suffix')
      editor.undo()
      equal(texts(editor), ['abcd', 'Untouched'])
      equal(editor.canUndo, false, 'the entire paste is one history step')
      editor.redo()
      equal(texts(editor), ['abX', 'Ycd', 'Untouched'])
    })

    test(`multiline ${format} replaces the selection without moving its suffix before the pasted content`, async () => {
      const editor = make([para('a', 'abcdef')])
      const p = editor.blocks.getBlockByIndex(0).contentElement
      select(p, 2, 4)
      await paste(p, data)
      equal(texts(editor), ['abX', 'Yef'])
    })

    test(`multiline ${format} preserves formatting and unresolved widget data in the suffix`, async () => {
      const inline = { w_missing: { type: 'missing', data: { name: 'Anna' } } }
      const editor = make([para('a', 'ab<em>cd</em>{{w_missing}}', { inline, tunes: { textAlign: 'right' } })])
      const p = editor.blocks.getBlockByIndex(0).contentElement
      select(p, 2)
      await paste(p, data)
      const blocks = editor.save().blocks
      equal(blocks[0].data.text, 'abX')
      equal(blocks[0].inline, undefined, 'moved metadata must not remain on an unreferencing block')
      equal(blocks[1].data.text, 'Y<em>cd</em>{{w_missing}}')
      equal(blocks[1].inline, inline)
      equal(blocks[1].tunes, { textAlign: 'right' })
    })

    test(`multiline ${format} uses the active quote caption rather than the plugin wrapper`, async () => {
      const editor = make([{ id: 'q', type: 'quote', data: { text: 'KEEP MAIN', caption: 'CAPTAIL' } }], {
        plugins: [new Paragraph(), new Quote()],
      })
      const caption = editor.blocks.getBlockByIndex(0).contentElement.querySelector('cite')
      select(caption, 3)
      await paste(caption, data)
      equal(editor.save().blocks.map(block => block.data), [{ text: 'KEEP MAIN', caption: 'CAPX' }, { text: 'YTAIL' }])
    })
  }

  test('HTML paste into an empty quote field leaves the other editable field and wrapper intact', async () => {
    const editor = make([{ id: 'q', type: 'quote', data: { text: '', caption: '' } }], {
      plugins: [new Paragraph(), new Quote()],
    })
    const caption = editor.blocks.getBlockByIndex(0).contentElement.querySelector('cite')
    select(caption, 0)
    await paste(caption, { 'text/html': '<p>X</p><p>Y</p>' })
    equal(editor.save().blocks.map(block => block.data), [{ text: '', caption: 'X' }, { text: 'Y' }])
    assert(editor.blocks.getBlockByIndex(0).contentElement.querySelector('blockquote'), 'quote structure must survive')
  })

  test('multiline paste from a table cell preserves unselected neighboring cells', async () => {
    const editor = make([{ id: 't', type: 'table', data: { withHeadings: false, content: [['abcd', 'NEIGHBOR']] } }], {
      plugins: [new Paragraph(), new Table()],
    })
    const cell = editor.blocks.getBlockByIndex(0).contentElement.querySelector('td')
    select(cell, 2)
    await paste(cell, { 'text/plain': 'X\nY' })
    equal(editor.save().blocks.map(block => block.data), [
      { content: [['abX', 'NEIGHBOR']], withHeadings: false }, { text: 'Ycd' },
    ])
  })

  test('a routed heading followed by a paragraph is inserted between the prefix and suffix', async () => {
    const editor = make([para('a', 'abcd')], { plugins: [new Paragraph(), new Heading()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    await paste(p, { 'text/html': '<h2>Title</h2><p>Y</p>' })
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'heading', 'paragraph'])
    equal(texts(editor), ['ab', 'Title', 'Ycd'])
  })

  test('a final routed media block keeps the original suffix in a separate paragraph', async () => {
    class TaggedImage extends Image {
      pasteConfig = { tags: ['img'] }
      onPaste(event) {
        return event.type === 'tag'
          ? super.onPaste({ type: 'pattern', data: event.element.getAttribute('src') })
          : super.onPaste(event)
      }
    }
    const editor = make([para('a', 'abcd')], { plugins: [new Paragraph(), new TaggedImage()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    await paste(p, { 'text/html': '<p>X</p><img src="https://example.test/picture.png">' })
    const blocks = editor.save().blocks
    equal(blocks.map(block => block.type), ['paragraph', 'image', 'paragraph'])
    equal(blocks[0].data.text, 'abX')
    equal(blocks[1].data.file.url, 'https://example.test/picture.png')
    equal(blocks[2].data.text, 'cd')
  })

  test('failed multiline paste restores the extracted suffix and the original document', async () => {
    class FailingParagraph extends Paragraph {
      render(data) {
        if (data?.text?.startsWith('Y')) throw new Error('deliberate final paragraph failure')
        return super.render(data)
      }
    }
    const editor = make([para('a', 'abcd')], { plugins: [new FailingParagraph()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    await paste(p, { 'text/plain': 'X\nY' })
    equal(texts(editor), ['abcd'])
    equal(editor.canUndo, false)
  })

  test('single-line paste still inserts between the original prefix and suffix', async () => {
    const editor = make([para('a', 'abcd')])
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 2)
    await paste(p, { 'text/plain': 'X' })
    equal(texts(editor), ['abXcd'])
  })
}
