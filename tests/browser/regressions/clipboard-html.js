import { Heading } from '../../../plugins/heading/index.js'
import { Quote } from '../../../plugins/quote/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, select, paste, equal, assert, texts } from './harness.js'

function copy(editor) {
  editor.blocks.selectBlocks(editor.save().blocks.map(block => block.id))
  const data = new DataTransfer()
  editor.blocks.getBlockByIndex(0).contentElement.dispatchEvent(new ClipboardEvent('copy', {
    clipboardData: data, bubbles: true, cancelable: true,
  }))
  return data
}

export function register() {
  test('HTML-only transfer preserves selected paragraph boundaries', async () => {
    const source = make([para('a', 'Alpha'), para('b', '<strong>Beta</strong>')])
    const data = copy(source)
    const target = make([para('empty', '')])
    const p = target.blocks.getBlockByIndex(0).contentElement
    select(p, 0)
    await paste(p, { 'text/html': data.getData('text/html') })
    equal(texts(target), ['Alpha', '<strong>Beta</strong>'])
    equal(data.getData('text/plain'), 'Alpha\nBeta')
  })
  test('HTML export retains heading and quotation semantics without editor attributes', () => {
    const source = make([
      { id: 'h', type: 'heading', data: { text: 'Heading', level: 2 } },
      { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Author' } },
    ], { plugins: [new Paragraph(), new Heading(), new Quote()] })
    const tpl = document.createElement('template')
    tpl.innerHTML = copy(source).getData('text/html')
    equal(tpl.content.querySelector('h2')?.textContent, 'Heading')
    equal(tpl.content.querySelector('blockquote cite')?.textContent, 'Author')
    assert(!tpl.content.querySelector('[contenteditable], [data-block-id], .oe-block'))
  })
  test('HTML export excludes plugin controls and keeps authored editable content', () => {
    const custom = {
      type: 'custom', title: 'Custom', icon: '',
      render() {
        const root = document.createElement('div')
        root.innerHTML = '<p contenteditable="true">Authored</p><button>Internal control</button><input value="secret-control">'
        return root
      },
      save() { return { text: 'Authored' } },
    }
    const source = make([{ id: 'custom', type: 'custom', data: {} }], { plugins: [custom] })
    const html = copy(source).getData('text/html')
    equal(html, '<p>Authored</p>')
  })
}
