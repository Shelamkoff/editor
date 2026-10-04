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
  await clickNative(root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]'))
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
      const origin=pointAt(editableField(editor,'b'),2)
      const destination=pointAt(editableField(editor,focusId),2)
      const position=document.caretPositionFromPoint?.(origin.clientX-0.1,destination.clientY)
      const range=position?null:document.caretRangeFromPoint(origin.clientX-0.1,destination.clientY)
      expectedFocus=getTextOffset(editableField(editor,focusId),position?.offsetNode??range.startContainer,position?.offset??range.startOffset)
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
await run()
