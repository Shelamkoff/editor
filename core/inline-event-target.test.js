// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { TriggerManager } from './TriggerManager.js'
import { InlinePatternMatcher } from './InlinePatternMatcher.js'

function fixture(kind) {
  const listeners = new Map(), calls = { edits: 0, mutations: 0 }
  const locked = {}, widget = {}
  const host = { contentEditable: 'true',
    contains(node) { return node === text || node === locked || node === widget },
    closest(selector) { return selector === '[contenteditable="true"]' || selector === '[contenteditable]' ? this : null },
  }
  const text = { nodeType: 3, data: kind === 'trigger' ? '@' : '#abc', parentElement: host }
  const view = { addEventListener() {}, removeEventListener() {},
    getSelection: () => ({ isCollapsed: true, rangeCount: 1, anchorNode: text, anchorOffset: text.data.length }) }
  const root = { ownerDocument: { defaultView: view }, contains: node => node === host,
    addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener(type) { listeners.delete(type) } }
  const plugin = { type: 'probe', trigger: '@', onEdit() { calls.edits++ }, pasteConfig: { patterns: [/^#abc$/] } }
  const registry = { triggerKeys: () => ['@'], getByTrigger: () => plugin, values: () => [plugin] }
  const events = { on() { return () => {} } }
  const block = { plugin: { mapTextFields() {} }, contentElement: { contains: node => node === host } }
  const manager = kind === 'trigger'
    ? new TriggerManager(root, registry, { hidePopup() {} }, events)
    : new InlinePatternMatcher(root, registry, {}, events,
      { getBlockByChildNode: () => block }, { runForBlock() { calls.mutations++ } })
  const fire = target => {
    let prevented = false
    listeners.get(kind === 'trigger' ? 'input' : 'keydown')({ target, key: ' ',
      preventDefault() { prevented = true }, stopPropagation() {} })
    return prevented
  }
  function target(type) {
    return { closest(selector) {
      if (selector === '[contenteditable="true"]') return host
      if (selector === '[contenteditable="false"]') return type === 'locked' ? locked : null
      if (selector.split(',').map(value => value.trim()).includes(type)) return this
      if (selector.includes('[data-inline-plugin]')) return type === 'widget' ? widget : null
      return null
    } }
  }
  return { manager, calls, host, fire, target }
}

for (const kind of ['trigger', 'pattern']) {
  for (const control of ['input', 'textarea', 'select', 'button', 'locked', 'widget']) {
    test(`${kind} ignores ${control} events even when an ancestor is editable and selection is stale`, () => {
      const f = fixture(kind)
      try {
        assert.equal(f.fire(f.target(control)), false, 'native control event must not be prevented')
        assert.deepEqual(f.calls, { edits: 0, mutations: 0 })
      } finally { f.manager.destroy() }
    })
  }
  test(`${kind} still accepts the actual editable host`, () => {
    const f = fixture(kind)
    try {
      f.fire(f.host)
      assert.deepEqual(f.calls, kind === 'trigger' ? { edits: 1, mutations: 0 } : { edits: 0, mutations: 1 })
    } finally { f.manager.destroy() }
  })
}
