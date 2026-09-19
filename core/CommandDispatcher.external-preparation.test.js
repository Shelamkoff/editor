// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandDispatcher } from './CommandDispatcher.js'

function fixture() {
  const dirtied = []
  const first = { id: 'first', markDirty() { dirtied.push(this.id) } }
  const second = { id: 'second', markDirty() { dirtied.push(this.id) } }
  const blocks = new Map([[first.id, first], [second.id, second]])
  const commands = new CommandDispatcher({ getBlockById(id) { return blocks.get(id) } }, { emit() {} })
  const committed = []
  commands.configureCommit(affected => committed.push(affected.map(block => block.id)))
  return { commands, first, second, dirtied, committed }
}

test('failed external affected iteration cannot contaminate the next commit', () => {
  const { commands, first, second, dirtied, committed } = fixture()
  const affected = { *[Symbol.iterator]() { yield first; throw new Error('iteration failed') } }
  assert.throws(() => commands.commitExternalMany(affected), /iteration failed/)
  commands.commitExternal(second)
  assert.deepEqual(dirtied, ['second'])
  assert.deepEqual(committed, [['second']])
})

test('external affected iteration is locked against reentrant commands', () => {
  const { commands, first, committed } = fixture()
  let rejected = false
  let childRan = false
  const affected = {
    *[Symbol.iterator]() {
      try { commands.execute({ name: 'child', apply() { childRan = true } }) }
      catch (error) { rejected = /prepar/i.test(String(error)) }
      yield first
    },
  }
  commands.commitExternalMany(affected)
  assert.equal(rejected, true)
  assert.equal(childRan, false)
  assert.deepEqual(committed, [['first']])
  assert.equal(commands.inTransaction, false)
})

test('failed external preparation discards its deferred observations', () => {
  const { commands, second } = fixture()
  const delivered = []
  const affected = {
    *[Symbol.iterator]() {
      commands.afterCommit(() => delivered.push('failed preparation'))
      throw new Error('iteration failed')
    },
  }
  assert.throws(() => commands.commitExternalMany(affected), /iteration failed/)
  commands.commitExternal(second)
  assert.deepEqual(delivered, [])
})

test('successful external preparation delivers observations only after its commit', () => {
  const { commands, first } = fixture()
  const order = []
  commands.configureCommit(() => order.push('commit'))
  commands.commitExternalMany({ *[Symbol.iterator]() {
    commands.afterCommit(() => order.push('observation'))
    yield first
  } })
  assert.deepEqual(order, ['commit', 'observation'])
})

test('nested external preparation preserves the surrounding affected set on failure', () => {
  const { commands, first, second, committed } = fixture()
  commands.execute({ name: 'outer', affected: [first], apply() {
    assert.throws(() => commands.commitExternalMany({ *[Symbol.iterator]() {
      yield second
      throw new Error('iteration failed')
    } }), /iteration failed/)
  } })
  assert.deepEqual(committed, [['first']])
})
