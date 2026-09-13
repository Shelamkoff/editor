import assert from 'node:assert/strict'
import test from 'node:test'

import { PluginControlsSlot } from './PluginControlsSlot.js'

test('latest selection suppression owns the delayed release in the editor window', () => {
  const originalRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = () => { throw new Error('ambient requestAnimationFrame must not be used') }
  const frames = []
  const ownerWindow = {
    requestAnimationFrame(callback) {
      frames.push(callback)
      return frames.length
    },
  }

  try {
    const calls = []
    let controlsContext
    const block = { type: 'paragraph', contentElement: {} }
    const slot = new PluginControlsSlot(
      { ownerDocument: { defaultView: ownerWindow }, appendChild() {} },
      { style: {} },
      {
        blocks: { getCurrentBlock: () => block },
        getInlineControls: () => (_element, context) => {
          controlsContext = context
          return { elements: [] }
        },
        events: {},
        typeSelector: { update() {} },
        setSuppressSelectionChange: value => calls.push(value),
        mutations: {
          active: false,
          runForBlock: (_block, operation) => operation(),
          commitExternal() {},
        },
      },
    )

    slot.refresh()
    controlsContext.suppressSelectionChange()
    frames.shift()()

    controlsContext.suppressSelectionChange()
    frames.shift()()

    assert.deepEqual(calls, [true, true])

    frames.shift()()
    frames.shift()()
    assert.deepEqual(calls, [true, true, false])
  } finally {
    globalThis.requestAnimationFrame = originalRaf
  }
})
