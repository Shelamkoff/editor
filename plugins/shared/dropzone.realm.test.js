// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'

import { renderDropzone } from './dropzone.js'

test('dropzone builds its DOM in the wrapper owning document', () => {
  const created = []
  const makeNode = (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    innerHTML: '',
    textContent: '',
    children: [],
    append(...nodes) { this.children.push(...nodes) },
    appendChild(node) { this.children.push(node); return node },
    addEventListener() {},
    insertAdjacentHTML() {},
    classList: { add() {}, remove() {} },
  })
  const ownerDocument = {
    createElement(tag) {
      created.push(['element', tag])
      return makeNode(tag)
    },
    createTextNode(text) {
      created.push(['text', text])
      return { textContent: text }
    },
  }
  const wrapper = makeNode('div')
  wrapper.ownerDocument = ownerDocument

  const previousDocument = globalThis.document
  globalThis.document = new Proxy({}, { get() { throw new Error('ambient document must not be used') } })
  try {
    renderDropzone(wrapper, {}, {
      select: 'select',
      selectIcon: 'icon',
      selectText: 'text',
      selectLink: 'link',
      dropzoneActive: 'active',
      filled: 'filled',
    }, {
      iconHtml: '<svg></svg>',
      uploadText: 'Upload',
      afterText: 'files',
      onUploadClick() {},
      onDrop() {},
      readOnly: true,
      emptyText: 'Empty',
    })
  } finally {
    globalThis.document = previousDocument
  }

  assert.deepEqual(created.map(entry => entry[1]), ['div', 'div', 'div'])
  assert.equal(wrapper.children.length, 1)
  assert.equal(wrapper.children[0].children[1].textContent, 'Empty')
})
