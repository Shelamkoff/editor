import { createColorSwatchPlugin, createEditor } from '../../core/index.js'
import { createMentionPlugin, createMentionWidget } from '../../inline-plugins/mention/index.js'
import { Paragraph } from '../../plugins/paragraph/index.js'
import { EditorRenderer } from '../../renderer/index.js'

const sandbox = document.querySelector('#sandbox')

function assert(value, message) {
  if (!value) throw new Error(message)
}

const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

function createMentionEditor(searchFunction, onMentionSelect = undefined, mentionOptions = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [new Paragraph()],
    inlineTools: [],
    inlinePlugins: [
      createColorSwatchPlugin(),
      createMentionPlugin({ ...mentionOptions, debounceDelay: 0, searchFunction, onMentionSelect }),
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

async function deleteLastCharacter(content) {
  const selection = window.getSelection()
  const text = selection?.anchorNode
  assert(text instanceof Text && selection.isCollapsed, 'mention deletion requires a collapsed text caret')
  const end = selection.anchorOffset
  assert(end > 0, 'mention deletion requires text before the caret')
  const start = end >= 2
    && text.data.charCodeAt(end - 1) >= 0xDC00 && text.data.charCodeAt(end - 1) <= 0xDFFF
    && text.data.charCodeAt(end - 2) >= 0xD800 && text.data.charCodeAt(end - 2) <= 0xDBFF
    ? end - 2
    : end - 1
  text.deleteData(start, end - start)
  const range = document.createRange()
  range.setStart(text, start)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  content.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'deleteContentBackward',
  }))
  await delay(0)
}

function setTextCaret(text, offset) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(text, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function deleteBackwardThroughBeforeInput(content) {
  content.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'deleteContentBackward',
  }))
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
  for (const invalidTrigger of ['', 'ab']) {
    let rejected = false
    try {
      createMentionPlugin({ trigger: invalidTrigger })
    } catch (error) {
      rejected = error instanceof TypeError
    }
    assert(rejected, `mention accepted invalid trigger ${JSON.stringify(invalidTrigger)}`)
  }

  const queries = []
  const selections = []
  const main = createMentionEditor(async (query, nextPageUrl, { signal }) => {
    assert(signal instanceof AbortSignal, 'mention search did not receive an AbortSignal')
    queries.push([query, nextPageUrl ?? null])
    if (query === 'none') return []
    return { items: [{ id: 42, name: 'Ada Lovelace', details: 'Mathematician' }], nextPageUrl: null }
  }, value => selections.push(value))

  const failedSelections = []
  const detached = createMentionEditor(
    async () => [{ id: 'detached', name: 'Detached' }],
    value => failedSelections.push(value),
  )
  await typeText(detached.content, '@d')
  await delay()
  const detachedItem = document.querySelector('.oe-mention-item[data-index="0"]')
  detached.content.firstChild?.remove()
  const foreignCaret = document.createElement('div')
  foreignCaret.textContent = 'outside'
  sandbox.appendChild(foreignCaret)
  const foreignRange = document.createRange()
  foreignRange.setStart(foreignCaret.firstChild, 0)
  foreignRange.collapse(true)
  const foreignSelection = window.getSelection()
  foreignSelection.removeAllRanges()
  foreignSelection.addRange(foreignRange)
  detachedItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await delay()
  assert(failedSelections.length === 0, 'onMentionSelect fired for a widget that was not committed')
  assert(!detached.content.querySelector('[data-inline-plugin="mention"]'), 'failed mention commit inserted a detached widget')
  detached.editor.destroy()
  foreignCaret.remove()

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
  const mainDropdown = document.querySelector('.oe-mention-dropdown')
  assert(mainDropdown?.getAttribute('role') === 'listbox', 'mention results are not exposed as a listbox')
  assert(mainDropdown?.parentElement === main.editor.rootElement, 'mention dropdown does not inherit its editor theme')
  assert(
    main.content.getAttribute('aria-controls') === mainDropdown.id
      && main.content.getAttribute('aria-expanded') === 'true'
      && main.content.hasAttribute('aria-activedescendant'),
    'mention listbox is not associated with the owning editable element',
  )
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

  const resetQueries = []
  const reset = createMentionEditor(async query => {
    resetQueries.push(query)
    return [{ id: 'reset', name: 'Reset' }]
  })
  await typeText(reset.content, '@ab')
  await deleteLastCharacter(reset.content)
  await deleteLastCharacter(reset.content)
  await delay()
  assert(resetQueries.at(-1) === '', 'removing the mention query did not restore initial suggestions')
  const resetDropdownId = reset.content.getAttribute('aria-controls')
  await deleteLastCharacter(reset.content)
  await delay()
  assert(!reset.content.hasAttribute('aria-controls'), 'removing the trigger left stale popup ARIA state')
  assert(!resetDropdownId || !document.getElementById(resetDropdownId), 'removing the trigger left the mention popup open')

  const deletion = createMentionEditor(async () => [{ id: 'short', name: 'A' }])
  await typeText(deletion.content, 'Prefix @')
  await delay()
  deletion.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await delay()
  const deletionWidget = deletion.content.querySelector('[data-inline-plugin="mention"]')
  const deletionWidgetText = deletionWidget?.firstChild
  assert(deletionWidgetText instanceof Text && deletionWidgetText.data === '@A', 'mention deletion fixture did not commit')
  setTextCaret(deletionWidgetText, deletionWidgetText.data.length)
  deleteBackwardThroughBeforeInput(deletion.content)
  await delay()
  assert(deletionWidget.textContent === '@', 'editing a mention did not reduce it to the trigger')
  deleteBackwardThroughBeforeInput(deletion.content)
  await delay()
  const deletionSelection = window.getSelection()
  assert(!deletion.content.querySelector('[data-inline-plugin="mention"]'), 'deleting the last mention trigger left a widget behind')
  assert(!deletion.content.textContent.includes('@'), 'deleting the last mention trigger restored the trigger as plain text')
  assert(
    deletionSelection?.isCollapsed
      && deletion.content.contains(deletionSelection.anchorNode)
      && deletionSelection.anchorNode?.textContent === 'Prefix '
      && deletionSelection.anchorOffset === 'Prefix '.length,
    'deleting the last mention trigger moved the caret away from the deletion point',
  )
  deletion.editor.destroy()

  const emoji = createMentionEditor(
    async () => [{ id: 'emoji', name: 'Light' }],
    undefined,
    { trigger: '💡' },
  )
  await typeText(emoji.content, '💡li')
  await delay()
  emoji.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await delay()
  const emojiWidget = emoji.content.querySelector('[data-inline-plugin="mention"]')
  assert(emojiWidget?.textContent === '💡Light', 'a non-BMP mention trigger was split during commit')
  const emojiOutput = document.createElement('section')
  const emojiRenderer = new EditorRenderer({
    blockTypes: ['paragraph'],
    inlinePlugins: [createMentionWidget('💡')],
  })
  emojiRenderer.renderTo(emoji.editor.save(), emojiOutput)
  assert(emojiOutput.querySelector('[data-inline-plugin="mention"]')?.textContent === '💡Light', 'renderer lost the configured mention trigger')
  emojiRenderer.destroy(emojiOutput)
  emoji.editor.destroy()
  reset.editor.destroy()

  const pageCalls = []
  const pageSelections = []
  const paged = createMentionEditor(async (_query, nextPageUrl) => {
    pageCalls.push(nextPageUrl ?? null)
    if (nextPageUrl === 'page-2') {
      return { items: [{ id: 'second', name: 'Second' }], nextPageUrl: null }
    }
    return { items: [{ id: 'first', name: 'First' }], nextPageUrl: 'page-2' }
  }, value => pageSelections.push(value), {
    renderItem(item) {
      const row = document.createElement('div')
      row.dataset.customMention = String(item.id)
      row.textContent = item.name
      return row
    },
  })
  await typeText(paged.content, '@p')
  await delay()
  const firstCustomRow = document.querySelector('[data-custom-mention="first"]')
  assert(
    firstCustomRow?.getAttribute('role') === 'option'
      && firstCustomRow.dataset.index === '0'
      && firstCustomRow.id,
    'custom mention result did not receive listbox semantics',
  )
  paged.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  await delay()
  assert(pageCalls.includes('page-2'), 'mention navigation did not request the next cursor page')
  assert(document.querySelector('[data-custom-mention="second"]')?.dataset.index === '1', 'cursor page was not appended with a stable index')
  paged.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  paged.content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await delay()
  assert(paged.content.querySelector('[data-inline-plugin="mention"]')?.textContent === '@Second', 'keyboard commit did not use an appended cursor result')
  assert(pageSelections[0]?.id === 'second', 'cursor result callback payload is wrong')
  paged.editor.destroy()

  const customEmpty = createMentionEditor(async () => [], undefined, {
    renderNoResults(text) {
      const row = document.createElement('div')
      row.dataset.customEmpty = 'true'
      row.textContent = text
      return row
    },
  })
  await typeText(customEmpty.content, '@empty')
  await delay()
  const customEmptyRow = document.querySelector('[data-custom-empty="true"]')
  assert(
    customEmptyRow?.classList.contains('oe-mention-no-results')
      && customEmptyRow.getAttribute('role') === 'status',
    'custom no-results row did not receive status semantics',
  )
  customEmpty.editor.destroy()

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
    flows: ['option validation', 'search', 'search cancellation', 'failed commit', 'keyboard commit', 'click semantics', 'pagination', 'custom rows', 'serialize', 'undo', 'redo', 'renderer', 'empty', 'query reset', 'last-trigger deletion', 'unicode trigger', 'aria', 'theme inheritance', 'multi-editor', 'destroy'],
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
