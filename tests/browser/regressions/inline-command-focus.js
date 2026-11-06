import { test, make, para, editableField, pause, equal, assert } from './harness.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextLength, getTextOffset } from '../../../shared/textOffset.js'
import en from '../../../locale/en.js'

// A cooperative extension may replace its nested editable element on update.
// Its stable public field key still identifies the replacement. Removing the
// focused element leaves BODY active until the command completes its caret.
function createRemountingTextPlugin() {
  return {
    ...createParagraphPlugin({ injectStyles: false }),
    type: 'remounting-text',
    label: { key: 'title', fallback: 'Remounting text' },
    setup() {
      return {
        create(initial, context) {
          const element = context.ownerDocument.createElement('article')
          let field
          let readOnly = context.isReadOnly()
          const paint = value => {
            const next = context.ownerDocument.createElement('p')
            next.contentEditable = String(!readOnly)
            next.textContent = value.text
            if (field) field.replaceWith(next)
            else element.append(next)
            field = next
          }
          paint(initial)
          return {
            element,
            read: () => ({ text: field.innerHTML }),
            update: paint,
            editableFields: () => [{ key: 'text', mode: 'rich-text', element: field }],
            setReadOnly(value) { readOnly = value; field.contentEditable = String(!value) },
            focus() { field.focus() },
            destroy() {},
          }
        },
        destroy() {},
      }
    },
  }
}

const actions = [
  { name: 'public insert', transaction: 'inline.insert' },
  { name: 'DOM Paste', transaction: 'inline.paste' },
  { name: 'DOM typed Space', transaction: 'inline.typed-pattern' },
]

for (const type of ['paragraph', 'remounting-text']) for (const action of actions) {
  for (const destination of ['ordinary completion', 'external input', 'another editor field']) {
    // These are public API and DOM-event contracts, not trusted native input
    // claims. Both retained and remounted renderers must preserve an observer's
    // newer focus while ordinary commands still complete at their planned caret.
    test(`commit-observer focus / inline Color ${action.name} / ${type} / ${destination}`, async () => {
      const outside = document.createElement('input')
      outside.value = 'External draft'
      document.body.append(outside)
      let stopObserving = () => {}
      try {
        const diagnostics = []
        const input = [{ id: 'a', type, dataVersion: 2,
          data: { text: 'A {{existing}} Z ' + (action.name === 'DOM typed Space' ? '#ff0000' : '') },
          inline: { existing: { type: 'color', dataVersion: 1, data: { value: '#112233' } } },
        }, para('b', 'Bravo')]
        const editor = make(input, {
          plugins: [createParagraphPlugin({ injectStyles: false }), createRemountingTextPlugin()],
          inlinePlugins: [createColorSwatchPlugin()], inlineTools: [],
          locale: { ...en, 'plugin.remounting-text.title': 'Remounting text' },
          blockInsertAnimationMs: 0, blockMoveAnimationMs: 0, blockRemoveAnimationMs: 0,
          onDiagnostic: value => diagnostics.push(value),
        })
        editor.blocks.focus('a', { offset: 'end' })
        const source = editableField(editor, 'a')
        const other = editableField(editor, 'b')
        const initialLength = getTextLength(source)
        const before = editor.save().blocks
        const commits = []
        let currentAtHandoff
        stopObserving = editor.on('transaction:committed', event => {
          if (event.action !== 'commit') return
          commits.push(event.name)
          if (type === 'remounting-text') {
            assert(!source.isConnected && editableField(editor, 'a') !== source,
              'The cooperative renderer did not replace its keyed editable field')
            assert(document.activeElement === document.body,
              'The remounted field did not expose the focusless projection boundary')
          }
          if (destination === 'external input') {
            outside.focus()
            outside.setSelectionRange(2, 5, 'backward')
            assert(document.activeElement === outside, 'The observer did not acquire the external input')
          } else if (destination === 'another editor field') {
            other.focus()
            window.getSelection().setBaseAndExtent(other.firstChild, 4, other.firstChild, 4)
            assert(document.activeElement === other, 'The observer did not acquire another editor field')
          }
          currentAtHandoff = editor.blocks.currentId
        })

        if (action.name === 'public insert') {
          assert(editor.insertInlinePlugin('color', { value: '#ff0000' }), 'Public Color insertion was declined')
        } else if (action.name === 'DOM Paste') {
          const clipboardData = new DataTransfer()
          clipboardData.setData('text/plain', '#ff0000')
          const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
          source.dispatchEvent(event)
          assert(event.defaultPrevented, 'The editor did not own Color Paste')
        } else {
          const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
          source.dispatchEvent(event)
          assert(event.defaultPrevented, 'The editor did not own the typed Color delimiter')
        }
        await pause()
        equal(commits, [action.transaction], 'Focus handoff changed the canonical operation or commit count')
        const after = editor.save().blocks
        equal(after[1], before[1], 'The untouched destination changed')
        assert(editableField(editor, 'b') === other, 'The untouched editing field was remounted')
        equal(after[0].inline.existing, before[0].inline.existing, 'The existing widget changed')
        const occurrences = Object.entries(after[0].inline).filter(([id]) => id !== 'existing')
        equal(occurrences.length, 1, 'The command did not insert exactly one occurrence')
        const [id, occurrence] = occurrences[0]
        equal(occurrence, { type: 'color', dataVersion: 1, data: { value: '#ff0000' } })
        equal(after[0].data.text, 'A {{existing}} Z ' + `{{${id}}}` + (action.name === 'DOM typed Space' ? ' ' : ''),
          'Color insertion changed the surrounding text or typed delimiter')
        equal(outside.value, 'External draft', 'The initiating event changed the external input value')

        if (destination === 'external input') {
          assert(document.activeElement === outside, 'Inline completion stole the observer external focus')
          equal([outside.selectionStart, outside.selectionEnd, outside.selectionDirection], [2, 5, 'backward'])
          equal(editor.blocks.currentId, currentAtHandoff, 'Inline completion replaced the observer current block')
        } else {
          const target = destination === 'another editor field' ? other : editableField(editor, 'a')
          const expectedOffset = destination === 'another editor field' ? 4
            : action.name === 'DOM typed Space' ? initialLength - 7 + 2 : initialLength + 1
          assert(document.activeElement === target, 'Inline completion focused the wrong editing field')
          const native = window.getSelection()
          assert(native.isCollapsed && target.contains(native.anchorNode) && target.contains(native.focusNode),
            'Inline completion lost the expected author caret')
          equal([getTextOffset(target, native.anchorNode, native.anchorOffset),
            getTextOffset(target, native.focusNode, native.focusOffset)], [expectedOffset, expectedOffset])
          equal(editor.blocks.currentId, destination === 'another editor field' ? 'b' : 'a')
        }

        stopObserving()
        equal([editor.canUndo, editor.canRedo], [true, false])
        assert(editor.undo(), 'The insertion could not be undone')
        equal(editor.save().blocks, before, 'One Undo did not restore the complete document')
        equal([editor.canUndo, editor.canRedo], [false, true], 'The command created multiple history entries')
        assert(editor.redo(), 'The insertion could not be redone')
        equal(editor.save().blocks, after, 'One Redo did not reproduce the committed result')
        equal(diagnostics, [], 'The public extension contract emitted diagnostics')
      } finally {
        stopObserving()
        outside.remove()
      }
    })
  }
}
