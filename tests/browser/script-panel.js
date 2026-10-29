import { createScriptTool } from '../../inline-tools/scriptTool.js'
import { test, assert, equal, run, make, para, editorHolder } from './regressions/harness.js'

const labels = { sup: 'Superscript', sub: 'Subscript', none: 'Normal' }
const modeButton = (panel, mode) => panel.querySelector(`button[aria-label="${labels[mode]}"]`)
const selectionPorts = new WeakMap()
function makeScriptEditor(blocks) {
  const tool = createScriptTool(labels)
  let selectionPort = null
  const editor = make(blocks, { inlineTools: [{
    ...tool,
    bindSelectionPort(port) {
      selectionPort = port
      tool.bindSelectionPort(port)
    },
  }] })
  selectionPorts.set(editor, () => selectionPort?.range)
  return editor
}
const fields = editor => [...editorHolder(editor).querySelectorAll('.oe-paragraph')]
const textLeaf = element => document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()

async function open(editor, backward = false) {
  const hosts = fields(editor)
  const first = textLeaf(hosts[0]), last = textLeaf(hosts.at(-1))
  hosts[0].focus()
  const native = window.getSelection()
  if (backward) native.setBaseAndExtent(last, last.length, first, 0)
  else native.setBaseAndExtent(first, 0, last, last.length)
  document.dispatchEvent(new Event('selectionchange'))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
  editorHolder(editor).querySelector('[data-tool="script"]').click()
  const panel = editorHolder(editor).querySelector('.oe-inline-toolbar__script-panel')
  assert(panel, 'Script action panel did not open')
  return panel
}

function checkDirection(editor, backward) {
  const hosts = fields(editor), native = window.getSelection()
  // Native Selection text can be clipped to its focused editing host. The
  // supported formatting port must still expose the complete author range.
  const range = selectionPorts.get(editor)()
  assert(range && !range.collapsed, 'formatting range was lost')
  equal(range.toString().replace(/\r?\n/g, ''), hosts.map(host => host.textContent).join(''), 'selected text changed')
  const anchorHost = backward ? hosts.at(-1) : hosts[0]
  const focusHost = backward ? hosts[0] : hosts.at(-1)
  assert(anchorHost.contains(native.anchorNode), 'selection anchor changed owner')
  assert(focusHost.contains(native.focusNode), 'selection focus changed owner')
  // Equivalent element/text boundary representations have the same logical
  // offset and must not fail merely because formatting split a Text node.
  const prefix = document.createRange()
  prefix.selectNodeContents(anchorHost)
  prefix.setEnd(native.anchorNode, native.anchorOffset)
  equal(prefix.toString().length, backward ? anchorHost.textContent.length : 0, 'selection direction changed')
}

for (const backward of [false, true]) {
  for (const [initial, mode, expected] of [
    ['Alpha', 'sup', '<sup>Alpha</sup>'],
    ['Alpha', 'sub', '<sub>Alpha</sub>'],
    ['<sub>Alpha</sub>', 'sup', '<sup>Alpha</sup>'],
    ['<sup>Alpha</sup>', 'sub', '<sub>Alpha</sub>'],
    ['<sup>Alpha</sup>', 'sup', 'Alpha'],
    ['<sub>Alpha</sub>', 'none', 'Alpha'],
  ]) {
    test(`Script ${backward ? 'backward' : 'forward'} ${initial} -> ${mode} is one reversible action`, async () => {
      const editor = makeScriptEditor([para('a', initial)])
      const before = editor.save().blocks, events = []
      editor.on('transaction:committed', event => events.push(event))
      const panel = await open(editor, backward)
      modeButton(panel, mode).click()
      equal(editor.save().blocks[0].data.text, expected)
      equal(events.length, 1)
      assert(!panel.isConnected, 'accepted mode action left its old panel active')
      checkDirection(editor, backward)
      equal(editor.undo(), true)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      checkDirection(editor, backward)
      equal(editor.redo(), true)
      equal(editor.save().blocks[0].data.text, expected)
      checkDirection(editor, backward)
    })
  }
}

for (const backward of [false, true]) {
  test(`cross-block Script ${backward ? 'backward' : 'forward'} preserves both blocks and one history step`, async () => {
    const editor = makeScriptEditor([para('a', 'Alpha'), para('b', 'Bravo')])
    const before = editor.save().blocks
    const panel = await open(editor, backward)
    modeButton(panel, 'sup').click()
    equal(editor.save().blocks.map(block => block.data.text), ['<sup>Alpha</sup>', '<sup>Bravo</sup>'])
    checkDirection(editor, backward)
    equal(editor.undo(), true)
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    equal(editor.redo(), true)
    equal(editor.save().blocks.map(block => block.data.text), ['<sup>Alpha</sup>', '<sup>Bravo</sup>'])
  })
}

test('a retired Script panel cannot change data or close its replacement panel', async () => {
  const editor = makeScriptEditor([para('a', 'Alpha')])
  const previous = await open(editor)
  const stale = modeButton(previous, 'sup')
  editor.blocks.update('a', () => ({ data: { text: 'Changed' } }))
  const current = await open(editor)
  const before = editor.save().blocks
  assert(current !== previous)
  stale.click()
  equal(editor.save().blocks, before)
  assert(current.isConnected, 'retired panel closed its successor')
  modeButton(current, 'sub').click()
  equal(editor.save().blocks[0].data.text, '<sub>Changed</sub>')
})

test('a read-only round trip cannot revive retained Script panel buttons', async () => {
  const editor = makeScriptEditor([para('a', 'Alpha')])
  const panel = await open(editor)
  const before = editor.save().blocks
  editor.setReadOnly(true)
  editor.setReadOnly(false)
  modeButton(panel, 'sup').click()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  const fresh = await open(editor)
  modeButton(fresh, 'sup').click()
  equal(editor.save().blocks[0].data.text, '<sup>Alpha</sup>')
})

test('Normal on unformatted text closes its accepted panel without manufacturing history', async () => {
  const editor = makeScriptEditor([para('a', 'Alpha')])
  const before = editor.save().blocks
  const panel = await open(editor)
  modeButton(panel, 'none').click()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  assert(!panel.isConnected)
})

await run()
