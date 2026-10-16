import test from 'node:test'
import assert from 'node:assert/strict'

import { InlineTriggerController } from './InlineTriggerController.js'

function harness() {
  const events = new Map()
  let readOnly = true
  let captures = 0
  let inputRoutes = 0
  const root = {
    ownerDocument: {
      defaultView: { AbortController },
      addEventListener() {},
    },
    addEventListener(type, listener) {
      const current = events.get(type) ?? []
      current.push(listener)
      events.set(type, current)
    },
  }
  const controller = new InlineTriggerController({
    root,
    registry: { inlineTypes: [] },
    reconciler: { resolveEditableTarget: () => null },
    selection: { capture() { captures++; return null } },
    commands: {},
    isComposing: () => false,
    isReadOnly: () => readOnly,
    nativeInputRoute() { inputRoutes++; return null },
  })
  return {
    controller,
    captures: () => captures,
    inputRoutes: () => inputRoutes,
    input: () => {
      for (const listener of events.get('input') ?? []) {
        listener({ target: {}, isComposing: false })
      }
    },
    setReadOnly(value) { readOnly = value; controller.setReadOnly(value) },
  }
}

test('deferred inline trigger refresh and input never reactivate after read-only or destruction', () => {
  const h = harness()
  // This is also the initial read-only case, before an external transition.
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 0)
  assert.equal(h.inputRoutes(), 0)

  h.setReadOnly(false)
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'editable refresh should remain available')
  assert.equal(h.inputRoutes(), 1, 'editable input routing should remain available')

  h.setReadOnly(true)
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'read-only refresh probed stale selection')
  assert.equal(h.inputRoutes(), 1, 'read-only input entered trigger dispatch')

  h.setReadOnly(false)
  h.controller.destroy()
  assert.equal(h.controller.refresh(), false)
  h.input()
  assert.equal(h.captures(), 1, 'destroyed refresh probed stale selection')
  assert.equal(h.inputRoutes(), 1, 'destroyed input entered trigger dispatch')
})
