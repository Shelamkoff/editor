import test from 'node:test'
import assert from 'node:assert/strict'
import { getTextLength, getTextOffset, findNodeAtOffset, splitsSurrogateAtOffset, editableTextWalker, firstTextNode, lastTextNode } from './textOffset.js'

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


/** Minimal TreeWalker honoring the returned accept/reject contract. */
function withTextWalker(root) {
  const document = {
    defaultView: { NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 } },
    createTreeWalker(walkRoot, _mask, filter) {
      const leaves = []
      const collect = node => {
        if (node.nodeType === 3) leaves.push(node)
        else for (const child of node.childNodes) collect(child)
      }
      collect(walkRoot)
      let cursor = 0
      return {
        currentNode: walkRoot,
        nextNode() {
          while (cursor < leaves.length) {
            const candidate = leaves[cursor++]
            if (filter.acceptNode(candidate) === 1) {
              this.currentNode = candidate
              return candidate
            }
          }
          return null
        },
      }
    },
  }
  const visit = node => {
    node.ownerDocument = document
    if (node.nodeType === 1) {
      node.closest = selector => {
        for (let current = node; current; current = current.parentElement) {
          if (selector === '[data-inline-plugin]' && current.hasAttribute('data-inline-plugin')) return current
          if (selector === '[contenteditable]' && current.hasAttribute('contenteditable')) return current
        }
        return null
      }
      for (const child of node.childNodes) visit(child)
    }
  }
  visit(root)
  return root
}

test('editable text walking and first/last text skip native controls and nested editing hosts', () => {
  const prefix = text('A')
  const suffix = text('B')
  const root = withTextWalker(wire(element('div', [
    element('button', [text('native')]),
    element('span', [text('locked')], { contenteditable: 'false' }),
    prefix,
    element('span', [text('inline widget')], { 'data-inline-plugin': '' }),
    element('div', [text('other field')], { contenteditable: 'true' }),
    suffix,
  ], { contenteditable: 'true' })))
  const walker = editableTextWalker(root)
  const results = []
  while (walker.nextNode()) results.push(walker.currentNode.textContent)
  assert.deepEqual(results, ['A', 'B'])
  assert.equal(firstTextNode(root), prefix)
  assert.equal(lastTextNode(root), suffix)
})

test('cross-block walker reaches true fields through false plugin shells, excluding control labels', () => {
  const left = text('Alpha')
  const right = text('Bravo')
  const root = withTextWalker(wire(element('div', [
    element('section', [
      element('button', [text('settings')]),
      element('div', [left], { contenteditable: 'true' }),
      element('span', [text('locked')], { contenteditable: 'false' }),
    ], { contenteditable: 'false' }),
    element('div', [right], { contenteditable: 'true' }),
  ])))
  const walker = editableTextWalker(root)
  const selected = []
  while (walker.nextNode()) selected.push(walker.currentNode.textContent)
  assert.deepEqual(selected, ['Alpha', 'Bravo'])
})

test('cross-block text walker excludes unowned editor chrome outside explicit editing hosts', () => {
  const lead = text('Editor title')
  const divider = text('Insert block')
  const footer = text('Status: saved')
  const a = text('Alpha')
  const b = text('Bravo')
  const root = withTextWalker(wire(element('main', [
    element('div', [lead], { class: 'toolbar-title' }),
    element('div', [a], { contenteditable: 'true' }),
    divider,
    element('span', [text('List item actions')], { class: 'block-label' }),
    element('section', [
      element('div', [b], { contenteditable: 'true' }),
    ], { contenteditable: 'false' }),
    element('div', [footer], { class: 'editor-footer' }),
  ])))
  const walker = editableTextWalker(root)
  const selected = []
  while (walker.nextNode()) selected.push(walker.currentNode.textContent)
  assert.deepEqual(selected, ['Alpha', 'Bravo'],
    'Unowned static editor chrome was exposed as authored text during cross-block traversal')
  assert.equal(firstTextNode(root), a)
  assert.equal(lastTextNode(root), b)
})

test('text walker inside a formatting span keeps its owning editable field', () => {
  const fragment = text('café')
  const span = element('b', [fragment])
  const root = withTextWalker(wire(element('div', [span], { contenteditable: 'true' })))
  const walker = editableTextWalker(span)
  assert.equal(walker.nextNode(), fragment)
  assert.equal(walker.nextNode(), null)
  assert.equal(getTextLength(root), 4)
})


test('an opaque unloaded inline reference is atomic while an unowned literal remains text', () => {
  const first = text('A')
  const last = text('😀B')
  const inert = element('span', [text('{{opaque-1}}')], {
    'data-inline-plugin': '__unregistered__',
    'data-oe-opaque-inline': 'opaque-1',
    contenteditable: 'false',
  })
  const field = wire(element('div', [first, inert, last], { contenteditable: 'true' }))
  assert.equal(getTextLength(field), 5,
    'The visible token label is not twelve authored caret positions')
  assert.equal(getTextOffset(field, last, 0), 2,
    'The caret after an opaque reference has the wrong logical offset')
  const point = findNodeAtOffset(field, 2, 'start')
  assert.equal(point.node, last)
  assert.equal(point.offset, 0)
  assert.equal(splitsSurrogateAtOffset(field, 3), true)
  assert.equal(splitsSurrogateAtOffset(field, 4), false)

  const author = wire(element('div', [text('A{{opaque-1}}B')], {
    contenteditable: 'true',
  }))
  assert.equal(getTextLength(author), 14,
    'A token-shaped author literal without a sidecar was made atomic')
})
