import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, para, select, pause, assert, equal, expectError } from './harness.js'
import { selectAcross } from './cross-input-fixture.js'
import { nativeClipboardShortcut } from './nativeClipboard.js'

const fragmentType = 'application/x-rector-fragment'
const reference = { type: 'missing', data: { name: 'KEEP', nested: { value: 42 } } }
function fixture(backwards = false, stored = false) {
  const editor = make([
    para('a', 'A{{w}}Z', { inline: { w: reference, unused: { type: 'missing', data: { name: 'NO' } } } }),
    para('b', 'Bravo'),
  ])
  const a = editor.blocks.getBlockById('a').contentElement
  const b = editor.blocks.getBlockById('b').contentElement
  if (stored) selectAcross(editor, a, 1, b, 2, backwards)
  else {
    a.focus()
    window.getSelection().setBaseAndExtent(backwards ? b.firstChild : a.firstChild, backwards ? 2 : 1,
      backwards ? a.firstChild : b.firstChild, backwards ? 1 : 2)
  }
  return { editor, field: backwards && stored ? b : a }
}
function copy(field, action, data = new DataTransfer()) {
  const event = new ClipboardEvent(action, { bubbles: true, cancelable: true, clipboardData: data })
  field.dispatchEvent(event)
  assert(event.defaultPrevented, 'editor must own the fragment transfer')
  return data
}
async function receive(data, recipient = make([para('target', '')])) {
  const field = recipient.blocks.getBlockByIndex(0).contentElement
  select(field, 0)
  field.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  await pause(20)
  return recipient
}
function payloads(editor) { return editor.save().blocks.flatMap(block => Object.values(block.inline ?? {})) }
function labelled(editor) {
  return editor.save().blocks.map(block => block.data.text.replace(/\{\{([\w-]+)\}\}/g,
    (token, id) => block.inline?.[id] ? `[${block.inline[id].data.name ?? block.inline[id].data.value}]` : token))
}

export function register() {
  for (const backwards of [false, true]) for (const action of ['copy', 'cut']) {
    test(`partial ${backwards ? 'backward' : 'forward'} ${action} transfers opaque inline data and only selected text`, async () => {
      const { editor, field } = fixture(backwards, true)
      const before = editor.save().blocks
      const clipboard = copy(field, action)
      equal(clipboard.getData('text/plain'), '{{w}}ZBr')
      const recipient = await receive(clipboard)
      equal(labelled(recipient), ['[KEEP]Z', 'Br'])
      equal(payloads(recipient), [reference], 'unreferenced metadata must not be exported')
      if (action === 'copy') equal(editor.save().blocks, before)
      else {
        equal(labelled(editor), ['Aavo'])
        editor.undo(); equal(editor.save().blocks, before)
        editor.redo(); equal(labelled(editor), ['Aavo'])
      }
      recipient.undo(); equal(labelled(recipient), [''])
      equal(recipient.canUndo, false, 'fragment insertion is one history operation')
      recipient.redo(); equal(payloads(recipient), [reference])
    })
  }

  test('fragment transfer disambiguates the same inline ID from different blocks and literal lookalikes', async () => {
    const editor = make([
      para('a', 'A{{w}}Z', { inline: { w: { type: 'missing', data: { name: 'LEFT' } } } }),
      para('b', '{{w}}', { inline: { w: { type: 'missing', data: { name: 'RIGHT' } } } }),
      para('c', '{{w}}End'),
    ])
    const a = editor.blocks.getBlockById('a').contentElement
    const c = editor.blocks.getBlockById('c').contentElement
    a.focus(); const range = document.createRange(); range.setStart(a.firstChild, 1); range.setEnd(c.firstChild, 5)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    const recipient = await receive(copy(a, 'copy'))
    equal(labelled(recipient), ['[LEFT]Z', '[RIGHT]', '{{w}}'])
    equal(payloads(recipient).map(ref => ref.data.name), ['LEFT', 'RIGHT'])
    equal(editor.save().blocks[0].inline.w.data.name, 'LEFT', 'source metadata is not renamed or mutated')
  })

  test('opaque fragment paste keeps destination metadata, prefix and suffix', async () => {
    const { field } = fixture()
    const data = copy(field, 'copy')
    const recipient = make([para('target', '{{w}}TAIL', { inline: { w: { type: 'missing', data: { name: 'DEST' } } } })])
    const p = recipient.blocks.getBlockByIndex(0).contentElement
    select(p, 5)
    p.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
    await pause(20)
    equal(labelled(recipient), ['[DEST][KEEP]Z', 'BrTAIL'])
    equal(payloads(recipient).map(ref => ref.data.name).sort(), ['DEST', 'KEEP'])
  })

  test('recipient with a newly registered inline plugin hydrates the pasted fragment', async () => {
    const { field } = fixture()
    let clicks = 0
    const plugin = {
      type: 'missing',
      createWidget(data, id) { const span = document.createElement('span'); span.dataset.inlinePlugin = 'missing'; span.dataset.id = id; span.dataset.value = JSON.stringify(data); span.contentEditable = 'false'; span.textContent = data.name; return span },
      getData(element) { return JSON.parse(element.dataset.value) },
      hydrate(element) { element.addEventListener('click', () => { clicks++ }) },
    }
    const recipient = await receive(copy(field, 'copy'), make([para('target', '')], { inlinePlugins: [plugin] }))
    const widget = recipient.rootElement.querySelector('[data-inline-plugin="missing"]')
    assert(widget, 'the receiver must expand the preserved reference')
    widget.click(); equal(clicks, 1)
    equal(payloads(recipient), [reference])
  })

  test('Cut keeps the source when the required fragment write throws', () => {
    const { editor, field } = fixture()
    const before = editor.save().blocks
    const data = new DataTransfer(), set = data.setData.bind(data)
    let attempted = false
    Object.defineProperty(data, 'setData', { value(type, value) {
      if (type === fragmentType) { attempted = true; throw new Error('intentional fragment refusal') }
      set(type, value)
    } })
    expectError(/intentional fragment refusal/)
    copy(field, 'cut', data)
    assert(attempted, 'the required payload must actually be attempted')
    equal(editor.save().blocks, before); equal(editor.canUndo, false)
  })

  test('Cut keeps the source when the required fragment write is silently discarded', () => {
    const { editor, field } = fixture()
    const before = editor.save().blocks
    const data = new DataTransfer(), set = data.setData.bind(data)
    let attempted = false
    Object.defineProperty(data, 'setData', { value(type, value) {
      if (type === fragmentType) attempted = true
      else set(type, value)
    } })
    copy(field, 'cut', data)
    assert(attempted)
    equal(editor.save().blocks, before); equal(editor.canUndo, false)
  })

  test('opaque keyboard Cut delegates to a native event rather than a lossy async text write', async () => {
    const { editor, field } = fixture(false, true)
    const before = editor.save().blocks
    let writes = 0
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { writes++ } } })
    try {
      const event = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', ctrlKey: true, bubbles: true, cancelable: true })
      field.dispatchEvent(event); await pause(20)
      equal(writes, 0, 'plain text is not a faithful copy of an opaque reference')
      assert(!event.defaultPrevented, 'the native clipboard event must remain available')
      equal(editor.save().blocks, before)
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete navigator.clipboard
    }
  })

  test('fragment insertion rollback preserves the destination on validation failure', async () => {
    const { field } = fixture()
    class Reject extends Paragraph { validate(data) { return !data.text.includes('Z') } }
    const recipient = make([para('target', 'SAFE')], { plugins: [new Reject()], validationMode: 'strict' })
    const before = recipient.save().blocks
    await receive(copy(field, 'copy'), recipient)
    equal(recipient.save().blocks, before)
    equal(recipient.canUndo, false)
  })

  test('opaque transfer does not capture token-like attributes or unselected references', async () => {
    const editor = make([
      para('a', 'A<a href="https://example.test/{{hidden}}">{{w}}Z</a>', { inline: { w: reference, hidden: { type: 'missing', data: { name: 'HIDDEN' } } } }),
      para('b', 'Br{{tail}}', { inline: { tail: { type: 'missing', data: { name: 'TAIL' } } } }),
    ])
    const a = editor.blocks.getBlockById('a').contentElement, b = editor.blocks.getBlockById('b').contentElement
    a.focus(); const range = document.createRange(); range.setStart(a, 1); range.setEnd(b.firstChild, 2)
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
    equal(range.toString(), '{{w}}ZBr', 'fixture selects the intended text only')
    const recipient = await receive(copy(a, 'copy'))
    equal(payloads(recipient), [reference])
    const visible = labelled(recipient).map(html => { const template = document.createElement('template'); template.innerHTML = html; return template.content.textContent })
    equal(visible, ['[KEEP]Z', 'Br'])
  })
}

export function registerNative() {
  for (const action of ['c', 'x']) {
    test(`native Ctrl+${action.toUpperCase()} and Ctrl+V preserve opaque selected-fragment data`, async () => {
      const { editor, field } = fixture(false, true)
      let events = 0
      editor.rootElement.addEventListener(action === 'c' ? 'copy' : 'cut', () => { events++ }, { once: true })
      await nativeClipboardShortcut(action, action === 'c' ? 67 : 88)
      equal(events, 1, 'a real clipboard event wrote the transfer')
      const recipient = make([para('target', '')])
      select(recipient.blocks.getBlockByIndex(0).contentElement, 0)
      await nativeClipboardShortcut('v', 86)
      equal(labelled(recipient), ['[KEEP]Z', 'Br'])
      equal(payloads(recipient), [reference])
      if (action === 'x') { equal(labelled(editor), ['Aavo']); editor.undo(); equal(payloads(editor), [reference]) }
    })
  }
}
