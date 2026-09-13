import { createEditor } from '../../core/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { Paragraph } from '../../plugins/paragraph/index.js'

const sandbox = document.querySelector('#sandbox')
const result = document.querySelector('#result')
const delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

function assert(value, message) {
  if (!value) throw new Error(message)
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

function key(content, value) {
  content.dispatchEvent(new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
  }))
}

async function run() {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)

  let resolveA2
  const b2Resolvers = []
  const calls = []
  const searchFunction = (query, nextPageUrl, { signal }) => {
    calls.push({ query, nextPageUrl: nextPageUrl ?? null, signal })
    if (nextPageUrl === 'a-page-2') {
      return new Promise(resolve => { resolveA2 = resolve })
    }
    if (nextPageUrl === 'b-page-2') {
      return new Promise(resolve => { b2Resolvers.push(resolve) })
    }
    if (query === 'a') {
      return { items: [{ id: 'a-1', name: 'Alpha' }], nextPageUrl: 'a-page-2' }
    }
    if (query === 'b') {
      return { items: [{ id: 'b-1', name: 'Beta' }], nextPageUrl: 'b-page-2' }
    }
    return { items: [], nextPageUrl: null }
  }

  const editor = createEditor({
    holder,
    plugins: [new Paragraph()],
    inlineTools: [],
    inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction })],
    data: { version: 'mention-session-race', blocks: [{ id: 'paragraph', type: 'paragraph', data: { text: '' } }] },
    tuning: {
      undo: { debounceMs: 0, maxStack: 20 },
      change: { debounceMs: 0 },
      animations: { blockInsertMs: 0, blockMoveMs: 0, blockRemoveMs: 0 },
    },
  })
  const content = editor.blocks.getBlockByIndex(0).contentElement

  try {
    await typeText(content, '@a')
    await delay(20)
    key(content, 'ArrowDown')
    await delay(0)
    assert(typeof resolveA2 === 'function', 'session A pagination did not start')

    key(content, 'Escape')
    await typeText(content, ' @b')
    await delay(20)
    key(content, 'ArrowDown')
    await delay(0)

    assert(b2Resolvers.length === 1, `session B pagination started ${b2Resolvers.length} times before the stale result`)
    assert(holder.querySelector('.oe-mention-loading'), 'session B loading indicator is missing before stale session A settles')

    // The old request deliberately ignores AbortSignal. runSearch() correctly
    // classifies its result as stale; loadMoreResults() must likewise mutate
    // only the session that originally owned this pagination request.
    resolveA2({ items: [{ id: 'a-2', name: 'Alpha 2' }], nextPageUrl: null })
    await delay(0)

    assert(holder.querySelector('.oe-mention-loading'), 'stale session A pagination removed session B loading indicator')
    key(content, 'ArrowDown')
    await delay(0)
    assert(b2Resolvers.length === 1, `stale session A pagination unlocked duplicate session B request (${b2Resolvers.length})`)
  } finally {
    for (const resolve of b2Resolvers) resolve({ items: [], nextPageUrl: null })
    await delay(0)
    editor.destroy()
    holder.remove()
  }
}

run().then(() => {
  document.body.dataset.status = 'pass'
  result.textContent = 'mention pagination remains owned by its originating session'
}).catch(error => {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
  console.error(error)
})
