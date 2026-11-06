import { test, make, para, editableField, equal, assert } from './harness.js'
import { dispatchKey } from '../native-input-helpers.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'

for (const timing of ['synchronous', 'queued']) {
  const internal = timing === 'synchronous'
  const destination = internal ? 'another editor field' : 'an external input'
  test(`Native Mention Backspace preserves ${timing} commit-observer focus on ${destination}`, async () => {
    const outside = document.createElement('input')
    outside.value = 'External input'
    document.body.append(outside)
    let sourceField, label
    const beforeInputs = [], inputs = [], diagnostics = []
    const ownsEvent = event => sourceField && sourceField.contains(event.target)
    const onBeforeInput = event => {
      if (!ownsEvent(event) || event.inputType !== 'deleteContentBackward') return
      const range = event.getTargetRanges()[0]
      beforeInputs.push({ event, target: range ? {
        owned: label.contains(range.startContainer) && label.contains(range.endContainer),
        start: range.startOffset, end: range.endOffset,
      } : null })
    }
    const onInput = event => {
      if (ownsEvent(event)) inputs.push({ trusted: event.isTrusted, inputType: event.inputType })
    }
    // Mention also listens on document capture. Observe the native protocol
    // before creating its runtime, including events it could consume itself.
    document.addEventListener('beforeinput', onBeforeInput, { capture: true })
    document.addEventListener('input', onInput, { capture: true })
    let stopObserving = () => {}
    let acceptingHandoff = true
    try {
      const input = [para('a', 'Hello {{m}} tail', {
        inline: { m: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } } },
      }), para('keep', 'Untouched')]
      const caller = structuredClone(input)
      const editor = make(input, {
        injectStyles: true, inlineTools: [],
        inlinePlugins: [createMentionPlugin({ debounceDelay: 0, searchFunction: async () => [] })],
        onDiagnostic: diagnostic => diagnostics.push(diagnostic),
      })
      const before = editor.save().blocks
      sourceField = editableField(editor, 'a')
      const untouched = editableField(editor, 'keep')
      label = sourceField.querySelector('[data-inline-plugin="mention"]')
      assert(label?.firstChild?.nodeType === 3, 'The initial Mention label is missing')
      equal(label.textContent, '@Ada')
      sourceField.focus()
      window.getSelection().setBaseAndExtent(label.firstChild, 3, label.firstChild, 3)
      assert(document.activeElement === sourceField, 'The Mention editing host did not acquire native focus')
      equal(editor.blocks.currentId, 'a')
      equal([editor.canUndo, editor.canRedo], [false, false])

      const commits = []
      let handoffs = 0
      let currentAtHandoff = null
      const handOff = () => {
        if (!acceptingHandoff) return
        handoffs++
        if (internal) {
          untouched.focus()
          window.getSelection().setBaseAndExtent(untouched.firstChild, 4, untouched.firstChild, 4)
        } else {
          outside.focus()
          outside.setSelectionRange(2, 5, 'backward')
        }
        currentAtHandoff = editor.blocks.currentId
      }
      stopObserving = editor.on('transaction:committed', event => {
        commits.push(event.name)
        if (internal) handOff()
        else queueMicrotask(handOff)
      })

      await dispatchKey('Backspace', 'Backspace', 8)

      equal(beforeInputs.length, 1, 'Mention Backspace did not deliver exactly one native beforeinput')
      assert(beforeInputs[0].event.isTrusted, 'Mention Backspace used an untrusted editing event')
      assert(!beforeInputs[0].event.defaultPrevented, 'Mention Backspace bypassed the browser deletion path')
      equal(beforeInputs[0].target, { owned: true, start: 2, end: 3 },
        'Native Backspace did not target the interior Mention character')
      equal(inputs, [{ trusted: true, inputType: 'deleteContentBackward' }],
        'Mention Backspace did not complete through native input')
      equal(commits, ['inline.native-reconcile'], 'Mention Backspace changed the action count or native reconciliation path')
      equal(handoffs, 1, 'The commit observer did not hand focus off exactly once')
      const after = editor.save().blocks
      const expected = structuredClone(before)
      expected[0].inline.m.data.name = 'Aa'
      equal(after, expected, 'The native character deletion changed the canonical Mention incorrectly')
      equal(label.textContent, '@Aa', 'The committed Mention label does not match its canonical payload')
      assert(editableField(editor, 'keep') === untouched, 'Mention editing replaced the untouched destination')
      equal(editor.blocks.currentId, currentAtHandoff, 'A stale Mention continuation overwrote the observer current block')
      equal(outside.value, 'External input', 'Mention Backspace leaked into the newly focused control')
      if (internal) {
        assert(document.activeElement === untouched, 'A stale Mention continuation reclaimed native editor focus')
        const native = window.getSelection()
        assert(native.isCollapsed && untouched.contains(native.anchorNode), 'A stale Mention continuation changed the observer caret')
        equal(getTextOffset(untouched, native.anchorNode, native.anchorOffset), 4,
          'A stale Mention continuation moved the observer caret within its field')
        equal(editor.blocks.currentId, 'keep')
      } else {
        assert(document.activeElement === outside, 'A stale Mention continuation stole external native focus')
        equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'],
          'Mention Backspace changed the external selection')
      }

      stopObserving()
      acceptingHandoff = false
      // History is an explicit later action in a surviving editing host. The
      // observer's external control must not receive the editor Undo shortcut.
      editor.blocks.focus('keep', { offset: 4 })
      equal([editor.canUndo, editor.canRedo], [true, false])
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before, 'One native Undo did not restore the complete Mention document')
      equal([editor.canUndo, editor.canRedo], [false, true], 'Mention Backspace created more than one history action')
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, after, 'One native Redo did not restore the complete Mention edit')
      equal([editor.canUndo, editor.canRedo], [true, false])
      equal(input, caller, 'Mention Backspace mutated caller-owned document data')
      equal(diagnostics, [], 'Native Mention editing reported an unexpected diagnostic')
    } finally {
      acceptingHandoff = false
      stopObserving()
      document.removeEventListener('beforeinput', onBeforeInput, { capture: true })
      document.removeEventListener('input', onInput, { capture: true })
      outside.remove()
    }
  })
}
