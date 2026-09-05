import { Paragraph } from '../../../plugins/paragraph/index.js'
import { Heading } from '../../../plugins/heading/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { test, make, para, equal, assert, select, key, pause } from './harness.js'

function clickable() {
  let clicks = 0
  return {
    get clicks() { return clicks },
    plugin: {
      type: 'clickable',
      createWidget(data, id = 'w_click') {
        const span = document.createElement('span')
        span.dataset.inlinePlugin = 'clickable'; span.dataset.id = id
        span.dataset.value = data.value; span.textContent = data.value
        span.contentEditable = 'false'
        return span
      },
      hydrate(span) { span.addEventListener('click', () => { clicks++ }) },
      getData(span) { return { value: span.dataset.value } },
    },
  }
}
const inline = { w_click: { type: 'clickable', data: { value: 'Widget' } } }

export function register() {
  for (const operation of ['merge', 'split', 'convert', 'insert']) {
    test(`inline widgets remain interactive after ${operation}`, () => {
      const fixture = clickable()
      const editor = make([para('a', 'AB{{w_click}}', { inline }), para('b', 'tail')], {
        plugins: [new Paragraph(), new Heading()], inlinePlugins: [fixture.plugin],
      })
      editor.rootElement.querySelector('[data-inline-plugin]').click()
      equal(fixture.clicks, 1)
      if (operation === 'merge') {
        const tail = editor.blocks.getBlockByIndex(1).contentElement
        select(tail, 0); key(tail, 'Backspace')
      } else if (operation === 'split') {
        const head = editor.blocks.getBlockByIndex(0).contentElement
        select(head, 1); key(head, 'Enter')
      } else if (operation === 'convert') editor.blocks.convert(0, 'heading')
      else editor.blocks.insert('paragraph', { text: '{{w_click}}' }, 2, 'inserted', inline)
      const widgets = editor.rootElement.querySelectorAll('.oe-block [data-inline-plugin]')
      widgets[widgets.length - 1].click()
      equal(fixture.clicks, 2, 'the current live widget must own a click handler')
    })
  }
  test('fresh inline insertion is hydrated once even when its command commits', () => {
    const fixture = clickable()
    const editor = make([para('a', 'A')], { inlinePlugins: [fixture.plugin] })
    select(editor.blocks.getBlockByIndex(0).contentElement, 1)
    editor.insertInlinePlugin('clickable', { value: 'New' })
    editor.rootElement.querySelector('[data-inline-plugin]').click()
    equal(fixture.clicks, 1, 'one click must not run duplicate handlers')
  })
  test('recreated markup is hydrated despite a serialized data-hydrated attribute', () => {
    let mutate
    class RecreatedParagraph extends Paragraph {
      render(data, ctx) { mutate = ctx.mutate; return super.render(data) }
    }
    const fixture = clickable()
    const editor = make([para('a', '{{w_click}}', { inline })], {
      plugins: [new RecreatedParagraph()], inlinePlugins: [fixture.plugin],
    })
    const element = editor.blocks.getBlockByIndex(0).contentElement
    mutate(() => { element.innerHTML = element.innerHTML })
    element.querySelector('[data-inline-plugin]').click()
    equal(fixture.clicks, 1)
  })
  test('built-in color popup still opens after merging paragraphs', async () => {
    const editor = make([
      para('a', 'A{{w_color}}', { inline: { w_color: { type: 'color', data: { value: '#123456' } } } }),
      para('b', 'B'),
    ], { inlinePlugins: [createColorSwatchPlugin()] })
    editor.rootElement.querySelector('[data-inline-plugin]').click()
    assert(editor.rootElement.querySelector('.oe-ip-popup'), 'initial popup')
    await pause()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    const tail = editor.blocks.getBlockByIndex(1).contentElement
    select(tail, 0); key(tail, 'Backspace')
    editor.rootElement.querySelector('[data-inline-plugin]').click()
    assert(editor.rootElement.querySelector('.oe-ip-popup'), 'popup after merge')
  })
}
