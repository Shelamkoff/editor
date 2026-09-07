import { Paragraph, Heading, Quote, Warning, Toggle, Spoiler, List, Checklist, Image } from '../../../plugins/index.js'
import { test, make, para, key, paste, pause, assert, equal } from './harness.js'

export const iconData = { w: { type: 'empty-label-icon', data: { value: 'Important' } } }
export const iconPlugin = {
  type: 'empty-label-icon', title: 'Icon', icon: '',
  createWidget(data, id) {
    const node = document.createElement('span')
    node.dataset.inlinePlugin = this.type
    node.dataset.id = id
    node.dataset.value = data.value
    node.contentEditable = 'false'
    node.setAttribute('aria-label', data.value)
    node.style.cssText = 'display:inline-block;width:18px;height:18px;border:2px solid currentColor'
    return node
  },
  getData(node) { return { value: node.dataset.value } },
  hydrate(node) { node.addEventListener('click', () => { node.dataset.clicked = 'yes' }) },
}
export function edge(field, end = false) {
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  range.collapse(!end)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

export function register() {
  for (const action of ['Backspace', 'Delete']) {
    for (const markup of ['{{w}}', '<em>{{w}}</em>']) {
      test(`${action} merges an icon-only paragraph without losing its payload: ${markup}`, () => {
        const editor = make([para('left', 'Left'), para('right', markup, { inline: iconData })], { inlinePlugins: [iconPlugin] })
        const before = editor.save().blocks
        const field = editor.blocks.getBlockById(action === 'Backspace' ? 'right' : 'left').contentElement
        assert(editor.blocks.getBlockById('right').contentElement.querySelector('[data-inline-plugin]'), 'fixture widget is present')
        edge(field, action === 'Delete')
        assert(key(field, action).defaultPrevented, 'the merge is handled')
        const merged = editor.save().blocks
        equal(merged.map(block => block.data.text), [`Left${markup}`])
        equal(merged[0].inline, iconData)
        const widget = editor.blocks.getBlockByIndex(0).contentElement.querySelector('[data-inline-plugin]')
        widget.click()
        equal(widget.dataset.clicked, 'yes', 'merged widget remains interactive')
        editor.undo(); equal(editor.save().blocks, before)
        editor.redo(); equal(editor.save().blocks, merged)
      })
    }
  }

  for (const [Plugin, type, data] of [
    [Heading, 'heading', { text: '{{w}}', level: 2 }],
    [Quote, 'quote', { text: '', caption: '{{w}}' }],
    [Warning, 'warning', { title: '', message: '{{w}}' }],
    [Toggle, 'toggle', { title: '', content: '{{w}}', open: true }],
    [Spoiler, 'spoiler', { label: '', content: '{{w}}' }],
    [List, 'list', { style: 'unordered', items: ['{{w}}'] }],
    [Checklist, 'checklist', { items: [{ text: '{{w}}', checked: false }] }],
  ]) {
    test(`Delete cannot discard a ${type} whose only authored content is an inline widget`, () => {
      const editor = make([para('left', 'Left'), { id: 'right', type, data, inline: iconData }], {
        plugins: [new Paragraph(), new Plugin()], inlinePlugins: [iconPlugin],
      })
      const before = editor.save().blocks
      equal(before[1].inline, iconData, 'fixture round-trips an actual widget')
      const field = editor.blocks.getBlockById('left').contentElement
      edge(field, true); key(field, 'Delete')
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
    })
  }

  test('image URL paste inserts after an icon-only paragraph instead of replacing it', async () => {
    const editor = make([para('icon', '{{w}}', { inline: iconData })], { plugins: [new Paragraph(), new Image()], inlinePlugins: [iconPlugin] })
    const before = editor.save().blocks
    const field = editor.blocks.getBlockById('icon').contentElement
    edge(field, true)
    await paste(field, { 'text/plain': 'https://example.test/picture.png' })
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'image'])
    equal(editor.save().blocks[0], before[0])
    editor.undo(); equal(editor.save().blocks, before)
  })

  test('a completed image upload does not replace an unchanged icon-only paragraph', async () => {
    const editor = make([para('icon', '{{w}}', { inline: iconData })], {
      plugins: [new Paragraph(), new Image({ uploadFile: async () => ({ url: 'https://example.test/file.png' }) })], inlinePlugins: [iconPlugin],
    })
    const field = editor.blocks.getBlockById('icon').contentElement
    edge(field, true)
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File(['image'], 'file.png', { type: 'image/png' }))
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    for (let i = 0; i < 50 && editor.save().blocks.length === 1; i++) await pause(10)
    equal(editor.save().blocks.map(block => block.type), ['paragraph', 'image'])
    equal(editor.save().blocks[0].inline, iconData)
  })

  for (const text of ['', ' ', '<br>']) {
    test(`empty placeholder deletion retains its existing policy: ${JSON.stringify(text)}`, () => {
      const editor = make([para('left', 'Left'), para('right', text)])
      const before = editor.save().blocks
      const field = editor.blocks.getBlockById('left').contentElement
      edge(field, true)
      assert(key(field, 'Delete').defaultPrevented)
      equal(editor.save().blocks.map(block => block.data.text), ['Left'])
      editor.undo(); equal(editor.save().blocks, before)
    })
  }
}
