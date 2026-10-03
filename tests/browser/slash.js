import { createEditor } from '../../core/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createHeadingPlugin, createParagraphPlugin, createQuotePlugin } from '../../plugins/index.js'

const sandbox = document.querySelector('#sandbox')
const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function mount(data) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [
      createParagraphPlugin({ injectStyles: false }),
      createHeadingPlugin(),
      createQuotePlugin(),
    ],
    inlinePlugins: [createColorSwatchPlugin()],
    defaultBlock: 'paragraph',
    injectStyles: true,
    changeDebounceMs: 0,
    data,
  })
  return { holder, editor }
}

function editable(entry, id, selector = '[contenteditable="true"]') {
  const element = entry.holder.querySelector(`.oe-block[data-block-id="${id}"] ${selector}`)
  assert(element instanceof HTMLElement, `missing editable ${id} ${selector}`)
  return element
}

function setCaretAtEnd(element) {
  element.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function typeText(element, text) {
  setCaretAtEnd(element)
  for (const char of text) {
    const selection = window.getSelection()
    const range = selection.getRangeAt(0)
    const node = document.createTextNode(char)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: char,
    }))
    await delay()
  }
}

function key(element, value) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    code: value === 'Enter' ? 'Enter' : value,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  return event
}

function slashMenu(entry) {
  const menu = entry.holder.querySelector('.oe-slash-menu')
  assert(menu instanceof HTMLElement, 'slash menu is missing')
  return menu
}

async function run() {
  const convert = mount({
    version: '2.0.0',
    blocks: [{ id: 'p1', type: 'paragraph', dataVersion: 2, data: { text: '' } }],
  })
  const p1 = editable(convert, 'p1')
  await typeText(p1, '/hea')
  const menu = slashMenu(convert)
  assert(menu.style.display !== 'none', 'slash menu did not open')
  assert(menu.textContent.includes('Heading'), 'slash filter did not expose Heading')
  const enter = key(p1, 'Enter')
  await delay()
  assert(enter.defaultPrevented, 'slash Enter was not consumed')
  assert(convert.editor.save().blocks[0].type === 'heading', 'empty slash command did not convert the current block')
  convert.editor.undo()
  await delay()
  assert(convert.editor.save().blocks[0].type === 'paragraph', 'slash conversion undo restored wrong type')
  assert(convert.editor.save().blocks[0].data.text === '/hea', 'slash conversion undo did not restore /query atomically')
  convert.editor.destroy()
  convert.holder.remove()

  const insert = mount({
    version: '2.0.0',
    blocks: [{ id: 'p2', type: 'paragraph', dataVersion: 2, data: { text: 'Before ' } }],
  })
  const p2 = editable(insert, 'p2')
  await typeText(p2, '/quote')
  assert(slashMenu(insert).textContent.includes('Quote'), 'slash filter did not expose Quote')
  key(p2, 'Enter')
  await delay()
  let saved = insert.editor.save()
  assert(saved.blocks.length === 2, 'non-empty slash command did not insert a block')
  assert(saved.blocks[0].data.text === 'Before ', 'non-empty slash command did not remove only /query')
  assert(saved.blocks[1].type === 'quote', 'non-empty slash command inserted wrong block type')
  insert.editor.undo()
  await delay()
  saved = insert.editor.save()
  assert(saved.blocks.length === 1 && saved.blocks[0].data.text === 'Before /quote', 'slash insert undo was not atomic')
  insert.editor.destroy()
  insert.holder.remove()

  const inline = mount({
    version: '2.0.0',
    blocks: [{ id: 'p3', type: 'paragraph', dataVersion: 2, data: { text: 'Color ' } }],
  })
  const p3 = editable(inline, 'p3')
  await typeText(p3, '/col')
  assert(slashMenu(inline).textContent.includes('Color'), 'slash filter did not expose inline Color')
  key(p3, 'Enter')
  await delay()
  saved = inline.editor.save()
  const refs = Object.values(saved.blocks[0].inline ?? {})
  assert(refs.length === 1 && refs[0].type === 'color', 'inline slash command did not create color widget')
  assert(!saved.blocks[0].data.text.includes('/col'), 'inline slash command retained /query')
  inline.editor.undo()
  await delay()
  assert(inline.editor.save().blocks[0].data.text === 'Color /col', 'inline slash undo did not restore /query atomically')
  inline.editor.destroy()
  inline.holder.remove()

  const composite = mount({
    version: '2.0.0',
    blocks: [{
      id: 'q1',
      type: 'quote', dataVersion: 1, data: { text: 'Quoted text', caption: 'By ' },
    }],
  })
  const caption = editable(composite, 'q1', '.oe-quote__caption')
  await typeText(caption, '/paragraph')
  key(caption, 'Enter')
  await delay()
  saved = composite.editor.save()
  assert(saved.blocks.length === 2, 'slash in composite field did not insert after source block')
  assert(saved.blocks[0].type === 'quote' && saved.blocks[0].data.text === 'Quoted text', 'slash in caption destroyed sibling quote field')
  assert(saved.blocks[0].data.caption === 'By ', 'slash in caption did not remove query from authored field')
  assert(saved.blocks[1].type === 'paragraph', 'slash in composite field inserted wrong target')
  composite.editor.undo()
  await delay()
  saved = composite.editor.save()
  assert(saved.blocks.length === 1 && saved.blocks[0].data.caption === 'By /paragraph', 'composite slash undo was not atomic')
  composite.editor.destroy()
  composite.holder.remove()

  const stale = mount({
    version: '2.0.0',
    blocks: [{ id: 'stale', type: 'paragraph', dataVersion: 2, data: { text: '' } }],
  })
  const staleField = editable(stale, 'stale')
  await typeText(staleField, '/')
  const staleMenu = slashMenu(stale)
  const oldItem = staleMenu.querySelector('.oe-slash-menu__item')
  assert(oldItem instanceof HTMLElement, 'slash stale-item fixture did not open')
  staleField.textContent = '/para'
  setCaretAtEnd(staleField)
  staleField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay()
  const filteredBefore = structuredClone(stale.editor.save().blocks)
  oldItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  assert(JSON.stringify(stale.editor.save().blocks) === JSON.stringify(filteredBefore), 'retained slash item acted after filter redraw')
  const currentItem = staleMenu.querySelector('.oe-slash-menu__item')
  assert(currentItem instanceof HTMLElement && currentItem !== oldItem, 'slash filter did not replace menu item ownership')
  currentItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  await delay()
  assert(staleMenu.style.display === 'none', 'current slash item did not close live menu')

  stale.editor.render({
    version: '2.0.0',
    blocks: [{ id: 'stale', type: 'paragraph', dataVersion: 2, data: { text: '/' } }],
  })
  await delay()
  const replacementField = editable(stale, 'stale')
  setCaretAtEnd(replacementField)
  replacementField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay()
  const retainedAfterRender = slashMenu(stale).querySelector('.oe-slash-menu__item')
  assert(retainedAfterRender instanceof HTMLElement, 'slash render-replacement fixture did not open')
  stale.editor.render({
    version: '2.0.0',
    blocks: [{ id: 'stale', type: 'paragraph', dataVersion: 2, data: { text: 'replacement' } }],
  })
  await delay()
  const afterRenderBefore = structuredClone(stale.editor.save().blocks)
  retainedAfterRender.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  assert(JSON.stringify(stale.editor.save().blocks) === JSON.stringify(afterRenderBefore), 'retained slash item acted on replacement block generation')
  stale.editor.destroy()
  stale.holder.remove()

  const focusAway = mount({
    version: '2.0.0',
    blocks: [
      { id: 'focus-a', type: 'paragraph', dataVersion: 2, data: { text: '' } },
      { id: 'focus-b', type: 'paragraph', dataVersion: 2, data: { text: 'KEEP' } },
    ],
  })
  const focusA = editable(focusAway, 'focus-a')
  const focusB = editable(focusAway, 'focus-b')
  await typeText(focusA, '/')
  assert(slashMenu(focusAway).style.display !== 'none', 'slash focus fixture did not open')
  focusB.focus()
  setCaretAtEnd(focusB)
  await delay()
  assert(slashMenu(focusAway).style.display === 'none', 'moving focus did not close slash session')
  key(focusB, 'Enter')
  await delay()
  assert(focusAway.editor.save().blocks[0].data.text === '/', 'closed slash session modified previous block')
  focusAway.editor.destroy()
  focusAway.holder.remove()

  const escape = mount({
    version: '2.0.0',
    blocks: [{ id: 'p4', type: 'paragraph', dataVersion: 2, data: { text: 'Keep ' } }],
  })
  const p4 = editable(escape, 'p4')
  await typeText(p4, '/head')
  const esc = key(p4, 'Escape')
  await delay()
  assert(esc.defaultPrevented, 'slash Escape was not consumed')
  assert(escape.editor.save().blocks[0].data.text === 'Keep ', 'slash Escape did not remove query')
  escape.editor.undo()
  await delay()
  assert(escape.editor.save().blocks[0].data.text === 'Keep /head', 'slash Escape undo did not restore query')
  escape.editor.destroy()
  escape.holder.remove()

  sandbox.replaceChildren()
  return {
    flows: ['convert', 'insert', 'inline', 'composite field', 'stale session', 'focus change', 'escape'],
    atomicUndo: true,
    dualRegistry: false,
  }
}

try {
  document.querySelector('#result').textContent = JSON.stringify(await run())
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
