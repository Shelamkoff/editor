import test from 'node:test'
import assert from 'node:assert/strict'
import { getTextLength, getTextOffset, findNodeAtOffset, splitsSurrogateAtOffset } from './textOffset.js'

const text = value => ({ nodeType: 3, textContent: value, childNodes: [] })
function element(tag, children, attrs = {}) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    textContent: children.map(child => child.textContent).join(''),
    attrs,
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


/** Wire only DOM relationships needed by the public logical offset helpers. */
function wire(root) {
  const visit = (node, parent = null) => {
    node.parentNode = parent
    node.parentElement = parent?.nodeType === 1 ? parent : null
    Object.defineProperty(node, 'previousSibling', {
      configurable: true,
      get() {
        const siblings = this.parentNode?.childNodes ?? []
        const at = siblings.indexOf(this)
        return at > 0 ? siblings[at - 1] : null
      },
    })
    node.contains = candidate => {
      for (let cursor = candidate; cursor; cursor = cursor.parentNode) {
        if (cursor === node) return true
      }
      return false
    }
    if (node.nodeType === 1) {
      node.getAttribute = name => node.attrs?.[name] ?? null
      for (const child of node.childNodes) visit(child, node)
    }
  }
  visit(root)
  return root
}

test('native control and locked labels do not shift authored logical UTF-16 positions', () => {
  const authored = text('A')
  const after = text('😀B')
  const button = element('button', [text('native action')])
  const locked = element('span', [text('locked label')], { contenteditable: 'false' })
  const root = wire(element('div', [authored, button, locked, after], { contenteditable: 'true' }))
  assert.equal(getTextLength(root), 4, 'native or locked label inflated authored length')
  assert.equal(getTextOffset(root, after, 0), 1)
  assert.equal(getTextOffset(root, after, 3), 4)
  assert.equal(getTextOffset(root, button.childNodes[0], 4), 1,
    'native button label was interpreted as editable caret text')
  assert.equal(splitsSurrogateAtOffset(root, 2), true)
  const recovered = findNodeAtOffset(root, 2, 'end')
  assert.equal(recovered.node, after, 'logical caret was placed in a native control')
  assert.equal(recovered.offset, 1)
})

test('inline widgets remain atomic while nested independent editing hosts do not add authored length', () => {
  const widget = element('span', [text('inline label')], { 'data-inline-plugin': '' })
  const nestedHost = element('div', [text('separate field')], { contenteditable: 'true' })
  const tail = text('B')
  const root = wire(element('div', [text('A'), widget, nestedHost, tail], { contenteditable: 'true' }))
  assert.equal(getTextLength(root), 3, 'widget or nested host has the wrong logical width')
  assert.equal(getTextOffset(root, tail, 1), 3)
  const next = findNodeAtOffset(root, 2, 'start')
  assert.equal(next.node, tail)
  assert.equal(next.offset, 0)
})
