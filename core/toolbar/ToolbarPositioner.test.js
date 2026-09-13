// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolbarPositioner } from './ToolbarPositioner.js'

function createHarness() {
  const originalWindow = globalThis.window
  globalThis.window = { innerWidth: 1200 }

  const animations = []
  const root = {
    appendChild(element) { element.parentElement = this },
    getBoundingClientRect() { return { top: 0, right: 100, bottom: 100 } },
  }
  const toolbar = {
    style: { top: '0px', display: '' },
    parentElement: root,
    getBoundingClientRect() { return { top: 0, right: 20, bottom: 20 } },
    animate() {
      const animation = {
        cancelled: false,
        onfinish: null,
        oncancel: null,
        cancel() {
          this.cancelled = true
          this.oncancel?.()
        },
      }
      animations.push(animation)
      return animation
    },
  }
  let top = 10
  const blockElement = {
    get offsetTop() { return top },
    offsetParent: root,
    getBoundingClientRect() { return { top } },
  }
  const blocks = { getCurrentBlock: () => ({ element: blockElement }) }
  const positioner = new ToolbarPositioner(toolbar, root, blocks, {
    mobileBreakpoint: 768,
    moveAnimationMs: 200,
  })

  return {
    animations,
    positioner,
    toolbar,
    setTop(value) { top = value },
    restore() { globalThis.window = originalWindow },
  }
}

test('a newer move owns moveAnimating until its animation settles', () => {
  const harness = createHarness()
  try {
    harness.positioner.animatePosition(null)
    const first = harness.animations[0]
    assert.equal(harness.positioner.moveAnimating, true)

    harness.setTop(20)
    harness.positioner.animatePosition(null)
    const second = harness.animations[1]

    assert.equal(first.cancelled, true)
    assert.equal(harness.positioner.moveAnimating, true)

    // A stale completion must not make the positioner look idle.
    first.onfinish?.()
    assert.equal(harness.positioner.moveAnimating, true)

    second.onfinish?.()
    assert.equal(harness.positioner.moveAnimating, false)
  } finally {
    harness.restore()
  }
})

test('removal FLIP keeps moveAnimating true until it settles', () => {
  const harness = createHarness()
  try {
    harness.toolbar.style.top = '0px'
    harness.setTop(20)

    const dy = harness.positioner.animateAfterRemoval()
    assert.equal(dy, -20)
    assert.equal(harness.positioner.moveAnimating, true)

    harness.animations[0].onfinish?.()
    assert.equal(harness.positioner.moveAnimating, false)
  } finally {
    harness.restore()
  }
})
