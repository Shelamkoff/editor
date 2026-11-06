import { test, make, para, editorRoot, blockElement, editableField, assert, equal } from './harness.js'
import { clickNative, dispatchKey } from '../native-input-helpers.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createImagePlugin } from '../../../plugins/image/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import en from '../../../locale/en.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

for (const destination of ['ordinary completion', 'external input', 'another editor field', 'outside pointer navigation']) {
  const pointerNavigation = destination === 'outside pointer navigation'
  const name = pointerNavigation
    ? 'Native Image Settings pointer navigation preserves ordinary external focus without a commit-observer focus handoff'
    : `Native Image Settings Tab preserves commit-observer focus: ${destination}`
  test(name, async () => {
    const outside = document.createElement('input')
    outside.value = 'External draft'
    document.body.append(outside)
    const inputs = [], changes = [], tabs = [], diagnostics = []
    let source, stopObserving = () => {}
    const captureInput = event => {
      if (event.target === source) inputs.push({ trusted: event.isTrusted, type: event.inputType })
    }
    const captureChange = event => {
      if (event.target === source) changes.push({ trusted: event.isTrusted, value: source.value })
    }
    const captureTab = event => {
      if (event.target === source && event.key === 'Tab') tabs.push(event)
    }
    document.addEventListener('input', captureInput, { capture: true })
    document.addEventListener('change', captureChange, { capture: true })
    document.addEventListener('keydown', captureTab, { capture: true })
    try {
      const definition = createImagePlugin()
      const editor = make([
        { id: 'image', type: 'image', dataVersion: definition.schema.currentVersion,
          data: { ...definition.schema.createDefault(), file: { url: pixel }, caption: 'Caption' } },
        para('keep', 'Bravo'),
      ], {
        injectStyles: true, locale: en, inlineTools: [],
        plugins: [createParagraphPlugin(), definition],
        blockInsertAnimationMs: 0, blockMoveAnimationMs: 0, blockRemoveAnimationMs: 0,
        onDiagnostic: value => diagnostics.push(value),
      })
      const wrapper = blockElement(editor, 'image').querySelector('.oe-image')
      const settings = [...wrapper.querySelectorAll('button')].find(button => button.textContent.trim() === 'Settings')
      await clickNative(settings)
      equal(settings.getAttribute('aria-expanded'), 'true', 'Image Settings did not open')
      const width = () => [...wrapper.querySelectorAll('.oe-image__style-label')]
        .find(row => row.querySelector('span')?.textContent === 'Width')?.querySelector('input')
      source = width()
      const sibling = editableField(editor, 'keep')
      const before = editor.save().blocks
      await clickNative(source)
      await dispatchKey('a', 'KeyA', 65, 2)
      await window.__testInput('Input.insertText', { text: '160px' })
      equal(source.value, '160px', 'Native typing did not reach the Image dimension input')
      equal(editor.save().blocks, before, 'The draft dimension committed before its native change')

      const commits = []
      let currentAtHandoff
      stopObserving = editor.on('transaction:committed', event => {
        if (event.action !== 'commit') return
        commits.push(event.name)
        assert(!source.isConnected && width() !== source, 'Settings did not replace the committed control')
        if (destination === 'external input') {
          outside.focus()
          outside.setSelectionRange(2, 5, 'backward')
          assert(document.activeElement === outside, 'The observer did not acquire the external input')
        } else if (destination === 'another editor field') {
          sibling.focus()
          window.getSelection().setBaseAndExtent(sibling.firstChild, 4, sibling.firstChild, 4)
          assert(document.activeElement === sibling, 'The observer did not acquire the sibling field')
        }
        currentAtHandoff = editor.blocks.currentId
      })

      if (pointerNavigation) await clickNative(outside)
      else await dispatchKey('Tab', 'Tab', 9)

      equal(inputs, [{ trusted: true, type: 'insertText' }], 'Image Settings did not receive one trusted native insertion')
      equal(changes, [{ trusted: true, value: '160px' }], 'Image Settings did not commit through one trusted native change')
      equal(tabs.length, pointerNavigation ? 0 : 1, 'The source control received the wrong native navigation gesture')
      if (!pointerNavigation) assert(tabs[0].isTrusted && !tabs[0].defaultPrevented, 'Image Settings bypassed normal browser Tab handling')
      equal(commits, ['block.update'], 'Native Settings changed the action or commit count')
      const after = editor.save().blocks
      const expected = structuredClone(before)
      expected[0].data.styles = { ...expected[0].data.styles, width: '160px' }
      equal(after, expected, 'Native Settings changed data beyond the authored dimension')
      equal(wrapper.querySelector('img').style.width, '160px', 'The visible image lost its committed dimension')
      equal(width().value, '160px', 'The replacement Settings input lost its value')
      assert(editableField(editor, 'keep') === sibling, 'Settings replaced the untouched sibling field')
      equal(outside.value, 'External draft', 'The dimension edit changed the external input')
      if (destination === 'ordinary completion') {
        assert(editorRoot(editor).contains(document.activeElement), 'Settings commit lost keyboard ownership')
        equal(editor.blocks.currentId, 'image', 'Ordinary Settings completion lost the current image')
      } else if (pointerNavigation) {
        assert(document.activeElement === outside, 'Settings interrupted ordinary native navigation to the external input')
      } else {
        equal(editor.blocks.currentId, currentAtHandoff, 'Settings overwrote the observer current block')
        if (destination === 'external input') {
          assert(document.activeElement === outside, 'Settings reclaimed external native focus')
          equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'])
        } else {
          assert(document.activeElement === sibling, 'Settings reclaimed the observer native field')
          const native = window.getSelection()
          assert(native.isCollapsed && sibling.contains(native.anchorNode) && sibling.contains(native.focusNode),
            'Settings replaced the observer caret')
          equal([getTextOffset(sibling, native.anchorNode, native.anchorOffset),
            getTextOffset(sibling, native.focusNode, native.focusOffset)], [4, 4])
          equal(editor.blocks.currentId, 'keep')
        }
      }

      stopObserving()
      // Ordinary completion must already own keyboard history. A handoff is
      // followed by an explicit later editor interaction before replaying it.
      if (destination !== 'ordinary completion') editor.blocks.focus('keep', { offset: 4 })
      equal([editor.canUndo, editor.canRedo], [true, false])
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before, 'One native Undo did not restore the original Image document')
      equal([editor.canUndo, editor.canRedo], [false, true], 'Native Settings created more than one history action')
      await dispatchKey('z', 'KeyZ', 90, 10)
      equal(editor.save().blocks, after, 'One native Redo did not reproduce the Image dimension')
      equal([editor.canUndo, editor.canRedo], [true, false])
      equal(diagnostics, [], 'Native Image Settings emitted diagnostics')
    } finally {
      stopObserving()
      document.removeEventListener('input', captureInput, { capture: true })
      document.removeEventListener('change', captureChange, { capture: true })
      document.removeEventListener('keydown', captureTab, { capture: true })
      outside.remove()
    }
  })
}
