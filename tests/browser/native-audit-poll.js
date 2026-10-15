import { createPollPlugin } from '../../plugins/poll/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { test, make, blockElement, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'

for (const fieldKey of ['question', 'option:yes']) for (const typing of [false, true]) test('Poll ' + fieldKey + ' ' + (typing ? 'edited' : 'unchanged') + ' blur preserves inline identities and author history', async () => {
  const definition = createPollPlugin()
  const editor = make([
    { id: 'poll', type: 'poll', dataVersion: definition.schema.currentVersion, data: {
      ...definition.schema.createDefault(), question: 'Choose {{person}}',
      options: [{ id: 'yes', text: 'Ask {{answer}}' }, { id: 'no', text: 'No' }],
    }, inline: {
      person: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      answer: { type: 'mention', dataVersion: 1, data: { id: 'grace', name: 'Grace' } },
    } },
    { id: 'tail', type: 'paragraph', dataVersion: 2, data: { text: 'Tail' } },
  ], { plugins: [createParagraphPlugin(), definition], injectStyles: true, inlinePlugins: [createMentionPlugin()] })
  const before = editor.save().blocks
  editor.blocks.focus('poll', { fieldKey, offset: 'start' })
  if (typing) await printable('X')
  const typed = editor.save().blocks
  await clickNative(blockElement(editor, 'tail').querySelector('.oe-paragraph'))
  equal(editor.save().blocks, typed, 'Leaving a Poll field replaced inline widgets with their displayed labels')
  if (!typing) {
    equal(editor.canUndo, false, 'Focus alone created author history')
    return
  }
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'Blur created an extra author history action')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, typed)
})

await run()
