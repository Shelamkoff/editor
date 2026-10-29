import { createParagraphPlugin, createHeadingPlugin, createListPlugin, createQuotePlugin, createWarningPlugin, createDelimiterPlugin } from '../../plugins/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import demo from '../../docs/.vitepress/theme/components/demo-data.json'
import { getTextLength, getTextOffset } from '../../shared/textOffset.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, select, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, pointAt, printable } from './native-input-helpers.js'

function mount(blocks = demo.ru) {
  return make(blocks, {
    injectStyles: true,
    plugins: [createParagraphPlugin(), createHeadingPlugin(), createListPlugin(), createQuotePlugin(), createWarningPlugin(), createDelimiterPlugin()],
    inlinePlugins: [createColorSwatchPlugin(), createMentionPlugin()],
    inlineTools: createDefaultInlineTools(),
  })
}


// Predict the destination column with an independent, plain native text host.
// A rounded mouse coordinate is not the current keyboard caret column, and the
// real destination may be covered by the editor's floating toolbar before the key.
function verticalTargetOffset(editor, fieldId) {
  const selection = window.getSelection(), origin = editableField(editor, 'b')
  assert(origin.contains(selection.focusNode), 'Vertical navigation must start in the middle field')
  equal(getTextOffset(origin, selection.focusNode, selection.focusOffset), 2)
  const caret = document.createRange()
  caret.setStart(selection.focusNode, selection.focusOffset)
  caret.collapse(true)
  const x = caret.getBoundingClientRect().left
  const destination = editableField(editor, fieldId), style = getComputedStyle(destination)
  const bounds = destination.getBoundingClientRect(), text = document.createRange()
  text.selectNodeContents(destination)
  equal(text.getClientRects().length, 1, 'Vertical fixture must expose one plain text line')
  const line = text.getBoundingClientRect()
  const reference = document.createElement('div')
  reference.contentEditable = 'true'
  reference.textContent = destination.textContent
  reference.style.cssText = `position:fixed;left:${bounds.left}px;top:${innerHeight - 60}px;width:${bounds.width}px;margin:0;padding:0;font:${style.font};white-space:${style.whiteSpace};letter-spacing:${style.letterSpacing};text-indent:${style.textIndent};z-index:2147483647`
  const before = { anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode, focusOffset: selection.focusOffset, active: document.activeElement }
  let offset
  document.body.append(reference)
  try {
    const referenceText = document.createRange()
    referenceText.selectNodeContents(reference)
    const referenceLine = referenceText.getBoundingClientRect()
    equal(referenceLine.left, line.left, 'Native reference changed the destination text origin')
    equal(referenceLine.width, line.width, 'Native reference changed text metrics')
    const y = referenceLine.top + referenceLine.height / 2
    const position = document.caretPositionFromPoint?.(x, y)
    const range = position ? null : document.caretRangeFromPoint(x, y)
    const node = position?.offsetNode ?? range?.startContainer
    assert(node === reference.firstChild, 'Native reference did not own the predicted text caret')
    offset = position?.offset ?? range.startOffset
  } finally { reference.remove() }
  equal(selection.anchorNode, before.anchorNode, 'Reference changed the native selection anchor')
  equal(selection.anchorOffset, before.anchorOffset)
  equal(selection.focusNode, before.focusNode, 'Reference changed the native selection focus')
  equal(selection.focusOffset, before.focusOffset)
  equal(document.activeElement, before.active, 'Reference stole author focus')
  return offset
}

test('mixed demo drag shows a visible highlight through Heading, widgets, List and both Quote fields', async () => {
  const editor = mount()
  const before = editor.save().blocks
  const heading = editableField(editor, 'welcome')
  const caption = editableField(editor, 'quote', '.oe-quote__caption')
  const trace = []
  const observe = event => {
    if (!(event.buttons & 1)) return
    const hit = document.caretPositionFromPoint(event.clientX, event.clientY)
    trace.push({ x: event.clientX, y: event.clientY, hit: hit?.offsetNode?.parentElement?.outerHTML?.slice(0, 180), ids: editor.blocks.selectedIds(), caption: caption.getBoundingClientRect().toJSON() })
  }
  document.addEventListener('mousemove', observe)
  const observeDrag = event => trace.push({ type: event.type, target: event.target?.outerHTML?.slice(0, 180) })
  document.addEventListener('dragstart', observeDrag)
  document.addEventListener('dragend', observeDrag)
  try { await dragAcross(editor, heading, 0, caption, getTextLength(caption)) }
  catch (error) { throw new Error(`${error.message}\n${JSON.stringify(trace)}`) }
  finally { document.removeEventListener('mousemove', observe); document.removeEventListener('dragstart', observeDrag); document.removeEventListener('dragend', observeDrag) }
  equal(editor.blocks.selectedIds(), ['welcome', 'intro', 'principles', 'quote'])
  const highlights = [...CSS.highlights.values()]
  equal(highlights.length, 1, 'Cross-block drag did not register a visual range')
  const [name] = [...CSS.highlights.keys()]
  const color = getComputedStyle(heading, `::highlight(${name})`).backgroundColor
  assert(color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent', `Cross-block range has no visible background: ${color}`)
  assert(editorRoot(editor).querySelector('.oe-inline-toolbar').style.display !== 'none', 'Cross-block drag did not open the formatting toolbar')
  equal(editor.canUndo, false, 'Selecting content must not enter history')
  equal(editor.save().blocks, before, 'Selecting content triggered native text drag/drop')
})

test('mixed cross-block toolbar retains the starting Heading controls and selection through a level change', async () => {
  const editor = mount()
  const before = editor.save().blocks
  await dragAcross(editor, editableField(editor, 'welcome'), 0, editableField(editor, 'quote', '.oe-quote__caption'), 4)
  const root = editorRoot(editor)
  equal(root.querySelector('.oe-inline-toolbar__type-name').textContent, 'Heading', 'Toolbar replaced the starting block context with the drag endpoint')
  const levels = root.querySelector('.oe-inline-toolbar__level-select')
  assert(!levels.hidden, 'Cross-block drag hid the starting Heading controls')
  equal(levels.textContent, 'H2')
  await clickNative(levels)
  await clickNative(root.querySelector('.oe-inline-toolbar__level-dropdown [data-action-id="h3"]'))
  const after = editor.save().blocks
  equal(after, before.map(block => block.id === 'welcome' ? { ...block, data: { ...block.data, level: 3 } } : block))
  equal(editor.blocks.selectedIds(), ['welcome', 'intro', 'principles', 'quote'])
  equal(root.querySelector('.oe-inline-toolbar__level-select').textContent, 'H3')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
  const native = window.getSelection()
  const heading = editableField(editor, 'welcome')
  const caption = editableField(editor, 'quote', '.oe-quote__caption')
  assert(heading.contains(native.anchorNode) && caption.contains(native.focusNode), 'History lost the cross-block endpoints')
  equal(getTextOffset(heading, native.anchorNode, native.anchorOffset), 0)
  equal(getTextOffset(caption, native.focusNode, native.focusOffset), 4)
})

for (const operation of ['format', 'convert']) {
  test(`a drag beyond the editor edge supports ${operation} and one native Undo/Redo`, async () => {
    const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
    const before = editor.save().blocks
    const a = editableField(editor, 'a')
    const b = editableField(editor, 'b')
    const from = pointAt(a, 2)
    const root = editorRoot(editor)
    const rect = b.getBoundingClientRect()
    await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: root.getBoundingClientRect().right + 20, y: rect.top + rect.height / 2 } })
    await pause(35)
    equal(editor.blocks.selectedIds(), ['a', 'b'])
    if (operation === 'format') {
      await clickNative(root.querySelector('[data-tool="bold"]'))
      equal(editor.save().blocks.map(block => block.data.text), ['Al<b>pha</b>', '<b>Bravo</b>'])
    } else {
      await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
      await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
      equal(editor.save().blocks.map(block => [block.type, block.data.text]), [['paragraph', 'Al'], ['heading', 'pha'], ['heading', 'Bravo']])
    }
    const after = editor.save().blocks
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after)
    assert(root.contains(document.activeElement), 'History lost editor focus')
  })
}

for (const boundary of ['right', 'below', 'above', 'gap']) {
  test(`dragging in the ${boundary} margin keeps its logical cross-block endpoint`, async () => {
    const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
    const before = editor.save().blocks
    const a = editableField(editor, 'a')
    const b = editableField(editor, 'b')
    const backward = boundary === 'above'
    const from = pointAt(backward ? b : a, 2)
    const root = editorRoot(editor).getBoundingClientRect()
    const rect = (backward ? a : b).getBoundingClientRect()
    const to = boundary === 'right' ? { x: root.right + 20, y: rect.top + rect.height / 2 }
      : boundary === 'below' ? { x: rect.left + 4, y: root.bottom + 20 }
      : boundary === 'above' ? { x: rect.left + 4, y: root.top - 20 }
      : { x: rect.left + 4, y: rect.top - 2 }
    await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to })
    await pause(35)
    equal(editor.blocks.selectedIds(), ['a', 'b'])
    const selection = window.getSelection()
    const anchor = backward ? b : a
    const focus = backward ? a : b
    assert(anchor.contains(selection.anchorNode) && focus.contains(selection.focusNode), 'Margin drag lost its editing hosts')
    equal(getTextOffset(anchor, selection.anchorNode, selection.anchorOffset), 2)
    equal(getTextOffset(focus, selection.focusNode, selection.focusOffset), boundary === 'above' || boundary === 'gap' ? 0 : 5)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}

test('dragging in the left margin still extends through the next block', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  const from = pointAt(a, 2)
  const root = editorRoot(editor).getBoundingClientRect()
  const rect = b.getBoundingClientRect()
  await window.__testInput('Input.drag', {
    from: { x: from.clientX, y: from.clientY },
    to: { x: root.left - 20, y: rect.top + rect.height / 2 },
  })
  await pause(35)
  equal(editor.blocks.selectedIds(), ['a', 'b'], 'Leaving the text boxes stopped cross-block drag')
  const selection = window.getSelection()
  assert(a.contains(selection.anchorNode) && b.contains(selection.focusNode), 'Margin drag did not retain both editing hosts')
  equal(getTextOffset(a, selection.anchorNode, selection.anchorOffset), 2)
  equal(getTextOffset(b, selection.focusNode, selection.focusOffset), 0)
})

for (const side of ['left', 'right']) {
  test(`a ${side} margin drag uses the nearest visual line in a multiline field`, async () => {
    const editor = mount([para('a', 'Alpha'), para('b', 'One<br>Two<br>Three')])
    const a = editableField(editor, 'a')
    const b = editableField(editor, 'b')
    const from = pointAt(a, 2)
    const line = pointAt(b, 5)
    const root = editorRoot(editor).getBoundingClientRect()
    await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: side === 'left' ? root.left - 20 : root.right + 20, y: line.clientY } })
    await pause(35)
    equal(editor.blocks.selectedIds(), ['a', 'b'])
    const selection = window.getSelection()
    assert(b.contains(selection.focusNode), 'Multiline margin lost its endpoint')
    equal(getTextOffset(b, selection.focusNode, selection.focusOffset), side === 'left' ? 4 : 7, 'Margin selected the whole field instead of the nearest line')
  })
}

test('returning the drag to its original field selects only the final local range', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  const coordinates = point => ({ x: point.clientX, y: point.clientY })
  await window.__testInput('Input.drag', { from: coordinates(pointAt(a, 2)), via: [coordinates(pointAt(b, 3))], to: coordinates(pointAt(a, 4)) })
  await pause(35)
  const native = window.getSelection()
  assert(a.contains(native.anchorNode) && a.contains(native.focusNode), 'Returning drag retained a different block endpoint')
  equal([getTextOffset(a, native.anchorNode, native.anchorOffset), getTextOffset(a, native.focusNode, native.focusOffset)], [2, 4])
  assert(!editorRoot(editor).classList.contains('oe-editor--cross-selecting'), 'Returning drag left a stale cross-block overlay')
  equal(editor.blocks.selectedIds(), [])
  equal(editor.save().blocks, before)
  await printable('X')
  equal(editor.save().blocks.map(block => block.data.text), ['AlXa', 'Bravo'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
})

test('Shift+ArrowLeft shrinks a cross-block selection before typing', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
  const before = editor.save().blocks
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  await dragAcross(editor, a, 2, b, 3)
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37, 8)
  const native = window.getSelection()
  assert(a.contains(native.anchorNode) && b.contains(native.focusNode), 'Shift navigation lost cross-block endpoints')
  equal([getTextOffset(a, native.anchorNode, native.anchorOffset), getTextOffset(b, native.focusNode, native.focusOffset)], [2, 2])
  await printable('X')
  equal(editor.save().blocks.map(block => block.data.text), ['AlXavo'])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
})

for (const [backward, key, initial, selectedEnd, expectedStart, expectedEnd] of [
  [false, 'ArrowRight', 'Bravo', 3, 2, 4],
  [true, 'ArrowLeft', 'Bravo', 3, 1, 3],
  [true, 'ArrowRight', 'Bravo', 3, 3, 3],
  [false, 'ArrowLeft', 'A😀B', 3, 2, 1],
  [false, 'ArrowLeft', 'A👨‍👩‍👧‍👦B', 12, 2, 1],
]) {
  test(`Shift+${key} retains ${backward ? 'backward' : 'forward'} cross-block intent with ${initial}`, async () => {
    const editor = mount([para('a', 'Alpha'), para('b', initial)])
    const before = editor.save().blocks
    const a = editableField(editor, 'a')
    const b = editableField(editor, 'b')
    await dragAcross(editor, a, 2, b, selectedEnd, backward)
    await dispatchKey(key, key, key === 'ArrowLeft' ? 37 : 39, 8)
    const native = window.getSelection()
    const anchor = backward ? b : a
    const focus = backward ? a : b
    assert(anchor.contains(native.anchorNode) && focus.contains(native.focusNode), 'Shift navigation clipped the range to one host')
    equal(getTextOffset(anchor, native.anchorNode, native.anchorOffset), backward ? selectedEnd : 2)
    equal(getTextOffset(focus, native.focusNode, native.focusOffset), backward ? expectedStart : expectedEnd)
    await printable('X')
    equal(editor.save().blocks.map(block => block.data.text), ['Alpha'.slice(0, expectedStart) + 'X' + initial.slice(expectedEnd)])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
  })
}

test('Shift navigation can shrink a cross-block range back into its original field', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'Bravo')])
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  await dragAcross(editor, a, 2, b, 1)
  for (let step = 0; step < 3; step++) await dispatchKey('ArrowLeft', 'ArrowLeft', 37, 8)
  const native = window.getSelection()
  assert(a.contains(native.anchorNode) && a.contains(native.focusNode), 'Shrinking did not return to the starting field')
  equal([getTextOffset(a, native.anchorNode, native.anchorOffset), getTextOffset(a, native.focusNode, native.focusOffset)], [2, 4])
  equal(editor.blocks.selectedIds(), [])
  assert(!editorRoot(editor).classList.contains('oe-editor--cross-selecting'))
  await printable('X')
  equal(editor.save().blocks.map(block => block.data.text), ['AlXa', 'Bravo'])
})

test('Shift navigation treats an inline widget as one atomic step and preserves its payload', async () => {
  const editor = mount([para('a', 'Alpha'), para('b', 'A{{swatch}}B', { inline: { swatch: { type: 'color', dataVersion: 1, data: { value: '#ff0000' } } } })])
  const before = editor.save().blocks
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  await dragAcross(editor, a, 2, b, 2)
  await dispatchKey('ArrowLeft', 'ArrowLeft', 37, 8)
  const native = window.getSelection()
  equal(getTextOffset(b, native.focusNode, native.focusOffset), 1, 'Arrow stopped inside plugin-owned widget markup')
  await printable('X')
  const after = editor.save().blocks
  equal(after[0].data.text, 'AlX{{swatch}}B')
  equal(after[0].inline.swatch, before[1].inline.swatch)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
})

for (const backwards of [false,true]) {
  test(`Shift horizontal navigation starts a ${backwards?'backward':'forward'} range across editing hosts`,async()=>{
    const editor=mount([para('a','Alpha'),para('b','Bravo')])
    const before=editor.save().blocks
    const first=editableField(editor,'a'), last=editableField(editor,'b')
    select(backwards?last:first,backwards?0:5)
    for(let step=0;step<2;step++)await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
    equal(editor.blocks.selectedIds(),['a','b'],'Shift navigation stayed trapped in its original host')
    const native=window.getSelection()
    equal(getTextOffset(backwards?last:first,native.anchorNode,native.anchorOffset),backwards?0:5)
    equal(getTextOffset(backwards?first:last,native.focusNode,native.focusOffset),backwards?4:1)
    await printable('X')
    equal(editor.save().blocks.map(block=>block.data.text),[backwards?'AlphXBravo':'AlphaXravo'])
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    equal(editor.canUndo,false)
  })
}

for(const backwards of [false,true]){
  test(`Shift+Enter replaces a ${backwards?'backward':'forward'} cross-block range with one line break`,async()=>{
    const editor=mount([para('a','Alpha'),para('b','Bravo')])
    const before=editor.save().blocks
    await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
    await dispatchKey('Enter','Enter',13,8)
    equal(editor.save().blocks.map(block=>block.data.text),['Al<br>vo'])
    const field=editableField(editor,'a'),native=window.getSelection()
    assert(native.isCollapsed&&field.contains(native.anchorNode),'Line break lost its caret')
    equal(getTextOffset(field,native.anchorNode,native.anchorOffset),3)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    equal(editor.canUndo,false)
    await dispatchKey('z','KeyZ',90,2|8)
    equal(editor.save().blocks.map(block=>block.data.text),['Al<br>vo'])
  })
}
for(const backwards of [false,true]){
  test(`Enter splits a ${backwards?'backward':'forward'} cross-block text range as one action`,async()=>{
    const editor=mount([para('a','Alpha'),para('b','Bravo')])
    const before=editor.save().blocks
    await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
    await dispatchKey('Enter','Enter',13)
    const after=editor.save().blocks
    equal(after.map(block=>block.data.text),['Al','vo'],'Enter inserted a soft line break instead of splitting the selected text')
    const native=window.getSelection(),field=editableField(editor,1)
    assert(native.isCollapsed&&field.contains(native.anchorNode),'Enter caret stayed in the preceding block')
    equal(getTextOffset(field,native.anchorNode,native.anchorOffset),0)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    equal(editor.canUndo,false)
    await dispatchKey('z','KeyZ',90,2|8)
    equal(editor.save().blocks,after)
  })
}
for(const [key,code,keyCode,modifiers,anchorId,anchorOffset,focusId,focusOffset] of [
  ['End','End',35,8,'a',2,'b',5],
  ['Home','Home',36,8,'a',2,'b',0],
  ['ArrowRight','ArrowRight',39,2|8,'a',2,'b',5],
  ['ArrowLeft','ArrowLeft',37,2|8,'a',2,'b',0],
  ['ArrowDown','ArrowDown',40,8,'a',2,'c',2],
  ['ArrowUp','ArrowUp',38,8,'c',3,'a',2],
]){
  test(`Shift navigation ${modifiers&2?'Ctrl+':''}${key} preserves cross-host intent and native endpoints`,async()=>{
    const editor=mount([para('a','Alpha'),para('b','Bravo'),para('c','Charlie')])
    const before=editor.save().blocks
    await dragAcross(editor,editableField(editor,key==='ArrowUp'?'b':'a'),2,editableField(editor,key==='ArrowUp'?'c':'b'),key==='ArrowDown'?2:3,key==='ArrowUp')
    let expectedFocus=focusOffset
    if(key==='ArrowUp'||key==='ArrowDown'){
      expectedFocus=verticalTargetOffset(editor,focusId)
    }
    await dispatchKey(key,code,keyCode,modifiers)
    const selection=window.getSelection(),anchor=editableField(editor,anchorId),focus=editableField(editor,focusId)
    assert(anchor.contains(selection.anchorNode)&&focus.contains(selection.focusNode),'Keyboard navigation clipped cross-block selection to one host')
    equal(getTextOffset(anchor,selection.anchorNode,selection.anchorOffset),anchorOffset)
    equal(getTextOffset(focus,selection.focusNode,selection.focusOffset),expectedFocus)
    equal(editor.save().blocks,before)
    equal(editor.canUndo,false)
  })
}
for (const { shift, backwards, widgetFirst } of [
  { shift: 0.25, backwards: false, widgetFirst: false },
  { shift: 0, backwards: true, widgetFirst: false },
  { shift: 0.25, backwards: true, widgetFirst: false },
  { shift: 0.25, backwards: true, widgetFirst: true },
]) {
  test(`native atomic-boundary drag at ${shift}px keeps a ${backwards ? 'backward' : 'forward'} range with the widget in its ${widgetFirst ? 'first' : 'last'} field`, async () => {
    const inline = { swatch: { type: 'color', dataVersion: 1, data: { value: '#ff0000' } } }
    const editor = mount(widgetFirst
      ? [para('a', 'A{{swatch}}B', { inline }), para('b', 'Bravo')]
      : [para('a', 'Alpha'), para('b', 'A{{swatch}}B', { inline })])
    editorRoot(editor).style.transform = `translateX(${shift}px)`
    const before = editor.save().blocks
    const a = editableField(editor, 'a'), b = editableField(editor, 'b')
    const delivered = []
    const capture = event => delivered.push({ type: event.type, trusted: event.isTrusted,
      x: event.clientX, y: event.clientY })
    for (const type of ['mousedown', 'mousemove', 'mouseup']) document.addEventListener(type, capture, true)
    try { await dragAcross(editor, a, 2, b, 2, backwards) }
    finally { for (const type of ['mousedown', 'mousemove', 'mouseup']) document.removeEventListener(type, capture, true) }
    equal(delivered.filter(event => event.type === 'mousedown').length, 1, 'The fixture retried the native gesture')
    equal(delivered.filter(event => event.type === 'mouseup').length, 1, 'The fixture retried the native release')
    assert(delivered.every(event => event.trusted), 'The drag used a synthetic input event')
    const nativePoint = widgetFirst || !backwards ? delivered.at(-1) : delivered[0]
    const host = widgetFirst ? a : b
    const position = document.caretPositionFromPoint(nativePoint.x, nativePoint.y)
    assert(position, 'The actual mouse point has no native caret position')
    assert(host.contains(position.offsetNode), 'The actual mouse point missed its authoring field')
    const hitElement = position.offsetNode.nodeType === Node.ELEMENT_NODE ? position.offsetNode : position.offsetNode.parentElement
    assert(!hitElement.closest('[data-inline-plugin],[contenteditable="false"]'),
      'The actual mouse point landed inside a private inline widget')
    equal(getTextOffset(host, position.offsetNode, position.offset), 2, 'The actual mouse point hit a different logical offset')
    equal(editor.save().blocks, before, 'The drag changed canonical data')
    equal(editor.canUndo, false, 'The drag entered history')

    const arrow = backwards && !widgetFirst ? 'ArrowRight' : 'ArrowLeft'
    await dispatchKey(arrow, arrow, arrow === 'ArrowRight' ? 39 : 37, 8)
    const focus = backwards ? a : b
    const focusOffset = backwards && !widgetFirst ? 3 : 1
    const selection = window.getSelection()
    equal(getTextOffset(focus, selection.focusNode, selection.focusOffset), focusOffset,
      'Shift navigation stopped inside widget-owned markup')
    await printable('X')
    const after = editor.save().blocks
    equal(after.map(block => block.data.text), [widgetFirst ? 'AXavo' : backwards ? 'AlpXB' : 'AlX{{swatch}}B'])
    if (!backwards) equal(after[0].inline.swatch, inline.swatch, 'Typing changed the unselected widget payload')
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before, 'One Undo did not restore the exact widget payload and block order')
    equal(editor.canUndo, false, 'The gesture or one input created an extra history operation')
    const restored = window.getSelection()
    const restoredAnchor = editableField(editor, backwards ? 'b' : 'a')
    const restoredFocus = editableField(editor, backwards ? 'a' : 'b')
    assert(restoredAnchor.contains(restored.anchorNode) && restoredFocus.contains(restored.focusNode),
      'Undo did not restore both current authoring hosts')
    equal(getTextOffset(restoredAnchor, restored.anchorNode, restored.anchorOffset), 2)
    equal(getTextOffset(restoredFocus, restored.focusNode, restored.focusOffset), focusOffset)
    await dispatchKey('z', 'KeyZ', 90, 2 | 8)
    equal(editor.save().blocks, after, 'One Redo did not restore the exact native edit')
    equal(editor.canRedo, false)
  })
}

for (const shift of [0, 0.25, 0.5, 0.75]) {
  test(`Shift vertical navigation at ${shift}px keeps the caret column across a fractional indent`, async () => {
    const editor = mount([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')])
    editorRoot(editor).style.transform = `translateX(${shift}px)`
    const destination = editableField(editor, 'c')
    destination.style.textIndent = '1.5px'
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 2)
    const expectedFocus = verticalTargetOffset(editor, 'c')
    await dispatchKey('ArrowDown', 'ArrowDown', 40, 8)
    const selection = window.getSelection(), anchor = editableField(editor, 'a')
    assert(anchor.contains(selection.anchorNode) && destination.contains(selection.focusNode),
      'Vertical navigation lost its directed editing hosts')
    equal(getTextOffset(anchor, selection.anchorNode, selection.anchorOffset), 2)
    equal(getTextOffset(destination, selection.focusNode, selection.focusOffset), expectedFocus)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}


const verticalPanelTag = 'rector-vertical-dismissal-probe'
if (!customElements.get(verticalPanelTag)) customElements.define(verticalPanelTag, class extends HTMLElement {
  disconnectedCallback() { this.onDismiss?.() }
})

for (const retirement of ['foreign focus', 'unrelated document revision']) {
  test(`native vertical selection yields to ${retirement} from public action-panel teardown`, async () => {
    let panel
    const tool = {
      type: 'verticalDismissal', title: 'Vertical dismissal', icon: 'V',
      isActive() { return false }, toggle() {},
      renderActions() {
        panel = document.createElement(verticalPanelTag)
        panel.textContent = 'Action panel'
        return panel
      },
    }
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie')], {
      injectStyles: true, inlineTools: [tool],
    })
    const foreign = document.createElement('textarea')
    foreign.value = 'Foreign control'
    document.body.append(foreign)
    const before = editor.save().blocks
    await dragAcross(editor, editableField(editor, 'a'), 2, editableField(editor, 'b'), 2)
    await clickNative(editorRoot(editor).querySelector('[data-tool="verticalDismissal"]'))
    assert(panel?.isConnected, 'Public action panel did not remain mounted for the key')
    const active = document.activeElement
    assert(active === editableField(editor, 'a') || active === editableField(editor, 'b'),
      'Opening the non-focusable action panel lost the original editing host')
    const snapshot = () => {
      const native = window.getSelection()
      return { active: document.activeElement, anchorNode: native.anchorNode, anchorOffset: native.anchorOffset,
        focusNode: native.focusNode, focusOffset: native.focusOffset }
    }
    let dismissed = 0, afterDismiss = null, observed = null, currentKey = null, dismissedDuringKey = false
    panel.onDismiss = () => {
      dismissed++
      dismissedDuringKey = Boolean(currentKey)
      if (retirement === 'foreign focus') {
        foreign.focus()
        foreign.setSelectionRange(2, 4)
      } else editor.blocks.update('c', () => ({ data: { text: 'Newer content' } }))
      afterDismiss = snapshot()
    }
    const begin = event => { if (event.key === 'ArrowDown') currentKey = event }
    const observe = event => {
      if (event.key === 'ArrowDown') {
        observed = { trusted: event.isTrusted, prevented: event.defaultPrevented, ...snapshot() }
        currentKey = null
      }
    }
    document.addEventListener('keydown', begin, true)
    document.addEventListener('keydown', observe)
    try {
      await dispatchKey('ArrowDown', 'ArrowDown', 40, 8)
      equal(dismissed, 1, 'Native vertical key did not dismiss exactly its current action panel')
      assert(observed?.trusted, 'The retirement control did not use a real native key')
      assert(dismissedDuringKey, 'Action panel closed outside the native key handler')
      equal(observed.prevented, false, 'Retired navigation consumed a newer author interaction')
      for (const property of ['active', 'anchorNode', 'anchorOffset', 'focusNode', 'focusOffset']) {
        equal(observed[property], afterDismiss[property], `Old vertical selection replaced ${property} after teardown`)
      }
      const expected = retirement === 'foreign focus' ? before
        : before.map(block => block.id === 'c' ? { ...block, data: { text: 'Newer content' } } : block)
      equal(editor.save().blocks, expected, 'Old key changed canonical content after panel teardown')
      equal(editor.canUndo, retirement !== 'foreign focus', 'Navigation created an authored history action')
      if (retirement === 'foreign focus') equal(document.activeElement, foreign, 'Old vertical key stole foreign focus')
    } finally {
      panel.onDismiss = null
      document.removeEventListener('keydown', begin, true)
      document.removeEventListener('keydown', observe)
      foreign.remove()
    }
  })
}

await run()
