import assert from 'node:assert/strict'
import test from 'node:test'
import { Diagnostics } from './Diagnostics.js'

test('diagnostics are deferred, content-free, frozen and callback failures are isolated', async () => {
  const received = []
  const diagnostics = new Diagnostics(event => {
    received.push(event)
    throw new Error('consumer diagnostic failure')
  }, { commandMs: 5 })

  assert.doesNotThrow(() => diagnostics.emit('command.failed', {
    operation: 'block.insert',
    errorName: 'TypeError',
  }))
  assert.equal(received.length, 0, 'diagnostic observer must not run inside editor control flow')
  await Promise.resolve()
  assert.equal(received.length, 1)
  assert.equal(Object.isFrozen(received[0]), true)
  assert.equal(diagnostics.threshold('commandMs'), 5)
  assert.equal('content' in received[0], false)
})

test('diagnostic thresholds reject invalid durations', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '10']) {
    assert.throws(
      () => new Diagnostics(() => {}, { commandMs: value }),
      /diagnosticThresholds\.commandMs/,
    )
  }
  assert.doesNotThrow(() => new Diagnostics(() => {}, { commandMs: 0 }))
})

test('diagnostic thresholds ignore inherited values without reading them', () => {
  let reads = 0
  const prototype = {}
  for (const key of ['commandMs', 'saveMs', 'renderMs', 'pasteMs']) {
    Object.defineProperty(prototype, key, {
      configurable: true,
      get() { reads++; throw new Error(`inherited diagnostic ${key} accessed`) },
    })
  }
  const thresholds = Object.create(prototype)
  const diagnostics = new Diagnostics(() => {}, thresholds)
  for (const key of ['commandMs', 'saveMs', 'renderMs', 'pasteMs']) {
    assert.equal(diagnostics.threshold(key), Infinity)
  }
  assert.equal(reads, 0)
})


test('diagnostics contain rejected observer promises', async () => {
  let calls = 0
  const diagnostics = new Diagnostics(async () => {
    calls++
    throw new Error('async diagnostic failure')
  })

  diagnostics.emit('command.failed', { operation: 'test', errorName: 'Error' })
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(calls, 1)
})
test('diagnostics never inspect or emit undeclared payload fields', async () => {
  const seen = []
  const diagnostics = new Diagnostics(event => seen.push(event))
  const input = {
    operation: 'clipboard.paste',
    pluginType: 'paragraph',
    blockType: 'paragraph',
    errorName: 'TypeError',
    durationMs: 3.5,
  }
  let forbiddenReads = 0
  for (const name of ['content', 'code', 'timestamp', 'payload']) {
    Object.defineProperty(input, name, {
      enumerable: true,
      get() { forbiddenReads++; throw new Error(`Undeclared diagnostic field ${name} accessed`) },
    })
  }

  assert.doesNotThrow(() => diagnostics.emit('paste.failed', input))
  await Promise.resolve()
  assert.equal(forbiddenReads, 0, 'diagnostics must not evaluate undeclared fields')
  assert.equal(seen.length, 1)
  assert.deepEqual(
    {
      code: seen[0].code,
      operation: seen[0].operation,
      pluginType: seen[0].pluginType,
      blockType: seen[0].blockType,
      errorName: seen[0].errorName,
      durationMs: seen[0].durationMs,
    },
    {
      code: 'paste.failed',
      operation: 'clipboard.paste',
      pluginType: 'paragraph',
      blockType: 'paragraph',
      errorName: 'TypeError',
      durationMs: 3.5,
    },
  )
  assert.equal(typeof seen[0].timestamp, 'number')
  assert.deepEqual(
    Object.keys(seen[0]).sort(),
    ['code', 'timestamp', 'operation', 'pluginType', 'blockType', 'errorName', 'durationMs'].sort(),
  )
})

test('diagnostic metadata does not deliver accidental object payloads or invalid durations', async () => {
  const events = []
  const diagnostics = new Diagnostics(event => events.push(event))
  diagnostics.emit('command.failed', {
    operation: { data: { secret: 'document content' } },
    pluginType: { value: 'not metadata' },
    blockType: ['not', 'metadata'],
    errorName: 42,
    durationMs: Infinity,
    code: 'render.slow',
    timestamp: 0,
    content: 'document content',
  })
  await Promise.resolve()
  assert.equal(events.length, 1)
  assert.equal(events[0].code, 'command.failed')
  assert.notEqual(events[0].timestamp, 0)
  assert.deepEqual(Object.keys(events[0]).sort(), ['code', 'timestamp'])
})

test('diagnostics do not invoke metadata getters supplied by extensions', async () => {
  const received = []
  const diagnostics = new Diagnostics(event => received.push(event))
  let reads = 0
  const details = { operation: 'clipboard.paste' }
  Object.defineProperty(details, 'pluginType', {
    enumerable: true,
    get() { reads++; throw new Error('extension metadata getter') },
  })
  assert.doesNotThrow(() => diagnostics.emit('paste.failed', details))
  await Promise.resolve()
  assert.equal(reads, 0)
  assert.equal(received.length, 1)
  assert.equal(received[0].operation, 'clipboard.paste')
  assert.equal('pluginType' in received[0], false)
})
