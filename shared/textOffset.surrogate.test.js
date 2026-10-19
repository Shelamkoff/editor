import test from 'node:test'
import assert from 'node:assert/strict'
import { splitsSurrogateAtOffset } from './textOffset.js'

const text = value => ({ nodeType: 3, textContent: value, childNodes: [] })
function element(tag, children, attrs = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    textContent: children.map(child => child.textContent).join(''),
    hasAttribute(name) { return Object.hasOwn(attrs, name) },
  }
}

test('logical UTF-16 checks reject only the interior of a Unicode surrogate pair', () => {
  const root = element('div', [text('A😀B')])
  assert.equal(splitsSurrogateAtOffset(root, 2), true)
  for (const offset of [-1, 0, 1, 3, 4, 5]) {
    assert.equal(splitsSurrogateAtOffset(root, offset), false, String(offset))
  }
})

test('pair boundaries remain invalid when its UTF-16 units occupy different text nodes', () => {
  const high = text('A\uD83D')
  const low = text('\uDE00B')
  const root = element('div', [high, text(''), low])
  assert.equal(splitsSurrogateAtOffset(root, 2), true)
  assert.equal(splitsSurrogateAtOffset(root, 1), false)
  assert.equal(splitsSurrogateAtOffset(root, 3), false)
})

test('wrappers do not legitimize a logical split, but atomic boundaries do', () => {
  const styled = element('div', [
    element('b', [text('A\uD83D')]),
    element('i', [text('\uDE00B')]),
  ])
  assert.equal(splitsSurrogateAtOffset(styled, 2), true)

  const br = element('div', [text('A\uD83D'), element('br', []), text('\uDE00B')])
  assert.equal(splitsSurrogateAtOffset(br, 2), false)
  assert.equal(splitsSurrogateAtOffset(br, 3), false)

  const widget = element('div', [
    text('A\uD83D'),
    element('span', [text('widget label')], { 'data-inline-plugin': '' }),
    text('\uDE00B'),
  ])
  assert.equal(splitsSurrogateAtOffset(widget, 2), false)
  assert.equal(splitsSurrogateAtOffset(widget, 3), false)
})
