// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandDispatcher } from './CommandDispatcher.js'

for (const action of ['execute', 'external']) {
  test(`checkpoint capture rejects ${action} reentry before state can change`, () => {
    const block = { id: 'a', type: 'paragraph', markDirty() {} }
    const commands = new CommandDispatcher({ getBlockById() { return block } }, { emit() {} })
    const observations = []
    let commits = 0
    let value = 'initial'
    let first = true
    let rejected = false
    commands.configureCommit(() => { commits++ })
    commands.configureRollback(() => {
      observations.push([commands.active, commands.inTransaction])
      if (first) {
        first = false
        try {
          if (action === 'execute') commands.execute({ name: 'child', apply() { value = 'child' } })
          else commands.commitExternal(block)
        } catch (error) {
          rejected = /capture|prepar|prelude/i.test(String(error))
        }
      }
      return { version: 'test', blocks: [] }
    }, () => {})
    commands.execute({ name: 'outer', apply() { assert.equal(value, 'initial'); value = 'outer' } })
    assert.equal(rejected, true)
    assert.deepEqual(observations, [[false, true]], 'capture must be non-active but locked')
    assert.equal(value, 'outer')
    assert.equal(commits, 1)
    assert.equal(commands.inTransaction, false)
  })
}

test('failed capture drops deferred observations and releases the prelude lock', () => {
  const commands = new CommandDispatcher({}, { emit() {} })
  let first = true
  const observed = []
  commands.configureRollback(() => {
    if (first) {
      first = false
      commands.afterCommit(() => observed.push('failed'))
      throw new Error('capture failed')
    }
    return { version: 'test', blocks: [] }
  }, () => {})
  assert.throws(() => commands.execute({ name: 'bad', apply() {} }), /capture failed/)
  assert.deepEqual(observed, [])
  assert.equal(commands.inTransaction, false)
  commands.execute({ name: 'next', apply() {} })
  assert.deepEqual(observed, [])
})

test('affected iterable is locked before checkpoint capture and unlocks on failure', () => {
  const commands = new CommandDispatcher({}, { emit() {} })
  let rejected = false
  const affected = {
    *[Symbol.iterator]() {
      try { commands.execute({ name: 'child', apply() {} }) }
      catch (error) { rejected = /preparation/.test(String(error)) }
      throw new Error('affected failed')
    },
  }
  assert.throws(() => commands.execute({ name: 'outer', affected, apply() {} }), /affected failed/)
  assert.equal(rejected, true)
  assert.equal(commands.inTransaction, false)
  commands.execute({ name: 'next', apply() {} })
})

test('successful checkpoint observations wait for commit and retain FIFO order', () => {
  const events = []
  const commands = new CommandDispatcher({}, { emit() {} })
  commands.configureRollback(() => {
    commands.afterCommit(() => events.push('observer'))
    events.push('capture')
    return { version: 'test', blocks: [] }
  }, () => {})
  commands.configureCommit(() => events.push('commit'))
  commands.execute({ name: 'outer', apply() { events.push('apply') } })
  assert.deepEqual(events, ['capture', 'apply', 'commit', 'observer'])
})

test('failed external commit never publishes its queued events during the next command', () => {
  const block = { id: 'a', type: 'paragraph', markDirty() {} }
  const commands = new CommandDispatcher({ getBlockById() { return block } }, { emit() {} })
  const delivered = []
  commands.configureCommit(() => {
    commands.afterCommit(() => delivered.push('failed external commit'))
    throw new Error('external commit failed')
  })
  assert.throws(() => commands.commitExternal(block), /external commit failed/)
  assert.equal(commands.inTransaction, false)
  commands.configureCommit(() => {})
  commands.execute({ name: 'next', apply() {} })
  assert.deepEqual(delivered, [])
})
