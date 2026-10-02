import { createEditor } from '../../core/index.js'
import {
  createHeadingPlugin,
  createListPlugin,
  createParagraphPlugin,
} from '../../plugins/index.js'

const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function semantic(document) {
  return document.blocks.map(block => ({
    id: block.id,
    type: block.type,
    data: block.data,
    ...(block.tunes ? { tunes: block.tunes } : {}),
    ...(block.inline ? { inline: block.inline } : {}),
  }))
}

function stable(value) {
  return JSON.stringify(value)
}

function createHarness(sandbox, data = {
  version: '2.0.0',
  blocks: [
    { id: 'alpha', type: 'paragraph', data: { text: 'Alpha' } },
    { id: 'beta', type: 'paragraph', data: { text: 'Beta' } },
  ],
}) {
  const holder = document.createElement('section')
  sandbox.append(holder)
  const editor = createEditor({
    holder,
    injectStyles: false,
    changeDebounceMs: 0,
    plugins: [
      createParagraphPlugin({ injectStyles: false }),
      createHeadingPlugin(),
      createListPlugin(),
    ],
    data: structuredClone(data),
  })
  return { holder, editor }
}

function editable(holder, blockId) {
  const block = holder.querySelector(`[data-block-id="${blockId}"]`)
  assert(block instanceof HTMLElement, `block ${blockId} is not projected`)
  const target = block.matches('[contenteditable="true"]')
    ? block
    : block.querySelector('[contenteditable="true"]')
  assert(target instanceof HTMLElement, `block ${blockId} has no editable field`)
  return target
}

function setCaret(element, offset) {
  element.focus()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  if (!node) {
    node = document.createTextNode('')
    element.append(node)
  }
  const range = document.createRange()
  range.setStart(node, Math.min(offset, node.textContent?.length ?? 0))
  range.collapse(true)
  const selection = getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function key(element, key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: options.code ?? key,
    ctrlKey: options.ctrlKey === true,
    metaKey: options.metaKey === true,
    shiftKey: options.shiftKey === true,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  return event
}

async function assertUndoRedo(editor, label, mutate) {
  const before = semantic(editor.save())
  await mutate()
  await delay()
  const after = semantic(editor.save())
  assert(stable(after) !== stable(before), `${label} did not change the document`)
  assert(editor.undo() === true, `${label} undo() returned false`)
  await delay()
  assert(stable(semantic(editor.save())) === stable(before), `${label} undo did not restore the previous document`)
  assert(editor.redo() === true, `${label} redo() returned false`)
  await delay()
  assert(stable(semantic(editor.save())) === stable(after), `${label} redo did not restore the changed document`)
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack ?? event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack ?? String(event.reason)))

  const structural = createHarness(sandbox)
  const { editor, holder } = structural

  await assertUndoRedo(editor, 'native typing', async () => {
    const target = editable(holder, 'alpha')
    target.textContent = 'Alpha edited'
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })

  await assertUndoRedo(editor, 'structural Enter split', async () => {
    const target = editable(holder, 'alpha')
    setCaret(target, 5)
    const event = key(target, 'Enter')
    assert(event.defaultPrevented, 'KeyboardRouter did not own structural Enter')
  })

  await assertUndoRedo(editor, 'public insert', () => {
    editor.blocks.insert({ type: 'paragraph', data: { text: 'Inserted' } }, 1)
  })

  let movableId = editor.blocks.at(0)?.id
  assert(movableId, 'move fixture has no first block')
  await assertUndoRedo(editor, 'public move', () => {
    editor.blocks.move(movableId, editor.blocks.count - 1)
  })

  const convertibleId = editor.blocks.at(0)?.id
  assert(convertibleId, 'convert fixture has no first block')
  await assertUndoRedo(editor, 'public convert', () => {
    editor.blocks.convert(convertibleId, { type: 'heading', toolboxItemId: 'h3' })
  })

  const removableId = editor.blocks.at(1)?.id
  assert(removableId, 'remove fixture has no removable block')
  await assertUndoRedo(editor, 'public remove', () => {
    editor.blocks.remove(removableId)
  })

  await assertUndoRedo(editor, 'clear', () => editor.clear())

  await assertUndoRedo(editor, 'public render', () => {
    editor.render({
      version: '2.0.0',
      blocks: [
        { id: 'render-heading', type: 'heading', data: { text: 'Rendered', level: 3 } },
        { id: 'render-paragraph', type: 'paragraph', data: { text: 'Document' } },
      ],
    })
  })

  editor.render({
    version: '2.0.0',
    blocks: [{ id: 'toolbar-origin', type: 'paragraph', data: { text: 'Origin' } }],
  })
  editor.blocks.focus('toolbar-origin', { offset: 'end' })
  await delay()
  const plus = holder.querySelector('.oe-toolbar__btn')
  assert(plus instanceof HTMLButtonElement, 'v2 toolbar add button is missing')
  plus.click()
  const headingItem = holder.querySelector('.oe-toolbox__item[data-plugin-type="heading"]')
  assert(headingItem instanceof HTMLElement, 'heading toolbox item is missing')
  headingItem.click()
  await delay()
  assert(editor.blocks.count === 2, 'toolbox did not insert a block after current content')
  assert(editor.blocks.at(1)?.type === 'heading', 'toolbox inserted the wrong block type')
  assert(editor.blocks.currentId === editor.blocks.at(1)?.id, 'toolbox insertion did not become current')
  assert(editor.undo() === true, 'toolbar insertion is not undoable')
  assert(editor.blocks.count === 1, 'toolbar undo did not remove inserted block')
  assert(editor.redo() === true, 'toolbar insertion is not redoable')
  assert(editor.blocks.count === 2, 'toolbar redo did not restore inserted block')

  const shortcutTarget = editable(holder, editor.blocks.at(0).id)
  const beforeShortcutUndo = semantic(editor.save())
  editor.blocks.insert({ type: 'paragraph', data: { text: 'Shortcut' } })
  const afterShortcutInsert = semantic(editor.save())
  const undoEvent = key(shortcutTarget, 'z', { code: 'KeyZ', ctrlKey: true })
  await delay()
  assert(undoEvent.defaultPrevented, 'Mod+Z was not claimed by KeyboardRouter')
  assert(stable(semantic(editor.save())) === stable(beforeShortcutUndo), 'Mod+Z restored the wrong state')
  const redoEvent = key(shortcutTarget, 'z', { code: 'KeyZ', ctrlKey: true, shiftKey: true })
  await delay()
  assert(redoEvent.defaultPrevented, 'Mod+Shift+Z was not claimed by KeyboardRouter')
  assert(stable(semantic(editor.save())) === stable(afterShortcutInsert), 'Mod+Shift+Z restored the wrong state')

  const beforeMode = stable(semantic(editor.save()))
  editor.setReadOnly(true)
  assert(editor.readOnly === true, 'setReadOnly(true) did not update the public state')
  assert(holder.querySelector('.oe-editor')?.getAttribute('aria-readonly') === 'true', 'read-only ARIA state is missing')
  assert(!holder.querySelector('[contenteditable="true"]'), 'read-only transition left editable DOM')
  assert(holder.querySelector('.oe-toolbar')?.getAttribute('style')?.includes('display: none'), 'toolbar stayed visible in read-only mode')
  editor.setReadOnly(false)
  assert(editor.readOnly === false, 'setReadOnly(false) did not restore editing')
  assert(stable(semantic(editor.save())) === beforeMode, 'read-only transition changed document data')

  const changes = []
  const stop = editor.on('document:changed', event => changes.push(event))
  const inserted = editor.blocks.insert({ type: 'paragraph', data: { text: 'Observed' } })
  await delay()
  assert(changes.length > 0, 'document:changed was not published after mutation')
  assert(changes.at(-1).changes.length > 0, 'document:changed did not carry canonical changes')
  stop()
  editor.blocks.remove(inserted)

  editor.destroy()
  editor.destroy()
  assert(holder.childNodes.length === 0, 'destroy left editor DOM in its holder')

  await delay()
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()

  return {
    historyCases: [
      'native typing',
      'structural Enter split',
      'insert',
      'move',
      'convert',
      'remove',
      'clear',
      'render',
      'toolbar insert',
      'keyboard undo/redo',
      'read-only transition',
    ],
    publicEvents: ['document:changed'],
  }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack ?? String(error)
}
