import test from 'node:test'
import assert from 'node:assert/strict'
import { selectOwnedDefaultPermissionContext } from './clipboard-permission-context.mjs'

const target = { targetId: 'fixture', type: 'page', browserContextId: 'reported-default' }

test('the owned default profile is addressed without its reported opaque ID', () => {
  const selected = selectOwnedDefaultPermissionContext(target,
    { browserContextIds: [], defaultBrowserContextId: 'reported-default' })
  // The hosted Chromium151 failure: TargetInfo's default ID is not accepted
  // as a created BrowserContext ID by the permission endpoint.
  const permissionEndpoint = parameters => {
    if (parameters.browserContextId) throw Error('Failed to find browser context for id ' + parameters.browserContextId)
    return 'default-profile'
  }
  assert.equal(permissionEndpoint(selected.parameters), 'default-profile')
  assert.deepEqual(selected.parameters, {})
})

test('a protocol omitting the optional default ID still uses the verified fresh profile', () => {
  assert.deepEqual(selectOwnedDefaultPermissionContext(target, { browserContextIds: [] }).parameters, {})
  assert.deepEqual(selectOwnedDefaultPermissionContext({ targetId: 'fixture' }, { browserContextIds: [] }).parameters, {})
})

for (const ids of [['reported-default'], ['another-context']]) test(`a profile with a created context is rejected: ${ids[0]}`, () => {
  assert.throws(() => selectOwnedDefaultPermissionContext(target, { browserContextIds: ids }), /created browser contexts/)
})

for (const contexts of [undefined, null, [], {}, { browserContextIds: null }, { browserContextIds: 'not-an-array' }]) {
  test('malformed browser context inventory fails before permission selection: ' + JSON.stringify(contexts), () => {
    assert.throws(() => selectOwnedDefaultPermissionContext(target, contexts), /browser context inventory/)
  })
}

for (const info of [undefined, null, [], { browserContextId: null }, { browserContextId: '' }, { browserContextId: 42 }]) {
  test('malformed target context metadata fails closed: ' + JSON.stringify(info), () => {
    assert.throws(() => selectOwnedDefaultPermissionContext(info, { browserContextIds: [] }), /target context/)
  })
}

for (const defaultId of [null, '', 42, 'different-default']) test('invalid or mismatched default context fails closed: ' + JSON.stringify(defaultId), () => {
  assert.throws(() => selectOwnedDefaultPermissionContext(target,
    { browserContextIds: [], defaultBrowserContextId: defaultId }), /default browser context/)
})

test('an advertised default context must match a reported target context', () => {
  assert.throws(() => selectOwnedDefaultPermissionContext({ targetId: 'fixture' },
    { browserContextIds: [], defaultBrowserContextId: 'reported-default' }), /default browser context/)
})

test('selection records the observed IDs and default-addressing reason without mutating input', () => {
  const info = Object.freeze({ ...target })
  const inventory = Object.freeze({ browserContextIds: Object.freeze([]), defaultBrowserContextId: 'reported-default' })
  const selected = selectOwnedDefaultPermissionContext(info, inventory)
  assert.equal(selected.evidence.kind, 'owned-default-profile')
  assert.equal(selected.evidence.reportedBrowserContextId, 'reported-default')
  assert.equal(selected.evidence.defaultBrowserContextId, 'reported-default')
  assert.deepEqual(selected.evidence.createdBrowserContextIds, [])
  assert.match(selected.evidence.selectionReason, /by omission/)
  assert.deepEqual(info, target)
})
