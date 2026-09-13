// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { BlockAnimator } from './BlockAnimator.js'

test('block removal reads computed style from the element owning window', async () => {
  const calls = []
  const ownerDocument = {
    defaultView: {
      getComputedStyle(element) {
        calls.push(['style', element])
        return { marginBottom: '12px' }
      },
    },
  }
  const element = {
    ownerDocument,
    parentNode: {},
    offsetHeight: 40,
    style: {},
    animate(frames) {
      calls.push(['animate', frames])
      return { finished: Promise.resolve() }
    },
    remove() { calls.push(['remove']) },
  }
  const previousGetComputedStyle = globalThis.getComputedStyle
  globalThis.getComputedStyle = () => { throw new Error('ambient getComputedStyle must not be used') }
  try {
    await new BlockAnimator({ blockInsertMs: 1, blockMoveMs: 1, blockRemoveMs: 1 }).animateRemove(element)
  } finally {
    globalThis.getComputedStyle = previousGetComputedStyle
  }
  assert.equal(calls[0][0], 'style')
  assert.equal(calls[1][1][0].marginBottom, '12px')
  assert.equal(calls.at(-1)[0], 'remove')
})
