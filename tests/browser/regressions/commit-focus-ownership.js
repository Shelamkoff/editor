import { test, make, para, editableField, blockElement, editorRoot, select, pause, equal, assert } from './harness.js'
import { clickNative, dispatchKey } from '../native-input-helpers.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../../core/ClipboardFragment.js'

// Each operation covers both observer timings and both destinations. Alternate
// the pairing to exercise native controls and same-editor caret ownership
// without multiplying every gesture into an otherwise identical full matrix.
const operations = [
  { name: 'Enter split', key: ['Enter', 'Enter', 13], transaction: 'block.split', source: 'a', offset: 2,
    texts: ['Al', 'pha', 'Bravo', 'Charlie', 'Untouched'], ids: ['a', 'b', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'Shift+Enter line break', key: ['Enter', 'Enter', 13, 8], transaction: 'input.line-break', inputType: 'insertLineBreak', source: 'a', offset: 2,
    texts: ['Al<br>pha', 'Bravo', 'Charlie', 'Untouched'], ids: ['a', 'b', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'Backspace merge', key: ['Backspace', 'Backspace', 8], transaction: 'block.merge', source: 'b', offset: 0,
    texts: ['AlphaBravo', 'Charlie', 'Untouched'], ids: ['a', 'c', 'keep'], syncTarget: 'an external input' },
  { name: 'Delete merge', key: ['Delete', 'Delete', 46], transaction: 'block.merge', source: 'a', offset: 'end',
    texts: ['AlphaBravo', 'Charlie', 'Untouched'], ids: ['a', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'selected-block Backspace', key: ['Backspace', 'Backspace', 8], transaction: 'selection.remove', source: 'a', offset: 2, whole: true,
    texts: ['Bravo', 'Charlie', 'Untouched'], ids: ['b', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'whole-block Cut', key: ['x', 'KeyX', 88, 2], transaction: 'clipboard.cut', source: 'a', offset: 2, whole: true, clipboardEvent: 'cut',
    texts: ['Bravo', 'Charlie', 'Untouched'], ids: ['b', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'local Paste', key: ['v', 'KeyV', 86, 2], transaction: 'clipboard.paste', source: 'a', offset: 2, clipboardEvent: 'paste', clipboard: 'XY',
    texts: ['AlXYa', 'Bravo', 'Charlie', 'Untouched'], ids: ['a', 'b', 'c', 'keep'], syncTarget: 'an external input' },
  { name: 'multiline Paste', key: ['v', 'KeyV', 86, 2], transaction: 'clipboard.paste', source: 'a', offset: 2, clipboardEvent: 'paste', clipboard: 'One\nTwo',
    texts: ['AlOnea', 'Two', 'Bravo', 'Charlie', 'Untouched'], ids: ['a', 'b', 'c', 'keep'], syncTarget: 'another editor field' },
  { name: 'block drag', transaction: 'block.move', source: 'a', offset: 2, drag: true,
    texts: ['Bravo', 'Charlie', 'Untouched', 'Alpha'], ids: ['b', 'c', 'keep', 'a'], syncTarget: 'another editor field' },
]

for (const operation of operations) for (const timing of ['synchronous', 'queued']) {
  const destination = timing === 'synchronous' ? operation.syncTarget
    : operation.syncTarget === 'an external input' ? 'another editor field' : 'an external input'
  const internal = destination === 'another editor field'
  test(`Native ${operation.name} preserves ${timing} commit-observer focus on ${destination}`, async () => {
    const outside = document.createElement('input')
    outside.value = 'External input'
    const source = document.createElement('textarea')
    document.body.append(outside)
    let stopObserving = () => {}
    let acceptingHandoff = true
    try {
      if (operation.clipboard) {
        source.value = operation.clipboard
        document.body.append(source)
        source.focus()
        let trustedCopy = false
        source.addEventListener('copy', event => { trustedCopy = event.isTrusted }, { once: true })
        await dispatchKey('a', 'KeyA', 65, 2)
        await dispatchKey('c', 'KeyC', 67, 2)
        assert(trustedCopy, 'External clipboard source did not receive a trusted Copy')
      }

      const input = [para('a', 'Alpha'), para('b', 'Bravo'), para('c', 'Charlie'), para('keep', 'Untouched')]
      const caller = structuredClone(input)
      const editor = make(input, { injectStyles: true, inlineTools: [] })
      const before = editor.save().blocks
      const originalIds = new Set(before.map(block => block.id))
      const untouched = editableField(editor, 'keep')
      const shells = before.map(block => blockElement(editor, block.id))
      if (operation.drag) await clickNative(editableField(editor, 'a'))
      editor.blocks.focus(operation.source, { offset: operation.offset })
      if (operation.clipboard) select(editableField(editor, operation.source), 2, 4)
      if (operation.whole) editor.blocks.select(['a'])

      let gesture = null
      let clipboardText = null
      let fragment = null
      const eventType = operation.drag ? 'pointerdown' : operation.inputType ? 'beforeinput' : operation.clipboardEvent ?? 'keydown'
      editorRoot(editor).addEventListener(eventType, event => {
        gesture = event
        if (event.clipboardData) {
          clipboardText = event.clipboardData.getData('text/plain')
          fragment = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
        }
      }, { capture: true, once: true })

      const commits = []
      let handoffs = 0
      let currentAtHandoff = null
      const handOff = () => {
        if (!acceptingHandoff) return
        handoffs++
        if (internal) {
          untouched.focus()
          window.getSelection().setBaseAndExtent(untouched.firstChild, 4, untouched.firstChild, 4)
        }
        else {
          outside.focus()
          outside.setSelectionRange(2, 5, 'backward')
        }
        currentAtHandoff = editor.blocks.currentId
      }
      stopObserving = editor.on('transaction:committed', event => {
        commits.push(event.name)
        if (timing === 'synchronous') handOff()
        else queueMicrotask(handOff)
      })

      if (operation.drag) {
        const handle = editorRoot(editor).querySelector('.oe-toolbar__drag')
        const from = handle.getBoundingClientRect()
        const last = blockElement(editor, 'keep').getBoundingClientRect()
        assert(from.width > 0 && from.height > 0, 'Block drag handle is not visible')
        await window.__testInput('Input.drag', {
          from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
          to: { x: from.left + from.width / 2, y: last.bottom + 100 },
        })
        await pause(30)
      } else await dispatchKey(...operation.key)

      assert(gesture?.isTrusted, 'The authoring gesture was not delivered as a trusted native event')
      if (!operation.drag) assert(gesture.defaultPrevented, 'The editor did not own the authoring gesture')
      if (operation.inputType) equal(gesture.inputType, operation.inputType, 'Native Shift+Enter delivered the wrong editing action')
      equal(commits, [operation.transaction], 'Focus handoff changed the committed action count or operation')
      equal(handoffs, 1, 'The commit observer did not hand focus off exactly once')
      const after = editor.save().blocks
      equal(after.map(block => block.data.text), operation.texts, 'Focus handoff changed the authored result')
      equal(after.filter(block => originalIds.has(block.id)).map(block => block.id), operation.ids,
        'Focus handoff changed surviving block identities or order')
      equal(after.find(block => block.id === 'keep'), before.at(-1), 'Focus handoff changed the untouched destination')
      assert(editableField(editor, 'keep') === untouched, 'Focus handoff replaced the untouched editing host')
      equal(editor.blocks.currentId, currentAtHandoff, 'A stale continuation overwrote the observer current block')
      equal(outside.value, 'External input', 'The original native gesture leaked text into the newly focused control')
      if (internal) {
        assert(document.activeElement === untouched, 'A stale continuation reclaimed native editor focus')
        const native = window.getSelection()
        assert(native.isCollapsed && untouched.contains(native.anchorNode), 'A stale continuation changed the observer caret')
        equal(getTextOffset(untouched, native.anchorNode, native.anchorOffset), 4,
          'A stale continuation moved the observer caret within its field')
        equal(editor.blocks.currentId, 'keep')
      } else {
        assert(document.activeElement === outside, 'A stale continuation stole external native focus')
        equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'],
          'The original gesture changed the external selection')
      }
      if (operation.clipboard) equal(clipboardText, operation.clipboard, 'Native Paste received different clipboard text')
      if (operation.clipboardEvent === 'cut') {
        assert(fragment, 'Native whole-block Cut did not export its private fragment')
        equal(JSON.parse(fragment).parts.map(part => part.block.data.text), ['Alpha'])
      }
      if (operation.drag) assert(before.every((block, index) => blockElement(editor, block.id) === shells[index]),
        'Native drag rebuilt a retained block')

      stopObserving()
      acceptingHandoff = false
      // The host intentionally owns focus now. Explicitly return to a surviving
      // field before exercising real keyboard history, so external native Undo
      // is not mistaken for the editor's one-action Undo/Redo contract.
      editor.blocks.focus('keep', { offset: 4 })
      equal([editor.canUndo, editor.canRedo], [true, false])
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before, 'One native Undo did not restore the complete document')
      equal([editor.canUndo, editor.canRedo], [false, true], 'The gesture created more than one history action')
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, after, 'One native Redo changed the authored result')
      equal([editor.canUndo, editor.canRedo], [true, false])
      equal(input, caller, 'The authoring gesture mutated caller-owned document data')
    } finally {
      acceptingHandoff = false
      stopObserving()
      outside.remove()
      source.remove()
    }
  })
}
