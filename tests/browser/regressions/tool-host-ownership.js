import { createCaseTransformTool } from '../../../inline-tools/caseTransform.js'
import { createClearFormattingTool } from '../../../inline-tools/clearFormatting.js'
import { createDefaultInlineTools } from '../../../inline-tools/defaults.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { clickNative, dispatchKey } from '../native-input-helpers.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal } from './harness.js'

for (const crossBlock of [false, true]) {
  for (const [name, createTool] of [['case transformation', createCaseTransformTool], ['clear formatting', createClearFormattingTool]]) {
    test(`owned tool ${name} preserves nested editing hosts in ${crossBlock ? 'cross-block' : 'single-field'} selections`, () => {
      const root = document.createElement('div')
      root.innerHTML = '<div class="oe-block" contenteditable="false"><div contenteditable="true">'
        + '<b>Alpha</b><span contenteditable="true"><b>Nested</b> label</span><i>Beta</i></div></div>'
        + '<button type="button"><b>Toolbar</b></button>'
        + '<div class="oe-block" contenteditable="false"><div contenteditable="true"><b>Bravo</b></div></div>'
      document.body.append(root)
      const first = root.firstChild.firstChild, last = root.lastChild.firstChild
      const nested = first.querySelector('[contenteditable]'), control = root.querySelector('button')
      const nestedNodes = [nested.firstChild, nested.firstChild.firstChild, nested.lastChild]
      const nestedMarkup = nested.innerHTML, controlMarkup = control.innerHTML
      const range = document.createRange()
      range.setStart(first.firstChild.firstChild, 0)
      range.setEnd(crossBlock ? last.firstChild.firstChild : first.lastChild.firstChild, crossBlock ? 5 : 4)
      const tool = createTool(name)
      tool.bindSelectionPort({ get range() { return range }, capture: () => ({}), restore: () => true })
      try {
        tool.toggle({ range })
        equal(nested.innerHTML, nestedMarkup, 'The tool edited text or marks owned by a nested editing host')
        assert(nestedNodes.every(node => node.isConnected && nested.contains(node)), 'The tool replaced nested-host nodes')
        equal(control.innerHTML, controlMarkup, 'The tool edited a native toolbar label')
        if (name === 'case transformation') {
          equal(first.firstChild.textContent, 'ALPHA')
          equal(first.lastChild.textContent, 'BETA')
          equal(last.textContent, crossBlock ? 'BRAVO' : 'Bravo')
        } else {
          assert(first.firstChild.nodeType === Node.TEXT_NODE, 'The authored leading bold was not cleared')
          assert(!crossBlock || last.firstChild.nodeType === Node.TEXT_NODE, 'The last authored bold was not cleared')
          equal(first.textContent, 'AlphaNested labelBeta')
        }
      } finally { tool.bindSelectionPort(null); root.remove() }
    })
  }
}

for (const type of ['caseTransform', 'clearFormatting']) {
  for (const elementBoundary of [false, true]) {
    for (const backward of [false, true]) {
      test(`owned tool native ${type} preserves mixed marks and widgets with ${elementBoundary ? 'Element' : 'Text'} ${backward ? 'backward' : 'forward'} boundaries`, async () => {
        const source = 'un<b>MiXeD</b> {{swatch}} <a href="/kept" rel="noopener noreferrer"><i>Tail</i></a>'
        const editor = make([
          para('a', source, { inline: { swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } } } }),
          para('b', '<mark>BrAvO</mark> rest'),
        ], { injectStyles: true, inlinePlugins: [createColorSwatchPlugin()], inlineTools: createDefaultInlineTools({ types: [type] }) })
        const initial = editor.save().blocks, first = editableField(editor, 'a'), last = editableField(editor, 'b')
        const selection = window.getSelection()
        first.focus(); selection.setBaseAndExtent(first.firstChild, 0, first.firstChild, 0)
        await window.__testInput('Input.insertText', { text: 'X' })
        await pause(25)
        const typed = editor.save().blocks
        equal(typed.map(block => block.data.text), ['X' + source, '<mark>BrAvO</mark> rest'])
        const widget = first.querySelector('[data-inline-plugin="color"]'), widgetChildren = [...widget.childNodes]
        const start = elementBoundary ? first.querySelector('b') : first.querySelector('b').firstChild
        const end = elementBoundary ? last.querySelector('mark') : last.querySelector('mark').firstChild
        const startOffset = elementBoundary ? 0 : 2, endOffset = elementBoundary ? 1 : 3
        selection.setBaseAndExtent(backward ? end : start, backward ? endOffset : startOffset,
          backward ? start : end, backward ? startOffset : endOffset)
        document.dispatchEvent(new Event('selectionchange'))
        await pause(40)
        await clickNative(editorRoot(editor).querySelector(`[data-tool="${type}"]`))
        await pause(25)
        const after = editor.save().blocks
        const expected = type === 'clearFormatting'
          ? [elementBoundary ? 'XunMiXeD {{swatch}} <a href="/kept" rel="noopener noreferrer">Tail</a>'
            : 'Xun<b>Mi</b>XeD {{swatch}} <a href="/kept" rel="noopener noreferrer">Tail</a>',
          elementBoundary ? 'BrAvO rest' : 'BrA<mark>vO</mark> rest']
          : [elementBoundary ? 'Xun<b>MIXED</b> {{swatch}} <a href="/kept" rel="noopener noreferrer"><i>TAIL</i></a>'
            : 'Xun<b>MiXED</b> {{swatch}} <a href="/kept" rel="noopener noreferrer"><i>TAIL</i></a>',
          elementBoundary ? '<mark>BRAVO</mark> rest' : '<mark>BRAvO</mark> rest']
        equal(after.map(block => block.data.text), expected, 'Formatting changed unselected characters or lost selected author text')
        equal(after.map(block => block.inline), initial.map(block => block.inline), 'Formatting changed widget sidecars')
        assert(widget.isConnected && first.querySelector('[data-inline-plugin="color"]') === widget
          && widgetChildren.every((node, index) => widget.childNodes[index] === node), 'Formatting replaced the selected live widget')
        const from = elementBoundary ? 3 : 5, to = elementBoundary ? 5 : 3
        const checkSelection = label => {
          const a = editableField(editor, 'a'), b = editableField(editor, 'b')
          const native = window.getSelection(), anchorHost = backward ? b : a, focusHost = backward ? a : b
          assert(anchorHost.contains(native.anchorNode) && focusHost.contains(native.focusNode), label + ': selection changed owner or direction')
          equal(getTextOffset(anchorHost, native.anchorNode, native.anchorOffset), backward ? to : from, label + ': anchor moved')
          equal(getTextOffset(focusHost, native.focusNode, native.focusOffset), backward ? from : to, label + ': focus moved')
        }
        checkSelection('apply')
        await dispatchKey('z', 'KeyZ', 90, 2)
        equal(editor.save().blocks, typed, 'One Undo did not restore the independent preceding edit')
        checkSelection('undo formatting')
        await dispatchKey('z', 'KeyZ', 90, 2)
        equal(editor.save().blocks, initial, 'The preceding native insertion did not undo separately')
        equal(editor.canUndo, false, 'The tool created extra history entries')
        await dispatchKey('z', 'KeyZ', 90, 10)
        equal(editor.save().blocks, typed)
        await dispatchKey('z', 'KeyZ', 90, 10)
        equal(editor.save().blocks, after, 'Redo did not preserve canonical author content')
        checkSelection('redo formatting')
      })
    }
  }
}
