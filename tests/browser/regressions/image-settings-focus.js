import { test, make, para, blockElement, editableField, pause, assert, equal } from './harness.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createImagePlugin } from '../../../plugins/image/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import en from '../../../locale/en.js'

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

for (const destination of ['ordinary completion', 'external input', 'another editor field']) {
  test(`Public Image settings preserves commit-observer focus: ${destination}`, async () => {
    const outside = document.createElement('input')
    outside.value = 'External draft'
    document.body.append(outside)
    let stopObserving = () => {}
    try {
      const diagnostics = []
      const definition = createImagePlugin({ injectStyles: false })
      const editor = make([
        { id: 'image', type: 'image', dataVersion: definition.schema.currentVersion,
          data: { ...definition.schema.createDefault(), file: { url: pixel }, caption: 'Caption', styles: { height: '100px' } } },
        para('keep', 'Bravo'),
      ], {
        plugins: [createParagraphPlugin({ injectStyles: false }), definition], locale: en, inlineTools: [],
        blockInsertAnimationMs: 0, blockMoveAnimationMs: 0, blockRemoveAnimationMs: 0,
        onDiagnostic: value => diagnostics.push(value),
      })
      const wrapper = blockElement(editor, 'image').querySelector('.oe-image')
      const settings = [...wrapper.querySelectorAll('button')].find(button => button.textContent.trim() === 'Settings')
      settings.click()
      equal(settings.getAttribute('aria-expanded'), 'true', 'Image Settings did not open')
      const height = () => [...wrapper.querySelectorAll('.oe-image__style-label')]
        .find(row => row.querySelector('span')?.textContent === 'Height')?.querySelector('input')
      const originalControl = height()
      const sibling = editableField(editor, 'keep')
      originalControl.focus()
      assert(document.activeElement === originalControl, 'The native settings input did not acquire focus')
      const before = editor.save().blocks
      const commits = []
      let currentAtHandoff
      stopObserving = editor.on('transaction:committed', event => {
        if (event.action !== 'commit') return
        commits.push(event.name)
        assert(!originalControl.isConnected && height() !== originalControl, 'Settings projection did not replace its active input')
        if (destination === 'external input') {
          outside.focus()
          outside.setSelectionRange(2, 5, 'backward')
          assert(document.activeElement === outside, 'The observer did not acquire the external input')
        } else if (destination === 'another editor field') {
          sibling.focus()
          window.getSelection().setBaseAndExtent(sibling.firstChild, 4, sibling.firstChild, 4)
          assert(document.activeElement === sibling, 'The observer did not acquire another editor field')
        }
        currentAtHandoff = editor.blocks.currentId
      })
      originalControl.value = '240px'
      originalControl.dispatchEvent(new Event('change', { bubbles: true }))
      await pause()
      equal(commits, ['block.update'], 'Settings changed the canonical operation or commit count')
      const after = editor.save().blocks
      equal(after, [{ ...before[0], data: { ...before[0].data, styles: { ...before[0].data.styles, height: '240px' } } }, before[1]],
        'Settings changed data beyond the authored dimension')
      equal(height().value, '240px', 'The replacement settings input lost its committed value')
      assert(editableField(editor, 'keep') === sibling, 'Settings remounted the untouched destination')
      equal(outside.value, 'External draft')
      if (destination === 'ordinary completion') {
        assert(document.activeElement === wrapper, 'Settings lost keyboard ownership after replacing the focused input')
        equal(editor.blocks.currentId, 'image')
      } else {
        equal(editor.blocks.currentId, currentAtHandoff, 'Settings replaced the observer current block')
        if (destination === 'external input') {
          assert(document.activeElement === outside, 'Settings stole external focus after commit')
          equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'])
        } else {
          assert(document.activeElement === sibling, 'Settings reclaimed the observer editor focus')
          const native = window.getSelection()
          assert(native.isCollapsed && sibling.contains(native.anchorNode) && sibling.contains(native.focusNode))
          equal([getTextOffset(sibling, native.anchorNode, native.anchorOffset),
            getTextOffset(sibling, native.focusNode, native.focusOffset)], [4, 4])
          equal(editor.blocks.currentId, 'keep')
        }
      }

      stopObserving()
      equal([editor.canUndo, editor.canRedo], [true, false])
      assert(editor.undo(), 'The settings change could not be undone')
      equal(editor.save().blocks, before, 'One Undo did not restore the original image')
      equal([editor.canUndo, editor.canRedo], [false, true], 'Settings created more than one history entry')
      assert(editor.redo(), 'The settings change could not be redone')
      equal(editor.save().blocks, after, 'One Redo did not reproduce the settings change')
      equal(diagnostics, [], 'Image settings emitted diagnostics')
    } finally {
      stopObserving()
      outside.remove()
    }
  })
}
