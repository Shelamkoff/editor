import test from 'node:test'
import assert from 'node:assert/strict'
import { InlineCommandController } from './InlineCommandController.js'

const point = (blockId, offset) => ({ blockId, fieldKey: 'text', offset })
const bookmark = (blockId, offset) => ({ anchor: point(blockId, offset), focus: point(blockId, offset) })
function fixture({ observer = () => {}, project = true, destination = 'a', remount = false } = {}) {
  let current = bookmark('a', 2)
  const source = {}, body = {}, outside = {}, replacement = {}
  const ownerDocument = { activeElement: source }
  const carets = [], afters = []
  const selection = {
    capture: () => structuredClone(current),
    setCaret(blockId, target) {
      carets.push({ blockId, ...target })
      current = bookmark(blockId, target.offset)
      ownerDocument.activeElement = remount ? replacement : source
    },
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
        current = remount ? null : bookmark('a', 0)
        if (remount) ownerDocument.activeElement = body
        afters.push(after(result))
        this.revision++
      }
      observer({ setSelection: value => { current = value }, runtime: this, ownerDocument, outside })
      return result
    },
  }
  const definition = {
    schema: { createDefault: () => ({ value: '#fff' }) },
    paste: { patterns: [/^#[0-9a-f]{3}$/], fromMatch: value => ({ value }) },
  }
  const controller = new InlineCommandController({ runtime, selection, ownerDocument,
    registry: { inlineTypes: ['color'], getInlineDefinition: () => definition },
  })
  const perform = kind => kind === 'insert' ? controller.insert('color')
    : kind === 'paste' ? controller.pasteText('#fff tail')
      : controller.commitTypedPattern('#fff', { blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 } }, ' ')
  return { perform, carets, afters, ownerDocument, outside, replacement }
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
  test(`${action} restores the planned caret after its own field remount loses native focus`, () => {
    const h = fixture({ remount: true })
    assert.equal(h.perform(action), true)
    assert.deepEqual(h.carets, [point('a', action === 'insert' ? 3 : 6)])
    assert.equal(h.ownerDocument.activeElement, h.replacement)
  })
  test(`${action} preserves a new native focus owner when both logical snapshots are null`, () => {
    const h = fixture({ remount: true, observer({ ownerDocument, outside }) {
      ownerDocument.activeElement = outside
    } })
    assert.equal(h.perform(action), true)
    assert.deepEqual(h.carets, [], 'null logical snapshots authorized focus after an observer acquired a native input')
    assert.equal(h.ownerDocument.activeElement, h.outside)
  })
}

test('a canonical no-op may still complete its planned inline caret', () => {
  const h = fixture({ project: false })
  assert.equal(h.perform('paste'), true)
  assert.deepEqual(h.carets, [point('a', 6)])
  assert.deepEqual(h.afters, [], 'fixture incorrectly invoked a skipped projection stage')
})
