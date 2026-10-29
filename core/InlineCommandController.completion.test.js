import test from 'node:test'
import assert from 'node:assert/strict'
import { InlineCommandController } from './InlineCommandController.js'

const point = (blockId, offset) => ({ blockId, fieldKey: 'text', offset })
const bookmark = (blockId, offset) => ({ anchor: point(blockId, offset), focus: point(blockId, offset) })
function fixture({ observer = () => {}, project = true, destination = 'a' } = {}) {
  let current = bookmark('a', 2)
  const carets = [], afters = []
  const selection = {
    capture: () => structuredClone(current),
    setCaret(blockId, target) { carets.push({ blockId, ...target }); current = bookmark(blockId, target.offset) },
  }
  const runtime = {
    readOnly: false, health: 'ready', generation: 1, modeEpoch: 0, revision: 0,
    prepareExtensionValue: operation => operation(),
    insertInlineWidget: () => 'new-widget',
    replaceRichTextWithInlineSegments: () => point(destination, 6),
    interact(_name, operation, after) {
      const result = operation()
      if (project) {
        // DOM reconciliation can collapse the source caret before the
        // resulting history bookmark is prepared, with no user navigation.
        current = bookmark('a', 0)
        afters.push(after(result))
        this.revision++
      }
      observer({ setSelection: value => { current = value }, runtime: this })
      return result
    },
  }
  const definition = {
    schema: { createDefault: () => ({ value: '#fff' }) },
    paste: { patterns: [/^#[0-9a-f]{3}$/], fromMatch: value => ({ value }) },
  }
  const controller = new InlineCommandController({ runtime, selection,
    registry: { inlineTypes: ['color'], getInlineDefinition: () => definition },
  })
  const perform = kind => kind === 'insert' ? controller.insert('color')
    : kind === 'paste' ? controller.pasteText('#fff tail')
      : controller.commitTypedPattern('#fff', { blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 } }, ' ')
  return { perform, carets, afters }
}

test('multiline paste may complete in its newly created field while the untouched projection caret stays in the source', () => {
  const h = fixture({ destination: 'new-block' })
  assert.equal(h.perform('paste'), true)
  assert.deepEqual(h.carets, [point('new-block', 6)])
  assert.deepEqual(h.afters, [bookmark('new-block', 6)])
})

for (const action of ['insert', 'paste', 'typed']) {
  test(`${action} preserves a newer same-field directed selection published after projection`, () => {
    const h = fixture({ observer({ setSelection }) {
      setSelection({ anchor: point('a', 7), focus: point('a', 1) })
    } })
    assert.equal(h.perform(action), true)
    assert.deepEqual(h.carets, [], 'completion overwrote an accepted observer selection')
  })
  test(`${action} may restore after its own projection changed the old native offset`, () => {
    const h = fixture()
    assert.equal(h.perform(action), true)
    assert.deepEqual(h.carets, [point('a', action === 'insert' ? 3 : 6)])
  })
}

test('a canonical no-op may still complete its planned inline caret', () => {
  const h = fixture({ project: false })
  assert.equal(h.perform('paste'), true)
  assert.deepEqual(h.carets, [point('a', 6)])
  assert.deepEqual(h.afters, [], 'fixture incorrectly invoked a skipped projection stage')
})
