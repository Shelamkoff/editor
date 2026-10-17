import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentStore } from './DocumentStore.js'
import { HistoryStore } from './HistoryStore.js'
import { TransactionEngine } from './TransactionEngine.js'

const copy = value => structuredClone(value)
const block = (id, text = id) => ({ id, type: 'paragraph', dataVersion: 2, data: { text } })

function random(seed) {
  let state = seed >>> 0
  return max => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % max
  }
}

// The oracle retains whole before/after documents; it does not replay or
// inspect production change records, drafts, AVL nodes or history internals.
for (const seed of [1, 7, 19, 41, 97, 257, 1021, 65537]) {
  test(`document/history matches a snapshot oracle across 2500 mixed actions, seed ${seed}`, () => {
    const next = random(seed)
    const limit = 1 + next(12)
    let expected = { version: '2.0.0', blocks: [block('a'), block('b'), block('__proto__')] }
    let undo = [], redo = [], gesture = 0, revision = 0, generation = 1
    const store = new DocumentStore(expected)
    const history = new HistoryStore({ maxStack: limit })
    let failProjection = false
    const engine = new TransactionEngine({ store, history, projector: {
      prepare() {
        return {
          apply() { if (failProjection) throw new Error('controlled projection failure') },
          recover() {}, finalize() {}, discard() {},
        }
      },
    } })
    const retained = []

    for (let step = 0; step < 2500; step++) {
      const operation = next(12)
      const label = `seed=${seed}, step=${step}, op=${operation}`
      if (step % 113 === 0) {
        const snapshot = store.createDraft()
        retained.push({ snapshot, value: copy(expected) })
      }

      if (operation === 0 || operation === 1) {
        const direction = operation === 0 ? 'undo' : 'redo'
        const source = direction === 'undo' ? undo : redo
        const entry = source.at(-1)
        failProjection = Boolean(entry) && next(11) === 0
        if (failProjection) {
          assert.throws(() => engine[direction](), /controlled projection failure/, label)
        } else {
          assert.equal(engine[direction](), Boolean(entry), label)
          if (entry) {
            source.pop()
            ;(direction === 'undo' ? redo : undo).push(entry)
            expected = copy(direction === 'undo' ? entry.before : entry.after)
            gesture++
            revision++
            if (entry.replacement) generation++
          }
        }
        failProjection = false
      } else if (operation === 2) {
        // A read/preparation alone must not change the committed gesture.
        history.prepareReplay(next(2) ? 'undo' : 'redo')
      } else if (operation === 3) {
        engine.clearHistory()
        undo = []; redo = []; gesture++
      } else {
        const before = copy(expected)
        const after = copy(before)
        const index = after.blocks.length ? next(after.blocks.length) : 0
        const target = after.blocks[index]
        const group = `input:${next(2)}`
        const typing = operation >= 8 && Boolean(target)
        let execute, replacement = false
        if (typing) {
          const text = `${target.data.text.slice(-40)}|${seed}:${step}`
          after.blocks[index] = { ...target, data: { text } }
          execute = tx => tx.update(target.id, after.blocks[index])
        } else if (operation === 4 || !target) {
          const at = next(after.blocks.length + 1)
          const item = block(`new:${seed}:${step}`)
          after.blocks.splice(at, 0, item)
          execute = tx => tx.insert(at, item)
        } else if (operation === 5) {
          after.blocks.splice(index, 1)
          execute = tx => tx.remove(target.id)
        } else if (operation === 6 && after.blocks.length > 1) {
          const to = (index + 1 + next(after.blocks.length - 1)) % after.blocks.length
          after.blocks.splice(index, 1)
          after.blocks.splice(to, 0, target)
          execute = tx => tx.move(target.id, to)
        } else {
          after.blocks = [block(`replaced:${seed}:${step}`, 'replacement')]
          replacement = true
          execute = tx => tx.replace(after)
        }
        const name = typing ? 'native-input' : 'structural'
        const metadata = {
          origin: typing ? 'native-input' : 'external', name,
          coalesce: typing, historyGroup: group,
        }
        failProjection = next(13) === 0
        if (failProjection) {
          assert.throws(() => engine.execute(metadata, execute), /controlled projection failure/, label)
        } else {
          engine.execute(metadata, execute)
          const last = undo.at(-1)
          // Only a contiguous typing gesture can replace its last snapshot.
          // A successful cursor move starts a new gesture, irrespective of
          // the input controller's still-cached group string.
          if (typing && last?.typing && last.gesture === gesture
            && last.target === target.id && last.group === group) {
            last.after = copy(after)
          } else {
            undo.push({ before, after: copy(after), gesture, group,
              typing, target: target?.id, replacement })
            if (undo.length > limit) undo.shift()
          }
          redo = []
          expected = after
          revision++
          if (replacement) generation++
        }
        failProjection = false
      }
      assert.deepEqual(store.export(), expected, label)
      assert.equal(engine.canUndo, undo.length > 0, label)
      assert.equal(engine.canRedo, redo.length > 0, label)
      assert.equal(history.undoDepth, undo.length, label)
      assert.equal(history.redoDepth, redo.length, label)
      assert.equal(store.revision, revision, label)
      assert.equal(store.generation, generation, label)
      assert.equal(engine.phase, 'idle', label)
      assert.equal(engine.health, 'ready', label)
    }
    for (const { snapshot, value } of retained) assert.deepEqual(snapshot.export(), value)
  })
}
