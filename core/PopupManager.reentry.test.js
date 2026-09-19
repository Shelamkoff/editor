// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { PopupManager } from './PopupManager.js'

function fixture() {
  const nodes = []
  const listeners = new Set()
  let readOnly = false
  let attached = true
  const document = {
    defaultView: { innerHeight: 800 },
    createElement() {
      const node = { style: {}, children: [], offsetHeight: 20,
        appendChild(child) { this.children.push(child) },
        contains(child) { return this.children.includes(child) },
        remove() { nodes.splice(nodes.indexOf(this), 1) },
      }
      return node
    },
    addEventListener(type, fn) { listeners.add(fn) },
    removeEventListener(type, fn) { listeners.delete(fn) },
  }
  const anchor = { ownerDocument: document, getBoundingClientRect: () => ({left: 0, top: 0, bottom: 20}) }
  const root = { ownerDocument: document, contains: node => node === anchor && attached,
    appendChild(node) { nodes.push(node) } }
  const manager = new PopupManager({on: () => () => {}}, 'changed', {
    getBlockByChildNode() {}, getBlockById() {},
  }, {}, () => readOnly)
  manager.setRoot(root)
  return { manager, anchor, nodes, listeners,
    readOnly() { readOnly = true }, detach() { attached = false },
  }
}

for (const operation of ['destroy', 'readOnly', 'detach']) {
  test(`popup replacement rechecks ${operation} after the previous cleanup`, async () => {
    const f = fixture()
    let disposed = 0
    f.manager.showPopup(f.anchor, {label: 'old'}, () => {
      operation === 'destroy' ? f.manager.destroy() : f[operation]()
    })
    f.manager.showPopup(f.anchor, {label: 'rejected'}, () => disposed++)
    await Promise.resolve()
    assert.equal(f.nodes.length, 0, 'invalidated replacement must not mount')
    assert.equal(f.listeners.size, 0, 'invalidated replacement must not arm a listener')
    assert.equal(disposed, 1, 'the unused replacement must release its resources')
    f.manager.destroy()
    assert.equal(disposed, 1)
  })
}

test('a cleanup-opened popup keeps sole ownership rather than becoming an orphan', async () => {
  const f = fixture()
  const nested = {label: 'nested'}
  let outerDisposals = 0, nestedDisposals = 0
  f.manager.showPopup(f.anchor, {label: 'old'}, () => {
    f.manager.showPopup(f.anchor, nested, () => nestedDisposals++)
  })
  f.manager.showPopup(f.anchor, {label: 'superseded'}, () => outerDisposals++)
  await Promise.resolve()
  assert.equal(f.nodes.length, 1, 'a reentrant opening must not leave two popups mounted')
  assert.strictEqual(f.nodes[0].children[0], nested)
  assert.equal(outerDisposals, 1)
  assert.equal(nestedDisposals, 0)
  assert.equal(f.listeners.size, 1)
  f.manager.destroy()
  assert.equal(f.nodes.length, 0)
  assert.equal(f.listeners.size, 0)
  assert.equal(nestedDisposals, 1)
})

test('cleanup may cancel an in-flight replacement with hidePopup', () => {
  const f = fixture()
  let disposed = 0
  f.manager.showPopup(f.anchor, {}, () => f.manager.hidePopup())
  f.manager.showPopup(f.anchor, {}, () => disposed++)
  assert.equal(f.nodes.length, 0)
  assert.equal(disposed, 1)
})

test('ordinary popup replacement still releases the old owner exactly once', async () => {
  const f = fixture()
  let oldDisposed = 0, newDisposed = 0
  const content = {}
  f.manager.showPopup(f.anchor, {}, () => oldDisposed++)
  await Promise.resolve()
  f.manager.showPopup(f.anchor, content, () => newDisposed++)
  await Promise.resolve()
  assert.equal(oldDisposed, 1)
  assert.equal(newDisposed, 0)
  assert.equal(f.nodes.length, 1)
  assert.strictEqual(f.nodes[0].children[0], content)
  assert.equal(f.listeners.size, 1)
  f.manager.destroy()
  assert.equal(newDisposed, 1)
})
