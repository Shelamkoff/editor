import { createColorSwatchPlugin, createEditor } from '../../core/index.js'
import { createMentionPlugin, createMentionWidget } from '../../inline-plugins/mention/index.js'
import { Paragraph } from '../../plugins/paragraph/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const sandbox = document.querySelector('#sandbox')

function assert(value, message) {
  if (!value) throw new Error(message)
}

const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

function createMentionEditor(searchFunction, onMentionSelect = undefined) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [new Paragraph()],
    inlineTools: [],
    inlinePlugins: [
      createColorSwatchPlugin(),
      createMentionPlugin({ debounceDelay: 0, searchFunction, onMentionSelect }),
    ],
    data: { version: 'mention-browser', blocks: [{ id: 'paragraph', type: 'paragraph', data: { text: '' } }] },
    tuning: {
      undo: { debounceMs: 0, maxStack: 20 },
      change: { debounceMs: 0 },
      animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
    },
  })
  return { editor, holder, content: editor.blocks.getBlockByIndex(0).contentElement }
}

function ensureTextCaret(content) {
  content.focus()
  let text = content.lastChild
  if (!(text instanceof Text)) {
    text = document.createTextNode('')
    content.appendChild(text)
  }
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(text, text.data.length)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  return text
}

async function typeText(content, value) {
  let text = ensureTextCaret(content)
  for (const character of value) {
    const selection = window.getSelection()
    if (!(selection.anchorNode instanceof Text)) text = ensureTextCaret(content)
    else text = selection.anchorNode
    const offset = selection.anchorOffset
    text.insertData(offset, character)
    const range = document.createRange()
    range.setStart(text, offset + character.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    content.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: character,
    }))
    await delay(0)
  }
}

function historyShortcut(target, shiftKey = false) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: shiftKey ? 'Z' : 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  }))
}

async function run() {
  const queries = []
  const selections = []
  const main = createMentionEditor(async (query, nextPageUrl, { signal }) => {
    assert(signal instanceof AbortSignal, 'mention search did not receive an AbortSignal')
    queries.push([query, nextPageUrl ?? null])
    if (query === 'none') return []
    return { items: [{ id: 42, name: 'Ada Lovelace', details: 'Mathematician' }], nextPageUrl: null }
  }, value => selections.push(value))

  assert(
    main.editor.rootElement.querySelector('[data-plugin-type="mention"] .oe-toolbox__label')?.textContent === 'Mention',
    'missing default locale exposed the mention translation key',
  )
  assert(
    main.editor.rootElement.querySelector('[data-plugin-type="color"] .oe-toolbox__label')?.textContent === 'Color',
    'missing default locale exposed the color translation key',
  )

  await typeText(main.content, '@ad')
  await delay()
  assert(queries.some(([query]) => query === 'ad'), 'mention query was not sent to searchFunction')
  assert(document.querySelector('.oe-mention-item[data-index="0"]'), 'mention results did not open')
  main.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await delay()

  const widget = main.content.querySelector('[data-inline-plugin="mention"]')
  assert(widget?.textContent === '@Ada Lovelace', 'keyboard selection did not commit the mention widget')
  assert(selections.length === 1 && selections[0].id === 42, 'onMentionSelect received the wrong payload')
  const saved = main.editor.save()
  const inlineEntries = Object.values(saved.blocks[0].inline || {})
  assert(inlineEntries.length === 1, 'mention widget was not serialized')
  assert(inlineEntries[0].type === 'mention' && inlineEntries[0].data.id === '42', 'mention serialized data is wrong')

  historyShortcut(main.content)
  await delay()
  let liveContent = main.editor.blocks.getBlockByIndex(0).contentElement
  assert(!liveContent.querySelector('[data-inline-plugin="mention"]'), 'undo did not remove the committed mention')
  historyShortcut(liveContent, true)
  await delay()
  liveContent = main.editor.blocks.getBlockByIndex(0).contentElement
  assert(liveContent.querySelector('[data-inline-plugin="mention"]'), 'redo did not restore the committed mention')

  const output = document.createElement('section')
  sandbox.appendChild(output)
  const renderer = new EditorRenderer({
    blockTypes: ['paragraph'],
    inlinePlugins: [createMentionWidget()],
  })
  renderer.renderTo(saved, output)
  assert(output.querySelector('[data-inline-plugin="mention"]')?.textContent === '@Ada Lovelace', 'renderer did not restore mention data')
  renderer.destroy(output)

  liveContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await typeText(liveContent, ' @none')
  await delay()
  assert(document.querySelector('.oe-mention-no-results'), 'empty search did not render the no-results state')
  liveContent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

  let firstCalls = 0
  let secondCalls = 0
  const first = createMentionEditor(async () => { firstCalls++; return [] })
  const second = createMentionEditor(async () => { secondCalls++; return [] })
  await typeText(first.content, '@')
  await delay()
  assert(firstCalls === 1 && secondCalls === 0, 'mention search escaped into another editor instance')
  first.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await typeText(second.content, '@')
  await delay()
  assert(firstCalls === 1 && secondCalls === 1, 'second editor did not use its own mention search')

  const searchSignals = []
  const cancellable = createMentionEditor((_query, _nextPageUrl, { signal }) => {
    searchSignals.push(signal)
    return new Promise(resolve => signal.addEventListener('abort', () => resolve([]), { once: true }))
  })
  await typeText(cancellable.content, '@a')
  await delay()
  await typeText(cancellable.content, 'b')
  await delay()
  assert(searchSignals.length >= 2 && searchSignals.slice(0, -1).some(signal => signal.aborted), 'a newer mention query did not abort the previous request')
  const activeSearchSignal = searchSignals.at(-1)
  cancellable.editor.destroy()
  assert(activeSearchSignal?.aborted, 'destroy did not abort the active mention request')

  first.editor.destroy()
  second.editor.destroy()
  main.editor.destroy()
  assert(!document.querySelector('.oe-mention-dropdown'), 'destroy left a mention popup in the document')

  return {
    flows: ['search', 'search cancellation', 'keyboard commit', 'serialize', 'undo', 'redo', 'renderer', 'empty', 'multi-editor', 'destroy'],
    queries: queries.map(([query]) => query),
  }
}

try {
  document.querySelector('#result').textContent = JSON.stringify(await run())
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
