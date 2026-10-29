import { createLinkPreviewPlugin } from '../../plugins/link-preview/index.js'
import { test, make, blockElement, assert, equal, pause } from './regressions/harness.js'
import { printable, dispatchKey } from './native-input-helpers.js'

for (const populated of [false, true]) test(`LinkPreview native URL typing preserves visible card and exact Undo/Redo from ${populated ? 'populated data' : 'the actual default'}`, async () => {
  const definition = createLinkPreviewPlugin(), defaults = { url: '', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion' }
  const initial = populated ? { ...defaults, url: 'https://example.test/story', title: 'Original title',
    description: 'Original description', domain: 'display.example', template: 'horizontal' } : defaults
  const editor = make(populated ? [{ id: 'link', type: 'linkPreview', dataVersion: 1, data: initial }] : [],
    { plugins: [definition], defaultBlock: 'linkPreview', inlineTools: [], ...(!populated ? { data: undefined } : {}) })
  try {
    const before = editor.save().blocks, id = before[0].id, root = blockElement(editor, id), input = root.querySelector('.oe-lp__url-input')
    const inputs = [], transactions = []
    input.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType }))
    editor.on('transaction:committed', event => transactions.push(event))
    equal(before[0].data, initial)
    const check = data => {
      equal(input.value, data.url)
      const card = root.querySelector('.oe-lp__card')
      equal({ hidden: card.hidden, href: card.getAttribute('href'), title: card.querySelector('.oe-lp__title').textContent,
        description: card.querySelector('.oe-lp__desc').textContent },
      { hidden: !data.url, href: data.url || null, title: data.title || data.url, description: data.description })
      assert(blockElement(editor, id) === root && root.querySelector('.oe-lp__url-input') === input)
    }
    check(initial)
    assert(editor.blocks.focus(id, { fieldKey: 'url', offset: 'end' }))
    const url = populated ? initial.url + 'X' : 'https://example.test/roundtrip'
    const appended = populated ? 'X' : url
    for (const character of appended) await printable(character)
    await pause(650)
    const after = structuredClone(before); after[0].data = { ...defaults, url, domain: 'example.test', template: initial.template }
    equal(editor.save().blocks, after); check(after[0].data)
    equal(inputs, [...appended].map(() => ({ trusted: true, type: 'insertText' })))
    const inputTransactions = transactions.length
    assert(inputTransactions > 0)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before); check(initial)
    equal([input.selectionStart, input.selectionEnd], [initial.url.length, initial.url.length])
    assert(!editor.canUndo && editor.canRedo)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after); check(after[0].data)
    equal([input.selectionStart, input.selectionEnd], [url.length, url.length])
    assert(editor.canUndo && !editor.canRedo)
    equal(transactions.length, inputTransactions + 2)
  } finally { editor.destroy() }
})

test('LinkPreview native URL submission yields to a successor authored by old metadata cancellation', async () => {
  const requests = [], originalUrl = 'https://old.example/start'
  let editor, cancelled = 0
  const definition = createLinkPreviewPlugin({ fetchMeta(url, { signal }) {
    requests.push(url)
    if (url === originalUrl) signal.addEventListener('abort', () => {
      cancelled++
      editor.blocks.update('link', current => ({ data: { ...current.data,
        url: 'https://successor.example/final', title: 'Successor', description: 'Owned by successor', domain: 'successor.example',
      } }))
    }, { once: true })
    return new Promise(() => {})
  } })
  editor = make([{ id: 'link', type: 'linkPreview', dataVersion: 1,
    data: { ...definition.schema.createDefault(), url: originalUrl, domain: 'old.example' } }],
  { plugins: [definition], defaultBlock: 'linkPreview', inlineTools: [] })
  try {
    await pause(40)
    equal(requests, [originalUrl])
    assert(editor.blocks.focus('link', { fieldKey: 'url', offset: 'end' }))
    await printable('X')
    await pause(650)
    equal(cancelled, 1)
    const saved = editor.save().blocks[0].data
    equal([saved.url, saved.title, saved.description], ['https://successor.example/final', 'Successor', 'Owned by successor'])
    const root = blockElement(editor, 'link')
    equal({ url: root.querySelector('.oe-lp__url-input').value,
      href: root.querySelector('.oe-lp__card').getAttribute('href'),
      title: root.querySelector('.oe-lp__title').textContent,
      description: root.querySelector('.oe-lp__desc').textContent,
    }, { url: saved.url, href: saved.url, title: saved.title, description: saved.description })
    equal(requests, [originalUrl], 'Retired submission must not request metadata for its superseded URL')
  } finally { editor.destroy() }
})

test('LinkPreview read-only input and a retired URL timer cannot author data or fetch metadata', async () => {
  const requests = [], definition = createLinkPreviewPlugin({ fetchMeta: async url => { requests.push(url); return {} } })
  const initial = { id: 'link', type: 'linkPreview', dataVersion: 1,
    data: { ...definition.schema.createDefault(), url: 'https://example.test/original', title: 'Original', domain: 'example.test' } }
  const options = { plugins: [definition], defaultBlock: 'linkPreview', inlineTools: [] }
  const editor = make([initial], options)
  let successor
  try {
    const before = editor.save().blocks, input = blockElement(editor, 'link').querySelector('.oe-lp__url-input')
    editor.setReadOnly(true)
    input.focus(); assert(document.activeElement === input)
    await printable('X')
    equal(input.value, initial.data.url); equal(editor.save().blocks, before)
    assert(!editor.canUndo)
    editor.setReadOnly(false)
    assert(editor.blocks.focus('link', { fieldKey: 'url', offset: 'end' }))
    await printable('X')
    equal(editor.save().blocks[0].data.url, initial.data.url + 'X')
    editor.destroy()
    successor = make([initial], options)
    const accepted = successor.save().blocks
    input.value = 'https://retired.example/blocked'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'blocked' }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await pause(650)
    equal(requests, [], 'Read-only input, canceled debounce and retired controls cannot request metadata')
    equal(successor.save().blocks, accepted)
    equal(blockElement(successor, 'link').querySelector('.oe-lp__url-input').value, initial.data.url)
    assert(!successor.canUndo)
  } finally { editor.destroy(); successor?.destroy() }
})

test('LinkPreview same-URL resubmission cannot fetch a URL superseded by metadata cancellation', async () => {
  const requests = [], originalUrl = 'https://old.example/start'
  let editor
  const definition = createLinkPreviewPlugin({ fetchMeta(url, { signal }) {
    requests.push(url)
    if (url === originalUrl && requests.length === 1) signal.addEventListener('abort', () => {
      editor.blocks.update('link', current => ({ data: { ...current.data,
        url: 'https://successor.example/final', title: 'Successor', domain: 'successor.example',
      } }))
    }, { once: true })
    return new Promise(() => {})
  } })
  editor = make([{ id: 'link', type: 'linkPreview', dataVersion: 1,
    data: { ...definition.schema.createDefault(), url: originalUrl, domain: 'old.example' } }],
  { plugins: [definition], defaultBlock: 'linkPreview', inlineTools: [] })
  try {
    await pause(40)
    equal(requests, [originalUrl])
    assert(editor.blocks.focus('link', { fieldKey: 'url', offset: 'end' }))
    await dispatchKey('Enter', 'Enter', 13)
    equal(editor.save().blocks[0].data.url, 'https://successor.example/final')
    equal(blockElement(editor, 'link').querySelector('.oe-lp__card').getAttribute('href'), 'https://successor.example/final')
    equal(requests, [originalUrl], 'The metadata snapshot must still belong to the submitted URL')
  } finally { editor.destroy() }
})
