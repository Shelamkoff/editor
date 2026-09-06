import { createColorSwatchPlugin, createEditor } from '../../core/index.js'
import {
  Attaches,
  CarouselBlock,
  Code,
  Checklist,
  Columns,
  Embed,
  Gallery,
  Heading,
  Image,
  LinkPreview,
  List,
  Paragraph,
  Person,
  Poll,
  Quote,
  Raw,
  Spoiler,
  Table,
  Toggle,
  Warning,
} from '../../plugins/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

const initialData = {
  version: 'browser-history',
  blocks: [
    { id: 'alpha', type: 'paragraph', data: { text: 'Alpha' } },
    { id: 'beta', type: 'paragraph', data: { text: 'Beta' } },
  ],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function stable(value) {
  return JSON.stringify(value)
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

function delay(ms = 10) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function shortcut(editor, { shift = false, target = editor.rootElement } = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: shift ? 'Z' : 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  }))
}

function redoWithY(editor, target = editor.rootElement) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'y',
    code: 'KeyY',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  }))
}

function createHarness(sandbox, data = initialData, options = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const plugins = [new Paragraph(), new Heading(), new List()]
  if (options.image) {
    plugins.push(options.image === 'data-url'
      ? new Image()
      : new Image({ uploadFile: async () => ({ url: pixel, alt: 'Pasted pixel' }) }))
  }
  if (options.gallery) {
    plugins.push(options.gallery === 'data-url'
      ? new Gallery()
      : new Gallery({ uploadFile: async () => ({ url: pixel, alt: 'Pasted pixel' }) }))
  }
  if (options.extraPlugins) plugins.push(...options.extraPlugins)
  const config = {
    holder,
    plugins,
    inlinePlugins: options.inlinePlugins ?? (options.inline ? [createColorSwatchPlugin()] : []),
    data: structuredClone(data),
  }
  if (options.inlineTools !== 'defaults') config.inlineTools = options.inlineTools ?? []
  if (!options.defaultTuning) {
    config.tuning = {
      undo: { debounceMs: 0, maxStack: 100 },
      change: { debounceMs: 0 },
      animations: { blockInsertMs: 0, blockMoveMs: 0 },
    }
  }
  const editor = createEditor(config)
  return { editor, holder }
}

async function snapshot(editor) {
  return semantic(editor.save())
}

async function assertUndoRedo(editor, label, mutate) {
  const before = await snapshot(editor)
  await mutate()
  await delay()
  const after = await snapshot(editor)
  assert(stable(after) !== stable(before), `${label} did not change the document`)

  const activeUndoTarget = document.activeElement instanceof HTMLElement
    && editor.rootElement.contains(document.activeElement)
    ? document.activeElement
    : editor.rootElement
  shortcut(editor, { target: activeUndoTarget })
  await delay()
  assert(stable(await snapshot(editor)) === stable(before), `${label} undo did not restore the previous document`)

  const activeRedoTarget = document.activeElement instanceof HTMLElement
    && editor.rootElement.contains(document.activeElement)
    ? document.activeElement
    : editor.rootElement
  shortcut(editor, { shift: true, target: activeRedoTarget })
  await delay()
  const redone = await snapshot(editor)
  assert(
    stable(redone) === stable(after),
    `${label} redo did not restore the changed document: expected ${stable(after)}, got ${stable(redone)}`,
  )
}

function setCaretToEnd(block) {
  const target = block.contentElement
  target.focus()
  const range = document.createRange()
  range.selectNodeContents(target)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  return target
}

function selectText(block, start = 0, end = block.contentElement.textContent?.length ?? 0) {
  const walker = document.createTreeWalker(block.contentElement, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  assert(nodes.length > 0, 'block has no selectable text')

  const locate = (offset) => {
    let remaining = offset
    for (const node of nodes) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) return { node, offset: remaining }
      remaining -= length
    }
    const node = nodes.at(-1)
    return { node, offset: node.textContent?.length ?? 0 }
  }

  const from = locate(start)
  const to = locate(end)
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  block.contentElement.focus()
  return range
}

function selectElementText(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.length) nodes.push(walker.currentNode)
  }
  assert(nodes.length > 0, 'contenteditable has no selectable text')
  const first = nodes[0]
  const last = nodes.at(-1)
  const range = document.createRange()
  range.setStart(first, 0)
  range.setEnd(last, last.textContent?.length ?? 0)
  element.focus()
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

function pointAtTextOffset(block, offset) {
  const target = block.contentElement
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.length) nodes.push(walker.currentNode)
  }
  assert(nodes.length > 0, 'cross-block fixture needs text content')
  let remaining = Math.max(0, offset)
  let node = nodes.at(-1)
  let clamped = node?.textContent?.length ?? 0
  for (const candidate of nodes) {
    const length = candidate.textContent?.length ?? 0
    if (remaining <= length) {
      node = candidate
      clamped = remaining
      break
    }
    remaining -= length
  }
  assert(node?.nodeType === Node.TEXT_NODE, 'cross-block text point is unavailable')
  const probe = document.createRange()
  if (clamped === 0) {
    probe.setStart(node, 0)
    probe.setEnd(node, Math.min(1, node.data.length))
  } else {
    probe.setStart(node, clamped - 1)
    probe.setEnd(node, clamped)
  }
  const rect = probe.getBoundingClientRect()
  return {
    x: clamped === 0 ? rect.left + 1 : rect.right - 1,
    y: rect.top + Math.max(1, rect.height / 2),
  }
}

async function activateCrossBlockSelection(editor, startBlock, endBlock, startOffset = 0, endOffset = endBlock.contentElement.textContent?.length ?? 0) {
  const start = pointAtTextOffset(startBlock, startOffset)
  const end = pointAtTextOffset(endBlock, endOffset)
  startBlock.contentElement.focus()
  startBlock.contentElement.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  }))
  document.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    clientX: end.x,
    clientY: end.y,
  }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }))
  await delay(20)
  assert(editor.rootElement.classList.contains('oe-editor--cross-selecting'), 'cross-block inline selection was not activated')
}

function dispatchEditorKey(target, key, code, options = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    code,
    ctrlKey: !!options.ctrlKey,
    shiftKey: !!options.shiftKey,
    bubbles: true,
    cancelable: true,
  }))
}

async function addBlockFromToolbar(editor, type) {
  const plus = editor.rootElement.querySelector('.oe-toolbar > [aria-label="Add block"]')
  assert(plus instanceof HTMLButtonElement, 'toolbar add button is missing')
  plus.click()
  await delay()

  const localItem = editor.rootElement.querySelector(`.oe-toolbox__item[data-plugin-type="${type}"]`)
  const portalledItems = [...document.querySelectorAll(`.oe-offcanvas-root .oe-toolbox__item[data-plugin-type="${type}"]`)]
  const item = localItem || portalledItems.at(-1)
  assert(item instanceof HTMLElement, `toolbox item ${type} is missing`)
  item.click()
  await delay()
  return editor.blocks.getCurrentBlock()
}

function dispatchPaste(editor, values) {
  const blocks = editor.blocks
  blocks.setCurrentIndex(0)
  const target = setCaretToEnd(blocks.getBlockByIndex(0))
  const clipboardData = new DataTransfer()
  for (const [type, value] of Object.entries(values)) clipboardData.setData(type, value)
  const event = new ClipboardEvent('paste', {
    clipboardData,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  assert(event.defaultPrevented, 'editor did not handle the paste event')
}

function dispatchFilePaste(editor) {
  const blocks = editor.blocks
  blocks.setCurrentIndex(0)
  const target = setCaretToEnd(blocks.getBlockByIndex(0))
  const clipboardData = new DataTransfer()
  clipboardData.items.add(new File(['pixel'], 'pixel.png', { type: 'image/png' }))
  const event = new ClipboardEvent('paste', {
    clipboardData,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  assert(event.defaultPrevented, 'editor did not handle file paste')
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(event.error?.stack || event.message))
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(event.reason?.stack || String(event.reason)))

  const structural = createHarness(sandbox)
  const { editor } = structural

  await assertUndoRedo(editor, 'typing', () => {
    const block = editor.blocks.getBlockByIndex(0)
    block.contentElement.innerHTML = 'Alpha edited'
    block.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })

  await assertUndoRedo(editor, 'split block', () => {
    const block = editor.blocks.getBlockByIndex(0)
    editor.blocks.setCurrentIndex(0)
    selectText(block, 5, 5)
    dispatchEditorKey(block.contentElement, 'Enter', 'Enter')
  })

  await assertUndoRedo(editor, 'insert', () => {
    editor.blocks.insert('paragraph', { text: 'Inserted' }, 1, 'inserted')
  })

  await assertUndoRedo(editor, 'move', () => {
    editor.blocks.move(0, 2)
  })

  await assertUndoRedo(editor, 'convert', () => {
    editor.blocks.convert(0, 'heading', { level: 3 })
  })

  await assertUndoRedo(editor, 'remove', () => {
    editor.blocks.remove(1)
  })

  await assertUndoRedo(editor, 'clear', () => {
    editor.clear()
  })

  await assertUndoRedo(editor, 'public render', () => {
    editor.render({
      version: 'browser-history',
      blocks: [
        { id: 'render-one', type: 'heading', data: { text: 'Rendered', level: 3 } },
        { id: 'render-two', type: 'paragraph', data: { text: 'Document' } },
      ],
    })
  })

  editor.destroy()
  assert(structural.holder.childNodes.length === 0, 'editor destroy left its root in the holder')

  const sequentialInsert = createHarness(sandbox)
  const beforeInserts = await snapshot(sequentialInsert.editor)
  sequentialInsert.editor.blocks.insert('paragraph', { text: 'First insert' }, 1, 'first-insert')
  const afterFirstInsert = await snapshot(sequentialInsert.editor)
  sequentialInsert.editor.blocks.insert('paragraph', { text: 'Second insert' }, 2, 'second-insert')
  const afterSecondInsert = await snapshot(sequentialInsert.editor)
  shortcut(sequentialInsert.editor)
  assert(stable(await snapshot(sequentialInsert.editor)) === stable(afterFirstInsert), 'first undo removed more than the second insert')
  shortcut(sequentialInsert.editor)
  assert(stable(await snapshot(sequentialInsert.editor)) === stable(beforeInserts), 'second undo did not remove the first insert')
  shortcut(sequentialInsert.editor, { shift: true })
  assert(stable(await snapshot(sequentialInsert.editor)) === stable(afterFirstInsert), 'first redo did not restore the first insert')
  shortcut(sequentialInsert.editor, { shift: true })
  assert(stable(await snapshot(sequentialInsert.editor)) === stable(afterSecondInsert), 'second redo did not restore the second insert')
  sequentialInsert.editor.destroy()

  // Exercise the real toolbar path as a user does: each inserted block becomes
  // current, then the next `+` action inserts after it. History must remain
  // strict LIFO and preserve the exact surviving block identity at every step.
  const toolbarInsert = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'toolbar-origin', type: 'paragraph', data: { text: 'Origin' } }],
  })
  toolbarInsert.editor.blocks.setCurrentIndex(0)
  toolbarInsert.editor.blocks.getBlockByIndex(0).focus()
  await delay()
  const addFromToolbar = async (type) => {
    const plus = toolbarInsert.editor.rootElement.querySelector('.oe-toolbar > [aria-label="Add block"]')
    assert(plus instanceof HTMLButtonElement, 'toolbar add button is missing')
    plus.click()
    await delay()
    // On a narrow viewport the toolbox is portalled into the editor's
    // off-canvas root, so query the document rather than assuming DOM nesting.
    const item = document.querySelector(`.oe-offcanvas-root .oe-toolbox__item[data-plugin-type="${type}"]`)
      || toolbarInsert.editor.rootElement.querySelector(`.oe-toolbox__item[data-plugin-type="${type}"]`)
    assert(item instanceof HTMLElement, `toolbox item ${type} is missing`)
    item.click()
    await delay()
  }
  const beforeToolbarInserts = await snapshot(toolbarInsert.editor)
  await addFromToolbar('heading')
  const afterFirstToolbarInsert = await snapshot(toolbarInsert.editor)
  const firstAddedId = afterFirstToolbarInsert[1]?.id
  assert(afterFirstToolbarInsert.map(block => block.type).join(',') === 'paragraph,heading', 'first toolbar insert has the wrong order')
  await addFromToolbar('list')
  const afterSecondToolbarInsert = await snapshot(toolbarInsert.editor)
  const secondAddedId = afterSecondToolbarInsert[2]?.id
  assert(afterSecondToolbarInsert.map(block => block.type).join(',') === 'paragraph,heading,list', 'second toolbar insert has the wrong order')
  assert(firstAddedId && secondAddedId && firstAddedId !== secondAddedId, 'toolbar inserts did not receive distinct identities')

  const currentAfterToolbarInsert = toolbarInsert.editor.blocks.getCurrentBlock()
  assert(currentAfterToolbarInsert?.id === secondAddedId, 'last toolbar insert did not become current')

  // Keep an editor overlay open while undoing. History must still be routed to
  // UndoManager; yielding to native contenteditable undo corrupts operation
  // ordering because the browser has no concept of editor blocks.
  const originBlock = toolbarInsert.editor.blocks.getBlockById('toolbar-origin')
  assert(originBlock, 'toolbar origin block is missing before undo')
  toolbarInsert.editor.blocks.setCurrentIndex(0)
  selectText(originBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay()
  const typeSelectorButton = toolbarInsert.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
  assert(typeSelectorButton instanceof HTMLButtonElement, 'inline type selector is missing')
  typeSelectorButton.click()
  assert(typeSelectorButton.getAttribute('aria-expanded') === 'true', 'inline type selector did not open')
  shortcut(toolbarInsert.editor, { target: originBlock.contentElement })
  await delay()
  const afterToolbarInsertUndo = await snapshot(toolbarInsert.editor)
  assert(stable(afterToolbarInsertUndo) === stable(afterFirstToolbarInsert), `toolbar undo did not remove the last added block ${secondAddedId}`)
  assert(afterToolbarInsertUndo.some(block => block.id === firstAddedId), `toolbar undo removed the first added block ${firstAddedId}`)
  redoWithY(toolbarInsert.editor, toolbarInsert.editor.blocks.getCurrentBlock().contentElement)
  await delay()
  assert(stable(await snapshot(toolbarInsert.editor)) === stable(afterSecondToolbarInsert), 'toolbar redo did not restore the last added block')
  shortcut(toolbarInsert.editor, { target: toolbarInsert.editor.blocks.getCurrentBlock().contentElement })
  shortcut(toolbarInsert.editor, { target: toolbarInsert.editor.blocks.getCurrentBlock().contentElement })
  await delay()
  assert(stable(await snapshot(toolbarInsert.editor)) === stable(beforeToolbarInserts), 'two toolbar undos did not remove blocks in reverse insertion order')
  toolbarInsert.editor.destroy()

  const formatting = createHarness(sandbox, initialData, { inlineTools: ['bold', 'italic'] })
  const beforeFormatting = await snapshot(formatting.editor)
  let formattedBlock = formatting.editor.blocks.getBlockByIndex(1)
  formatting.editor.blocks.setCurrentIndex(1)
  selectText(formattedBlock)
  dispatchEditorKey(formattedBlock.contentElement, 'b', 'KeyB', { ctrlKey: true })
  const afterBold = await snapshot(formatting.editor)
  assert(stable(afterBold) !== stable(beforeFormatting), 'bold formatting was not serialized')

  formattedBlock = formatting.editor.blocks.getBlockByIndex(1)
  selectText(formattedBlock)
  dispatchEditorKey(formattedBlock.contentElement, 'i', 'KeyI', { ctrlKey: true })
  const afterBoldItalic = await snapshot(formatting.editor)
  assert(stable(afterBoldItalic) !== stable(afterBold), 'italic formatting was not serialized')

  shortcut(formatting.editor)
  assert(stable(await snapshot(formatting.editor)) === stable(afterBold), 'formatting undo merged Bold and Italic into one step')
  shortcut(formatting.editor)
  assert(stable(await snapshot(formatting.editor)) === stable(beforeFormatting), 'second formatting undo did not restore plain text')
  shortcut(formatting.editor, { shift: true })
  assert(stable(await snapshot(formatting.editor)) === stable(afterBold), 'formatting redo did not restore Bold')
  shortcut(formatting.editor, { shift: true })
  assert(stable(await snapshot(formatting.editor)) === stable(afterBoldItalic), 'second formatting redo did not restore Italic')
  formatting.editor.destroy()

  const toolbarFormatting = createHarness(sandbox, initialData, { inlineTools: ['bold', 'italic'] })
  const beforeToolbarFormatting = await snapshot(toolbarFormatting.editor)
  let toolbarBlock = toolbarFormatting.editor.blocks.getBlockByIndex(1)
  toolbarFormatting.editor.blocks.setCurrentIndex(1)
  selectText(toolbarBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  toolbarFormatting.editor.rootElement.querySelector('[data-tool="bold"]').click()
  const afterToolbarBold = await snapshot(toolbarFormatting.editor)
  assert(stable(afterToolbarBold) !== stable(beforeToolbarFormatting), 'Bold toolbar click was not serialized')

  toolbarBlock = toolbarFormatting.editor.blocks.getBlockByIndex(1)
  selectText(toolbarBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  toolbarFormatting.editor.rootElement.querySelector('[data-tool="italic"]').click()
  const afterToolbarBoldItalic = await snapshot(toolbarFormatting.editor)
  assert(stable(afterToolbarBoldItalic) !== stable(afterToolbarBold), 'Italic toolbar click was not serialized')
  const toolbarUndoTarget = toolbarFormatting.editor.rootElement.querySelector('[data-tool="italic"]')
  assert(toolbarUndoTarget instanceof HTMLButtonElement, 'Italic toolbar button disappeared')
  toolbarUndoTarget.focus()
  shortcut(toolbarFormatting.editor, { target: toolbarUndoTarget })
  assert(stable(await snapshot(toolbarFormatting.editor)) === stable(afterToolbarBold), 'toolbar Italic undo merged with Bold')
  shortcut(toolbarFormatting.editor, { target: toolbarUndoTarget })
  assert(stable(await snapshot(toolbarFormatting.editor)) === stable(beforeToolbarFormatting), 'toolbar Bold undo did not restore plain text')
  shortcut(toolbarFormatting.editor, { shift: true, target: toolbarUndoTarget })
  assert(stable(await snapshot(toolbarFormatting.editor)) === stable(afterToolbarBold), 'toolbar Bold redo failed')
  shortcut(toolbarFormatting.editor, { shift: true, target: toolbarUndoTarget })
  assert(stable(await snapshot(toolbarFormatting.editor)) === stable(afterToolbarBoldItalic), 'toolbar Italic redo failed')
  toolbarFormatting.editor.destroy()

  // Structural and inline history must share one strict stack. This catches
  // regressions where an inline command is visible in DOM but its final block
  // snapshot is not committed, causing undo to fall through to block insertion.
  const mixedHistory = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'mixed-origin', type: 'paragraph', data: { text: 'Origin' } }],
  }, { inlineTools: ['bold'] })
  mixedHistory.editor.blocks.insert('paragraph', { text: 'Upper inserted' }, 1, 'mixed-upper')
  mixedHistory.editor.blocks.insert('paragraph', { text: 'Lower inserted' }, 2, 'mixed-lower')
  const beforeMixedBold = await snapshot(mixedHistory.editor)
  const mixedLower = mixedHistory.editor.blocks.getBlockById('mixed-lower')
  assert(mixedLower, 'lower inserted block is missing')
  mixedHistory.editor.blocks.setCurrentIndex(2)
  selectText(mixedLower)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  mixedHistory.editor.rootElement.querySelector('[data-tool="bold"]').click()
  const afterMixedBold = await snapshot(mixedHistory.editor)
  assert(stable(afterMixedBold) !== stable(beforeMixedBold), 'mixed-history Bold was not committed')
  shortcut(mixedHistory.editor)
  await delay()
  assert(stable(await snapshot(mixedHistory.editor)) === stable(beforeMixedBold), 'inline undo fell through to a structural insertion')
  assert(mixedHistory.editor.blocks.getBlockById('mixed-upper'), 'inline undo removed the upper inserted block')
  assert(mixedHistory.editor.blocks.getBlockById('mixed-lower'), 'inline undo removed the lower inserted block')
  shortcut(mixedHistory.editor, { shift: true })
  await delay()
  assert(stable(await snapshot(mixedHistory.editor)) === stable(afterMixedBold), 'mixed-history Bold redo failed')
  mixedHistory.editor.destroy()

  const demoHistory = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'demo-origin', type: 'paragraph', data: { text: 'Origin' } }],
  }, { inlineTools: 'defaults', defaultTuning: true })
  demoHistory.editor.blocks.setCurrentIndex(0)
  demoHistory.editor.blocks.getBlockByIndex(0).focus()
  await delay()

  const demoUpper = await addBlockFromToolbar(demoHistory.editor, 'paragraph')
  assert(demoUpper, 'demo upper block was not inserted')
  demoUpper.contentElement.textContent = 'Upper inserted'
  demoUpper.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))

  const demoLower = await addBlockFromToolbar(demoHistory.editor, 'paragraph')
  assert(demoLower, 'demo lower block was not inserted')
  demoLower.contentElement.textContent = 'Lower inserted'
  demoLower.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  const beforeDemoBold = await snapshot(demoHistory.editor)

  selectText(demoLower)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  const demoBold = demoHistory.editor.rootElement.querySelector('[data-tool="bold"]')
  assert(demoBold instanceof HTMLButtonElement, 'default Bold tool is missing')
  demoBold.click()
  const afterDemoBold = await snapshot(demoHistory.editor)
  assert(stable(afterDemoBold) !== stable(beforeDemoBold), 'default-toolbar Bold was not committed')
  shortcut(demoHistory.editor, { target: demoLower.contentElement })
  await delay()
  assert(stable(await snapshot(demoHistory.editor)) === stable(beforeDemoBold), 'default-toolbar undo removed a block instead of Bold')
  assert(demoHistory.editor.blocks.getBlockById(demoUpper.id), 'default-toolbar undo removed the upper inserted block')
  assert(demoHistory.editor.blocks.getBlockById(demoLower.id), 'default-toolbar undo removed the formatted block')
  shortcut(demoHistory.editor, { shift: true, target: demoHistory.editor.blocks.getBlockById(demoLower.id).contentElement })
  await delay()
  assert(stable(await snapshot(demoHistory.editor)) === stable(afterDemoBold), 'default-toolbar Bold redo failed')
  demoHistory.editor.destroy()

  const limitedHolder = document.createElement('section')
  sandbox.appendChild(limitedHolder)
  const limitedParagraph = new Paragraph()
  limitedParagraph.inlineTools = ['bold']
  const limitedTools = createEditor({
    holder: limitedHolder,
    plugins: [limitedParagraph],
    inlineTools: ['bold', 'italic'],
    data: {
      version: 'browser-history',
      blocks: [{ id: 'limited-tools', type: 'paragraph', data: { text: 'Limited tools' } }],
    },
    tuning: {
      undo: { debounceMs: 0, maxStack: 100 },
      change: { debounceMs: 0 },
      animations: { blockInsertMs: 0, blockMoveMs: 0 },
    },
  })
  const limitedBlock = limitedTools.blocks.getBlockByIndex(0)
  selectText(limitedBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  const limitedBold = limitedTools.rootElement.querySelector('[data-tool="bold"]')
  const limitedItalic = limitedTools.rootElement.querySelector('[data-tool="italic"]')
  assert(limitedBold instanceof HTMLButtonElement && !limitedBold.hidden, 'allowed per-block tool was hidden')
  assert(limitedItalic instanceof HTMLButtonElement && limitedItalic.hidden, 'disallowed per-block tool remained visible')
  limitedBlock.contentElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'i',
    code: 'KeyI',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  }))
  await delay()
  assert(!limitedBlock.contentElement.querySelector('em'), 'keyboard shortcut bypassed the per-block tool allowlist')
  limitedTools.destroy()

  const replacementHolder = document.createElement('section')
  sandbox.appendChild(replacementHolder)
  const replacementBold = {
    type: 'bold',
    title: 'Replacement bold',
    icon: '<span>B</span>',
    isActive: () => false,
    toggle(selection) {
      const underline = document.createElement('u')
      underline.append(selection.range.extractContents())
      selection.range.insertNode(underline)
    },
  }
  const replacementTools = createEditor({
    holder: replacementHolder,
    plugins: [new Paragraph()],
    inlineTools: ['bold', replacementBold],
    data: {
      version: 'browser-history',
      blocks: [{ id: 'replacement-tool', type: 'paragraph', data: { text: 'Replace me' } }],
    },
    tuning: { undo: { debounceMs: 0, maxStack: 100 } },
  })
  assert(replacementTools.rootElement.querySelectorAll('[data-tool="bold"]').length === 1, 'duplicate tool type created duplicate toolbar buttons')
  const replacementBlock = replacementTools.blocks.getBlockByIndex(0)
  selectText(replacementBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  replacementTools.rootElement.querySelector('[data-tool="bold"]').click()
  assert(replacementBlock.contentElement.querySelector('u'), 'later custom tool did not replace the built-in implementation')
  replacementTools.destroy()

  const enterHistory = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'enter-origin', type: 'paragraph', data: { text: 'Origin' } }],
  }, { inlineTools: 'defaults', defaultTuning: true })
  enterHistory.editor.blocks.setCurrentIndex(0)
  let enterTarget = setCaretToEnd(enterHistory.editor.blocks.getBlockByIndex(0))
  dispatchEditorKey(enterTarget, 'Enter', 'Enter')
  const enterUpper = enterHistory.editor.blocks.getCurrentBlock()
  assert(enterUpper && enterUpper.id !== 'enter-origin', 'Enter did not create the upper block')
  enterUpper.contentElement.textContent = 'Upper inserted'
  enterUpper.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))

  enterTarget = setCaretToEnd(enterUpper)
  dispatchEditorKey(enterTarget, 'Enter', 'Enter')
  const enterLower = enterHistory.editor.blocks.getCurrentBlock()
  assert(enterLower && enterLower.id !== enterUpper.id, 'second Enter did not create the lower block')
  enterLower.contentElement.textContent = 'Lower inserted'
  enterLower.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  const beforeEnterBold = await snapshot(enterHistory.editor)

  selectText(enterLower)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  enterHistory.editor.rootElement.querySelector('[data-tool="bold"]').click()
  const afterEnterBold = await snapshot(enterHistory.editor)
  assert(stable(afterEnterBold) !== stable(beforeEnterBold), 'Enter-history Bold was not committed')
  shortcut(enterHistory.editor, { target: enterLower.contentElement })
  await delay()
  assert(stable(await snapshot(enterHistory.editor)) === stable(beforeEnterBold), 'Enter-history undo removed a block instead of Bold')
  assert(enterHistory.editor.blocks.getBlockById(enterUpper.id), 'Enter-history undo removed the upper block')
  assert(enterHistory.editor.blocks.getBlockById(enterLower.id), 'Enter-history undo removed the lower block')
  shortcut(enterHistory.editor, { shift: true, target: enterHistory.editor.blocks.getBlockById(enterLower.id).contentElement })
  await delay()
  assert(stable(await snapshot(enterHistory.editor)) === stable(afterEnterBold), 'Enter-history Bold redo failed')
  enterHistory.editor.destroy()

  const crossInlineHistory = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'cross-origin', type: 'paragraph', data: { text: 'Origin' } }],
  }, { inlineTools: ['bold'] })
  const crossUpper = crossInlineHistory.editor.blocks.insert('paragraph', { text: 'Upper inserted' }, 1, 'cross-upper')
  const crossLower = crossInlineHistory.editor.blocks.insert('paragraph', { text: 'Lower inserted' }, 2, 'cross-lower')
  const beforeCrossBold = await snapshot(crossInlineHistory.editor)
  await activateCrossBlockSelection(crossInlineHistory.editor, crossUpper, crossLower)
  const crossBold = crossInlineHistory.editor.rootElement.querySelector('[data-tool="bold"]')
  assert(crossBold instanceof HTMLButtonElement, 'cross-block Bold tool is missing')
  crossBold.click()
  const afterCrossBold = await snapshot(crossInlineHistory.editor)
  assert(stable(afterCrossBold) !== stable(beforeCrossBold), 'cross-block Bold was not committed')
  shortcut(crossInlineHistory.editor, { target: crossInlineHistory.editor.rootElement })
  await delay()
  assert(stable(await snapshot(crossInlineHistory.editor)) === stable(beforeCrossBold), 'cross-block inline undo removed a structural block')
  assert(crossInlineHistory.editor.blocks.getBlockById('cross-upper'), 'cross-block inline undo removed the upper inserted block')
  assert(crossInlineHistory.editor.blocks.getBlockById('cross-lower'), 'cross-block inline undo removed the lower inserted block')
  shortcut(crossInlineHistory.editor, { shift: true })
  await delay()
  assert(stable(await snapshot(crossInlineHistory.editor)) === stable(afterCrossBold), 'cross-block Bold redo failed')
  crossInlineHistory.editor.destroy()

  const crossConvert = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [
      { id: 'convert-first', type: 'paragraph', data: { text: 'AlphaTail' } },
      { id: 'convert-last', type: 'paragraph', data: { text: 'BetaTail' } },
    ],
  })
  await assertUndoRedo(crossConvert.editor, 'partial cross-block conversion', async () => {
    const first = crossConvert.editor.blocks.getBlockById('convert-first')
    const last = crossConvert.editor.blocks.getBlockById('convert-last')
    assert(first && last, 'cross conversion fixture is incomplete')
    await activateCrossBlockSelection(crossConvert.editor, first, last, 2, 4)
    const selector = crossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
    assert(selector instanceof HTMLButtonElement, 'cross conversion type selector is missing')
    selector.click()
    const heading = crossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="heading"]')
    assert(heading instanceof HTMLElement, 'cross conversion heading option is missing')
    heading.click()
    await delay()
    const converted = await snapshot(crossConvert.editor)
    assert(converted.map(block => block.type).join(',') === 'paragraph,heading,heading,paragraph', `partial conversion changed the wrong interval: ${stable(converted)}`)
    assert(converted.map(block => block.data.text).join('|') === 'Al|phaTail|Beta|Tail', `partial conversion lost boundary content: ${stable(converted)}`)
  })
  crossConvert.editor.destroy()

  const structuredFirstCrossConvert = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [
      { id: 'structured-first-list', type: 'list', data: { style: 'ordered', items: ['First', '<strong>Second</strong>', 'Third'] } },
      { id: 'structured-first-tail', type: 'paragraph', data: { text: 'TailEnd' } },
    ],
  })
  await assertUndoRedo(structuredFirstCrossConvert.editor, 'structured first endpoint cross-block conversion', async () => {
    const first = structuredFirstCrossConvert.editor.blocks.getBlockById('structured-first-list')
    const last = structuredFirstCrossConvert.editor.blocks.getBlockById('structured-first-tail')
    assert(first && last, 'structured first endpoint fixture is incomplete')
    await activateCrossBlockSelection(structuredFirstCrossConvert.editor, first, last, 5, 4)
    const selector = structuredFirstCrossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
    assert(selector instanceof HTMLButtonElement, 'structured first endpoint selector is missing')
    selector.click()
    const heading = structuredFirstCrossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="heading"]')
    assert(heading instanceof HTMLElement, 'structured first endpoint heading option is missing')
    heading.click()
    await delay()
    const converted = await snapshot(structuredFirstCrossConvert.editor)
    assert(converted.map(block => block.type).join(',') === 'list,heading,heading,paragraph', `structured first endpoint order is invalid: ${stable(converted)}`)
    assert(stable(converted[0]?.data.items) === stable(['First']), `structured first endpoint lost its list remainder: ${stable(converted)}`)
    assert(converted[1]?.data.text === '<strong>Second</strong><br>Third', `structured first endpoint lost selected list data: ${stable(converted)}`)
    assert(converted[2]?.data.text === 'Tail' && converted[3]?.data.text === 'End', `structured first endpoint lost paragraph boundary data: ${stable(converted)}`)
  })
  structuredFirstCrossConvert.editor.destroy()

  const structuredLastCrossConvert = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [
      { id: 'structured-last-head', type: 'paragraph', data: { text: 'Alpha' } },
      { id: 'structured-last-list', type: 'list', data: { style: 'unordered', items: ['First', '<em>Second</em>', 'Third'] } },
    ],
  })
  await assertUndoRedo(structuredLastCrossConvert.editor, 'structured last endpoint cross-block conversion', async () => {
    const first = structuredLastCrossConvert.editor.blocks.getBlockById('structured-last-head')
    const last = structuredLastCrossConvert.editor.blocks.getBlockById('structured-last-list')
    assert(first && last, 'structured last endpoint fixture is incomplete')
    await activateCrossBlockSelection(structuredLastCrossConvert.editor, first, last, 2, 11)
    const selector = structuredLastCrossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
    assert(selector instanceof HTMLButtonElement, 'structured last endpoint selector is missing')
    selector.click()
    const heading = structuredLastCrossConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="heading"]')
    assert(heading instanceof HTMLElement, 'structured last endpoint heading option is missing')
    heading.click()
    await delay()
    const converted = await snapshot(structuredLastCrossConvert.editor)
    assert(converted.map(block => block.type).join(',') === 'paragraph,heading,heading,list', `structured last endpoint order is invalid: ${stable(converted)}`)
    assert(converted[0]?.data.text === 'Al' && converted[1]?.data.text === 'pha', `structured last endpoint lost paragraph boundary data: ${stable(converted)}`)
    assert(converted[2]?.data.text === 'First<br><em>Second</em>', `structured last endpoint lost selected list data: ${stable(converted)}`)
    assert(stable(converted[3]?.data.items) === stable(['Third']), `structured last endpoint lost its list remainder: ${stable(converted)}`)
  })
  structuredLastCrossConvert.editor.destroy()

  for (const style of ['ordered', 'unordered']) {
    const listConvert = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [
        { id: `${style}-list`, type: 'list', data: { style, items: ['First', '<strong>Second</strong>', 'Third'] } },
        { id: `${style}-tail`, type: 'paragraph', data: { text: 'Tail' } },
      ],
    })
    await assertUndoRedo(listConvert.editor, `${style} partial list conversion`, async () => {
      const listBlock = listConvert.editor.blocks.getBlockById(`${style}-list`)
      const secondItem = listBlock?.contentElement.querySelector(':scope > li:nth-child(2)')
      assert(secondItem instanceof HTMLElement, `${style} list second item is missing`)
      listConvert.editor.blocks.setCurrentIndex(0)
      selectElementText(secondItem)
      document.dispatchEvent(new Event('selectionchange'))
      await delay(20)

      const selector = listConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
      assert(selector instanceof HTMLButtonElement, `${style} list type selector is missing`)
      selector.click()
      const paragraph = listConvert.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="paragraph"]')
      assert(paragraph instanceof HTMLElement, `${style} list paragraph option is missing`)
      paragraph.click()
      await delay()

      const converted = await snapshot(listConvert.editor)
      assert(converted.map(block => block.type).join(',') === 'list,paragraph,paragraph', `${style} list inserted the converted block at the wrong position: ${stable(converted)}`)
      assert(stable(converted[0]?.data.items) === stable(['First', 'Third']), `${style} list did not remove and renumber the selected item: ${stable(converted)}`)
      assert(converted[1]?.data.text === '<strong>Second</strong>', `${style} list lost selected inline HTML: ${stable(converted)}`)
      assert(converted[2]?.data.text === 'Tail', `${style} list displaced the following block: ${stable(converted)}`)
    })
    listConvert.editor.destroy()
  }

  const listToMedia = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [
      { id: 'list-to-media', type: 'list', data: { style: 'ordered', items: ['First', 'Second', 'Third'] } },
      { id: 'list-to-media-tail', type: 'paragraph', data: { text: 'Tail' } },
    ],
  }, { image: 'data-url' })
  await assertUndoRedo(listToMedia.editor, 'partial list conversion to a non-text block', async () => {
    const listBlock = listToMedia.editor.blocks.getBlockById('list-to-media')
    const secondItem = listBlock?.contentElement.querySelector(':scope > li:nth-child(2)')
    assert(secondItem instanceof HTMLElement, 'list-to-media second item is missing')
    listToMedia.editor.blocks.setCurrentIndex(0)
    selectElementText(secondItem)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)

    const selector = listToMedia.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
    assert(selector instanceof HTMLButtonElement, 'list-to-media type selector is missing')
    selector.click()
    const image = listToMedia.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="image"]')
    assert(image instanceof HTMLElement, 'list-to-media image option is missing')
    image.click()
    await delay()

    const converted = await snapshot(listToMedia.editor)
    assert(converted.map(block => block.type).join(',') === 'list,image,paragraph', `non-text conversion inserted the block at the wrong position: ${stable(converted)}`)
    assert(stable(converted[0]?.data.items) === stable(['First', 'Third']), `non-text conversion did not remove and renumber the selected item: ${stable(converted)}`)
    assert(converted[2]?.data.text === 'Tail', `non-text conversion displaced the following block: ${stable(converted)}`)
  })
  listToMedia.editor.destroy()

  for (const [targetType, plugin] of [
    ['list', null],
    ['checklist', new Checklist()],
  ]) {
    const textToStructured = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `text-to-${targetType}`, type: 'paragraph', data: { text: 'Keep <strong>rich text</strong>' } }],
    }, { extraPlugins: plugin ? [plugin] : [] })
    await assertUndoRedo(textToStructured.editor, `paragraph to ${targetType} conversion`, async () => {
      const source = textToStructured.editor.blocks.getBlockByIndex(0)
      textToStructured.editor.blocks.setCurrentIndex(0)
      setCaretToEnd(source)
      document.dispatchEvent(new Event('selectionchange'))
      await delay(20)

      const selector = textToStructured.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
      assert(selector instanceof HTMLButtonElement, `${targetType} conversion selector is missing`)
      selector.click()
      const item = textToStructured.editor.rootElement.querySelector(`.oe-inline-toolbar__type-item[data-plugin-type="${targetType}"]`)
      assert(item instanceof HTMLElement, `${targetType} conversion option is missing`)
      item.click()
      await delay()

      const converted = await snapshot(textToStructured.editor)
      assert(converted[0]?.type === targetType, `paragraph was not converted to ${targetType}: ${stable(converted)}`)
      const transferred = targetType === 'list'
        ? converted[0]?.data.items?.[0]
        : converted[0]?.data.items?.[0]?.text
      assert(transferred === 'Keep <strong>rich text</strong>', `${targetType} conversion lost neutral rich text: ${stable(converted)}`)
    })
    textToStructured.editor.destroy()
  }

  const listToChecklist = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'list-to-checklist', type: 'list', data: { style: 'ordered', items: ['First', '<em>Second</em>', 'Third'] } }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(listToChecklist.editor, 'partial list to checklist conversion', async () => {
    const listBlock = listToChecklist.editor.blocks.getBlockByIndex(0)
    const secondItem = listBlock?.contentElement.querySelector(':scope > li:nth-child(2)')
    assert(secondItem instanceof HTMLElement, 'list-to-checklist second item is missing')
    listToChecklist.editor.blocks.setCurrentIndex(0)
    selectElementText(secondItem)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)

    const selector = listToChecklist.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')
    selector?.click()
    const checklist = listToChecklist.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="checklist"]')
    assert(checklist instanceof HTMLElement, 'list-to-checklist option is missing')
    checklist.click()
    await delay()

    const converted = await snapshot(listToChecklist.editor)
    assert(converted.map(block => block.type).join(',') === 'list,checklist', `list-to-checklist order is invalid: ${stable(converted)}`)
    assert(stable(converted[0]?.data.items) === stable(['First', 'Third']), `list-to-checklist did not retain unselected items: ${stable(converted)}`)
    assert(converted[1]?.data.items?.[0]?.text === '<em>Second</em>', `list-to-checklist lost selected HTML: ${stable(converted)}`)
  })
  listToChecklist.editor.destroy()

  const unsupportedStructuredSplit = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'checklist-partial-safe', type: 'checklist', data: { items: [{ text: 'Do not corrupt', checked: true }] } }],
  }, { extraPlugins: [new Checklist()] })
  const beforeUnsupportedSplit = await snapshot(unsupportedStructuredSplit.editor)
  const checklistText = unsupportedStructuredSplit.editor.rootElement.querySelector('.oe-checklist__text')
  assert(checklistText instanceof HTMLElement, 'structured split fixture is missing')
  unsupportedStructuredSplit.editor.blocks.setCurrentIndex(0)
  selectElementText(checklistText)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  unsupportedStructuredSplit.editor.rootElement.querySelector('.oe-inline-toolbar__type-select')?.click()
  const unsupportedParagraph = unsupportedStructuredSplit.editor.rootElement.querySelector('.oe-inline-toolbar__type-item[data-plugin-type="paragraph"]')
  assert(unsupportedParagraph instanceof HTMLElement, 'structured split paragraph option is missing')
  unsupportedParagraph.click()
  await delay()
  assert(stable(await snapshot(unsupportedStructuredSplit.editor)) === stable(beforeUnsupportedSplit), 'unsupported structured partial conversion corrupted the block')
  unsupportedStructuredSplit.editor.destroy()

  const slashPosition = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'slash-position', type: 'paragraph', data: { text: 'Prefix ' } }],
  }, {
    inlinePlugins: [createColorSwatchPlugin()],
    extraPlugins: [new Columns()],
  })
  slashPosition.holder.style.width = '800px'
  slashPosition.editor.rootElement.style.width = '800px'
  // The package stylesheet normally establishes this containing block.
  slashPosition.editor.rootElement.style.position = 'relative'
  const slashBlock = slashPosition.editor.blocks.getBlockById('slash-position')
  assert(slashBlock, 'slash command fixture is missing')
  slashPosition.editor.blocks.setCurrentIndex(0)
  slashBlock.contentElement.innerHTML = 'Prefix <span data-inline-plugin="test">Widget</span> /'
  setCaretToEnd(slashBlock)
  slashBlock.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  const slashMenu = slashPosition.editor.rootElement.querySelector('.oe-slash-menu')
  assert(slashMenu instanceof HTMLElement && slashMenu.style.display !== 'none', 'slash command menu did not open')
  // Browser fixtures do not import the package stylesheet; provide the
  // production list reset and width so positioning has real geometry.
  slashMenu.style.position = 'absolute'
  slashMenu.style.width = '240px'
  slashMenu.style.margin = '0'
  slashMenu.style.padding = '0'
  slashMenu.style.listStyle = 'none'
  const slashText = slashBlock.contentElement.lastChild
  assert(slashText?.nodeType === Node.TEXT_NODE, 'slash command fixture has no trailing text node')
  slashText.textContent = ' /col'
  setCaretToEnd(slashBlock)
  slashBlock.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay(20)
  const commandRange = document.createRange()
  commandRange.setStart(slashText, 1)
  commandRange.setEnd(slashText, slashText.textContent?.length ?? 1)
  const commandRect = commandRange.getClientRects()[0] ?? commandRange.getBoundingClientRect()
  const menuRect = slashMenu.getBoundingClientRect()
  assert(menuRect.left >= commandRect.left - 2 && menuRect.left <= commandRect.right + 2, `slash menu is not aligned with /col: command=${commandRect.left}-${commandRect.right}, menu=${menuRect.left}, root=${slashPosition.editor.rootElement.getBoundingClientRect().left}, style=${slashMenu.style.left}, text=${JSON.stringify(slashText.textContent)}`)
  assert(menuRect.top >= commandRect.bottom, `slash menu is not below /col: command=${commandRect.bottom}, menu=${menuRect.top}`)
  slashPosition.editor.destroy()

  const slashBlockInsert = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'slash-block-insert', type: 'paragraph', data: { text: 'Prefix ' } }],
  }, {
    inlinePlugins: [createColorSwatchPlugin()],
    extraPlugins: [new Columns()],
  })
  const slashSource = slashBlockInsert.editor.blocks.getBlockById('slash-block-insert')
  assert(slashSource, 'slash block insertion fixture is missing')
  slashBlockInsert.editor.blocks.setCurrentIndex(0)
  slashSource.contentElement.textContent = 'Prefix /'
  setCaretToEnd(slashSource)
  slashSource.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  slashSource.contentElement.textContent = 'Prefix /col'
  setCaretToEnd(slashSource)
  slashSource.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay(20)
  await assertUndoRedo(slashBlockInsert.editor, 'slash block insertion after existing text', async () => {
    const columnsItem = slashBlockInsert.editor.rootElement.querySelector('.oe-slash-menu__item')
    assert(columnsItem instanceof HTMLElement, 'slash command did not offer the Columns block')
    columnsItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await delay()

    const converted = await snapshot(slashBlockInsert.editor)
    assert(converted.map(block => block.type).join(',') === 'paragraph,columns', `slash command did not insert the block below its source: ${stable(converted)}`)
    assert(converted[0]?.data.text === 'Prefix ', `slash command changed the existing prefix: ${stable(converted)}`)
  })
  slashBlockInsert.editor.destroy()

  const pluginInlineCases = [
    ['paragraph', null, { text: 'Paragraph inline' }],
    ['heading', null, { text: 'Heading inline', level: 2 }],
    ['list', null, { style: 'unordered', items: ['List inline'] }],
    ['quote', new Quote(), { text: 'Quote inline', caption: 'Caption' }],
    ['table', new Table(), { withHeadings: false, content: [['Table inline']] }],
    ['columns', new Columns(), { layout: '1-1', columns: [{ content: 'Columns inline' }, { content: 'Second column' }] }],
    ['checklist', new Checklist(), { items: [{ text: 'Checklist inline', checked: false }] }],
    ['warning', new Warning(), { title: 'Warning inline', message: 'Message' }],
    ['toggle', new Toggle(), { title: 'Toggle inline', content: 'Content', open: true }],
    ['spoiler', new Spoiler(), { label: 'Spoiler inline', content: 'Content' }],
  ]
  for (const [type, extraPlugin, data] of pluginInlineCases) {
    const harness = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `${type}-origin`, type: 'paragraph', data: { text: 'Origin' } }],
    }, {
      inlineTools: ['bold'],
      extraPlugins: extraPlugin ? [extraPlugin] : [],
    })
    const inserted = harness.editor.blocks.insert(type, data, 1, `${type}-inline-block`)
    harness.editor.blocks.setCurrentIndex(1)
    const editables = [
      ...(inserted.contentElement.matches('[contenteditable="true"]') ? [inserted.contentElement] : []),
      ...inserted.contentElement.querySelectorAll('[contenteditable="true"]'),
    ]
    const editable = editables.find(element => element.textContent?.trim())
    assert(editable instanceof HTMLElement, `${type} has inlineTools=true but no editable text target`)
    const before = await snapshot(harness.editor)
    selectElementText(editable)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const bold = harness.editor.rootElement.querySelector('[data-tool="bold"]')
    assert(bold instanceof HTMLButtonElement, `${type} did not expose Bold for editable content`)
    bold.click()
    const after = await snapshot(harness.editor)
    assert(stable(after) !== stable(before), `${type} displayed Bold but did not persist it in save/history`)
    shortcut(harness.editor, { target: editable })
    await delay()
    assert(stable(await snapshot(harness.editor)) === stable(before), `${type} Bold undo fell through to block insertion`)
    assert(harness.editor.blocks.getBlockById(`${type}-inline-block`), `${type} Bold undo removed the inserted block`)
    shortcut(harness.editor, { shift: true, target: harness.editor.blocks.getBlockById(`${type}-inline-block`).contentElement })
    await delay()
    assert(stable(await snapshot(harness.editor)) === stable(after), `${type} Bold redo failed`)
    harness.editor.destroy()
  }

  const simpleInlineCases = [
    ['bold', 'b'],
    ['italic', 'i'],
    ['strikethrough', 's'],
    ['code', 'code'],
    ['marker', 'mark'],
  ]
  for (const [toolType, tag] of simpleInlineCases) {
    const applyHarness = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `${toolType}-apply`, type: 'paragraph', data: { text: 'Inline value' } }],
    }, { inlineTools: [toolType] })
    await assertUndoRedo(applyHarness.editor, `${toolType} apply`, async () => {
      const block = applyHarness.editor.blocks.getBlockByIndex(0)
      applyHarness.editor.blocks.setCurrentIndex(0)
      selectText(block)
      document.dispatchEvent(new Event('selectionchange'))
      await delay(20)
      const button = applyHarness.editor.rootElement.querySelector(`[data-tool="${toolType}"]`)
      assert(button instanceof HTMLButtonElement, `${toolType} button is missing`)
      button.click()
      await delay()
    })
    applyHarness.editor.destroy()

    const removeHarness = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `${toolType}-remove`, type: 'paragraph', data: { text: `<${tag}>Inline value</${tag}>` } }],
    }, { inlineTools: [toolType] })
    await assertUndoRedo(removeHarness.editor, `${toolType} removal`, async () => {
      const block = removeHarness.editor.blocks.getBlockByIndex(0)
      removeHarness.editor.blocks.setCurrentIndex(0)
      selectText(block)
      document.dispatchEvent(new Event('selectionchange'))
      await delay(20)
      const button = removeHarness.editor.rootElement.querySelector(`[data-tool="${toolType}"]`)
      assert(button instanceof HTMLButtonElement, `${toolType} removal button is missing`)
      button.click()
      await delay()
    })
    removeHarness.editor.destroy()
  }

  for (const [label, text] of [['uppercase', 'Inline value'], ['lowercase', 'INLINE VALUE']]) {
    const caseHarness = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `case-${label}`, type: 'paragraph', data: { text } }],
    }, { inlineTools: ['caseTransform'] })
    await assertUndoRedo(caseHarness.editor, `case transform ${label}`, async () => {
      const block = caseHarness.editor.blocks.getBlockByIndex(0)
      caseHarness.editor.blocks.setCurrentIndex(0)
      selectText(block)
      document.dispatchEvent(new Event('selectionchange'))
      await delay(20)
      caseHarness.editor.rootElement.querySelector('[data-tool="caseTransform"]').click()
      await delay()
    })
    caseHarness.editor.destroy()
  }

  const unicodeCase = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'case-unicode', type: 'paragraph', data: { text: 'Καλημέρα κόσμε' } }],
  }, { inlineTools: ['caseTransform'] })
  const unicodeBlock = unicodeCase.editor.blocks.getBlockByIndex(0)
  unicodeCase.editor.blocks.setCurrentIndex(0)
  selectText(unicodeBlock)
  document.dispatchEvent(new Event('selectionchange'))
  await delay(20)
  unicodeCase.editor.rootElement.querySelector('[data-tool="caseTransform"]').click()
  await delay()
  assert(unicodeCase.editor.save().blocks[0].data.text === 'ΚΑΛΗΜΈΡΑ ΚΌΣΜΕ', 'case transform ignored a cased non-Latin script')
  unicodeCase.editor.destroy()

  const clearFormatting = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'clear-inline-formatting',
      type: 'paragraph',
      data: { text: '<b><i><span style="font-size: 24px; background-color: rgb(10, 20, 30);">Inline value</span></i></b>' },
    }],
  }, { inlineTools: ['clearFormatting'] })
  await assertUndoRedo(clearFormatting.editor, 'clear formatting', async () => {
    const block = clearFormatting.editor.blocks.getBlockByIndex(0)
    clearFormatting.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    clearFormatting.editor.rootElement.querySelector('[data-tool="clearFormatting"]').click()
    await delay()
  })
  clearFormatting.editor.destroy()

  const partialClear = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'partial-clear-inline-formatting',
      type: 'paragraph',
      data: { text: '<b>Before selected after</b>' },
    }],
  }, { inlineTools: ['clearFormatting'] })
  await assertUndoRedo(partialClear.editor, 'partial clear formatting', async () => {
    const block = partialClear.editor.blocks.getBlockByIndex(0)
    partialClear.editor.blocks.setCurrentIndex(0)
    selectText(block, 7, 15)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    partialClear.editor.rootElement.querySelector('[data-tool="clearFormatting"]').click()
    await delay()
  })
  assert(
    partialClear.editor.save().blocks[0].data.text === '<b>Before </b>selected<b> after</b>',
    'partial clear formatting changed text outside the selected range',
  )
  partialClear.editor.destroy()

  const alignFormatting = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'align-apply', type: 'paragraph', data: { text: 'Aligned value' } }],
  }, { inlineTools: ['align'] })
  await assertUndoRedo(alignFormatting.editor, 'align center', async () => {
    const block = alignFormatting.editor.blocks.getBlockByIndex(0)
    alignFormatting.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    alignFormatting.editor.rootElement.querySelector('[data-tool="align"]').click()
    const actions = [...alignFormatting.editor.rootElement.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool:not(.oe-inline-tool--back)')]
    assert(actions.length === 4, 'alignment actions are incomplete')
    actions[1].click()
    await delay()
  })
  alignFormatting.editor.destroy()

  const structuredAlignment = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'quote-align', type: 'quote', data: { text: 'Aligned quote', caption: 'Author' } }],
  }, { inlineTools: ['align'], extraPlugins: [new Quote()] })
  await assertUndoRedo(structuredAlignment.editor, 'structured block alignment', async () => {
    const block = structuredAlignment.editor.blocks.getBlockByIndex(0)
    structuredAlignment.editor.blocks.setCurrentIndex(0)
    const quoteText = block.contentElement.querySelector('.oe-quote__text')
    assert(quoteText instanceof HTMLElement, 'quote text field is missing')
    selectElementText(quoteText)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    structuredAlignment.editor.rootElement.querySelector('[data-tool="align"]').click()
    const actions = [...structuredAlignment.editor.rootElement.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool:not(.oe-inline-tool--back)')]
    actions[1].click()
    await delay()
  })
  const structuredAlignedDocument = structuredAlignment.editor.save()
  assert(structuredAlignedDocument.blocks[0].tunes?.textAlign === 'center', 'structured block alignment was not serialized as a block tune')
  assert(structuredAlignment.editor.blocks.getBlockByIndex(0).contentElement.style.textAlign === 'center', 'structured block alignment was not applied to the complete plugin root')
  structuredAlignment.editor.destroy()

  const alignRemoval = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'align-remove', type: 'paragraph', data: { text: 'Aligned value', align: 'center' } }],
  }, { inlineTools: ['align'] })
  await assertUndoRedo(alignRemoval.editor, 'align reset', async () => {
    const block = alignRemoval.editor.blocks.getBlockByIndex(0)
    alignRemoval.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    alignRemoval.editor.rootElement.querySelector('[data-tool="align"]').click()
    const actions = [...alignRemoval.editor.rootElement.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool:not(.oe-inline-tool--back)')]
    actions[0].click()
    await delay()
  })
  alignRemoval.editor.destroy()

  const scriptFormatting = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'script-apply', type: 'paragraph', data: { text: 'Script value' } }],
  }, { inlineTools: ['script'] })
  await assertUndoRedo(scriptFormatting.editor, 'superscript apply', async () => {
    const block = scriptFormatting.editor.blocks.getBlockByIndex(0)
    scriptFormatting.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    scriptFormatting.editor.rootElement.querySelector('[data-tool="script"]').click()
    const actions = [...scriptFormatting.editor.rootElement.querySelectorAll('.oe-inline-toolbar__script-panel .oe-inline-tool:not(.oe-inline-tool--back)')]
    assert(actions.length === 3, 'script actions are incomplete')
    actions[0].click()
    await delay()
  })
  scriptFormatting.editor.destroy()

  const scriptRemoval = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'script-remove', type: 'paragraph', data: { text: '<sup>Script value</sup>' } }],
  }, { inlineTools: ['script'] })
  await assertUndoRedo(scriptRemoval.editor, 'superscript removal', async () => {
    const block = scriptRemoval.editor.blocks.getBlockByIndex(0)
    scriptRemoval.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    scriptRemoval.editor.rootElement.querySelector('[data-tool="script"]').click()
    const actions = [...scriptRemoval.editor.rootElement.querySelectorAll('.oe-inline-toolbar__script-panel .oe-inline-tool:not(.oe-inline-tool--back)')]
    assert(actions.length === 3, 'script removal actions are incomplete')
    actions[2].click()
    await delay()
  })
  scriptRemoval.editor.destroy()

  const backgroundFormatting = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'background-origin', type: 'paragraph', data: { text: 'Origin' } }],
  }, { inlineTools: ['bgcolor'] })
  backgroundFormatting.editor.blocks.insert('paragraph', { text: 'Upper inserted' }, 1, 'background-upper')
  const backgroundTarget = backgroundFormatting.editor.blocks.insert('paragraph', { text: 'Color value' }, 2, 'background-apply')
  await assertUndoRedo(backgroundFormatting.editor, 'background color apply', async () => {
    backgroundFormatting.editor.blocks.setCurrentIndex(2)
    selectText(backgroundTarget)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    backgroundFormatting.editor.rootElement.querySelector('[data-tool="bgcolor"]').click()
    const input = backgroundFormatting.editor.rootElement.querySelector('.oe-color-hex')
    assert(input instanceof HTMLInputElement, 'background color input is missing')
    input.focus()
    input.value = '#336699'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    backgroundFormatting.editor.rootElement.querySelector('.oe-color-btn--apply').click()
    await delay()
  })
  assert(backgroundFormatting.editor.blocks.getBlockById('background-upper'), 'background color undo removed the upper inserted block')
  assert(backgroundFormatting.editor.blocks.getBlockById('background-apply'), 'background color undo removed the formatted block')
  backgroundFormatting.editor.destroy()

  const backgroundRemoval = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'background-remove', type: 'paragraph', data: { text: '<span style="background-color: rgb(51, 102, 153);">Color value</span>' } }],
  }, { inlineTools: ['bgcolor'] })
  await assertUndoRedo(backgroundRemoval.editor, 'background color removal', async () => {
    const block = backgroundRemoval.editor.blocks.getBlockByIndex(0)
    backgroundRemoval.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    backgroundRemoval.editor.rootElement.querySelector('[data-tool="bgcolor"]').click()
    const remove = backgroundRemoval.editor.rootElement.querySelector('.oe-color-btn--remove')
    assert(remove instanceof HTMLButtonElement, 'background color remove action is missing')
    remove.click()
    await delay()
  })
  backgroundRemoval.editor.destroy()

  const linkFormatting = createHarness(sandbox, initialData, { inlineTools: ['link'] })
  await assertUndoRedo(linkFormatting.editor, 'link action formatting', async () => {
    const block = linkFormatting.editor.blocks.getBlockByIndex(1)
    linkFormatting.editor.blocks.setCurrentIndex(1)
    selectText(block)
    dispatchEditorKey(block.contentElement, 'k', 'KeyK', { ctrlKey: true })
    const input = linkFormatting.editor.rootElement.querySelector('.oe-inline-toolbar__link-input')
    assert(input instanceof HTMLInputElement, 'link action panel did not open')
    input.focus()
    input.value = 'https://example.com/profile'
    linkFormatting.editor.rootElement.querySelector('.oe-inline-tool--apply').click()
    await delay()
  })
  linkFormatting.editor.destroy()

  const unlinkFormatting = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'linked',
      type: 'paragraph',
      data: { text: '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Linked text</a>' },
    }],
  }, { inlineTools: ['link'] })
  await assertUndoRedo(unlinkFormatting.editor, 'link removal', async () => {
    const block = unlinkFormatting.editor.blocks.getBlockByIndex(0)
    unlinkFormatting.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const button = unlinkFormatting.editor.rootElement.querySelector('[data-tool="link"]')
    assert(button instanceof HTMLButtonElement, 'link toolbar button is missing')
    button.click()
    await delay()
  })
  unlinkFormatting.editor.destroy()

  const fontFormatting = createHarness(sandbox, initialData, { inlineTools: ['fontSize'] })
  await assertUndoRedo(fontFormatting.editor, 'font-size dropdown formatting', async () => {
    const block = fontFormatting.editor.blocks.getBlockByIndex(1)
    fontFormatting.editor.blocks.setCurrentIndex(1)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const button = fontFormatting.editor.rootElement.querySelector('[data-tool="fontSize"]')
    assert(button instanceof HTMLButtonElement, 'font-size tool button is missing')
    button.click()
    const input = fontFormatting.editor.rootElement.querySelector('.oe-font-size-input')
    assert(input instanceof HTMLInputElement, 'font-size input is missing')
    input.focus()
    const preset = fontFormatting.editor.rootElement.querySelector('.oe-font-size-item[data-size="24"]')
    assert(preset instanceof HTMLElement, 'font-size preset is missing')
    preset.click()
    await delay()
  })
  fontFormatting.editor.destroy()

  for (const invalidValue of ['201', '12.5']) {
    const invalidFont = createHarness(sandbox, initialData, { inlineTools: ['fontSize'] })
    const beforeInvalidFont = await snapshot(invalidFont.editor)
    const block = invalidFont.editor.blocks.getBlockByIndex(1)
    invalidFont.editor.blocks.setCurrentIndex(1)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    invalidFont.editor.rootElement.querySelector('[data-tool="fontSize"]').click()
    const input = invalidFont.editor.rootElement.querySelector('.oe-font-size-input')
    assert(input instanceof HTMLInputElement, 'font-size input is missing for range validation')
    input.value = invalidValue
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await delay()
    assert(
      stable(await snapshot(invalidFont.editor)) === stable(beforeInvalidFont),
      `font-size accepted invalid custom value ${invalidValue}`,
    )
    invalidFont.editor.destroy()
  }

  const fontRemoval = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'font-remove', type: 'paragraph', data: { text: '<span style="font-size: 24px;">Sized value</span>' } }],
  }, { inlineTools: ['fontSize'] })
  await assertUndoRedo(fontRemoval.editor, 'font-size removal', async () => {
    const block = fontRemoval.editor.blocks.getBlockByIndex(0)
    fontRemoval.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const button = fontRemoval.editor.rootElement.querySelector('[data-tool="fontSize"]')
    assert(button instanceof HTMLButtonElement, 'font-size removal button is missing')
    button.click()
    const input = fontRemoval.editor.rootElement.querySelector('.oe-font-size-input')
    assert(input instanceof HTMLInputElement, 'font-size removal input is missing')
    input.focus()
    const reset = fontRemoval.editor.rootElement.querySelector('.oe-font-size-reset')
    assert(reset instanceof HTMLButtonElement, 'font-size reset action is missing')
    reset.click()
    await delay()
  })
  fontRemoval.editor.destroy()

  const partialFontRemoval = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'partial-font-remove',
      type: 'paragraph',
      data: { text: '<span style="font-size: 24px; background-color: rgb(10, 20, 30);">Before selected after</span>' },
    }],
  }, { inlineTools: ['fontSize'] })
  await assertUndoRedo(partialFontRemoval.editor, 'partial font-size removal', async () => {
    const block = partialFontRemoval.editor.blocks.getBlockByIndex(0)
    partialFontRemoval.editor.blocks.setCurrentIndex(0)
    selectText(block, 7, 15)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const button = partialFontRemoval.editor.rootElement.querySelector('[data-tool="fontSize"]')
    assert(button instanceof HTMLButtonElement, 'partial font-size removal button is missing')
    button.click()
    const reset = partialFontRemoval.editor.rootElement.querySelector('.oe-font-size-reset')
    assert(reset instanceof HTMLButtonElement, 'partial font-size reset action is missing')
    reset.click()
    await delay()
  })
  const partialFontBlock = partialFontRemoval.editor.blocks.getBlockByIndex(0).contentElement
  const partialFontNodes = []
  const partialFontWalker = document.createTreeWalker(partialFontBlock, NodeFilter.SHOW_TEXT)
  while (partialFontWalker.nextNode()) partialFontNodes.push(partialFontWalker.currentNode)
  const selectedNode = partialFontNodes.find(node => node.textContent === 'selected')
  const beforeNode = partialFontNodes.find(node => node.textContent === 'Before ')
  const afterNode = partialFontNodes.find(node => node.textContent === ' after')
  const fontAncestor = node => node?.parentElement?.closest('span[style*="font-size"]') ?? null
  assert(selectedNode && !fontAncestor(selectedNode), 'font-size remained on the selected text')
  assert(beforeNode && fontAncestor(beforeNode), 'font-size was removed before the selected text')
  assert(afterNode && fontAncestor(afterNode), 'font-size was removed after the selected text')
  assert(
    selectedNode.parentElement?.closest('span[style*="background-color"]'),
    'font-size reset removed an unrelated style from the selected text',
  )
  partialFontRemoval.editor.destroy()

  const headingControls = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'heading-control', type: 'heading', data: { text: 'Heading control', level: 2 } }],
  })
  await assertUndoRedo(headingControls.editor, 'heading inline control', async () => {
    const block = headingControls.editor.blocks.getBlockByIndex(0)
    headingControls.editor.blocks.setCurrentIndex(0)
    selectText(block)
    document.dispatchEvent(new Event('selectionchange'))
    await delay(20)
    const select = headingControls.editor.rootElement.querySelector('.oe-inline-toolbar__level-select')
    assert(select instanceof HTMLButtonElement, 'heading level control is missing')
    select.click()
    const level = headingControls.editor.rootElement.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]')
    assert(level instanceof HTMLButtonElement, 'heading level 3 action is missing')
    level.click()
    await delay()
  })
  headingControls.editor.destroy()

  // BlockPluginContext regressions: plugin-owned DOM commands must capture
  // their pre-state before mutating and commit independently of debounce.
  const rawCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'raw-command', type: 'raw', data: { html: 'x' } }],
  }, { extraPlugins: [new Raw()] })
  await assertUndoRedo(rawCommand.editor, 'raw Tab command', () => {
    const textarea = rawCommand.editor.rootElement.querySelector('.oe-raw__textarea')
    assert(textarea instanceof HTMLTextAreaElement, 'raw textarea is missing')
    textarea.focus()
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length
    dispatchEditorKey(textarea, 'Tab', 'Tab')
  })
  rawCommand.editor.destroy()

  const rawDedentCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'raw-dedent-command', type: 'raw', data: { html: '  first\n second\nthird' } }],
  }, { extraPlugins: [new Raw()] })
  await assertUndoRedo(rawDedentCommand.editor, 'raw multiline Shift+Tab command', () => {
    const textarea = rawDedentCommand.editor.rootElement.querySelector('.oe-raw__textarea')
    assert(textarea instanceof HTMLTextAreaElement, 'raw textarea is missing for dedent')
    textarea.focus()
    textarea.selectionStart = 0
    textarea.selectionEnd = textarea.value.length
    dispatchEditorKey(textarea, 'Tab', 'Tab', { shiftKey: true })
    assert(textarea.value === 'first\nsecond\nthird', 'raw multiline Shift+Tab did not dedent every selected line')
  })
  rawDedentCommand.editor.destroy()

  const codeCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'code-command', type: 'code', data: { code: 'x', language: 'auto' } }],
  }, { extraPlugins: [new Code()] })
  await assertUndoRedo(codeCommand.editor, 'code Tab command', () => {
    const textarea = codeCommand.editor.rootElement.querySelector('.oe-code-textarea')
    assert(textarea instanceof HTMLTextAreaElement, 'code textarea is missing')
    textarea.focus()
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length
    dispatchEditorKey(textarea, 'Tab', 'Tab')
  })
  codeCommand.editor.destroy()

  const codeDedentCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'code-dedent-command', type: 'code', data: { code: '    first\n  second\nthird', language: 'auto' } }],
  }, { extraPlugins: [new Code()] })
  await assertUndoRedo(codeDedentCommand.editor, 'code multiline Shift+Tab command', () => {
    const edit = codeDedentCommand.editor.rootElement.querySelector('.oe-code-btn--edit')
    const textarea = codeDedentCommand.editor.rootElement.querySelector('.oe-code-textarea')
    assert(edit instanceof HTMLButtonElement && textarea instanceof HTMLTextAreaElement, 'code edit controls are missing')
    edit.click()
    textarea.focus()
    textarea.selectionStart = 0
    textarea.selectionEnd = textarea.value.length
    dispatchEditorKey(textarea, 'Tab', 'Tab', { shiftKey: true })
    assert(textarea.value === 'first\nsecond\nthird', 'code multiline Shift+Tab did not dedent every selected line')
  })
  codeDedentCommand.editor.destroy()

  const listCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'list-command', type: 'list', data: { items: ['One', 'Two'], style: 'unordered' } }],
  })
  await assertUndoRedo(listCommand.editor, 'list item split command', () => {
    const item = listCommand.editor.rootElement.querySelector('.oe-list__item')
    assert(item instanceof HTMLElement, 'list item is missing')
    selectElementText(item)
    const selection = window.getSelection()
    selection?.collapseToEnd()
    dispatchEditorKey(item, 'Enter', 'Enter')
  })
  listCommand.editor.destroy()

  const listSelectionCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'list-selection-command', type: 'list', data: { items: ['Alpha selection', 'Middle', 'Omega tail'], style: 'ordered' } }],
  })
  await assertUndoRedo(listSelectionCommand.editor, 'list selected range replacement command', () => {
    const items = listSelectionCommand.editor.rootElement.querySelectorAll('.oe-list__item')
    const firstText = items[0]?.firstChild
    const lastText = items[2]?.firstChild
    assert(firstText?.nodeType === Node.TEXT_NODE && lastText?.nodeType === Node.TEXT_NODE, 'list selection text nodes are missing')
    const range = document.createRange()
    range.setStart(firstText, 6)
    range.setEnd(lastText, 6)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(/** @type {HTMLElement} */ (items[0]), 'Enter', 'Enter')
  })
  const listSelectionData = (await snapshot(listSelectionCommand.editor))[0]?.data
  assert(
    listSelectionData?.items?.length === 2
      && listSelectionData.items[0] === 'Alpha'
      && listSelectionData.items[1] === 'tail',
    `list Enter did not replace the selected item range: ${stable(listSelectionData)}`,
  )
  listSelectionCommand.editor.destroy()

  const listExit = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'list-exit', type: 'list', data: { items: ['One', ''], style: 'ordered' } }],
  })
  await assertUndoRedo(listExit.editor, 'list empty last item exit command', () => {
    const item = listExit.editor.rootElement.querySelector('.oe-list__item:last-child')
    assert(item instanceof HTMLElement, 'empty last list item is missing')
    listExit.editor.blocks.setCurrentIndex(0)
    item.focus()
    const range = document.createRange()
    range.selectNodeContents(item)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(item, 'Enter', 'Enter')
  })
  const exitedList = await snapshot(listExit.editor)
  assert(exitedList.map(block => block.type).join(',') === 'list,paragraph', `empty last list item did not create a following paragraph: ${stable(exitedList)}`)
  assert(stable(exitedList[0]?.data.items) === stable(['One']), `empty last list item was not removed: ${stable(exitedList)}`)
  listExit.editor.destroy()

  const emptyListExit = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'empty-list-exit', type: 'list', data: { items: [''], style: 'unordered' } }],
  })
  await assertUndoRedo(emptyListExit.editor, 'single empty list exit command', () => {
    const item = emptyListExit.editor.rootElement.querySelector('.oe-list__item')
    assert(item instanceof HTMLElement, 'single empty list item is missing')
    emptyListExit.editor.blocks.setCurrentIndex(0)
    item.focus()
    const range = document.createRange()
    range.selectNodeContents(item)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(item, 'Enter', 'Enter')
  })
  const convertedEmptyList = await snapshot(emptyListExit.editor)
  assert(convertedEmptyList.length === 1 && convertedEmptyList[0]?.type === 'paragraph', `single empty list was not converted to the default block: ${stable(convertedEmptyList)}`)
  emptyListExit.editor.destroy()

  const checklistCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'check-command', type: 'checklist', data: { items: [{ text: 'Check', checked: false }] } }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(checklistCommand.editor, 'checklist toggle command', () => {
    const checkbox = checklistCommand.editor.rootElement.querySelector('.oe-checklist__checkbox')
    assert(checkbox instanceof HTMLButtonElement, 'checklist checkbox is missing')
    checkbox.click()
  })
  checklistCommand.editor.destroy()

  const checklistSelectionCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'checklist-selection-command',
      type: 'checklist',
      data: { items: [
        { text: 'Alpha selection', checked: true },
        { text: 'Middle', checked: false },
        { text: 'Omega tail', checked: true },
      ] },
    }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(checklistSelectionCommand.editor, 'checklist selected range replacement command', () => {
    const texts = checklistSelectionCommand.editor.rootElement.querySelectorAll('.oe-checklist__text')
    const firstText = texts[0]?.firstChild
    const lastText = texts[2]?.firstChild
    assert(firstText?.nodeType === Node.TEXT_NODE && lastText?.nodeType === Node.TEXT_NODE, 'checklist selection text nodes are missing')
    const range = document.createRange()
    range.setStart(firstText, 6)
    range.setEnd(lastText, 6)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(/** @type {HTMLElement} */ (texts[0]), 'Enter', 'Enter')
  })
  const checklistSelectionData = (await snapshot(checklistSelectionCommand.editor))[0]?.data
  assert(
    checklistSelectionData?.items?.length === 2
      && checklistSelectionData.items[0]?.text === 'Alpha'
      && checklistSelectionData.items[0]?.checked === true
      && checklistSelectionData.items[1]?.text === 'tail'
      && checklistSelectionData.items[1]?.checked === false,
    `checklist Enter did not replace the selected item range: ${stable(checklistSelectionData)}`,
  )
  checklistSelectionCommand.editor.destroy()

  const checklistNestedBackspace = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'checklist-nested-backspace', type: 'checklist', data: { items: [
      { text: 'Previous', checked: false },
      { text: '<strong>Current</strong>', checked: true },
    ] } }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(checklistNestedBackspace.editor, 'checklist nested Backspace merge command', () => {
    const nested = checklistNestedBackspace.editor.rootElement.querySelector('.oe-checklist__item:last-child strong')?.firstChild
    assert(nested?.nodeType === Node.TEXT_NODE, 'nested checklist text is missing')
    const range = document.createRange()
    range.setStart(nested, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(/** @type {HTMLElement} */ (nested.parentElement), 'Backspace', 'Backspace')
  })
  const nestedBackspaceData = (await snapshot(checklistNestedBackspace.editor))[0]?.data
  assert(
    nestedBackspaceData?.items?.length === 1
      && nestedBackspaceData.items[0]?.text === 'Previous<strong>Current</strong>',
    `checklist Backspace did not merge a nested first text node: ${stable(nestedBackspaceData)}`,
  )
  checklistNestedBackspace.editor.destroy()

  const checklistExit = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'check-exit',
      type: 'checklist',
      data: { items: [{ text: 'Keep', checked: true }, { text: '', checked: false }] },
    }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(checklistExit.editor, 'checklist empty last item exit command', () => {
    const item = checklistExit.editor.rootElement.querySelector('.oe-checklist__item:last-child .oe-checklist__text')
    assert(item instanceof HTMLElement, 'empty last checklist item is missing')
    checklistExit.editor.blocks.setCurrentIndex(0)
    item.focus()
    const range = document.createRange()
    range.selectNodeContents(item)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(item, 'Enter', 'Enter')
  })
  const exitedChecklist = await snapshot(checklistExit.editor)
  assert(exitedChecklist.map(block => block.type).join(',') === 'checklist,paragraph', `empty last checklist item did not create a following paragraph: ${stable(exitedChecklist)}`)
  assert(exitedChecklist[0]?.data.items?.length === 1, `empty last checklist item was not removed: ${stable(exitedChecklist)}`)
  checklistExit.editor.destroy()

  const emptyChecklistExit = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'empty-check-exit', type: 'checklist', data: { items: [{ text: '', checked: false }] } }],
  }, { extraPlugins: [new Checklist()] })
  await assertUndoRedo(emptyChecklistExit.editor, 'single empty checklist exit command', () => {
    const item = emptyChecklistExit.editor.rootElement.querySelector('.oe-checklist__text')
    assert(item instanceof HTMLElement, 'single empty checklist item is missing')
    emptyChecklistExit.editor.blocks.setCurrentIndex(0)
    item.focus()
    const range = document.createRange()
    range.selectNodeContents(item)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    dispatchEditorKey(item, 'Enter', 'Enter')
  })
  const convertedEmptyChecklist = await snapshot(emptyChecklistExit.editor)
  assert(convertedEmptyChecklist.length === 1 && convertedEmptyChecklist[0]?.type === 'paragraph', `single empty checklist was not converted to the default block: ${stable(convertedEmptyChecklist)}`)
  emptyChecklistExit.editor.destroy()

  const tableCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'table-command', type: 'table', data: { content: [['Cell']], withHeadings: false } }],
  }, { extraPlugins: [new Table()] })
  await assertUndoRedo(tableCommand.editor, 'table line break command', () => {
    const cell = tableCommand.editor.rootElement.querySelector('.oe-table__cell')
    assert(cell instanceof HTMLElement, 'table cell is missing')
    selectElementText(cell)
    window.getSelection()?.collapseToEnd()
    dispatchEditorKey(cell, 'Enter', 'Enter')
  })

  const tableCells = [...tableCommand.editor.rootElement.querySelectorAll('.oe-table__cell')]
  assert(tableCells.length > 0, 'table navigation cells are missing')
  const firstCell = tableCells[0]
  const lastCell = tableCells.at(-1)
  firstCell.focus()
  const backwardBoundary = new KeyboardEvent('keydown', {
    key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
  })
  assert(firstCell.dispatchEvent(backwardBoundary) === true && !backwardBoundary.defaultPrevented, 'Shift+Tab was trapped at the first table cell')
  lastCell.focus()
  const forwardBoundary = new KeyboardEvent('keydown', {
    key: 'Tab', code: 'Tab', bubbles: true, cancelable: true,
  })
  assert(lastCell.dispatchEvent(forwardBoundary) === true && !forwardBoundary.defaultPrevented, 'Tab was trapped at the last table cell')
  tableCommand.editor.destroy()

  const quoteFocus = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'quote-focus', type: 'quote', data: { text: 'Quotation', caption: 'Author' } }],
  }, { extraPlugins: [new Quote()] })
  const quoteText = quoteFocus.editor.rootElement.querySelector('.oe-quote__text')
  const quoteCaption = quoteFocus.editor.rootElement.querySelector('.oe-quote__caption')
  assert(quoteText instanceof HTMLElement && quoteCaption instanceof HTMLElement, 'quote focus fields are missing')
  quoteText.focus()
  const quoteForward = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })
  quoteText.dispatchEvent(quoteForward)
  assert(quoteForward.defaultPrevented && document.activeElement === quoteCaption, 'Tab did not move from quote text to caption')
  const quoteExitForward = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })
  assert(quoteCaption.dispatchEvent(quoteExitForward) === true && !quoteExitForward.defaultPrevented, 'Tab was trapped after the quote caption')
  quoteCaption.focus()
  const quoteBackward = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  quoteCaption.dispatchEvent(quoteBackward)
  assert(quoteBackward.defaultPrevented && document.activeElement === quoteText, 'Shift+Tab did not move from quote caption to text')
  const quoteExitBackward = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  assert(quoteText.dispatchEvent(quoteExitBackward) === true && !quoteExitBackward.defaultPrevented, 'Shift+Tab was trapped before the quote text')
  quoteFocus.editor.destroy()

  const sequentialToggle = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'toggle-command', type: 'toggle', data: { title: 'Toggle', content: 'Body', open: false } }],
  }, { extraPlugins: [new Toggle()] })
  const beforeToggle = await snapshot(sequentialToggle.editor)
  let chevron = sequentialToggle.editor.rootElement.querySelector('.oe-toggle__chevron')
  assert(chevron instanceof HTMLElement, 'toggle control is missing')
  chevron.click()
  const afterFirstToggle = await snapshot(sequentialToggle.editor)
  chevron = sequentialToggle.editor.rootElement.querySelector('.oe-toggle__chevron')
  chevron.click()
  const afterSecondToggle = await snapshot(sequentialToggle.editor)
  assert(stable(afterFirstToggle) !== stable(beforeToggle), 'first toggle command was not saved')
  assert(stable(afterSecondToggle) === stable(beforeToggle), 'second toggle command did not restore closed state')
  shortcut(sequentialToggle.editor)
  await delay()
  assert(stable(await snapshot(sequentialToggle.editor)) === stable(afterFirstToggle), 'rapid toggle commands collapsed into one undo step')
  shortcut(sequentialToggle.editor)
  await delay()
  assert(stable(await snapshot(sequentialToggle.editor)) === stable(beforeToggle), 'second toggle undo did not restore initial state')
  sequentialToggle.editor.destroy()

  const columnsCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'columns-command', type: 'columns', data: { columns: [{ content: 'A' }, { content: 'B' }], layout: '1-1' } }],
  }, { extraPlugins: [new Columns()] })
  await assertUndoRedo(columnsCommand.editor, 'columns layout command', () => {
    const buttons = columnsCommand.editor.rootElement.querySelectorAll('.oe-columns__layout-btn')
    const layout = buttons[1]
    assert(layout instanceof HTMLButtonElement, 'columns layout control is missing')
    layout.click()
  })
  columnsCommand.editor.destroy()

  const pollCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'poll-command', type: 'poll', data: { question: 'Q', type: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], resultsMode: 'always' } }],
  }, { extraPlugins: [new Poll()] })
  await assertUndoRedo(pollCommand.editor, 'poll add option command', () => {
    const add = pollCommand.editor.rootElement.querySelector('.oe-poll__option-add')
    assert(add instanceof HTMLButtonElement, 'poll add option control is missing')
    add.click()
  })
  pollCommand.editor.destroy()

  const imageCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'image-command', type: 'image', data: { file: { url: pixel }, caption: 'Pixel' } }],
  }, { extraPlugins: [new Image()] })
  await assertUndoRedo(imageCommand.editor, 'image delete command', () => {
    const remove = imageCommand.editor.rootElement.querySelector('.oe-image__action-btn--danger')
    assert(remove instanceof HTMLButtonElement, 'image delete control is missing')
    remove.click()
  })
  imageCommand.editor.destroy()

  const galleryCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'gallery-command', type: 'gallery', data: { images: [{ url: pixel, caption: 'Pixel' }] } }],
  }, { extraPlugins: [new Gallery()] })
  await assertUndoRedo(galleryCommand.editor, 'gallery remove image command', () => {
    const remove = galleryCommand.editor.rootElement.querySelector('.oe-gallery__slot-remove')
    assert(remove instanceof HTMLButtonElement, 'gallery remove control is missing')
    remove.click()
  })
  galleryCommand.editor.destroy()

  const carouselCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'carousel-command',
      type: 'carousel',
      data: {
        slides: [
          { id: 'carousel-a', type: 'image', src: pixel, alt: 'A' },
          { id: 'carousel-b', type: 'html', html: '<strong>B</strong>' },
        ],
        options: { loop: true, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false },
      },
    }],
  }, { extraPlugins: [new CarouselBlock()] })
  await assertUndoRedo(carouselCommand.editor, 'carousel remove slide command', () => {
    const settings = [...carouselCommand.editor.rootElement.querySelectorAll('.oe-carousel-block__action-btn')]
      .find(button => button.textContent.includes('Settings'))
    assert(settings instanceof HTMLButtonElement, 'carousel settings control is missing')
    settings.click()
    const remove = carouselCommand.editor.rootElement.querySelector('.oe-carousel-block__settings-button--danger')
    assert(remove instanceof HTMLButtonElement, 'carousel remove control is missing')
    remove.click()
  })
  carouselCommand.editor.destroy()

  const attachesCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'attaches-command', type: 'attaches', data: { files: [{ url: pixel, name: 'pixel.png', size: 1, extension: 'png' }] } }],
  }, { extraPlugins: [new Attaches()] })
  await assertUndoRedo(attachesCommand.editor, 'attachment remove command', () => {
    const remove = attachesCommand.editor.rootElement.querySelector('.oe-attaches__remove')
    assert(remove instanceof HTMLButtonElement, 'attachment remove control is missing')
    remove.click()
  })
  attachesCommand.editor.destroy()

  const previewCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'preview-command', type: 'linkPreview', data: { url: 'https://example.com', title: 'Example' } }],
  }, { extraPlugins: [new LinkPreview()] })
  await assertUndoRedo(previewCommand.editor, 'link preview delete command', () => {
    const remove = previewCommand.editor.rootElement.querySelector('.oe-lp__action-btn--danger')
    assert(remove instanceof HTMLButtonElement, 'link preview delete control is missing')
    remove.click()
  })
  previewCommand.editor.destroy()

  const previewResolution = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'preview-resolution',
      type: 'linkPreview',
      data: { url: '', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion' },
    }],
  }, {
    extraPlugins: [new LinkPreview({
      async fetchMeta() {
        return { title: 'Resolved title', description: 'Resolved description' }
      },
    })],
  })
  await assertUndoRedo(previewResolution.editor, 'link preview URL and metadata command', () => {
    const input = previewResolution.editor.rootElement.querySelector('.oe-lp__url-input')
    assert(input instanceof HTMLInputElement, 'link preview URL input is missing')
    input.value = 'https://example.com/resolved'
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }))
  })
  const resolvedPreview = await snapshot(previewResolution.editor)
  assert(resolvedPreview[0]?.data?.url === 'https://example.com/resolved', 'link preview did not persist the resolved URL')
  assert(resolvedPreview[0]?.data?.title === 'Resolved title', 'link preview did not persist resolved metadata')
  previewResolution.editor.destroy()

  const embedCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'embed-command', type: 'embed', data: { service: 'youtube', videoId: 'dQw4w9WgXcQ' } }],
  }, { extraPlugins: [new Embed()] })
  await assertUndoRedo(embedCommand.editor, 'embed delete command', () => {
    const remove = embedCommand.editor.rootElement.querySelector('.oe-embed__action-btn--danger')
    assert(remove instanceof HTMLButtonElement, 'embed delete control is missing')
    remove.click()
  })
  embedCommand.editor.destroy()

  const personCommand = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'person-command', type: 'person', data: { persons: [{ name: 'Ada', role: '', bio: '', avatar: '', links: [] }] } }],
  }, { extraPlugins: [new Person()] })
  await assertUndoRedo(personCommand.editor, 'person add command', () => {
    const add = personCommand.editor.rootElement.querySelector('.oe-person__tab-add')
    assert(add instanceof HTMLButtonElement, 'person add control is missing')
    add.click()
  })
  personCommand.editor.destroy()

  const pasteCases = [
    ['plain text paste', { 'text/plain': 'Plain one\nPlain two' }],
    ['HTML paste', {
      'text/plain': 'HTML heading\nHTML paragraph',
      'text/html': '<h3>HTML heading</h3><p>HTML paragraph</p>',
    }],
    ['internal block paste', {
      'application/x-rector-editor': JSON.stringify([
        { type: 'heading', data: { text: 'Internal heading', level: 3 } },
        { type: 'paragraph', data: { text: 'Internal paragraph' } },
      ]),
      'text/plain': 'Internal heading\nInternal paragraph',
    }],
    ['malformed internal MIME fallback', {
      'application/x-rector-editor': JSON.stringify({ blocks: 'invalid' }),
      'text/plain': 'Fallback text',
    }],
  ]

  for (const [label, clipboard] of pasteCases) {
    const harness = createHarness(sandbox)
    await assertUndoRedo(harness.editor, label, () => dispatchPaste(harness.editor, clipboard))
    harness.editor.destroy()
    assert(harness.holder.childNodes.length === 0, `${label} editor destroy leaked DOM`)
  }

  let tokenSequence = 0
  const globalPatternPlugin = {
    type: 'token',
    title: 'Token',
    icon: '<span>T</span>',
    editable: false,
    pasteConfig: { patterns: [/^TOKEN$/g] },
    onPatternMatch: value => ({ value }),
    createWidget(data, id) {
      const widget = document.createElement('span')
      widget.contentEditable = 'false'
      widget.dataset.inlinePlugin = 'token'
      widget.dataset.id = id || `token-${++tokenSequence}`
      widget.dataset.value = data.value
      widget.textContent = data.value
      return widget
    },
    hydrate(element) { element.dataset.pluginReady = '1' },
    getData: element => ({ value: element.dataset.value || '' }),
  }

  const internalInline = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{
      id: 'inline-copy-source',
      type: 'paragraph',
      data: { text: 'Copy {{copy-token}}' },
      inline: { 'copy-token': { type: 'token', data: { value: 'TOKEN' } } },
    }],
  }, { inlinePlugins: [globalPatternPlugin] })
  const inlineSource = internalInline.editor.blocks.getBlockByIndex(0)
  internalInline.editor.blocks.selectBlocks([inlineSource.id])
  const copyData = new DataTransfer()
  inlineSource.contentElement.dispatchEvent(new ClipboardEvent('copy', {
    clipboardData: copyData,
    bubbles: true,
    cancelable: true,
  }))
  const internalPayload = copyData.getData('application/x-rector-editor')
  const copiedBlocks = JSON.parse(internalPayload)
  assert(copiedBlocks[0]?.inline?.['copy-token']?.type === 'token', 'internal block copy dropped canonical inline widget data')
  assert(copiedBlocks[0]?.data?.text === 'Copy {{copy-token}}', 'internal block copy did not tokenize inline widget HTML')
  internalInline.editor.blocks.clearSelection()
  await assertUndoRedo(internalInline.editor, 'internal inline block paste', () => {
    dispatchPaste(internalInline.editor, {
      'application/x-rector-editor': internalPayload,
      'text/plain': 'Copy TOKEN',
    })
  })
  const copiedWidgets = internalInline.editor.rootElement.querySelectorAll('[data-inline-plugin="token"]')
  assert(copiedWidgets.length === 2, 'internal inline block paste lost a widget')
  assert([...copiedWidgets].every(widget => widget.dataset.pluginReady === '1'), 'internal inline block paste left an inert widget')

  await assertUndoRedo(internalInline.editor, 'inline block duplicate', async () => {
    internalInline.editor.blocks.setCurrentIndex(0)
    internalInline.editor.blocks.getBlockByIndex(0).focus()
    const dragHandle = internalInline.editor.rootElement.querySelector('.oe-toolbar__drag')
    assert(dragHandle instanceof HTMLButtonElement, 'block settings handle is missing')
    dragHandle.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
    const duplicate = [...document.querySelectorAll('.oe-settings-menu__item')]
      .find(item => item.textContent?.includes('Duplicate'))
    assert(duplicate instanceof HTMLElement, 'duplicate block action is missing')
    duplicate.click()
    await delay()
  })
  const duplicatedWidgets = internalInline.editor.rootElement.querySelectorAll('[data-inline-plugin="token"]')
  assert(duplicatedWidgets.length === 3, 'inline block duplicate lost a widget')
  assert([...duplicatedWidgets].every(widget => widget.dataset.pluginReady === '1'), 'inline block duplicate left an inert widget')
  internalInline.editor.destroy()

  const globalPattern = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'pattern-block', type: 'paragraph', data: { text: '' } }],
  }, { inlinePlugins: [globalPatternPlugin] })
  await assertUndoRedo(globalPattern.editor, 'global RegExp inline paste', () => {
    const block = globalPattern.editor.blocks.getBlockByIndex(0)
    setCaretToEnd(block)
    dispatchPaste(globalPattern.editor, { 'text/plain': 'TOKEN TOKEN' })
  })
  assert(globalPattern.editor.rootElement.querySelectorAll('[data-inline-plugin="token"]').length === 2, 'global RegExp skipped an adjacent inline pattern')
  globalPattern.editor.destroy()

  // Regression: a multi-block paste mutates the original block and then
  // focuses the last inserted block. Both the canonical save cache and the
  // next inline history boundary must retain the first pasted fragment.
  for (const [label, clipboard, firstText, secondText] of [
    ['plain multi-block paste + inline undo', { 'text/plain': 'First pasted\nSecond pasted' }, 'First pasted', 'Second pasted'],
    ['HTML multi-block paste + inline undo', {
      'text/plain': 'First HTML\nSecond HTML',
      'text/html': '<p>First HTML</p><p>Second HTML</p>',
    }, 'First HTML', 'Second HTML'],
  ]) {
    const harness = createHarness(sandbox, {
      version: 'browser-history',
      blocks: [{ id: `${label}-origin`, type: 'paragraph', data: { text: '' } }],
    }, { inlineTools: ['bold'] })
    dispatchPaste(harness.editor, clipboard)
    await delay()
    const afterPaste = await snapshot(harness.editor)
    assert(afterPaste.length === 2, `${label} did not produce two blocks`)
    assert(afterPaste[0].data.text === firstText, `${label} left a stale first-block snapshot: ${stable(afterPaste)}`)
    assert(afterPaste[1].data.text === secondText, `${label} lost the second pasted block: ${stable(afterPaste)}`)
    const pastedIds = afterPaste.map(block => block.id)

    const first = harness.editor.blocks.getBlockByIndex(0)
    harness.editor.blocks.setCurrentIndex(0)
    selectText(first)
    harness.editor.rootElement.querySelector('[data-tool="bold"]').click()
    await delay()
    shortcut(harness.editor, { target: first.contentElement })
    await delay()
    const afterInlineUndo = await snapshot(harness.editor)
    assert(stable(afterInlineUndo) === stable(afterPaste), `${label} restored stale content after inline Undo`)
    assert(afterInlineUndo.map(block => block.id).join('|') === pastedIds.join('|'), `${label} changed block identity/order`)
    harness.editor.destroy()
  }

  const pluginPasteCases = [
    ['heading tag paste', [], { 'text/html': '<h3>Heading route</h3>', 'text/plain': 'Heading route' }, 'heading'],
    ['list tag paste', [], { 'text/html': '<ul><li>First</li><li>Second</li></ul>', 'text/plain': 'First\nSecond' }, 'list'],
    ['quote tag paste', [new Quote()], { 'text/html': '<blockquote>Quote route<cite>Author</cite></blockquote>', 'text/plain': 'Quote route' }, 'quote'],
    ['code tag paste', [new Code()], { 'text/html': '<code>const routed = true</code>', 'text/plain': 'const routed = true' }, 'code'],
    ['table tag paste', [new Table()], { 'text/html': '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>', 'text/plain': 'Name Value' }, 'table'],
    ['image pattern paste', [new Image()], { 'text/plain': 'https://example.com/image.png' }, 'image'],
    ['embed pattern paste', [new Embed()], { 'text/plain': 'https://youtu.be/dQw4w9WgXcQ' }, 'embed'],
    ['link preview pattern paste', [new LinkPreview()], { 'text/plain': 'https://example.com/article' }, 'linkPreview'],
  ]

  for (const [label, extraPlugins, clipboard, expectedType] of pluginPasteCases) {
    const harness = createHarness(sandbox, initialData, { extraPlugins })
    await assertUndoRedo(harness.editor, label, () => dispatchPaste(harness.editor, clipboard))
    const document = await harness.editor.save()
    assert(document.blocks.some(block => block.type === expectedType), `${label} did not route to ${expectedType}`)
    harness.editor.destroy()
  }

  const inlineHarness = createHarness(sandbox, initialData, { inline: true })
  const outsideBlockRange = document.createRange()
  outsideBlockRange.setStart(inlineHarness.editor.rootElement, 0)
  outsideBlockRange.collapse(true)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(outsideBlockRange)
  assert(
    !inlineHarness.editor.insertInlinePlugin('color', { value: '#000000' }),
    'inline widget insertion accepted a caret outside a text block',
  )
  await assertUndoRedo(inlineHarness.editor, 'inline widget insert', () => {
    const block = inlineHarness.editor.blocks.getBlockByIndex(0)
    inlineHarness.editor.blocks.setCurrentIndex(0)
    setCaretToEnd(block)
    assert(
      inlineHarness.editor.insertInlinePlugin('color', { value: '#123456' }),
      'inline widget insertion was not acknowledged',
    )
  })
  const inlineDocument = await inlineHarness.editor.save()
  assert(Object.keys(inlineDocument.blocks[0].inline ?? {}).length === 1, 'inline widget was not serialized')

  const colorBeforePreview = await snapshot(inlineHarness.editor)
  let colorWidget = inlineHarness.editor.rootElement.querySelector('[data-inline-plugin="color"]')
  assert(colorWidget instanceof HTMLElement, 'color widget is missing')
  colorWidget.click()
  await delay(20)
  let colorInput = inlineHarness.editor.rootElement.querySelector('.oe-color-hex')
  assert(colorInput instanceof HTMLInputElement, 'color picker input is missing')
  colorInput.value = '#654321'
  colorInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  assert(colorWidget.dataset.value === '#654321', 'color preview did not update the widget')
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  await delay()
  assert(colorWidget.dataset.value === '#123456', 'cancelled color preview leaked into the document DOM')
  assert(stable(await snapshot(inlineHarness.editor)) === stable(colorBeforePreview), 'cancelled color preview changed serialized data')

  await assertUndoRedo(inlineHarness.editor, 'color widget apply', async () => {
    colorWidget = inlineHarness.editor.rootElement.querySelector('[data-inline-plugin="color"]')
    assert(colorWidget instanceof HTMLElement, 'color widget disappeared before apply')
    colorWidget.click()
    await delay(20)
    colorInput = inlineHarness.editor.rootElement.querySelector('.oe-color-hex')
    const apply = inlineHarness.editor.rootElement.querySelector('.oe-color-btn--apply')
    assert(colorInput instanceof HTMLInputElement && apply instanceof HTMLButtonElement, 'color apply controls are missing')
    colorInput.value = '#abcdef'
    colorInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    apply.click()
  })

  const colorBeforeReadOnly = stable(await snapshot(inlineHarness.editor))
  colorWidget = inlineHarness.editor.rootElement.querySelector('[data-inline-plugin="color"]')
  assert(colorWidget instanceof HTMLElement, 'color widget disappeared before read-only transition')
  colorWidget.click()
  await delay(20)
  colorInput = inlineHarness.editor.rootElement.querySelector('.oe-color-hex')
  assert(colorInput instanceof HTMLInputElement, 'color picker did not open before read-only transition')
  colorInput.value = '#fedcba'
  colorInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  inlineHarness.editor.setReadOnly(true)
  assert(!inlineHarness.editor.rootElement.querySelector('.oe-ip-popup'), 'read-only transition kept an inline popup open')
  assert(stable(await snapshot(inlineHarness.editor)) === colorBeforeReadOnly, 'read-only transition committed a transient color preview')

  colorWidget = inlineHarness.editor.rootElement.querySelector('[data-inline-plugin="color"]')
  assert(colorWidget instanceof HTMLElement, 'read-only render lost the color widget')
  colorWidget.click()
  await delay(20)
  assert(!inlineHarness.editor.rootElement.querySelector('.oe-ip-popup'), 'read-only color widget opened a mutation popup')
  assert(stable(await snapshot(inlineHarness.editor)) === colorBeforeReadOnly, 'read-only color widget changed the document')
  inlineHarness.editor.destroy()

  const incompatibleInline = createHarness(sandbox, {
    version: 'browser-history',
    blocks: [{ id: 'code-inline', type: 'code', data: { code: 'const value = 1', language: 'javascript' } }],
  }, { inlinePlugins: [createColorSwatchPlugin()], extraPlugins: [new Code()] })
  const codeInlineBlock = incompatibleInline.editor.blocks.getBlockByIndex(0)
  setCaretToEnd(codeInlineBlock)
  assert(
    !incompatibleInline.editor.insertInlinePlugin('color', { value: '#000000' }),
    'inline widget insertion accepted a block without text-field marshalling',
  )
  incompatibleInline.editor.destroy()

  let finishSlowPaste = null
  const slowPastePromises = new WeakMap()
  const slowFilePlugin = {
    type: 'slowFile',
    title: 'Slow file',
    icon: '',
    inlineTools: false,
    pasteConfig: { files: ['image/*'] },
    onPaste(event) { return event.type === 'file' ? { pending: true, url: '' } : null },
    render(data) {
      const element = document.createElement('div')
      element.tabIndex = -1
      element.dataset.url = String(data?.url || '')
      if (data?.pending) {
        const pending = new Promise(resolve => {
          finishSlowPaste = () => {
            element.dataset.url = 'https://example.com/slow.png'
            resolve()
          }
        })
        slowPastePromises.set(element, pending)
      }
      return element
    },
    save(element) { return { url: element.dataset.url || '' } },
    validate(data) { return typeof data.url === 'string' && data.url.length > 0 },
    waitForPaste(element) { return slowPastePromises.get(element) ?? Promise.resolve() },
    destroy(element) { slowPastePromises.delete(element) },
  }
  const slowPasteHarness = createHarness(sandbox, initialData, { extraPlugins: [slowFilePlugin] })
  dispatchFilePaste(slowPasteHarness.editor)
  await delay()
  assert(!(await snapshot(slowPasteHarness.editor)).some(block => block.type === 'slowFile'), 'pending async paste entered the live model early')

  const betaDuringPaste = slowPasteHarness.editor.blocks.getBlockById('beta')
  betaDuringPaste.contentElement.textContent = 'Beta edited during upload'
  betaDuringPaste.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay(20)
  const editedWhilePending = await snapshot(slowPasteHarness.editor)
  finishSlowPaste?.()
  await delay(30)
  const completedSlowPaste = await snapshot(slowPasteHarness.editor)
  assert(completedSlowPaste.some(block => block.type === 'slowFile'), 'completed async paste was not committed')

  shortcut(slowPasteHarness.editor, { target: slowPasteHarness.editor.rootElement })
  await delay()
  assert(stable(await snapshot(slowPasteHarness.editor)) === stable(editedWhilePending), 'async paste undo consumed an unrelated edit')
  shortcut(slowPasteHarness.editor, { target: slowPasteHarness.editor.rootElement })
  await delay()
  assert(stable(await snapshot(slowPasteHarness.editor)) === stable(semantic(initialData)), 'second undo did not revert the edit made during upload')
  slowPasteHarness.editor.destroy()

  const cancelledSlowPaste = createHarness(sandbox, initialData, { extraPlugins: [slowFilePlugin] })
  dispatchFilePaste(cancelledSlowPaste.editor)
  await delay()
  const finishCancelledPaste = finishSlowPaste
  const pendingShell = cancelledSlowPaste.holder.querySelector('.oe-block--pending-paste')
  assert(pendingShell instanceof HTMLElement, 'pending paste did not expose progress DOM')
  assert(pendingShell.getAttribute('aria-busy') === 'true', 'pending paste was not exposed as busy')
  const pendingSpinner = pendingShell.querySelector('.oe-pending-paste__spinner')
  assert(pendingSpinner instanceof HTMLElement, 'pending paste did not render the core spinner')
  const hiddenPluginSurface = pendingShell.querySelector('[data-url]')
  assert(hiddenPluginSurface instanceof HTMLElement && hiddenPluginSurface.hidden, 'pending plugin UI remained visible behind the spinner')
  cancelledSlowPaste.editor.destroy()
  assert(!cancelledSlowPaste.holder.querySelector('.oe-block--pending-paste'), 'destroy leaked pending paste DOM')
  finishCancelledPaste?.()
  await delay(20)

  let finishImagePaste = null
  const pendingImageHarness = createHarness(sandbox, initialData, {
    extraPlugins: [new Image({
      uploadFile: () => new Promise(resolve => {
        finishImagePaste = () => resolve({ url: pixel, alt: 'Pasted pixel' })
      }),
    })],
  })
  dispatchFilePaste(pendingImageHarness.editor)
  await delay()
  const pendingImageShell = pendingImageHarness.holder.querySelector('.oe-block--pending-paste')
  assert(pendingImageShell?.querySelector('.oe-pending-paste__spinner'), 'image paste did not render the processing spinner')
  const pendingImageSurface = pendingImageShell?.querySelector('.oe-image')
  assert(
    pendingImageSurface instanceof HTMLElement && pendingImageSurface.hidden,
    'image drop zone remained visible while the pasted file was processing',
  )
  finishImagePaste?.()
  await delay(40)
  assert(!pendingImageHarness.holder.querySelector('.oe-block--pending-paste'), 'image processing spinner remained after upload')
  assert(pendingImageHarness.holder.querySelector('.oe-image--filled'), 'processed pasted image did not replace the spinner')
  pendingImageHarness.editor.destroy()

  const fileHarness = createHarness(sandbox, initialData, { image: true })
  await assertUndoRedo(fileHarness.editor, 'file paste', async () => {
    dispatchFilePaste(fileHarness.editor)
    await delay(100)
  })
  fileHarness.editor.destroy()

  const dataUrlHarness = createHarness(sandbox, initialData, { image: 'data-url' })
  await assertUndoRedo(dataUrlHarness.editor, 'file paste (data URL)', async () => {
    dispatchFilePaste(dataUrlHarness.editor)
    await delay(100)
  })
  dataUrlHarness.editor.destroy()

  const galleryHarness = createHarness(sandbox, initialData, { gallery: true })
  await assertUndoRedo(galleryHarness.editor, 'gallery file paste', async () => {
    dispatchFilePaste(galleryHarness.editor)
    await delay(100)
  })
  galleryHarness.editor.destroy()

  const galleryDataUrlHarness = createHarness(sandbox, initialData, { gallery: 'data-url' })
  await assertUndoRedo(galleryDataUrlHarness.editor, 'gallery file paste (data URL)', async () => {
    dispatchFilePaste(galleryDataUrlHarness.editor)
    await delay(100)
  })
  galleryDataUrlHarness.editor.destroy()

  const publicApiHolder = document.createElement('section')
  sandbox.appendChild(publicApiHolder)
  let modeChangeNotifications = 0
  const publicApiEditor = createEditor({
    holder: publicApiHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: structuredClone(initialData),
    tuning: { change: { debounceMs: 0 } },
    onChange() { modeChangeNotifications++ },
  })
  const historyStates = []
  const readOnlyStates = []
  let modeWillChangeEvents = 0
  let modeChangedEvents = 0
  let modeCommitEvents = 0
  publicApiEditor.events.on('history:changed', state => historyStates.push(state))
  publicApiEditor.events.on('readOnly:changed', state => readOnlyStates.push(state))
  publicApiEditor.events.on('editor:willChange', () => { modeWillChangeEvents++ })
  publicApiEditor.events.on('editor:changed', () => { modeChangedEvents++ })
  publicApiEditor.events.on('history:commit', () => { modeCommitEvents++ })
  assert(publicApiEditor.readOnly === false, 'public readOnly getter did not expose edit mode')
  assert(publicApiEditor.canUndo === false && publicApiEditor.canRedo === false, 'new editor exposed unavailable history')
  publicApiEditor.blocks.insert('paragraph', { text: 'Public history' })
  assert(publicApiEditor.canUndo === true, 'public canUndo did not update after insert')
  assert(publicApiEditor.undo() === true, 'public undo() did not restore the previous step')
  assert(publicApiEditor.blocks.getBlockCount() === 2, 'public undo() restored the wrong document')
  assert(publicApiEditor.canRedo === true, 'public canRedo did not update after undo')
  assert(publicApiEditor.redo() === true, 'public redo() did not restore the next step')
  assert(publicApiEditor.blocks.getBlockCount() === 3, 'public redo() restored the wrong document')
  assert(historyStates.some(state => state.canUndo) && historyStates.some(state => state.canRedo), 'history:changed did not expose button state')

  await delay(20)
  modeChangeNotifications = 0
  modeWillChangeEvents = 0
  modeChangedEvents = 0
  modeCommitEvents = 0

  publicApiEditor.setReadOnly(true)
  await delay(20)
  assert(publicApiEditor.readOnly === true, 'setReadOnly(true) did not update the public mode')
  assert(publicApiEditor.rootElement.getAttribute('aria-readonly') === 'true', 'read-only root semantics are missing')
  assert(!publicApiEditor.rootElement.querySelector('[contenteditable="true"]'), 'read-only transition kept editable DOM')
  assert(publicApiEditor.canUndo === false && publicApiEditor.canRedo === false, 'read-only mode exposed active history commands')
  assert(publicApiEditor.undo() === false && publicApiEditor.redo() === false, 'read-only mode executed a history mutation')

  publicApiEditor.setReadOnly(false)
  await delay(20)
  assert(publicApiEditor.readOnly === false, 'setReadOnly(false) did not restore edit mode')
  assert(publicApiEditor.rootElement.querySelector('[contenteditable="true"]'), 'edit-mode transition did not restore editable DOM')
  assert(publicApiEditor.canUndo === true, 'mode transition discarded history')
  assert(readOnlyStates.map(state => state.readOnly).join(',') === 'true,false', 'readOnly:changed emitted an invalid sequence')
  assert(modeChangeNotifications === 0, 'mode transition emitted a document change notification')
  assert(
    modeWillChangeEvents === 0 && modeChangedEvents === 0 && modeCommitEvents === 0,
    'mode transition emitted command or document mutation events',
  )

  publicApiEditor.setReadOnly(true)
  publicApiEditor.setReadOnly(false)
  shortcut(publicApiEditor)
  await delay(20)
  assert(publicApiEditor.blocks.getBlockCount() === 2, 'mode remount duplicated keyboard history handlers')
  assert(publicApiEditor.canRedo === true, 'keyboard undo after mode remount did not update public history')
  publicApiEditor.destroy()

  const pendingHistoryHolder = document.createElement('section')
  sandbox.appendChild(pendingHistoryHolder)
  const pendingHistoryEditor = createEditor({
    holder: pendingHistoryHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: {
      version: 'browser-history',
      blocks: [{ id: 'pending', type: 'paragraph', data: { text: 'Before' } }],
    },
    tuning: { undo: { debounceMs: 60_000 } },
  })
  const pendingHistoryStates = []
  pendingHistoryEditor.events.on('history:changed', state => pendingHistoryStates.push(state))
  const pendingHistoryBlock = pendingHistoryEditor.blocks.getBlockByIndex(0)
  pendingHistoryBlock.contentElement.textContent = 'After'
  pendingHistoryBlock.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  assert(pendingHistoryEditor.canUndo === true, 'pending input did not immediately enable public undo')
  assert(pendingHistoryEditor.canRedo === false, 'pending input exposed redo from an obsolete branch')
  assert(pendingHistoryStates.at(-1)?.canUndo === true, 'pending input did not emit public history availability')
  assert(pendingHistoryEditor.undo() === true, 'public undo did not flush pending input')
  assert(pendingHistoryEditor.save().blocks[0].data.text === 'Before', 'public undo did not restore pending input')
  pendingHistoryEditor.destroy()

  const readOnlyHostHolder = document.createElement('section')
  sandbox.appendChild(readOnlyHostHolder)
  const readOnlyHostEditor = createEditor({
    holder: readOnlyHostHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: {
      version: 'browser-history',
      blocks: [{ id: 'host-origin', type: 'paragraph', data: { text: 'Origin' } }],
    },
  })
  readOnlyHostEditor.setReadOnly(true)
  const readOnlyHistoryStates = []
  readOnlyHostEditor.events.on('history:changed', state => readOnlyHistoryStates.push(state))
  readOnlyHostEditor.blocks.insert('paragraph', { text: 'Host update' })
  await delay(20)
  assert(readOnlyHostEditor.canUndo === false && readOnlyHostEditor.canRedo === false, 'read-only host update exposed history commands')
  assert(!readOnlyHistoryStates.some(state => state.canUndo || state.canRedo), 'read-only history event contradicted public getters')
  readOnlyHostEditor.setReadOnly(false)
  assert(readOnlyHostEditor.canUndo === true, 'read-only host update was not retained for editable history')
  assert(readOnlyHostEditor.undo() === true, 'recorded read-only host update could not be undone after editing resumed')
  assert(readOnlyHostEditor.blocks.getBlockCount() === 1, 'read-only host history restored the wrong document')
  readOnlyHostEditor.destroy()

  const completeModeHolder = document.createElement('section')
  sandbox.appendChild(completeModeHolder)
  const completeModePlugins = [
    new Paragraph(), new Heading(), new List(), new Quote(), new Code(), new Raw(),
    new Checklist(), new Table(), new Warning(), new Toggle(), new Spoiler(), new Columns(),
    new Image(), new Gallery(), new CarouselBlock(), new Attaches(), new LinkPreview(),
    new Embed(), new Person(), new Poll(),
  ]

  const tablePasteProbe = document.createElement('div')
  tablePasteProbe.innerHTML = '<table><tr><td>Body</td></tr><tr><th>Footer heading cell</th></tr></table>'
  const tablePasteData = new Table().onPaste({
    type: 'tag',
    tag: 'table',
    element: /** @type {HTMLElement} */ (tablePasteProbe.firstElementChild),
  })
  assert(tablePasteData?.withHeadings === false, 'table paste treated a later TH cell as the first-row header')

  const quotePasteProbe = document.createElement('blockquote')
  quotePasteProbe.innerHTML = 'Quote<cite><strong>Formatted author</strong></cite>'
  const quotePasteData = new Quote().onPaste({ type: 'tag', tag: 'blockquote', element: quotePasteProbe })
  assert(quotePasteData?.caption === '<strong>Formatted author</strong>', 'quote paste discarded caption formatting')
  const completeModeEditor = createEditor({
    holder: completeModeHolder,
    plugins: completeModePlugins,
    inlineTools: [],
  })
  for (const plugin of completeModePlugins.slice(1)) completeModeEditor.blocks.insert(plugin.type)
  const completeModeDocument = stable(semantic(completeModeEditor.save()))
  completeModeEditor.setReadOnly(true)
  assert(!completeModeEditor.rootElement.querySelector('[contenteditable="true"]'), 'a built-in plugin stayed editable in read-only mode')
  assert(stable(semantic(completeModeEditor.save())) === completeModeDocument, 'built-in plugin data changed when entering read-only mode')
  completeModeEditor.setReadOnly(false)
  assert(stable(semantic(completeModeEditor.save())) === completeModeDocument, 'built-in plugin data changed when returning to edit mode')
  completeModeEditor.destroy()

  const holderOwnership = document.createElement('section')
  sandbox.appendChild(holderOwnership)
  const holderOwner = createEditor({ holder: holderOwnership, plugins: [new Paragraph()], inlineTools: [] })
  let duplicateHolderRejected = false
  try {
    createEditor({ holder: holderOwnership, plugins: [new Paragraph()], inlineTools: [] })
  } catch {
    duplicateHolderRejected = true
  }
  assert(duplicateHolderRejected, 'one holder accepted two live editor instances')
  holderOwner.destroy()
  const holderReuse = createEditor({ holder: holderOwnership, plugins: [new Paragraph()], inlineTools: [] })
  holderReuse.destroy()

  for (const [label, invalidConfig] of [
    ['minHeight', { minHeight: -1 }],
    ['history depth', { tuning: { undo: { maxStack: 0 } } }],
    ['change debounce', { tuning: { change: { debounceMs: Number.NaN } } }],
  ]) {
    const invalidHolder = document.createElement('section')
    sandbox.appendChild(invalidHolder)
    let rejected = false
    try {
      createEditor({ holder: invalidHolder, plugins: [new Paragraph()], inlineTools: [], ...invalidConfig })
    } catch {
      rejected = true
    }
    assert(rejected && invalidHolder.childNodes.length === 0, `invalid ${label} configuration was accepted`)
  }

  const callbackHolder = document.createElement('section')
  sandbox.appendChild(callbackHolder)
  let readyCalls = 0
  const changedDocuments = []
  const callbackEditor = createEditor({
    holder: callbackHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: {
      version: 'browser-history',
      blocks: [{ id: 'callbacks', type: 'paragraph', data: { text: 'Before' } }],
    },
    tuning: { change: { debounceMs: 0 } },
    onReady() { readyCalls++ },
    onChange(document) { changedDocuments.push(document) },
  })
  assert(readyCalls === 0, 'onReady ran synchronously before createEditor returned')
  await Promise.resolve()
  assert(readyCalls === 1, 'onReady did not run once in the queued microtask')
  assert(changedDocuments.length === 0, 'onChange ran for the initial document')
  const callbackBlock = callbackEditor.blocks.getBlockByIndex(0)
  callbackBlock.contentElement.textContent = 'After'
  callbackBlock.contentElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  await delay(20)
  assert(changedDocuments.length === 1, 'onChange did not run once after a document mutation')
  assert(changedDocuments[0].blocks[0].data.text === 'After', 'onChange received a stale document snapshot')
  callbackEditor.destroy()

  for (let cycle = 0; cycle < 5; cycle++) {
    const harness = createHarness(sandbox)
    harness.editor.destroy()
    assert(harness.holder.childNodes.length === 0, `editor lifecycle leaked DOM at cycle ${cycle}`)
  }

  await delay(50)
  assert(runtimeErrors.length === 0, `browser runtime errors: ${runtimeErrors.join('\n')}`)
  sandbox.replaceChildren()

  return {
    historyCases: [
      'typing', 'split block', 'insert', 'sequential insert', 'toolbar sequential insert', 'move', 'convert',
      'remove', 'clear', 'public render', 'sequential inline formatting',
      'partial cross-block conversion', 'structured endpoint cross-block conversion',
      'ordered partial list conversion', 'unordered partial list conversion',
      'partial list conversion to a non-text block', 'slash command caret positioning',
      'slash block insertion after existing text', 'inline block duplicate',
    ],
    pasteCases: [
      ...pasteCases.map(([label]) => label),
      'plain/HTML multi-block paste + inline undo',
      'global RegExp inline paste',
      'internal inline block paste',
      'file paste',
      'file paste (data URL)',
      'gallery file paste',
      'gallery file paste (data URL)',
      'slow file paste with concurrent edit',
    ],
    pluginPasteRoutes: pluginPasteCases.map(([label]) => label),
    pluginCommandCases: [
      'raw Tab', 'raw multiline Shift+Tab', 'code Tab', 'list item split',
      'list selected range replacement', 'list empty last item exit',
      'single empty list exit', 'checklist toggle', 'checklist empty last item exit',
      'checklist selected range replacement', 'checklist nested Backspace merge',
      'single empty checklist exit', 'table line break', 'quote focus navigation',
      'rapid toggle ordering', 'columns layout', 'poll add option',
      'image delete', 'gallery remove image', 'carousel remove slide', 'attachment remove',
      'link preview delete', 'embed delete', 'person add',
    ],
    inlineCases: [
      'inline widget insert', 'sequential Bold/Italic',
      'toolbar Bold/Italic', 'structural + inline ordering', 'default toolbar ordering', 'Enter + inline ordering', 'cross-block inline ordering',
      'Bold history across all inline-capable block plugins',
      'bold apply/remove', 'italic apply/remove', 'strikethrough apply/remove', 'code apply/remove', 'marker apply/remove',
      'case transform upper/lower', 'clear formatting', 'align apply/reset', 'script apply/remove',
      'background color apply/remove', 'link action formatting', 'link removal',
      'font-size apply/remove', 'heading inline control',
      'color widget preview/cancel/apply/read-only',
      'per-block inline tool allowlist',
      'inline tool replacement by type',
    ],
    lifecycleCycles: 5,
    callbackCases: ['onReady microtask', 'onChange mutation notification'],
    publicApiCases: ['undo/redo state', 'pending history state', 'history events', 'dynamic read-only', 'read-only host history', 'mode lifecycle', 'all-plugin mode transition', 'holder ownership', 'numeric validation'],
  }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
