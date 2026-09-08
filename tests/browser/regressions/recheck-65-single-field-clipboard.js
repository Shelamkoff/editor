import { Paragraph, Quote, Table } from '../../../plugins/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { nativeClipboardShortcut } from './nativeClipboard.js'
import { test, make, para, select, pause, equal, assert, expectError } from './harness.js'

const fragmentType = 'application/x-rector-fragment'
const opaque = { type: 'missing', data: { name: 'KEEP', nested: { id: 42 } } }
const color = { type: 'color', data: { value: '#ff0000' } }
function clipboard(field, action, data = new DataTransfer()) {
  const event = new ClipboardEvent(action, { bubbles: true, cancelable: true, clipboardData: data })
  field.dispatchEvent(event)
  return { data, event }
}
function payloads(editor) { return editor.save().blocks.flatMap(block => Object.values(block.inline ?? {})) }
function decoded(editor) {
  return editor.save().blocks.map(block => String(block.data.text).replace(/\{\{([\w-]+)\}\}/g,
    (token, id) => block.inline?.[id] ? `[${block.inline[id].data.name ?? block.inline[id].data.value}]` : token))
}
async function receive(data, options = {}) {
  const editor = make([para('target', '')], options)
  const field = editor.blocks.getBlockByIndex(0).contentElement
  select(field, 0); clipboard(field, 'paste', data); await pause(20)
  return editor
}
function wholeField(field) {
  field.focus()
  const range = document.createRange(); range.selectNodeContents(field)
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
}
export function register() {
  for (const backwards of [false, true]) for (const action of ['copy', 'cut']) {
    test(`single-field ${backwards ? 'backward' : 'forward'} ${action} transfers only referenced opaque data`, async () => {
      const other = { type: 'missing', data: { name: 'UNSELECTED' } }
      const source = make([para('source', 'A{{w}}Z{{other}}', { inline: { w: opaque, other } })])
      const before = source.save().blocks
      const field = source.blocks.getBlockByIndex(0).contentElement
      field.focus(); window.getSelection().setBaseAndExtent(field.firstChild, backwards ? 6 : 1, field.firstChild, backwards ? 1 : 6)
      equal(window.getSelection().getRangeAt(0).toString(), '{{w}}')
      const { data, event } = clipboard(field, action)
      assert(event.defaultPrevented, 'editor must serialize the complete single-field fragment')
      assert(data.getData(fragmentType), 'opaque data needs a lossless representation')
      const destination = await receive(data)
      equal(decoded(destination), ['[KEEP]']); equal(payloads(destination), [opaque])
      if (action === 'copy') { equal(source.save().blocks, before); equal(source.canUndo, false) }
      else {
        equal(decoded(source), ['AZ[UNSELECTED]']); equal(payloads(source), [other])
        const cut = source.save().blocks
        source.undo(); equal(source.save().blocks, before); equal(source.canUndo, false)
        source.redo(); equal(source.save().blocks, cut)
      }
    })
  }
  for (const action of ['copy', 'cut']) {
    test(`single-field ${action} preserves live color and formatting at the recipient`, async () => {
      const options = { inlinePlugins: [createColorSwatchPlugin()] }
      const source = make([para('source', '<b>A</b>{{w}}<i>Z</i>', { inline: { w: color } })], options)
      const field = source.blocks.getBlockByIndex(0).contentElement
      wholeField(field)
      const before = source.save().blocks
      const destination = await receive(clipboard(field, action).data, { inlinePlugins: [createColorSwatchPlugin()] })
      equal(payloads(destination), [color])
      const copied = destination.blocks.getBlockByIndex(0).contentElement
      equal(copied.querySelector('b')?.textContent, 'A'); equal(copied.querySelector('i')?.textContent, 'Z')
      const widget = copied.querySelector('[data-inline-plugin="color"]'); assert(widget)
      widget.click(); await pause(20); assert(destination.rootElement.querySelector('.oe-ip-popup'))
      destination.undo(); equal(payloads(destination), []); destination.redo(); equal(payloads(destination), [color])
      if (action === 'cut') { equal(payloads(source), []); source.undo(); equal(source.save().blocks, before) }
      else equal(source.save().blocks, before)
    })
  }
  for (const type of ['quote', 'table']) {
    test(`single-field Cut preserves neighboring ${type} fields and their data`, async () => {
      const data = type === 'quote' ? { text: 'KEEP', caption: 'A{{w}}Z' } : { content: [['A{{w}}Z', 'KEEP']], withHeadings: false }
      const source = make([{ id: 'source', type, data, inline: { w: opaque } }], { plugins: [new Paragraph(), new Quote(), new Table()] })
      const field = source.blocks.getBlockByIndex(0).contentElement.querySelector(type === 'quote' ? 'cite' : 'td')
      const before = source.save().blocks
      select(field, 1, 6)
      const destination = await receive(clipboard(field, 'cut').data)
      equal(payloads(destination), [opaque])
      equal(source.save().blocks[0].data, type === 'quote' ? { text: 'KEEP', caption: 'AZ' } : { content: [['AZ', 'KEEP']], withHeadings: false })
      source.undo(); equal(source.save().blocks, before)
    })
  }
  for (const failure of ['missing clipboard', 'silent discard', 'throw']) {
    test(`single-field Cut keeps its source after ${failure}`, () => {
      const source = make([para('source', 'A{{w}}Z', { inline: { w: opaque } })])
      const field = source.blocks.getBlockByIndex(0).contentElement
      const before = source.save().blocks; select(field, 1, 6)
      let data = failure === 'missing clipboard' ? null : new DataTransfer()
      if (data) {
        const original = data.setData.bind(data)
        data.setData = (type, value) => {
          if (type === fragmentType) { if (failure === 'throw') throw new Error('fragment write denied'); return }
          original(type, value)
        }
      }
      if (failure === 'throw') expectError(/fragment write denied/)
      const { event } = clipboard(field, 'cut', data)
      assert(event.defaultPrevented, 'the browser must not apply a lossy cut')
      equal(source.save().blocks, before); equal(source.canUndo, false)
      equal(window.getSelection().getRangeAt(0).toString(), '{{w}}')
    })
  }
  test('single-field Cut rolls back when the remaining document fails validation', () => {
    let attempts = 0
    class Reject extends Paragraph {
      validate(data) { if (data.text === 'AZ') { attempts++; return false }; return true }
    }
    const source = make([para('source', 'A{{w}}Z', { inline: { w: opaque } })], { plugins: [new Reject()], validationMode: 'strict' })
    const before = source.save().blocks; const field = source.blocks.getBlockByIndex(0).contentElement
    select(field, 1, 6)
    expectError(/validation|invalid/i)
    const { data, event } = clipboard(field, 'cut')
    assert(event.defaultPrevented); assert(data.getData(fragmentType))
    assert(attempts > 0, 'the deletion must reach its failing validation phase')
    equal(source.save().blocks, before); equal(source.canUndo, false)
  })
  test('single-field fragment insertion rolls back rather than using a lossy fallback', async () => {
    const source = make([para('source', 'A{{w}}Z', { inline: { w: opaque } })])
    const field = source.blocks.getBlockByIndex(0).contentElement; select(field, 1, 6)
    const { data } = clipboard(field, 'copy')
    assert(data.getData(fragmentType), 'the insertion must attempt the lossless transfer')
    let rejected = 0
    class Reject extends Paragraph { validate(data) { if (data.text.includes('{{')) { rejected++; return false }; return true } }
    const recipient = await receive(data, { plugins: [new Reject()], validationMode: 'strict' })
    assert(rejected > 0, 'validation must actually reject the imported data')
    equal(recipient.save().blocks[0].data.text, ''); equal(recipient.canUndo, false)
  })
  test('copying a token from inside a styled ancestor keeps the selected formatting', async () => {
    const source = make([para('source', '<b>A{{w}}Z</b>', { inline: { w: opaque } })])
    const field = source.blocks.getBlockByIndex(0).contentElement
    field.focus(); select(field.querySelector('b'), 1, 6)
    const destination = await receive(clipboard(field, 'copy').data)
    equal(payloads(destination), [opaque])
    equal(decoded(destination), ['<b>[KEEP]</b>'])
  })
  test('a token-like literal without metadata stays literal through single-field copy', async () => {
    const source = make([para('source', 'A{{w}}Z')]); const field = source.blocks.getBlockByIndex(0).contentElement
    select(field, 1, 6)
    const { data, event } = clipboard(field, 'copy')
    equal(event.defaultPrevented, false, 'plain literal text keeps the native clipboard path')
    equal(data.types.length, 0)
    equal(decoded(source), ['A{{w}}Z']); equal(payloads(source), [])
  })
  test('form input Copy/Cut does not use a stale editor selection', () => {
    const source = make([para('source', 'A{{w}}Z', { inline: { w: opaque } })]); const field = source.blocks.getBlockByIndex(0).contentElement
    const input = document.createElement('input'); field.parentNode.appendChild(input); input.value = 'form text'
    select(field, 1, 6); input.focus(); input.select()
    for (const action of ['copy', 'cut']) {
      const { data, event } = clipboard(input, action)
      equal(event.defaultPrevented, false); equal(data.types.length, 0)
    }
    equal(decoded(source), ['A[KEEP]Z']); equal(source.canUndo, false)
  })
}
export function registerNative() {
  for (const reference of [opaque, color]) for (const action of ['c', 'x']) {
    test(`native single-field Ctrl+${action.toUpperCase()} → Paste keeps ${reference.type} data`, async () => {
      const options = { inlinePlugins: [createColorSwatchPlugin()] }
      const source = make([para('source', 'A{{w}}Z', { inline: { w: reference } })], options)
      const before = source.save().blocks; const field = source.blocks.getBlockByIndex(0).contentElement
      select(field, 0)
      if (reference.type === 'color') await nativeClipboardShortcut('a', 65)
      else select(field, 1, 6)
      equal(source.blocks.hasSelectedBlocks(), false)
      equal(window.getSelection().getRangeAt(0).toString(), reference.type === 'color' ? 'A#ff0000Z' : '{{w}}')
      let events = 0; source.rootElement.addEventListener(action === 'c' ? 'copy' : 'cut', () => events++, { once: true })
      await nativeClipboardShortcut(action, action === 'c' ? 67 : 88); equal(events, 1)
      const destination = make([para('target', '')], { inlinePlugins: [createColorSwatchPlugin()] }); select(destination.blocks.getBlockByIndex(0).contentElement, 0)
      await nativeClipboardShortcut('v', 86)
      equal(payloads(destination), [reference]); equal(decoded(destination), reference.type === 'color' ? ['A[#ff0000]Z'] : ['[KEEP]'])
      if (action === 'x') { equal(payloads(source), []); source.undo(); equal(source.save().blocks, before) }
      else equal(source.save().blocks, before)
    })
  }
}
