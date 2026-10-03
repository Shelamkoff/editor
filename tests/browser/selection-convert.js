import { createEditor } from '../../core/index.js'
import {
  createHeadingPlugin,
  createListPlugin,
  createParagraphPlugin,
} from '../../plugins/index.js'
import { createColorSwatchPlugin, createColorSwatchRenderer } from '../../inline-plugins/color.js'
import { EditorRenderer } from '../../renderer/index.js'

const sandbox = document.querySelector('#sandbox')
const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function mount(blocks) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [
      createParagraphPlugin({ injectStyles: false }),
      createHeadingPlugin(),
      createListPlugin(),
    ],
    inlinePlugins: [createColorSwatchPlugin()],
    defaultBlock: 'paragraph',
    injectStyles: true,
    changeDebounceMs: 0,
    data: { version: '2.0.0', blocks },
  })
  return { holder, editor }
}

function editable(entry, id, selector = '[contenteditable="true"]') {
  const element = entry.holder.querySelector(`.oe-block[data-block-id="${id}"] ${selector}`)
  assert(element instanceof HTMLElement, `missing editable ${id} ${selector}`)
  return element
}

function firstText(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode()
  assert(node instanceof Text, 'selection fixture needs text node')
  return node
}

function selectRange(startElement, startOffset, endElement = startElement, endOffset = startOffset) {
  const start = firstText(startElement)
  const end = firstText(endElement)
  const range = document.createRange()
  range.setStart(start, Math.min(startOffset, start.data.length))
  range.setEnd(end, Math.min(endOffset, end.data.length))
  const selection = window.getSelection()
  startElement.focus()
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  return range
}

function selectBackward(anchorElement, anchorOffset, focusElement, focusOffset) {
  const anchor = firstText(anchorElement)
  const focus = firstText(focusElement)
  const selection = window.getSelection()
  assert(typeof selection.setBaseAndExtent === 'function', 'directional Selection API is unavailable')
  anchorElement.focus()
  selection.removeAllRanges()
  selection.setBaseAndExtent(
    anchor,
    Math.min(anchorOffset, anchor.data.length),
    focus,
    Math.min(focusOffset, focus.data.length),
  )
  document.dispatchEvent(new Event('selectionchange'))
}

function assertCollapsedFocus(entry, blockId, message) {
  const block = entry.holder.querySelector(`.oe-block[data-block-id="${blockId}"]`)
  assert(block instanceof HTMLElement, `${message}: target block is missing`)
  assert(block.contains(document.activeElement), `${message}: focus escaped target block`)
  assert(window.getSelection()?.isCollapsed === true, `${message}: caret is not collapsed`)
}

async function openType(entry) {
  await delay()
  const button = entry.holder.querySelector('.oe-inline-toolbar__type-select')
  assert(button instanceof HTMLButtonElement && !button.hidden, 'v2 type selector is missing')
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  button.click()
  await delay()
  const dropdown = entry.holder.querySelector('.oe-inline-toolbar__type-dropdown')
  assert(dropdown instanceof HTMLElement && dropdown.style.display !== 'none', 'v2 type dropdown did not open')
  return dropdown
}

function chooseType(dropdown, type) {
  const item = dropdown.querySelector(`.oe-inline-toolbar__type-item[data-plugin-type="${type}"]`)
  assert(item instanceof HTMLElement, `type selector lost ${type}`)
  item.click()
  return item
}

async function run() {
  const wholeInline = mount([
    {
      id: 'whole-inline',
      type: 'paragraph',
      dataVersion: 2,
      data: { text: 'Before {{color-1}} literal {{literal-token}} after' },
      inline: {
        'color-1': {
          type: 'color',
          dataVersion: 1,
          data: { value: '#123456' },
        },
      },
    },
  ])
  const wholeBefore = JSON.stringify(wholeInline.editor.save().blocks)
  const convertedWhole = wholeInline.editor.blocks.convert('whole-inline', { type: 'heading' })
  assert(convertedWhole?.type === 'heading', 'whole conversion did not produce Heading')
  let wholeSaved = wholeInline.editor.save()
  assert(wholeSaved.blocks[0].data.text === 'Before {{color-1}} literal {{literal-token}} after', 'whole conversion changed inline/literal token text')
  assert(wholeSaved.blocks[0].inline?.['color-1']?.type === 'color', 'whole conversion lost inline sidecar')
  assert(wholeSaved.blocks[0].inline?.['color-1']?.data.value === '#123456', 'whole conversion changed inline payload')
  wholeInline.editor.undo()
  await delay()
  assert(JSON.stringify(wholeInline.editor.save().blocks) === wholeBefore, 'whole inline conversion undo did not restore graph')
  wholeInline.editor.redo()
  await delay()
  wholeSaved = wholeInline.editor.save()
  assert(wholeSaved.blocks[0].inline?.['color-1']?.data.value === '#123456', 'whole inline conversion redo lost payload')
  assert(wholeSaved.blocks[0].data.text.includes('{{literal-token}}'), 'whole inline conversion rewrote literal token')

  const reloadedWhole = mount(wholeSaved.blocks)
  const reloadedWholeSaved = reloadedWhole.editor.save().blocks[0]
  assert(reloadedWholeSaved.type === 'heading', 'converted document reload changed block type')
  assert(reloadedWholeSaved.inline?.['color-1']?.data.value === '#123456', 'converted document reload lost inline payload')
  assert(reloadedWholeSaved.data.text.includes('{{literal-token}}'), 'converted document reload changed literal token')
  reloadedWhole.editor.destroy()
  reloadedWhole.holder.remove()

  const renderer = new EditorRenderer({
    blockTypes: ['heading'],
    inlineRenderers: [createColorSwatchRenderer()],
    injectStyles: false,
  })
  const renderedWhole = renderer.render(wholeSaved)
  const renderedColor = renderedWhole.querySelector('.oe-ip--color')
  assert(renderedColor instanceof HTMLElement, 'renderer did not hydrate converted inline widget')
  assert(renderedColor.dataset.value === '#123456', 'renderer changed converted inline widget payload')
  assert(renderedWhole.textContent.includes('{{literal-token}}'), 'renderer consumed literal placeholder-shaped text')
  renderer.destroy(renderedWhole)
  renderer.destroy()

  wholeInline.editor.destroy()
  wholeInline.holder.remove()

  const opaqueInline = mount([
    {
      id: 'whole-opaque-inline',
      type: 'paragraph',
      dataVersion: 2,
      data: { text: 'Opaque {{future-1}} payload' },
      inline: {
        'future-1': {
          type: 'future-inline',
          dataVersion: 7,
          data: { nested: { value: 42 }, label: 'opaque' },
        },
      },
    },
  ])
  const opaqueBefore = structuredClone(opaqueInline.editor.save().blocks[0].inline['future-1'])
  const opaqueConverted = opaqueInline.editor.blocks.convert('whole-opaque-inline', { type: 'heading' })
  assert(opaqueConverted?.type === 'heading', 'opaque inline whole conversion did not produce Heading')
  const opaqueSaved = opaqueInline.editor.save().blocks[0]
  assert(opaqueSaved.data.text === 'Opaque {{future-1}} payload', 'opaque inline conversion changed token text')
  assert(JSON.stringify(opaqueSaved.inline?.['future-1']) === JSON.stringify(opaqueBefore), 'opaque inline payload was not preserved')
  opaqueInline.editor.undo()
  await delay()
  assert(JSON.stringify(opaqueInline.editor.save().blocks[0].inline?.['future-1']) === JSON.stringify(opaqueBefore), 'opaque inline undo lost payload')
  opaqueInline.editor.redo()
  await delay()
  assert(JSON.stringify(opaqueInline.editor.save().blocks[0].inline?.['future-1']) === JSON.stringify(opaqueBefore), 'opaque inline redo lost payload')
  const opaqueRoundTrip = opaqueInline.editor.save()
  const opaqueReload = mount(opaqueRoundTrip.blocks)
  assert(
    JSON.stringify(opaqueReload.editor.save().blocks[0].inline?.['future-1']) === JSON.stringify(opaqueBefore),
    'opaque inline reload lost payload',
  )
  opaqueReload.editor.destroy()
  opaqueReload.holder.remove()
  opaqueInline.editor.destroy()
  opaqueInline.holder.remove()

  const paragraph = mount([
    { id: 'p', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha Beta Gamma' } },
  ])
  const p = editable(paragraph, 'p')
  selectRange(p, 6, p, 10)
  let dropdown = await openType(paragraph)
  chooseType(dropdown, 'heading')
  await delay()
  let saved = paragraph.editor.save()
  assert(saved.blocks.length === 3, 'partial paragraph conversion did not split into three blocks')
  assert(saved.blocks[0].type === 'paragraph' && saved.blocks[0].data.text === 'Alpha ', 'paragraph prefix was not preserved')
  assert(saved.blocks[1].type === 'heading' && saved.blocks[1].data.text === 'Beta', 'selected paragraph fragment was not converted')
  assert(saved.blocks[2].type === 'paragraph' && saved.blocks[2].data.text === ' Gamma', 'paragraph suffix was not preserved')
  paragraph.editor.undo()
  await delay()
  saved = paragraph.editor.save()
  assert(saved.blocks.length === 1 && saved.blocks[0].data.text === 'Alpha Beta Gamma', 'partial paragraph undo was not atomic')
  paragraph.editor.redo()
  await delay()
  assert(paragraph.editor.save().blocks[1].data.text === 'Beta', 'partial paragraph redo failed')
  paragraph.editor.destroy()
  paragraph.holder.remove()

  const paragraphBackward = mount([
    { id: 'pb', type: 'paragraph', dataVersion: 2, data: { text: 'Alpha Beta Gamma' } },
  ])
  const pb = editable(paragraphBackward, 'pb')
  selectBackward(pb, 10, pb, 6)
  dropdown = await openType(paragraphBackward)
  chooseType(dropdown, 'heading')
  await delay()
  saved = paragraphBackward.editor.save()
  assert(saved.blocks.length === 3, 'backward partial paragraph conversion did not split into three blocks')
  assert(saved.blocks[0].data.text === 'Alpha ', 'backward paragraph conversion lost prefix')
  assert(saved.blocks[1].type === 'heading' && saved.blocks[1].data.text === 'Beta', 'backward paragraph selection converted wrong text')
  assert(saved.blocks[2].data.text === ' Gamma', 'backward paragraph conversion lost suffix')
  assertCollapsedFocus(paragraphBackward, saved.blocks[1].id, 'backward partial conversion')
  paragraphBackward.editor.undo()
  await delay()
  saved = paragraphBackward.editor.save()
  assert(saved.blocks.length === 1 && saved.blocks[0].data.text === 'Alpha Beta Gamma', 'backward partial conversion undo was not atomic')
  paragraphBackward.editor.destroy()
  paragraphBackward.holder.remove()

  const list = mount([
    {
      id: 'list',
      type: 'list',
      dataVersion: 2,
      data: {
        style: 'ordered',
        items: [
          { id: 'one', text: 'One' },
          { id: 'two', text: 'Two' },
        ],
      },
    },
  ])
  const firstItem = editable(list, 'list', '[data-item-id="one"]')
  selectRange(firstItem, 0, firstItem, 3)
  dropdown = await openType(list)
  chooseType(dropdown, 'paragraph')
  await delay()
  saved = list.editor.save()
  assert(saved.blocks.length === 2, 'List partial conversion did not preserve remainder')
  assert(saved.blocks[0].type === 'paragraph' && saved.blocks[0].data.text === 'One', 'List selected item did not convert to paragraph')
  assert(saved.blocks[1].type === 'list', 'List remainder changed type')
  assert(saved.blocks[1].data.style === 'ordered', 'List remainder lost ordered style')
  assert(saved.blocks[1].data.items.length === 1 && saved.blocks[1].data.items[0].text === 'Two', 'List remainder lost unselected item')
  list.editor.undo()
  await delay()
  saved = list.editor.save()
  assert(saved.blocks.length === 1 && saved.blocks[0].type === 'list' && saved.blocks[0].data.items.length === 2, 'List partial conversion undo was not atomic')
  list.editor.destroy()
  list.holder.remove()

  const cross = mount([
    { id: 'a', type: 'paragraph', dataVersion: 2, data: { text: 'FIRST' } },
    { id: 'b', type: 'paragraph', dataVersion: 2, data: { text: 'SECOND' } },
  ])
  const a = editable(cross, 'a')
  const b = editable(cross, 'b')
  selectRange(a, 2, b, 3)
  dropdown = await openType(cross)
  chooseType(dropdown, 'heading')
  await delay()
  saved = cross.editor.save()
  assert(saved.blocks.map(block => block.type).join(',') === 'paragraph,heading,heading,paragraph', 'cross-block text conversion shape is wrong')
  assert(saved.blocks[0].data.text === 'FI', 'cross-block conversion lost first prefix')
  assert(saved.blocks[1].data.text === 'RST', 'cross-block conversion lost first selected tail')
  assert(saved.blocks[2].data.text === 'SEC', 'cross-block conversion lost last selected head')
  assert(saved.blocks[3].data.text === 'OND', 'cross-block conversion lost last suffix')
  cross.editor.undo()
  await delay()
  saved = cross.editor.save()
  assert(saved.blocks.length === 2 && saved.blocks[0].data.text === 'FIRST' && saved.blocks[1].data.text === 'SECOND', 'cross-block conversion undo was not atomic')
  cross.editor.destroy()
  cross.holder.remove()

  const crossBackward = mount([
    { id: 'ba', type: 'paragraph', dataVersion: 2, data: { text: 'FIRST' } },
    { id: 'bb', type: 'paragraph', dataVersion: 2, data: { text: 'SECOND' } },
  ])
  const ba = editable(crossBackward, 'ba')
  const bb = editable(crossBackward, 'bb')
  selectBackward(bb, 3, ba, 2)
  dropdown = await openType(crossBackward)
  chooseType(dropdown, 'heading')
  await delay()
  saved = crossBackward.editor.save()
  assert(saved.blocks.map(block => block.type).join(',') === 'paragraph,heading,heading,paragraph', 'backward cross-block conversion shape is wrong')
  assert(saved.blocks[0].data.text === 'FI', 'backward cross-block conversion lost first prefix')
  assert(saved.blocks[1].data.text === 'RST', 'backward cross-block conversion lost first selected tail')
  assert(saved.blocks[2].data.text === 'SEC', 'backward cross-block conversion lost last selected head')
  assert(saved.blocks[3].data.text === 'OND', 'backward cross-block conversion lost last suffix')
  assertCollapsedFocus(crossBackward, saved.blocks[2].id, 'backward cross-block conversion')
  crossBackward.editor.undo()
  await delay()
  saved = crossBackward.editor.save()
  assert(saved.blocks.length === 2 && saved.blocks[0].data.text === 'FIRST' && saved.blocks[1].data.text === 'SECOND', 'backward cross-block conversion undo was not atomic')
  crossBackward.editor.destroy()
  crossBackward.holder.remove()

  const stale = mount([
    { id: 's', type: 'paragraph', dataVersion: 2, data: { text: 'KEEP' } },
  ])
  const s = editable(stale, 's')
  selectRange(s, 0, s, 4)
  dropdown = await openType(stale)
  const oldHeading = dropdown.querySelector('[data-plugin-type="heading"]')
  assert(oldHeading instanceof HTMLElement, 'stale type item fixture missing')
  const typeButton = stale.holder.querySelector('.oe-inline-toolbar__type-select')
  typeButton.click()
  typeButton.click()
  await delay()
  const beforeStale = JSON.stringify(stale.editor.save().blocks)
  oldHeading.click()
  assert(JSON.stringify(stale.editor.save().blocks) === beforeStale, 'retired type selector item changed document')
  const currentHeading = stale.holder.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]')
  assert(currentHeading instanceof HTMLElement && currentHeading !== oldHeading, 'type selector did not replace item session')
  currentHeading.click()
  await delay()
  assert(stale.editor.save().blocks.some(block => block.type === 'heading'), 'current type selector item did not convert')
  stale.editor.undo()
  stale.editor.setReadOnly(true)
  const readonlyBefore = JSON.stringify(stale.editor.save().blocks)
  currentHeading.click()
  assert(JSON.stringify(stale.editor.save().blocks) === readonlyBefore, 'retired type selector item acted in read-only mode')
  stale.editor.destroy()
  stale.holder.remove()

  const heading = mount([
    { id: 'h1', type: 'heading', dataVersion: 2, data: { text: 'FIRST', level: 2 } },
    { id: 'h2', type: 'heading', dataVersion: 2, data: { text: 'SECOND', level: 2 } },
  ])
  const h1 = editable(heading, 'h1')
  selectRange(h1, 0, h1, 5)
  await delay()
  const levelButton = heading.holder.querySelector('.oe-inline-toolbar__level-select')
  assert(levelButton instanceof HTMLButtonElement && !levelButton.hidden, 'Heading inline level control is missing')
  levelButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  levelButton.click()
  await delay()
  const level3 = heading.holder.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]')
  assert(level3 instanceof HTMLButtonElement, 'Heading level 3 action is missing')
  level3.click()
  await delay()
  assert(heading.editor.blocks.get('h1').data.level === 3, 'Heading inline level control did not update canonical data')
  heading.editor.undo()
  await delay()
  assert(heading.editor.blocks.get('h1').data.level === 2, 'Heading level control undo failed')
  heading.editor.redo()
  await delay()
  assert(heading.editor.blocks.get('h1').data.level === 3, 'Heading level control redo failed')

  const retiredLevel = level3
  const h2 = editable(heading, 'h2')
  selectRange(h2, 0, h2, 6)
  await delay()
  const beforeRetired = JSON.stringify(heading.editor.save().blocks)
  retiredLevel.click()
  assert(JSON.stringify(heading.editor.save().blocks) === beforeRetired, 'retired Heading level control edited a different block')
  heading.editor.setReadOnly(true)
  retiredLevel.click()
  assert(JSON.stringify(heading.editor.save().blocks) === beforeRetired, 'retired Heading control acted after read-only transition')
  heading.editor.destroy()
  heading.holder.remove()

  sandbox.replaceChildren()
  return {
    conversions: ['whole inline roundtrip/renderer', 'paragraph partial forward/backward', 'List data-aware', 'cross-block forward/backward'],
    controls: ['type selector', 'Heading level'],
    history: 'atomic undo/redo',
    staleCallbacks: 'inert',
  }
}

try {
  document.querySelector('#result').textContent = JSON.stringify(await run())
  document.body.dataset.status = 'pass'
} catch (error) {
  document.querySelector('#result').textContent = error?.stack || String(error)
  document.body.dataset.status = 'fail'
}
