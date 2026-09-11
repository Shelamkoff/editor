import test from 'node:test'
import assert from 'node:assert/strict'
import { SOCIAL_ICONS, resolveSocialIcon } from './socialResolver.js'

test('global custom social resolvers are deterministic across repeated calls', () => {
  const resolvers = [{ test: /example\.com/g, type: 'example', icon: '<svg></svg>' }]

  const first = resolveSocialIcon('https://example.com/user', resolvers)
  const second = resolveSocialIcon('https://example.com/user', resolvers)

  assert.equal(first.type, 'example')
  assert.equal(second.type, 'example')
})

test('custom social resolver types cannot resolve inherited icon keys', () => {
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const resolved = resolveSocialIcon('https://example.com/user', [
      { test: () => true, type },
    ])

    assert.equal(resolved.type, type)
    assert.equal(resolved.icon, SOCIAL_ICONS.website)
    assert.equal(typeof resolved.icon, 'string')
  }
})
