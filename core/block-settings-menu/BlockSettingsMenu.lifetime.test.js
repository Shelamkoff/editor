// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { BlockSettingsMenu } from './BlockSettingsMenu.js'

function fixture() {
  const frames = [], calls = []
  const document = { defaultView: {
    innerWidth: 1200, innerHeight: 800, CSS: { highlights: new Map() },
    Highlight: class { constructor(range) { this.range = range } },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length },
    getSelection() { return selection },
  }, addEventListener() {}, removeEventListener() {}, querySelector() { return null } }
  function element(tag = 'div') {
    const listeners = new Map(), attrs = new Map()
    const node = { ownerDocument: document, nodeType: 1, tagName: tag.toUpperCase(),
      children: [], style: {}, dataset: {}, className: '', parentElement: null,
      classList: { add() {}, remove() {} }, innerHTML: '',
      setAttribute(k, v) { attrs.set(k, String(v)) }, getAttribute(k) { return attrs.get(k) ?? null },
      addEventListener(type, cb) { const list = listeners.get(type) ?? []; list.push(cb); listeners.set(type, list) },
      removeEventListener(type, cb) { listeners.set(type, (listeners.get(type) ?? []).filter(x => x !== cb)) },
      appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child },
      append(...children) { children.forEach(child => this.appendChild(child)) },
      remove() { if (this.parentElement) { const a = this.parentElement.children; a.splice(a.indexOf(this), 1) }; this.parentElement = null },
      contains(child) { return child === this || this.children.some(c => c.contains(child)) },
      querySelector() { return null }, querySelectorAll() { return [] }, closest() { return null },
      focus() { calls.push('focus') },
      click() { for (const cb of [...(listeners.get('click') ?? [])]) cb({ target: this, preventDefault() {}, stopPropagation() {} }) },
    }
    let text = ''
    Object.defineProperty(node, 'textContent', {
      get() { return text + this.children.map(c => c.textContent).join('') },
      set(value) { this.children.forEach(c => { c.parentElement = null }); this.children.length = 0; text = value },
    })
    return node
  }
  document.createElement = element
  const selection = { rangeCount: 0, removeAllRanges() { calls.push('restore') }, addRange() {} }
  const root = element(), a = { id: 'a', type: 'paragraph', contentElement: element(), focus() {} }
  let current = a
  const live = new Map([['a', a]])
  const blocks = {
    getCurrentBlock: () => current, getCurrentIndex: () => 0, getBlockCount: () => live.size,
    getBlockByIndex: () => current, getBlockById: id => live.get(id),
    move() { calls.push('move') },
  }
  const settings = element('li'); settings.dataset.action = 'probe'
  const plugin = { type: 'paragraph', title: 'Paragraph', icon: '',
    renderSettings() { return settings }, onSettingsAction() { calls.push('setting') } }
  const menu = new BlockSettingsMenu(root, blocks, {},
    new Map([['paragraph', plugin], ['heading', { type: 'heading', title: 'Heading', icon: '' }]]),
    { t: key => key }, { emit() {} }, { range: null }, {}, 'paragraph',
    block => { calls.push(`duplicate:${block.id}`) },
    { execute(cmd) { calls.push(cmd.name) }, runForBlock(block, fn) { calls.push(`command:${block.id}`); return fn() } })
  const item = name => menu.menuEl.children.find(n => n.textContent === name)
  return { menu, root, document, selection, calls, frames, a, settings, item, plugin,
    select(block) { current = block; live.set(block.id, block) },
    open() { menu.toggle() },
  }
}

for (const name of ['block.duplicate', 'block.delete', 'block.moveDown']) {
  test(`closed settings menu retires retained ${name} handlers`, () => {
    const f = fixture(); f.select({ ...f.a, id: 'b' }); f.open()
    const old = f.item(name)
    assert.ok(old)
    f.menu.close(); old.click()
    assert.deepEqual(f.calls, [])
  })
}

test('closed settings menu retires plugin-provided actions', () => {
  const f = fixture(); f.open(); f.menu.close(); f.settings.click()
  assert.deepEqual(f.calls, [])
})

test('settings menu rejects actions when focus selects another block', () => {
  const f = fixture(); f.open(); const old = f.item('block.duplicate')
  f.select({ ...f.a, id: 'b' }); old.click()
  assert.deepEqual(f.calls, [])
})

test('settings menu rejects a reconstructed block with the same id', () => {
  const f = fixture(); f.open(); const old = f.item('block.duplicate')
  f.select({ ...f.a }); old.click()
  assert.deepEqual(f.calls, [])
})

test('reopening the settings menu leaves previous items inert while live items work', () => {
  const f = fixture(); f.open(); const old = f.item('block.duplicate')
  f.menu.close(); f.open(); old.click()
  assert.deepEqual(f.calls, [])
  f.item('block.duplicate').click()
  assert.deepEqual(f.calls, ['duplicate:a'])
})

test('changing settings views retires previous item callbacks', () => {
  const f = fixture(); f.open(); const old = f.item('block.duplicate')
  f.item('block.convertTo').click(); old.click()
  assert.deepEqual(f.calls, [])
  assert.ok(f.item('block.back'))
})

test('settings menu destruction cancels autofocus and prevents reopening', () => {
  const f = fixture(); f.open(); f.menu.destroy()
  f.frames.splice(0).forEach(fn => fn()); f.menu.toggle()
  f.frames.splice(0).forEach(fn => fn())
  assert.equal(f.menu.isOpen, false)
  assert.deepEqual(f.calls, [])
})

test('settings menu destruction releases highlights without restoring old selection', () => {
  const f = fixture()
  const node = { ownerDocument: f.document, isConnected: true }
  const range = { collapsed: false, startContainer: node, endContainer: node, cloneRange() { return this } }
  f.selection.rangeCount = 1; f.selection.getRangeAt = () => range
  f.open()
  assert.equal(f.document.defaultView.CSS.highlights.has('oe-cross-select'), true)
  f.menu.destroy()
  assert.equal(f.document.defaultView.CSS.highlights.has('oe-cross-select'), false)
  assert.deepEqual(f.calls, [])
})

test('reusing a plugin settings node does not activate its old listeners', () => {
  const f = fixture(); f.open(); f.menu.close(); f.open()
  f.settings.click()
  assert.deepEqual(f.calls, ['command:a', 'setting'])
})

test('the queued focus of a retired opening does not act on the next opening', () => {
  const f = fixture(); f.open(); f.menu.close(); f.open()
  f.frames.shift()()
  assert.deepEqual(f.calls, [])
  f.frames.shift()()
  assert.deepEqual(f.calls, ['focus'])
})

test('a settings renderer that destroys the menu cannot leave newly mounted items', () => {
  const f = fixture(); f.plugin.renderSettings = () => { f.menu.destroy(); return f.settings }
  f.open()
  assert.equal(f.menu.isOpen, false)
  assert.equal(f.menu.menuEl.children.length, 0)
  assert.equal(f.frames.length, 0)
})
