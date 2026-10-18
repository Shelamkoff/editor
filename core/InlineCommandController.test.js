import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineCommandController } from './InlineCommandController.js'

function harness({ onFreshText = null } = {}) {
  const calls = []
  const carets = []
  let preparing = false
  const runtime = {
    prepareExtensionValue(operation) {
      preparing = true
      try { return operation() }
      finally { preparing = false }
    },
    readOnly: false,
    insertInlineWidget() {},
    interact(_name, operation) { return operation() },
    replaceRichTextWithInlineSegments(blockId, fieldKey, range, segments) {
      calls.push({ blockId, fieldKey, range, segments })
      const logicalLength = segments.reduce((total, segment) => (
        total + (segment.kind === 'widget' ? 1 : segment.text.length)
      ), 0)
      return { blockId, fieldKey, offset: range.start + logicalLength }
    },
  }
  const definition = {
    paste: {
      patterns: [/^#[0-9a-f]{3}$/i, /^#[0-9a-f]{6}$/i],
      fromMatch(match) { return { value: match.toLowerCase() } },
    },
  }
  const registry = {
    inlineTypes: ['color'],
    getInlineDefinition(type) { return type === 'color' ? definition : undefined },
  }
  const selection = {
    capture() {
      return {
        anchor: { blockId: 'a', fieldKey: 'text', offset: 2 },
        focus: { blockId: 'a', fieldKey: 'text', offset: 2 },
      }
    },
    setCaret(blockId, target) { carets.push({ blockId, target }); return true },
  }
  const controller = new InlineCommandController({ runtime, registry, selection, onFreshText })
  return { controller, runtime, selection, calls, carets, definition, isPreparing: () => preparing }
}

test('pasteText chooses the longest overlapping pattern and keeps surrounding text', () => {
  const { controller, calls, carets } = harness()

  assert.equal(controller.pasteText('#ff0000 tail'), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    blockId: 'a',
    fieldKey: 'text',
    range: { start: 2, end: 2 },
    segments: [
      { kind: 'widget', type: 'color', data: { value: '#ff0000' } },
      { kind: 'text', text: ' tail' },
    ],
  })
  assert.deepEqual(carets, [{
    blockId: 'a',
    target: { fieldKey: 'text', offset: 8 },
  }])
})

test('pasteText converts multiple non-overlapping matches in registration order', () => {
  const { controller, calls } = harness()

  assert.equal(controller.pasteText('#f00 mid #00ff00 tail'), true)
  assert.deepEqual(calls[0].segments, [
    { kind: 'widget', type: 'color', data: { value: '#f00' } },
    { kind: 'text', text: ' mid ' },
    { kind: 'widget', type: 'color', data: { value: '#00ff00' } },
    { kind: 'text', text: ' tail' },
  ])
})

test('pasteText leaves unmatched text to the normal clipboard path', () => {
  const { controller, calls, carets } = harness()

  assert.equal(controller.pasteText('plain text'), false)
  assert.deepEqual(calls, [])
  assert.deepEqual(carets, [])
})

test('throwing inline matcher fails the owned Paste before any mutation', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.paste.fromMatch = () => {
    assert.equal(isPreparing(), true)
    throw new Error('matcher failed')
  }
  assert.throws(() => controller.pasteText('#fff'), /matcher failed/)
  assert.equal(calls.length, 0)
})

test('async inline matcher result cannot become a persisted widget payload', () => {
  const { controller, definition, calls } = harness()
  definition.paste.fromMatch = () => Promise.resolve({ value: '#fff' })
  assert.throws(() => controller.pasteText('#fff'), /synchron|thenable/i)
  assert.equal(calls.length, 0)
})

test('accessor-backed inline matcher result is captured under preparation guard', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.paste.fromMatch = () => ({
    get value() {
      assert.equal(isPreparing(), true)
      throw new Error('paste payload getter failed')
    },
  })
  assert.throws(() => controller.pasteText('#fff'), /paste payload getter failed/)
  assert.equal(calls.length, 0)
})

test('inline insertion default is prepared before entering a model command', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  definition.insertion = {
    createInitial() {
      assert.equal(isPreparing(), true)
      throw new Error('initial insertion failed')
    },
  }
  assert.throws(() => controller.insert('color'), /initial insertion failed/)
  assert.equal(calls.length, 0)
})

test('trigger encoding is guarded before invoking the insertion command', () => {
  const { controller, definition, isPreparing, calls } = harness()
  definition.schema = {
    encode() {
      assert.equal(isPreparing(), true)
      throw new Error('trigger encoding failed')
    },
  }
  assert.throws(() => controller.commitTrigger('color', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 0 },
  }, { value: '#fff' }), /trigger encoding failed/)
  assert.equal(calls.length, 0)
})

test('refused inline widget insert does not claim success or move the caret', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  runtime.insertInlineWidget = () => false

  assert.equal(controller.insert('color'), false,
    'a rejected insertion was still reported successful')
  assert.deepEqual(carets, [], 'rejected widget insert displaced the caret')
})

test('refused trigger widget insert keeps its trigger session alive', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { encode: data => ({ dataVersion: 1, data }) }
  runtime.insertInlineWidget = () => false

  assert.equal(controller.commitTrigger('color', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 2 },
  }, { value: '#fff' }), false,
  'a failed widget insertion made the trigger controller retire its query')
  assert.deepEqual(carets, [])
})

test('a successful widget insertion preserves the expected caret and true return', () => {
  const { controller, runtime, definition, carets } = harness()
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  runtime.insertInlineWidget = () => 'inline-1'

  assert.equal(controller.insert('color'), true)
  assert.deepEqual(carets, [{ blockId: 'a', target: { fieldKey: 'text', offset: 3 } }])
})

test('fresh inline text insertion succeeds when its rich-text command returns void', () => {
  const { controller, runtime, definition, carets } = harness()
  let replacements = 0
  runtime.replaceRichText = () => { replacements++ }
  definition.insertion = { createInitial: () => ({ kind: 'text', text: 'Hello' }) }
  assert.equal(controller.insert('color'), true)
  assert.equal(replacements, 1)
  assert.deepEqual(carets, [{ blockId: 'a', target: { fieldKey: 'text', offset: 7 } }])
})

test('rejected fresh inline text insertion cannot fire the success observer', () => {
  const calls = []
  const { controller, runtime, definition, carets } = harness()
  runtime.replaceRichText = () => false
  definition.insertion = { createInitial: () => ({ kind: 'text', text: 'Hello' }) }
  // A failed authoring transaction must not act like fresh text for triggers.
  const runtimeResult = controller.insert('color')
  assert.equal(runtimeResult, false)
  assert.deepEqual(carets, [])
})

test('frozen inline Paste patterns remain usable without writable lastIndex', () => {
  const { controller, calls, definition } = harness()
  definition.paste.patterns = Object.freeze([
    Object.freeze(/^#[a-f0-9]{3}$/gi),
  ])
  assert.equal(controller.pasteText('#fff tail'), true,
    'inline paste tried to mutate a frozen extension-owned RegExp')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].segments, [
    { kind: 'widget', type: 'color', data: { value: '#fff' } },
    { kind: 'text', text: ' tail' },
  ])
})

test('inline Paste does not reset or advance extension-owned RegExp lastIndex', () => {
  const { controller, calls, definition } = harness()
  const pattern = /^#[a-f0-9]{3}$/gi
  pattern.lastIndex = 2
  definition.paste.patterns = [pattern]

  assert.equal(controller.pasteText('#f00 tail'), true)
  assert.equal(calls.length, 1)
  assert.equal(pattern.lastIndex, 2,
    'a reusable plugin pattern had its observable state overwritten by Paste')
  assert.equal(controller.pasteText('#fff tail'), true,
    'subsequent matches depend on a mutable extension pattern cursor')
  assert.equal(pattern.lastIndex, 2)
})


for (const action of ['insert', 'pasteText']) {
  test(`${action} keeps a committed command but never restores caret after editor teardown in the commit observer`, () => {
    const { controller, runtime, definition, carets } = harness()
    runtime.health = 'ready'
    runtime.modeEpoch = 0
    runtime.generation = 1
    definition.schema = { createDefault: () => ({ value: '#fff' }) }
    runtime.insertInlineWidget = () => 'inline-1'
    runtime.interact = (_name, operation) => {
      const result = operation()
      runtime.health = 'destroyed'
      return result
    }

    assert.equal(action === 'insert' ? controller.insert('color') : controller.pasteText('#fff'), true)
    assert.deepEqual(carets, [],
      'an already committed inline action restored selection inside a destroyed editor')
  })

  test(`${action} does not restore a prior author caret after read-only mode changes in the commit observer`, () => {
    const { controller, runtime, definition, carets } = harness()
    runtime.health = 'ready'
    runtime.modeEpoch = 0
    runtime.generation = 1
    definition.schema = { createDefault: () => ({ value: '#fff' }) }
    runtime.insertInlineWidget = () => 'inline-1'
    runtime.interact = (_name, operation) => {
      const result = operation()
      runtime.readOnly = true
      runtime.modeEpoch++
      runtime.readOnly = false
      runtime.modeEpoch++
      return result
    }

    assert.equal(action === 'insert' ? controller.insert('color') : controller.pasteText('#fff'), true)
    assert.deepEqual(carets, [],
      'an outdated inline command reclaimed the caret after a read-only round trip')
  })
}


test('typed color word followed by space becomes an inline widget in one canonical command', () => {
  const { controller, calls, carets } = harness()
  const target = { blockId: 'a', fieldKey: 'text', range: { start: 2, end: 6 } }
  assert.equal(controller.commitTypedPattern('#fff', target, ' '), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    blockId: 'a', fieldKey: 'text', range: { start: 2, end: 6 },
    segments: [
      { kind: 'widget', type: 'color', data: { value: '#fff' } },
      { kind: 'text', text: ' ' },
    ],
  })
  assert.deepEqual(carets, [{
    blockId: 'a', target: { fieldKey: 'text', offset: 4 },
  }])
})

test('typed color word followed by Enter converts without inserting newline or splitting the block', () => {
  const { controller, calls, carets } = harness()
  assert.equal(controller.commitTypedPattern('#ff0000', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 7 },
  }, 'Enter'), true)
  assert.deepEqual(calls[0].segments, [
    { kind: 'widget', type: 'color', data: { value: '#ff0000' } },
  ])
  assert.deepEqual(carets, [{
    blockId: 'a', target: { fieldKey: 'text', offset: 1 },
  }])
})

test('typed unmatched or partial color word leaves native delimiter ownership unchanged', () => {
  const { controller, calls, carets } = harness()
  for (const word of ['plain', 'prefix#fff', '#ggg']) {
    assert.equal(controller.commitTypedPattern(word, {
      blockId: 'a', fieldKey: 'text', range: { start: 0, end: word.length },
    }, ' '), false)
  }
  assert.deepEqual(calls, [])
  assert.deepEqual(carets, [])
})

test('a partial matching custom pattern still converts the entire typed word, as in v1', () => {
  const { controller, definition, calls } = harness()
  definition.paste.patterns = [/foo/]
  assert.equal(controller.commitTypedPattern('prefixfoosuffix', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 15 },
  }, 'Enter'), true)
  assert.deepEqual(calls[0].segments, [
    { kind: 'widget', type: 'color', data: { value: 'prefixfoosuffix' } },
  ])
})

test('typed word conversion never writes to extension-owned RegExp lastIndex', () => {
  const { controller, definition, calls } = harness()
  const pattern = /^#[0-9a-f]{3}$/gi
  pattern.lastIndex = 2
  definition.paste.patterns = [pattern]
  assert.equal(controller.commitTypedPattern('#f00', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 },
  }, ' '), true)
  assert.equal(pattern.lastIndex, 2)
  assert.equal(calls.length, 1)
})

test('typed pattern matcher failures are atomic and never author a half-converted word', () => {
  const { controller, definition, calls, isPreparing } = harness()
  definition.paste.fromMatch = () => {
    assert.equal(isPreparing(), true)
    throw new Error('invalid typed matcher')
  }
  assert.throws(() => controller.commitTypedPattern('#fff', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 },
  }, ' '), /invalid typed matcher/)
  assert.deepEqual(calls, [])
})

test('committed typed conversion does not restore a caret in a synchronously destroyed editor', () => {
  const { controller, runtime, calls, carets } = harness()
  runtime.health = 'ready'
  runtime.generation = 1
  runtime.modeEpoch = 0
  runtime.interact = (_name, operation) => {
    const result = operation()
    runtime.health = 'destroyed'
    return result
  }
  assert.equal(controller.commitTypedPattern('#fff', {
    blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 },
  }, ' '), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(carets, [])
})


for (const operation of ['commitTypedPattern', 'pasteText']) {
  test(operation + ' cannot start a canonical transaction if its matcher retires the editor during preparation', () => {
    const { controller, runtime, definition, calls, carets } = harness()
    runtime.health = 'ready'
    runtime.generation = 1
    runtime.modeEpoch = 0
    let attempts = 0
    definition.paste.fromMatch = word => {
      runtime.health = 'destroyed'
      return { value: word }
    }
    runtime.interact = () => {
      attempts++
      throw new Error('dead runtime was invoked after matcher')
    }
    const target = { blockId: 'a', fieldKey: 'text', range: { start: 0, end: 4 } }
    const result = operation === 'commitTypedPattern'
      ? controller.commitTypedPattern('#fff', target, ' ')
      : controller.pasteText('#fff', target)
    assert.equal(result, false)
    assert.equal(attempts, 0, 'retired command tried to begin a new authoring transaction')
    assert.deepEqual(calls, [])
    assert.deepEqual(carets, [])
  })
}

test('inline insertion preparation that retires the editor cannot mutate a detached owner', () => {
  const { controller, runtime, definition, carets } = harness()
  runtime.health = 'ready'
  runtime.generation = 1
  runtime.modeEpoch = 0
  definition.schema = { createDefault: () => ({ value: '#fff' }) }
  definition.insertion = {
    createInitial() {
      runtime.health = 'destroyed'
      return null
    },
  }
  let attempts = 0
  runtime.interact = () => {
    attempts++
    throw new Error('dead runtime reached through insertion')
  }
  assert.equal(controller.insert('color'), false)
  assert.equal(attempts, 0)
  assert.deepEqual(carets, [])
})


test('explicit inline insertion data cannot outlive reentrant trailing-text preparation',()=>{
  const {controller,runtime,definition,carets}=harness()
  runtime.health='ready'
  runtime.generation=1
  runtime.modeEpoch=0
  definition.insertion={
    get trailingText(){
      runtime.health='destroyed'
      return ' '
    },
  }
  let transactions=0
  runtime.interact=()=>{transactions++;throw new Error('retired explicit insertion invoked model')}
  assert.equal(controller.insert('color',{value:'#fff'}),false)
  assert.equal(transactions,0)
  assert.deepEqual(carets,[])
})

test('trigger encoding teardown prevents a stale inline widget transaction',()=>{
  const {controller,runtime,definition,carets}=harness()
  runtime.health='ready'
  runtime.generation=1
  runtime.modeEpoch=0
  definition.schema={
    encode(data){
      runtime.health='destroyed'
      return {dataVersion:1,data}
    },
  }
  let transactions=0
  runtime.interact=()=>{transactions++;throw new Error('retired trigger invoked model')}
  assert.equal(controller.commitTrigger('color',{
    blockId:'a',fieldKey:'text',range:{start:0,end:2},
  },{value:'#fff'}),false)
  assert.equal(transactions,0)
  assert.deepEqual(carets,[])
})

test('typed matcher cannot claim an edit after a control-mode round trip during preparation',()=>{
  const {controller,runtime,definition,carets}=harness()
  runtime.health='ready'
  runtime.generation=1
  runtime.modeEpoch=0
  definition.paste.fromMatch=word=>{
    runtime.modeEpoch+=2
    return {value:word}
  }
  let transactions=0
  runtime.interact=()=>{transactions++;throw new Error('stale typed command invoked model')}
  assert.equal(controller.commitTypedPattern('#fff',{
    blockId:'a',fieldKey:'text',range:{start:0,end:4},
  },' '),false)
  assert.equal(transactions,0)
  assert.deepEqual(carets,[])
})


for (const retirement of ['commit observer', 'control-mode callback', 'caret focus callback']) {
  test('fresh inline text does not refresh a retired editor after ' + retirement, () => {
    const notices = []
    const { controller, runtime, definition, selection, carets } = harness({
      onFreshText: details => notices.push(details),
    })
    runtime.health = 'ready'
    runtime.generation = 1
    runtime.modeEpoch = 0
    runtime.replaceRichText = () => undefined
    definition.insertion = { createInitial: () => ({ kind: 'text', text: '@' }) }
    runtime.interact = (_name, operation) => {
      const result = operation()
      if (retirement === 'commit observer') runtime.health = 'destroyed'
      if (retirement === 'control-mode callback') runtime.modeEpoch += 2
      return result
    }
    if (retirement === 'caret focus callback') {
      selection.setCaret = () => {
        runtime.health = 'destroyed'
        carets.push({ blockId: 'a', target: { fieldKey: 'text', offset: 3 } })
        return true
      }
    }
    assert.equal(controller.insert('color'), true, 'successful canonical insertion lost its committed result')
    assert.deepEqual(notices, [], 'retired fresh-text command notified a detached inline owner')
    assert.equal(carets.length, retirement === 'caret focus callback' ? 1 : 0)
  })
}

test('fresh inline text notifies its trigger exactly once after a live committed edit', () => {
  const notices = []
  const { controller, runtime, definition, carets } = harness({
    onFreshText: details => notices.push(details),
  })
  runtime.health = 'ready'
  runtime.generation = 1
  runtime.modeEpoch = 0
  runtime.replaceRichText = () => undefined
  definition.insertion = { createInitial: () => ({ kind: 'text', text: '@' }) }
  assert.equal(controller.insert('color'), true)
  assert.deepEqual(notices, [{ type: 'color', blockId: 'a', fieldKey: 'text' }])
  assert.deepEqual(carets, [{ blockId: 'a', target: { fieldKey: 'text', offset: 3 } }])
})
