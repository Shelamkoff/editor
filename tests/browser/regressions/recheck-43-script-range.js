import { test, make, para, equal, assert } from './harness.js'
import { textRange, characterStyles, openTool } from './formatting-fixture.js'

const script = element => element.closest('sup') ? 'sup' : element.closest('sub') ? 'sub' : 'none'
async function applyScript(editor, mode) {
  await openTool(editor, 'script')
  const buttons = editor.rootElement.querySelectorAll('.oe-inline-toolbar__script-panel button')
  assert(buttons.length === 4)
  buttons[{ sup: 1, sub: 2, none: 3 }[mode]].click()
}
export function register() {
  for (const source of ['sup', 'sub']) {
    for (const mode of ['none', source === 'sup' ? 'sub' : 'sup']) {
      test(`script ${source} to ${mode} changes only the selected middle character`, async () => {
        const html = `<${source}>ABC</${source}>`
        const editor = make([para('a', html)], { inlineTools: ['script'] })
        const field = editor.blocks.getBlockByIndex(0).contentElement
        textRange(field.firstChild.firstChild, 1, field.firstChild.firstChild, 2)
        await applyScript(editor, mode)
        equal(characterStyles(field, script), [['A', source], ['B', mode], ['C', source]])
        equal(window.getSelection().toString(), 'B')
        const result = editor.save().blocks[0].data.text
        editor.undo(); equal(editor.save().blocks[0].data.text, html)
        editor.redo(); equal(editor.save().blocks[0].data.text, result)
      })
    }
  }
  test('script removal isolates text inside nested ordinary formatting', async () => {
    const editor = make([para('a', '<sup>A<i>BC</i>D</sup>')], { inlineTools: ['script'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.querySelector('i').firstChild, 0, field.querySelector('i').firstChild, 1)
    await applyScript(editor, 'none')
    equal(characterStyles(field, script), [['A', 'sup'], ['B', 'none'], ['C', 'sup'], ['D', 'sup']])
    equal(characterStyles(field, element => !!element.closest('i')), [['A', false], ['B', true], ['C', true], ['D', false]])
  })
  test('script removal clips both sides of a multi-wrapper selection', async () => {
    const editor = make([para('a', '<sup>AB</sup><sub>CD</sub>')], { inlineTools: ['script'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.firstChild.firstChild, 1, field.lastChild.firstChild, 1)
    await applyScript(editor, 'none')
    equal(characterStyles(field, script), [['A', 'sup'], ['B', 'none'], ['C', 'none'], ['D', 'sub']])
    equal(window.getSelection().toString(), 'BC')
  })
  test('script removal clears nested script ancestors only for selected text', async () => {
    const editor = make([para('a', '<sup>A<sub>BC</sub>D</sup>')], { inlineTools: ['script'] })
    const field = editor.blocks.getBlockByIndex(0).contentElement
    textRange(field.querySelector('sub').firstChild, 0, field.querySelector('sub').firstChild, 1)
    await applyScript(editor, 'none')
    equal(characterStyles(field, script), [['A', 'sup'], ['B', 'none'], ['C', 'sup'], ['D', 'sup']])
    assert([...field.querySelectorAll('sub')].some(node => node.textContent === 'C'), 'unselected nested subscript must survive')
  })
}
