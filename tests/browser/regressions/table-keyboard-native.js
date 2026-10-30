import { test, make, para, editableField, assert, equal } from './harness.js'
import { dispatchKey, printable, waitForStyles } from '../native-input-helpers.js'
import { tableKeyboardCases, runTableKeyboardCase } from '../table-keyboard-parity-fixture.js'

const keys = {
  Enter: ['Enter', 'Enter', 13],
  'Shift+Enter': ['Enter', 'Enter', 13, 8],
  Tab: ['Tab', 'Tab', 9],
  'Shift+Tab': ['Tab', 'Tab', 9, 8],
  'Control+z': ['z', 'KeyZ', 90, 2],
  'Control+Shift+z': ['z', 'KeyZ', 90, 10],
}

for (const [name, initial, selector, wrap] of [
  ['bold', '<b>Alpha</b> tail', 'b', text => `<b>${text}</b> tail`],
  ['nested marks', '<b><i>Alpha</i></b> tail', 'i', text => `<b><i>${text}</i></b> tail`],
]) test(`Table keyboard parity shared Paragraph ${name} line-break before a plain suffix`, async () => {
  const editor = make([para('paragraph', initial)], { inlineTools: [], injectStyles: true })
  await waitForStyles(document)
  const field = () => editableField(editor, 'paragraph')
  field().focus()
  const text = field().querySelector(selector).firstChild
  getSelection().setBaseAndExtent(text, 5, text, 5)
  const before = editor.save().blocks
  const trace = () => {
    const selection = getSelection(), node = selection.anchorNode
    return { node: node?.nodeName, parent: node?.parentElement?.tagName,
      text: node?.nodeType === Node.TEXT_NODE ? node.data : null, offset: selection.anchorOffset,
      previousChild: node?.childNodes?.[selection.anchorOffset - 1]?.nodeName ?? null }
  }
  equal(trace(), { node: '#text', parent: selector.toUpperCase(), text: 'Alpha', offset: 5, previousChild: null }, 'Input must start inside the marked text')
  await dispatchKey('Enter', 'Enter', 13, 8)
  const afterBreak = trace()
  equal(editor.save().blocks[0].data.text, wrap('Alpha<br>'))
  await printable('Y')
  const afterInput = trace()
  equal(editor.save().blocks[0].data.text, wrap('Alpha<br>Y'),
    'Paragraph line-break lost the active mark: ' + JSON.stringify({ afterBreak, afterInput }))
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, wrap('Alpha<br>'))
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks[0].data.text, wrap('Alpha<br>'))
  await printable('Z')
  equal(editor.save().blocks[0].data.text, wrap('Alpha<br>Z'), 'Typing after redo must inherit the mark too')
})

for (const [name, initial, offset, expected] of [
  ['plain break before bold', 'Alpha<br><b>Bravo</b>', 6, 'Alpha<br>Y<b>Bravo</b>'],
  ['plain break before nested marks', 'Alpha<br><b><i>Bravo</i></b>', 6, 'Alpha<br>Y<b><i>Bravo</i></b>'],
  ['ordinary bold to plain boundary', '<b>Alpha</b> tail', 5, '<b>AlphaY</b> tail'],
  ['ordinary bold to italic boundary', '<b>Alpha</b><i>tail</i>', 5, '<b>AlphaY</b><i>tail</i>'],
  ['terminal break with projection padding', '<b>Alpha<br></b>', 6, '<b>Alpha<br>Y</b>'],
]) test(`Table keyboard parity shared caret ${name}`, async () => {
  const editor = make([para('paragraph', initial)], { inlineTools: [], injectStyles: true })
  await waitForStyles(document)
  const transactions = [], nativeInputs = []
  editor.on('transaction:committed', event => transactions.push(event))
  editableField(editor, 'paragraph').addEventListener('input', event => nativeInputs.push(event.isTrusted))
  assert(editor.blocks.focus('paragraph', { fieldKey: 'text', offset }))
  if (name === 'terminal break with projection padding') {
    assert(editableField(editor, 'paragraph').querySelector('[data-oe-caret-padding]'), 'A real terminal projection padding must be present')
    const native = getSelection(), previous = native.anchorNode.childNodes[native.anchorOffset - 1]
    equal(previous?.tagName, 'BR')
    assert(!previous.hasAttribute('data-oe-caret-padding'), 'Padding must not own the authored caret')
  }
  await printable('Y')
  equal(editor.save().blocks[0].data.text, expected)
  equal(transactions.length, 1, 'Boundary input must be one native author action')
  if (name.startsWith('ordinary') || name === 'terminal break with projection padding') {
    equal(nativeInputs, [true], 'Existing ordinary and padded terminal native input must stay unchanged')
  }
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, initial)
  assert(!editor.canUndo && editor.canRedo)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks[0].data.text, expected)
  equal(transactions.length, 3)
})

for (const backward of [false, true]) test(`Table keyboard parity shared noncollapsed ${backward ? 'backward' : 'forward'} restore after break`, async () => {
  const initial = 'Alpha<br><b>Bravo</b> tail'
  const editor = make([para('paragraph', initial)], { inlineTools: [], injectStyles: true })
  await waitForStyles(document)
  const field = () => editableField(editor, 'paragraph')
  field().focus()
  const text = field().querySelector('b').firstChild, anchor = backward ? 2 : 0, focus = backward ? 0 : 2
  getSelection().setBaseAndExtent(text, anchor, text, focus)
  await printable('Y')
  equal(editor.save().blocks[0].data.text, 'Alpha<br><b>Yavo</b> tail')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, initial)
  const native = getSelection(), currentText = field().querySelector('b').firstChild
  assert(native.anchorNode === currentText && native.focusNode === (backward ? field() : currentText),
    'A noncollapsed range must keep its existing start/end text bias')
  equal([native.anchorOffset, native.focusOffset, native.isCollapsed], [anchor, backward ? 2 : focus, false])
  equal(native.toString(), 'Br', 'Equivalent BR/text boundaries must select the same authored text')
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks[0].data.text, 'Alpha<br><b>Yavo</b> tail')
})

for (const specification of tableKeyboardCases) {
  test(`Table keyboard parity ${specification.id}`, async () => {
    const result = await runTableKeyboardCase(specification, { native: async (action, value) => {
      if (action === 'type') await printable(value)
      else if (action === 'key' && keys[value]) await dispatchKey(...keys[value])
      else throw new Error(`Unknown Table keyboard test action: ${action} ${value}`)
    } })
    assert(!result.error, result.error)
    assert(!result.unsupported, result.unsupported)
    equal(result.pageErrors, [], 'Table keyboard browser error')
    equal(result.diagnostics, [], 'Table keyboard diagnostic')
    assert(result.observations.length > 0, 'Table keyboard case produced no observations')
    equal(result.completedPhases, result.plannedPhases, 'Table keyboard phases incomplete')
    const failures = result.observations.filter(observation => observation.status !== 'PASS')
    equal(failures, [], 'Table keyboard parity failed: ' + JSON.stringify(failures))
  })
}
