// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandDispatcher } from './CommandDispatcher.js'
import { EditorFacade } from './EditorFacade.js'
import { EditorBlocksApi, EditorHandle } from './PublicEditorApi.js'
import { EventBus } from '@shelamkoff/event-bus'

function fixture() {
  const calls = []
  const events = new EventBus()
  const live = { id: 'a', type: 'paragraph', focus() { calls.push('focus') } }
  const blocks = {
    getBlockById() { return live }, getBlockByIndex() { return live }, getCurrentBlock() { return live },
    getCurrentIndex() { return 0 }, getBlockCount() { return 1 }, getSelectedBlocks() { return [] },
    insert() { calls.push('insert'); return live }, remove() { calls.push('remove') },
    clear() { calls.push('clear') }, prepareReplacement() { calls.push('stage'); throw new Error('unexpected staging') },
    *[Symbol.iterator]() { yield live },
  }
  const commands = new CommandDispatcher(blocks, events)
  const publicBlocks = new EditorBlocksApi(blocks, events, commands)
  const facade = new EditorFacade({ remove() { calls.push('root removed') } }, {
    blocks, events, commands, publicBlocks, selection: {}, defaultBlockType: 'paragraph',
    publicEvents: {}, diagnostics: { enabled: false }, snapshots: { save() { return { blocks: [] } } },
    documentSchema: { normalize(data) { calls.push('normalize'); return data } }, readOnly: false,
  })
  facade.configureHistory({
    canUndo: true, canRedo: true,
    undo() { calls.push('undo'); return true }, redo() { calls.push('redo'); return true },
  })
  facade.configureReadOnlyTransition(() => calls.push('readOnly'))
  facade.markReady()
  return { commands, editor: new EditorHandle(facade), calls }
}

for (const method of ['render', 'clear', 'focus', 'destroy', 'setReadOnly', 'insert', 'blockFocus']) {
  test(`public ${method} cannot mutate a document during checkpoint restoration`, () => {
    const { commands, editor, calls } = fixture()
    commands.restore(() => {
      const operations = {
        render: () => editor.render({ version: '1', blocks: [] }),
        clear: () => editor.clear(), focus: () => editor.focus(), destroy: () => editor.destroy(),
        setReadOnly: () => editor.setReadOnly(true), insert: () => editor.blocks.insert('paragraph'),
        blockFocus: () => editor.blocks.getBlockById('a').focus(),
      }
      assert.throws(operations[method], /restor|transaction/i)
      assert.deepEqual(calls, [])
      assert.equal(editor.isReady, true)
    })
    assert.equal(commands.restoring, false)
  })
}

test('history availability is masked throughout checkpoint restoration', () => {
  const { commands, editor, calls } = fixture()
  commands.restore(() => {
    assert.equal(editor.canUndo, false)
    assert.equal(editor.canRedo, false)
    assert.equal(editor.undo(), false)
    assert.equal(editor.redo(), false)
    assert.deepEqual(calls, [])
  })
  assert.equal(editor.canUndo, true)
  assert.equal(editor.undo(), true)
  assert.deepEqual(calls, ['undo'])
})

test('native history entry points reject reentry from their restoration callback', async () => {
  const { UndoManager } = await import('./UndoManager.js')
  const documentAt = value => ({ version: '1', blocks: [{ id: 'a', type: 'paragraph', data: { text: value } }] })
  let current = documentAt('initial')
  let manager
  let restored = 0
  manager = new UndoManager({}, new EventBus(), () => current, document => {
    restored++
    current = document
    assert.equal(manager.undo(), false)
    assert.equal(manager.redo(), false)
  }, () => null)
  current = documentAt('changed')
  manager.commit()
  assert.equal(manager.undo(), true)
  assert.equal(current.blocks[0].data.text, 'initial')
  assert.equal(manager.redo(), true)
  assert.equal(current.blocks[0].data.text, 'changed')
  assert.equal(restored, 2)
  manager.destroy()
})
