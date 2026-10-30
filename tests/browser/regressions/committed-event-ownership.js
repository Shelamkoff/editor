import { test, make, para, equal, assert } from './harness.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createTablePlugin } from '../../../plugins/table/index.js'

const tableData = () => ({
  withHeadings: false,
  rows: Array.from({ length: 3 }, (_, row) => ({
    id: `row-${row}`,
    cells: Array.from({ length: 3 }, (_, cell) => ({
      id: `cell-${row}-${cell}`,
      text: row === 0 && cell === 0 ? '<b>Alpha</b> {{opaque}} tail' : `<i>Cell ${row}:${cell}</i>`,
    })),
  })),
})
const edited = data => ({ ...data, rows: data.rows.map((row, index) => index ? row : ({
  ...row, cells: row.cells.map((cell, column) => column ? cell : { ...cell, text: cell.text + 'X' }),
})) })
const deeplyFrozen = value => !value || typeof value !== 'object'
  || Object.isFrozen(value) && Object.values(value).every(deeplyFrozen)
function subject() {
  return make([para('before', 'Before'), {
    id: 'probe', type: 'table', dataVersion: 2, data: tableData(),
    inline: { opaque: { type: 'unloaded-owner-control', dataVersion: 7, data: { label: 'Retained', nested: { value: 1 } } } },
  }, para('after', 'After')], { plugins: [createParagraphPlugin(), createTablePlugin()] })
}

test('committed event fanout does not recapture an already owned structured change', () => {
  const editor = subject()
  const originalSymbols = Object.getOwnPropertySymbols
  const transactions = [], documents = [], visits = []
  let payloadVisits = 0
  const restore = () => { Object.getOwnPropertySymbols = originalSymbols }
  editor.on('transaction:committed', event => {
    transactions.push(event)
    payloadVisits = 0
    // Observe the JSON boundary between two public notifications. This does
    // not replace a runtime owner or introduce getters into its frozen graph.
    Object.getOwnPropertySymbols = value => {
      if (Array.isArray(Object.getOwnPropertyDescriptor(value, 'rows')?.value)
        && Object.hasOwn(value, 'withHeadings')) payloadVisits++
      return originalSymbols(value)
    }
  })
  editor.on('document:changed', event => {
    restore()
    visits.push(payloadVisits)
    documents.push(event)
  })
  try {
    editor.blocks.update('probe', record => ({ data: edited(record.data) }))
    equal(editor.blocks.get('probe').data, edited(tableData()))
    equal(editor.undo(), true)
    equal(editor.blocks.get('probe').data, tableData())
    equal(editor.canUndo, false, 'A single author action produced extra history')
    equal(editor.redo(), true)
    equal(editor.blocks.get('probe').data, edited(tableData()))
    equal(transactions.map(event => event.action), ['commit', 'undo', 'redo'])
    equal(documents.map(event => event.action), ['commit', 'undo', 'redo'])
    for (let index = 0; index < transactions.length; index++) {
      assert(deeplyFrozen(transactions[index]), 'Transaction event is not deeply immutable')
      assert(deeplyFrozen(documents[index]), 'Document event is not deeply immutable')
      equal(Object.keys(documents[index]).sort(), ['action', 'changes', 'origin'])
      equal(documents[index].changes, transactions[index].changes)
    }
    equal(visits, [0, 0, 0], 'An already published immutable change crossed JSON ownership again')
  } finally { restore() }
})

test('owned event fanout preserves external capture and isolates observers, snapshots and replay', () => {
  const editor = subject(), transactions = [], documents = []
  editor.on('transaction:committed', event => {
    transactions.push(event)
    equal(Reflect.set(event.changes[0].after.data.rows[0].cells[0], 'text', 'Observer poison'), false)
    equal(Reflect.set(event.changes[0].after.inline.opaque.data.nested, 'value', 99), false)
  })
  editor.on('document:changed', event => documents.push(event))
  const external = edited(tableData())
  let reads = 0
  Object.defineProperty(external.rows[0].cells[0], 'text', {
    enumerable: true, configurable: true,
    get() { reads++; return '<b>Alpha</b> {{opaque}} tailX' },
  })
  Object.freeze(external)
  editor.blocks.update('probe', () => ({ data: external }))
  equal(reads, 1, 'A shallow-frozen external value bypassed one-read ownership capture')
  external.rows[1].cells[0].text = 'External poison'
  const snapshot = editor.blocks.get('probe')
  snapshot.data.rows[0].cells[0].text = 'Snapshot poison'
  snapshot.inline.opaque.data.nested.value = 88
  equal(editor.blocks.get('probe').data, edited(tableData()))
  equal(editor.blocks.get('probe').inline.opaque.data.nested.value, 1)
  equal(documents[0].changes[0].after.data, edited(tableData()))
  equal(documents[0].changes[0].after.inline.opaque.data.nested.value, 1)
  equal(editor.undo(), true)
  equal(editor.blocks.get('probe').data, tableData())
  equal(editor.redo(), true)
  equal(editor.blocks.get('probe').data, edited(tableData()))
  equal(transactions.length, 3)
  equal(documents.length, 3)
  assert(transactions.every(deeplyFrozen) && documents.every(deeplyFrozen))
})
