import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveSocialIcon } from './socialResolver.js'

test('global custom social resolvers are deterministic across repeated calls', () => {
  const resolver = { test: /example\.com/g, type: 'custom', icon: '<svg></svg>' }
  const first = resolveSocialIcon('https://example.com/profile', [resolver])
  const second = resolveSocialIcon('https://example.com/profile', [resolver])

  assert.equal(first.type, 'custom')
  assert.deepEqual(second, first)
  assert.equal(resolver.test.lastIndex, 0)
})
