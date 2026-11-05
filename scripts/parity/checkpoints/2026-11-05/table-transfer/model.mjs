import assert from 'node:assert/strict'

const kinds = ['paste', 'middle', 'widget', 'cell', 'emptyNeighbors', 'all']
export const specs = kinds.flatMap(kind => [false, true].flatMap(headings => [false, true].map(backward => ({
  id: kind === 'paste' ? `paste/${headings}/${backward}` : `convert/${kind}/${headings}/${backward}`,
  kind, headings, backward,
}))))

const rich = '<b>Alpha</b> {{tone}}<br>tail'
const inline = { tone: { type: 'color', dataVersion: 1, data: { value: '#123456' } } }
const paragraph = (id, text, refs) => ({ id, type: 'paragraph', dataVersion: 2, data: { text }, ...(refs && { inline: refs }) })
const table = (id, headings, grid, refs) => ({ id, type: 'table', dataVersion: 2,
  data: { withHeadings: headings, rows: grid.map((row, r) => ({ id: 'row-' + r, cells: row.map((text, c) => ({ id: 'cell-' + c, text })) })) },
  ...(refs && { inline: refs }),
})
const key = (role, letter, modifiers = 2) => ({ role, type: 'keydown', key: letter, trusted: true, modifiers })
const trusted = (role, type) => ({ role, type, trusted: true })

export function model(spec) {
  const paste = spec.kind === 'paste', all = spec.kind === 'all', middle = spec.kind === 'middle'
  const rest = spec.kind === 'emptyNeighbors' ? ['', '', ''] : ['<i>Bravo</i>', '<s>Charlie</s>', 'Delta']
  const grid = first => [[first, rest[0]], [rest[1], rest[2]]]
  const suffix = paragraph('suffix', 'After')
  const prefix = paragraph('prefix', 'Before')
  const before = paste ? [paragraph('seed', 'abcDEFghi'), suffix] : [prefix, table('seed', spec.headings, grid(rich), inline), suffix]
  let after, targetIndex
  if (paste) {
    targetIndex = 1
    after = [before[0], table('converted', spec.headings, [['<b>Q</b>', '<i>R</i>'], ['S', 'T']]), suffix]
  } else {
    const selected = { middle: '<b>ph</b>', widget: '{{tone}}', cell: rich, emptyNeighbors: rich,
      all: '<b>Alpha</b> {{tone}}<br>tail<br><i>Bravo</i><br><s>Charlie</s><br>Delta' }[spec.kind]
    const residual = { middle: '<b>Ala</b> {{tone}}<br>tail', widget: '<b>Alpha</b> <br>tail' }[spec.kind] ?? ''
    targetIndex = all ? 1 : 2
    after = [prefix]
    if (!all) after.push(table('seed', spec.headings, grid(residual), middle ? inline : undefined))
    after.push(paragraph('converted', selected, middle ? undefined : inline), suffix)
  }

  const stage = paste ? 'paste' : 'convert'
  const observations = [
    ['load', 'canonical', before], ['load', 'history', [false, false]],
    ...(paste ? [['select', 'sourceUnchanged', 'QRST']] : []),
    ['select', 'canonical', before], ['select', 'history', [false, false]],
    ...(paste ? [[stage, 'clipboard', { trusted: true, tableHTML: true, private: false }]] : []),
    [stage, 'canonical', after], [stage, 'targetIdentity', paste ? true : { exists: true, reuse: all, unique: true }],
    ...(paste ? [[stage, 'pastedFieldIdentities', true]] : []),
    [stage, 'history', [true, false]], ['undo', 'canonical', before], ['undo', 'history', [false, true]],
    ['redo', 'canonical', after], ['redo', 'history', [true, false]],
    ['redo', 'caller', { version: '2.0.0', blocks: before }], ['redo', 'diagnostics', []],
    ['dispose', 'editorRemoved', true], ['dispose', 'caller', { version: '2.0.0', blocks: before }],
  ]
  const native = paste ? [key('copy-key', 'c'), trusted('external-copy', 'copy'), key('paste-key', 'v'), trusted('paste', 'paste')]
    : [trusted('type-open', 'mousedown'), trusted('type-choose', 'mousedown')]
  native.push(key('undo', 'z'), key('redo', 'z', 10))
  const name = paste ? 'clipboard.paste' : 'selection.convert'
  const transactions = ['commit', 'undo', 'redo'].map(action => ({ action, origin: action === 'commit' ? 'user' : 'history', name }))
  return { observations, native, transactions, after, before, targetIndex }
}

export function verifyRawReplay(item, expected) {
  const { targetId, rawAfter, spec } = item
  const { targetIndex, before, after } = expected
  assert.equal(typeof targetId, 'string')
  assert(targetId.length)
  assert.equal(before.some(block => block.id === targetId), spec.kind === 'all')
  if (spec.kind === 'all') assert.equal(targetId, 'seed')
  const exact = structuredClone(after)
  exact[targetIndex].id = targetId
  assert.equal(rawAfter.length, exact.length)
  if (spec.kind === 'paste') {
    const actualRows = rawAfter[targetIndex].data.rows
    const expectedRows = exact[targetIndex].data.rows
    const assertIds = entries => {
      assert(entries.every(entry => typeof entry.id === 'string' && entry.id.length > 0))
      assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
    }
    assert.equal(actualRows.length, expectedRows.length)
    assertIds(actualRows)
    for (const [rowIndex, row] of actualRows.entries()) {
      assert.equal(row.cells.length, expectedRows[rowIndex].cells.length)
      assertIds(row.cells)
      expectedRows[rowIndex].id = row.id
      for (const [cellIndex, cell] of row.cells.entries()) expectedRows[rowIndex].cells[cellIndex].id = cell.id
    }
  }
  if (spec.kind === 'widget') {
    const rawCell = rawAfter[1].data.rows[0].cells[0]
    if (rawCell.text === '<b>Alpha</b> <b></b><br>tail') exact[1].data.rows[0].cells[0].text = rawCell.text
    const rawTarget = rawAfter[targetIndex].data.text
    if (rawTarget === '<b></b>{{tone}}') exact[targetIndex].data.text = rawTarget
  }
  assert.deepEqual(rawAfter, exact, 'Raw conversion output violates the field or identity contract')
  const adjusted = structuredClone(item)
  const redo = adjusted.observations.find(entry => entry.phase === 'redo' && entry.property === 'canonical')
  assert.deepEqual(redo.actual, exact)
  assert.deepEqual(redo.expected, exact)
  redo.actual = redo.expected = after
  return adjusted
}
