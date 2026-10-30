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

test('Table keyboard parity shared Paragraph line-break keeps the mark before a plain suffix', async () => {
  const editor = make([para('paragraph', '<b>Alpha</b> tail')], { inlineTools: [], injectStyles: true })
  await waitForStyles(document)
  const field = () => editableField(editor, 'paragraph')
  field().focus()
  const text = field().querySelector('b').firstChild
  getSelection().setBaseAndExtent(text, 5, text, 5)
  const before = editor.save().blocks
  const trace = () => {
    const selection = getSelection(), node = selection.anchorNode
    return { node: node?.nodeName, parent: node?.parentElement?.tagName,
      text: node?.nodeType === Node.TEXT_NODE ? node.data : null, offset: selection.anchorOffset,
      previousChild: node?.childNodes?.[selection.anchorOffset - 1]?.nodeName ?? null }
  }
  equal(trace(), { node: '#text', parent: 'B', text: 'Alpha', offset: 5, previousChild: null }, 'Input must start inside the bold text')
  await dispatchKey('Enter', 'Enter', 13, 8)
  const afterBreak = trace()
  equal(editor.save().blocks[0].data.text, '<b>Alpha<br></b> tail')
  await printable('Y')
  const afterInput = trace()
  equal(editor.save().blocks[0].data.text, '<b>Alpha<br>Y</b> tail',
    'Paragraph line-break lost the active mark: ' + JSON.stringify({ afterBreak, afterInput }))
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks[0].data.text, '<b>Alpha<br></b> tail')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks[0].data.text, '<b>Alpha<br></b> tail')
  await printable('Z')
  equal(editor.save().blocks[0].data.text, '<b>Alpha<br>Z</b> tail', 'Typing after redo must inherit the mark too')
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
