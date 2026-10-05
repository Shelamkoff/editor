import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createHeadingPlugin, createParagraphPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, printable, pointAt } from './native-input-helpers.js'

const controls = [
  { tool: 'fontSize', target: '.oe-font-size-apply', tabs: 1, panel: '.oe-font-size-dropdown', input: '.oe-font-size-input', draft: '99' },
  { tool: 'fontSize', target: '.oe-font-size-reset', tabs: 2, panel: '.oe-font-size-dropdown', input: '.oe-font-size-input', draft: '99' },
  { tool: 'fontSize', target: '.oe-font-size-item', tabs: 3, panel: '.oe-font-size-dropdown', input: '.oe-font-size-input', draft: '99' },
  { tool: 'link', target: '.oe-inline-tool--apply', tabs: 1, panel: '.oe-inline-toolbar__panel--link', input: '.oe-inline-toolbar__link-input', draft: 'https://example.com/canceled' },
  { tool: 'link', target: '.oe-inline-tool--back', tabs: -1, panel: '.oe-inline-toolbar__panel--link', input: '.oe-inline-toolbar__link-input', draft: 'https://example.com/canceled' },
]

function assertDirection(editor, backwards, cross) {
  const first = editableField(editor, 'a'), last = cross ? editableField(editor, 'b') : first
  const native = window.getSelection()
  equal(document.activeElement, backwards && cross ? last : first, 'Cancellation lost the editing host')
  equal(getTextOffset(backwards ? last : first, native.anchorNode, native.anchorOffset), backwards ? (cross ? 3 : 4) : (cross ? 2 : 1), 'Cancellation moved the anchor')
  equal(getTextOffset(backwards ? first : last, native.focusNode, native.focusOffset), backwards ? (cross ? 2 : 1) : (cross ? 3 : 4), 'Cancellation moved the focus')
}

async function sourceSelection(editor, backwards, cross) {
  const first = editableField(editor, 'a'), last = cross ? editableField(editor, 'b') : first
  if (cross) await dragAcross(editor, first, 2, last, 3, backwards)
  else {
    await clickNative(first)
    const from = pointAt(first, backwards ? 4 : 1), to = pointAt(first, backwards ? 1 : 4)
    await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY } })
    await pause(30)
  }
}

for (const control of controls) for (const backwards of [false, true]) for (const cross of [false, true]) {
  test('Escape from ' + control.tool + ' ' + control.target + ' restores input/history / ' + (cross ? 'cross' : 'local') + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true, inlineTools: createDefaultInlineTools() })
    const root = editorRoot(editor), before = editor.save().blocks
    await sourceSelection(editor, backwards, cross)
    await clickNative(root.querySelector('[data-tool="' + control.tool + '"]'))
    await clickNative(root.querySelector(control.input))
    await dispatchKey('a', 'KeyA', 65, 2)
    await window.__testInput('Input.insertText', { text: control.draft })
    for (let i = 0; i < Math.abs(control.tabs); i++) await dispatchKey('Tab', 'Tab', 9, control.tabs < 0 ? 8 : 0)
    equal(document.activeElement, root.querySelector(control.target), 'Native Tab did not reach the requested panel control')
    await dispatchKey('Escape', 'Escape', 27)
    const panel = root.querySelector(control.panel)
    assert(!panel || getComputedStyle(panel).display === 'none', 'Escape from a button did not close the panel')
    equal(editor.save().blocks, before, 'Cancellation committed the draft')
    assertDirection(editor, backwards, cross)
    await printable('X')
    equal(editor.save().blocks.map(block => block.data.text), cross ? ['AlXvo'] : ['AXa', 'Bravo'])
    const after = editor.save().blocks
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false, 'Cancellation created an extra history entry')
    assertDirection(editor, backwards, cross)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, after)
  })
}

for (const tool of ['align', 'script']) for (const backwards of [false, true]) for (const cross of [false, true]) {
  test('Escape from keyboard-reached ' + tool + ' actions cancels without mutation / ' + (cross ? 'cross' : 'local') + ' / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], { injectStyles: true, inlineTools: createDefaultInlineTools() })
    const root = editorRoot(editor), before = editor.save().blocks
    await sourceSelection(editor, backwards, cross)
    await clickNative(root.querySelector('[data-tool="' + tool + '"]'))
    const panelSelector = '.oe-inline-toolbar__' + tool + '-panel'
    const panel = root.querySelector(panelSelector)
    assert(panel, 'Drill-down panel did not open')
    // Keep normal browser Tab traversal; no synthetic focus/key event.
    for (let tries = 0; !panel.contains(document.activeElement) && tries < 24; tries++) await dispatchKey('Tab', 'Tab', 9)
    assert(panel.contains(document.activeElement), 'Tab could not reach the action panel')
    await dispatchKey('Tab', 'Tab', 9)
    assert(panel.contains(document.activeElement), 'Tab left the action panel before reaching an action')
    await dispatchKey('Escape', 'Escape', 27)
    assert(!root.querySelector(panelSelector), 'Escape did not dismiss actions')
    equal(editor.save().blocks, before)
    assertDirection(editor, backwards, cross)
    await printable('X')
    equal(editor.save().blocks.map(block => block.data.text), cross ? ['AlXvo'] : ['AXa', 'Bravo'])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    assertDirection(editor, backwards, cross)
  })
}

for (const tool of ['fontSize', 'link']) for (const backwards of [false, true]) {
  test(tool + ' keyboard cancellation preserves a converted interval and its end caret / ' + (backwards ? 'backward' : 'forward'), async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
      injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin()], inlineTools: createDefaultInlineTools(),
    })
    const root = editorRoot(editor), before = editor.save().blocks
    await sourceSelection(editor, backwards, true)
    await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
    await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
    await pause(260)
    const converted = editor.save().blocks
    equal(converted.map(block => [block.type, block.data.text]), [['paragraph', 'Al'], ['heading', 'pha'], ['heading', 'Bra'], ['paragraph', 'vo']])
    const control = controls.find(item => item.tool === tool)
    await clickNative(root.querySelector('[data-tool="' + tool + '"]'))
    await clickNative(root.querySelector(control.input))
    await dispatchKey('Tab', 'Tab', 9)
    equal(document.activeElement, root.querySelector(control.target))
    await dispatchKey('Escape', 'Escape', 27)
    const ids = converted.filter(block => block.type === 'heading').map(block => block.id)
    equal(editor.blocks.selectedIds(), ids)
    const last = editableField(editor, ids.at(-1)), native = window.getSelection()
    assert(native.isCollapsed && document.activeElement === last, 'Cancel expanded or lost the converted end caret')
    equal(getTextOffset(last, native.anchorNode, native.anchorOffset), 3)
    await printable('X')
    equal(editor.save().blocks.map(block => block.data.text), ['Al', 'X', 'vo'])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, converted)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}

test('Action panel respects a control-owned Escape and handles Escape from its other control', async () => {
  let panel
  const tool = {
    type: 'ownedEscape', title: 'Owned Escape', icon: 'E', isActive() { return false }, toggle() {},
    renderActions(ctx) {
      panel = document.createElement('div')
      panel.className = 'audit-owned-escape-panel'
      const input = document.createElement('input')
      input.addEventListener('keydown', event => { if (event.key === 'Escape') event.preventDefault() })
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Next'
      panel.append(input, button)
      return panel
    },
  }
  const editor = make([para('a', 'Alpha')], { injectStyles: true, inlineTools: [tool] })
  const root = editorRoot(editor), before = editor.save().blocks
  await sourceSelection(editor, false, false)
  await clickNative(root.querySelector('[data-tool="ownedEscape"]'))
  equal(document.activeElement, panel.querySelector('input'))
  await dispatchKey('Escape', 'Escape', 27)
  assert(panel.isConnected, 'Toolbar overrode a control-owned Escape')
  equal(editor.save().blocks, before)
  await dispatchKey('Tab', 'Tab', 9)
  equal(document.activeElement, panel.querySelector('button'))
  await dispatchKey('Escape', 'Escape', 27)
  assert(!panel.isConnected, 'Unclaimed Escape did not close the current action panel')
  equal(document.activeElement, editableField(editor, 'a'))
  await printable('X')
  equal(editor.save().blocks[0].data.text, 'AXa')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('A retained panel cannot return focus or close its same-ID successor after render', async () => {
  const panels = [], contexts = []
  const tool = {
    type: 'retainedPanel', title: 'Retained panel', icon: 'R', isActive() { return false }, toggle() {},
    renderActions(ctx) {
      contexts.push(ctx)
      const panel = document.createElement('div')
      panel.className = 'audit-retained-panel'
      const input = document.createElement('input')
      panel.append(input)
      panels.push(panel)
      return panel
    },
  }
  const editor = make([para('a', 'Alpha')], { injectStyles: true, inlineTools: [tool] })
  const root = editorRoot(editor)
  await sourceSelection(editor, false, false)
  await clickNative(root.querySelector('[data-tool="retainedPanel"]'))
  const retired = panels[0]
  editor.render({ version: '2.0.0', blocks: [para('a', 'Bravo')] })
  await sourceSelection(editor, false, false)
  await clickNative(root.querySelector('[data-tool="retainedPanel"]'))
  const successor = panels[1], before = editor.save().blocks, couldUndo = editor.canUndo
  const active = document.activeElement
  contexts[0].close()
  contexts[0].restoreSelection()
  equal(document.activeElement, active, 'Revoked callback stole successor focus')
  assert(successor.isConnected)
  // An extension may retain its own detached element; reattachment does not renew its lease.
  document.body.append(retired)
  try {
    await clickNative(retired.querySelector('input'))
    await dispatchKey('Escape', 'Escape', 27)
    equal(document.activeElement, retired.querySelector('input'), 'Retired Escape revived a document bookmark')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, couldUndo, 'Retired Escape changed document history')
  } finally {
    retired.remove()
  }
})


for (const theme of ['light', 'dark']) test('Background swatch remains visible against the toolbar surface / ' + theme, async () => {
  const editor = make([para('a', 'Alpha')], { injectStyles: true, theme, inlineTools: createDefaultInlineTools() })
  const root = editorRoot(editor)
  await sourceSelection(editor, false, false)
  const dot = root.querySelector('.oe-inline-tool__color-dot')
  const toolbar = root.querySelector('.oe-inline-toolbar')
  const style = getComputedStyle(dot), surface = getComputedStyle(toolbar).backgroundColor
  const hasVisibleFill = style.backgroundColor !== surface && !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor)
  const hasVisibleBorder = style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0 && style.borderTopColor !== surface
  const hasVisibleOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== surface
  const shadowColor = style.boxShadow.match(/rgba?\([^)]+\)/)?.[0]
  const hasVisibleShadow = !!shadowColor && shadowColor !== surface && !['transparent', 'rgba(0, 0, 0, 0)'].includes(shadowColor)
  assert(hasVisibleFill || hasVisibleBorder || hasVisibleOutline || hasVisibleShadow, 'Color swatch has no visible pixels against its toolbar surface: ' + JSON.stringify({ fill: style.backgroundColor, surface, shadow: style.boxShadow }))
  const bounds = dot.getBoundingClientRect()
  assert(bounds.width > 0 && bounds.height > 0, 'Color swatch is not rendered')
  const before = editor.save().blocks
  await clickNative(root.querySelector('[data-tool="bgcolor"]'))
  assert(getComputedStyle(root.querySelector('.oe-color-dropdown')).display !== 'none')
  await clickNative(root.querySelector('.oe-color-hex'))
  await dispatchKey('Escape', 'Escape', 27)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})


await run()
