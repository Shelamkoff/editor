import { test, make, para, equal, input } from './harness.js'

export function register() {
const unknown = { w_unknown: { type: 'unavailable', data: { id: '42', name: 'Anna' } } }
test('opening a document without its inline plugin preserves referenced widget data', () => {
  const document = [para('a', 'Hello {{w_unknown}}', { inline: unknown })]
  const editor = make(document)
  equal(editor.save().blocks[0].inline, unknown)
  editor.render(editor.save())
  equal(editor.save().blocks[0].inline, unknown)
  equal(document[0].inline, unknown, 'the caller still owns its data')
})
test('deleting an unresolved inline token removes its data on save', () => {
  const editor = make([para('a', '{{w_unknown}}', { inline: unknown })])
  equal(editor.save().blocks[0].inline, unknown)
  input(editor.blocks.getBlockByIndex(0).contentElement, 'Removed')
  equal(editor.save().blocks[0].inline, undefined)
})
test('tokens in attributes do not keep otherwise unused widget data alive', () => {
  const editor = make([para('a', '<a href="/{{w_unknown}}">Link</a>', { inline: unknown })])
  equal(editor.save().blocks[0].inline, undefined)
})
test('an unresolved token and a registered widget retain independent data', () => {
  const plugin = {
    type: 'known',
    createWidget(data, id) {
      const span = document.createElement('span')
      span.dataset.inlinePlugin = 'known'; span.dataset.id = id
      span.dataset.value = data.value; span.textContent = data.value
      return span
    },
    hydrate() {},
    getData(span) { return { value: span.dataset.value } },
  }
  const inline = { ...unknown, w_known: { type: 'known', data: { value: 'Bob' } } }
  const editor = make([para('a', '{{w_unknown}} {{w_known}}', { inline })], { inlinePlugins: [plugin] })
  equal(editor.save().blocks[0].inline, inline)
  input(editor.blocks.getBlockByIndex(0).contentElement, '{{w_unknown}}')
  equal(editor.save().blocks[0].inline, unknown)
})

}
