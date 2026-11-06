import { test, make, para, blockElement, editableField, equal, assert } from './harness.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createPollPlugin } from '../../../plugins/poll/index.js'

for (const destination of ['none', 'external input', 'another editor field']) {
  test(`Public Poll Add option preserves commit-observer focus: ${destination}`, () => {
    const outside = document.createElement('input')
    outside.value = 'External input'
    document.body.append(outside)
    let stopObserving = () => {}
    try {
      const poll = createPollPlugin({ injectStyles: false })
      const input = [{ id: 'poll', type: 'poll', dataVersion: 1, data: poll.schema.createDefault() },
        para('keep', 'Untouched')]
      const caller = structuredClone(input)
      const diagnostics = []
      const editor = make(input, {
        plugins: [createParagraphPlugin(), poll], inlineTools: [],
        onDiagnostic: diagnostic => diagnostics.push(diagnostic),
      })
      const before = editor.save().blocks
      const wrapper = blockElement(editor, 'poll').querySelector('.oe-poll')
      const button = wrapper.querySelector('.oe-poll__add')
      const untouched = editableField(editor, 'keep')
      assert(button, 'The public Poll Add option control is missing')
      equal(before[0].data.options.length, 2)
      button.focus()
      assert(document.activeElement === button, 'The Poll button did not acquire focus')
      equal(editor.blocks.currentId, 'poll')

      const commits = []
      let currentAtHandoff = 'poll'
      stopObserving = editor.on('transaction:committed', event => {
        commits.push(event.name)
        if (destination === 'external input') {
          outside.focus()
          outside.setSelectionRange(2, 5, 'backward')
        } else if (destination === 'another editor field') {
          untouched.focus()
          window.getSelection().setBaseAndExtent(untouched.firstChild, 4, untouched.firstChild, 4)
        }
        currentAtHandoff = editor.blocks.currentId
      })
      button.click()

      equal(commits, ['block.update'], 'The Poll button did not commit exactly one action')
      const after = editor.save().blocks
      equal(after[0].data.options.length, 3, 'The Poll button did not add its option')
      const added = after[0].data.options.at(-1)
      assert(typeof added.id === 'string' && added.id
        && !before[0].data.options.some(option => option.id === added.id), 'The added Poll option has no new identity')
      equal(added.text, '')
      const expected = structuredClone(before)
      expected[0].data.options.push(added)
      equal(after, expected, 'Focus handoff changed data beyond the added Poll option')
      assert(!button.isConnected, 'Poll did not exercise replacement of the original focused control')
      assert(editableField(editor, 'keep') === untouched, 'The Poll action replaced the untouched editing host')
      equal(editor.blocks.currentId, currentAtHandoff, 'The old Poll action reclaimed the current block')
      equal(outside.value, 'External input')
      if (destination === 'external input') {
        assert(document.activeElement === outside, 'The old Poll action stole external focus')
        equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'])
      } else if (destination === 'another editor field') {
        assert(document.activeElement === untouched, 'The old Poll action reclaimed editor focus')
        const native = window.getSelection()
        assert(native.isCollapsed && untouched.contains(native.anchorNode), 'The old Poll action changed the observer caret')
        equal(getTextOffset(untouched, native.anchorNode, native.anchorOffset), 4)
        equal(editor.blocks.currentId, 'keep')
      } else {
        assert(document.activeElement === wrapper, 'Ordinary Poll projection lost keyboard ownership')
        equal(editor.blocks.currentId, 'poll')
      }

      stopObserving()
      equal([editor.canUndo, editor.canRedo], [true, false])
      editor.undo()
      equal(editor.save().blocks, before, 'One Undo did not restore the complete Poll document')
      equal([editor.canUndo, editor.canRedo], [false, true], 'The Poll action created more than one history entry')
      editor.redo()
      equal(editor.save().blocks, after, 'One Redo did not restore the complete Poll action')
      equal([editor.canUndo, editor.canRedo], [true, false])
      equal(input, caller, 'The Poll action mutated caller-owned input')
      equal(diagnostics, [], 'The Poll action reported an unexpected diagnostic')
    } finally {
      stopObserving()
      outside.remove()
    }
  })
}
