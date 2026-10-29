import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditor } from './index.js'

const invalidBudgets = [0, -1, null, '100', 1.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER + 1, true, false, {}, [], 1n]

test('public historyMaxBytes rejects invalid budgets before acquiring editor resources', () => {
  for (const value of invalidBudgets) {
    let holderReads = 0
    let diagnostics = 0
    let optionReads = 0
    const holder = {
      get ownerDocument() {
        holderReads++
        throw new Error('editor resources were observed before budget validation')
      },
    }
    assert.throws(() => createEditor({
      holder,
      plugins: [{}],
      get historyMaxBytes() { optionReads++; return value },
      onDiagnostic() { diagnostics++ },
    }), {
      name: 'RangeError',
      message: 'createEditor() historyMaxBytes must be a positive safe integer',
    })
    assert.equal(optionReads, 1)
    assert.equal(holderReads, 0)
    assert.equal(diagnostics, 0)
  }
})

test('public historyMaxBytes permits omitted, undefined and positive safe integers', () => {
  for (const option of [{}, { historyMaxBytes: undefined }, { historyMaxBytes: 1 },
    { historyMaxBytes: Number.MAX_SAFE_INTEGER }]) {
    // A missing holder intentionally stops construction after config validation.
    assert.throws(() => createEditor({ plugins: [{}], ...option }),
      /requires an HTMLElement holder/)
  }
})

test('public historyMaxBytes does not observe inherited configuration accessors', () => {
  let reads = 0
  const config = Object.create({
    get historyMaxBytes() { reads++; throw new Error('inherited budget read') },
  })
  config.plugins = [{}]
  assert.throws(() => createEditor(config), /requires an HTMLElement holder/)
  assert.equal(reads, 0)
})
