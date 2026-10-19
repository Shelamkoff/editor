import test from 'node:test'
import assert from 'node:assert/strict'
import { handleMenuKeydown } from './menuKeyboardNav.js'

function menuFixture(entries = ['first', 'second', 'third']) {
  const ownerDocument = { activeElement: null }
  const items = entries.map(entry => {
    const value = typeof entry === 'string' ? { id: entry } : entry
    return {
      ...value,
      focus() { ownerDocument.activeElement = this },
    }
  })
  const menu = {
    ownerDocument,
    querySelectorAll(selector) {
      // Model the two standard CSS disabled filters used by a menu's public
      // selector. Custom selectors remain the caller's own filtering policy.
      return items.filter(item => !(
        (selector.includes(':not(:disabled)') && item.disabled)
        || (selector.includes('[aria-disabled="true"]') && item.ariaDisabled)
      ))
    },
  }
  const event = key => ({
    key,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true },
    stopPropagation() { this.stopped = true },
  })
  return { menu, ownerDocument, items, event }
}

test('Home and End fully consume menu keys instead of bubbling into editor shortcuts', () => {
  const h = menuFixture()
  h.ownerDocument.activeElement = h.items[1]
  for (const [key, target] of [['Home', h.items[0]], ['End', h.items[2]]]) {
    const event = h.event(key)
    assert.equal(handleMenuKeydown(event, h.menu, { onEscape() {} }), true)
    assert.equal(event.prevented, true, key + ' was not owned by the menu')
    assert.equal(event.stopped, true,
      key + ' bubbled to the parent editor after menu navigation handled it')
    assert.equal(h.ownerDocument.activeElement, target)
  }
})

test('Arrow navigation wraps only through selectable menu items', () => {
  const h = menuFixture(['first', 'second', 'third'])
  h.ownerDocument.activeElement = h.items[2]
  let event = h.event('ArrowDown')
  assert.equal(handleMenuKeydown(event, h.menu, { onEscape() {} }), true)
  assert.equal(h.ownerDocument.activeElement, h.items[0])
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
  event = h.event('ArrowUp')
  assert.equal(handleMenuKeydown(event, h.menu, { onEscape() {} }), true)
  assert.equal(h.ownerDocument.activeElement, h.items[2])
})

test('default menu navigation skips disabled native and ARIA menu items', () => {
  const h = menuFixture([
    { id: 'native-disabled', disabled: true },
    { id: 'aria-disabled', ariaDisabled: true },
    { id: 'enabled' },
  ])
  const event = h.event('ArrowDown')
  assert.equal(handleMenuKeydown(event, h.menu, { onEscape() {} }), true)
  assert.equal(h.ownerDocument.activeElement, h.items[2],
    'menu navigation landed on a disabled native button instead of an enabled action')
})

test('Escape closes an empty menu without claiming unhandled keys', () => {
  const h = menuFixture([])
  let closed = 0
  const escape = h.event('Escape')
  assert.equal(handleMenuKeydown(escape, h.menu, { onEscape() { closed++ } }), true)
  assert.equal(escape.prevented, true)
  assert.equal(escape.stopped, true)
  assert.equal(closed, 1)
  const other = h.event('x')
  assert.equal(handleMenuKeydown(other, h.menu, { onEscape() { closed++ } }), false)
  assert.equal(other.prevented, false)
  assert.equal(other.stopped, false)
  assert.equal(closed, 1)
})
