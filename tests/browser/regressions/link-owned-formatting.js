import { createLinkTool } from '../../../inline-tools/link.js'
import { createDefaultInlineTools } from '../../../inline-tools/defaults.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { clickNative, dispatchKey, dragAcross } from '../native-input-helpers.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal } from './harness.js'

function fixture(html) {
  const root = document.createElement('div')
  root.className = 'oe-block'
  const field = document.createElement('div')
  field.contentEditable = 'true'
  field.innerHTML = html
  root.append(field)
  document.body.append(root)
  const range = document.createRange()
  range.selectNodeContents(field)
  const tool = createLinkTool('URL', 'Link')
  tool.bindSelectionPort({ get range() { return range }, capture: () => ({}), restore: () => true })
  return { root, field, range, tool, dispose() { tool.bindSelectionPort(null); root.remove() } }
}

test('Link ignores anchors owned by locked content and native controls', () => {
  const h = fixture('alpha<span contenteditable="false"><a href="/locked">Locked</a></span>'
    + '<button type="button"><a href="/action">Action</a></button>'
    + '<span role="button"><a href="/role">Role</a></span>'
    + '<span data-inline-plugin="mention" contenteditable="false"><a href="/widget">Widget</a></span>beta')
  try {
    const before = h.field.innerHTML
    const anchors = [...h.field.querySelectorAll('a')]
    equal(h.tool.isActive({ range: h.range }), false, 'Protected anchors made authored text appear linked')
    h.tool.toggle({ range: h.range })
    equal(h.field.innerHTML, before, 'Unlink changed protected controls')
    assert(anchors.every(anchor => anchor.isConnected), 'Unlink retired a control-owned anchor')
  } finally { h.dispose() }
})

test('Link unlinks adjacent authored text while retaining native and locked anchors', () => {
  const h = fixture('<a href="/author">alpha</a>'
    + '<span contenteditable="false"><a href="/locked">Locked</a></span>'
    + '<button type="button"><a href="/action">Action</a></button>beta')
  try {
    const locked = h.field.querySelector('[contenteditable="false"] a')
    const action = h.field.querySelector('button a')
    equal(h.tool.isActive({ range: h.range }), true, 'Authored anchor was not detected')
    h.tool.toggle({ range: h.range })
    equal(h.field.textContent, 'alphaLockedActionbeta', 'Unlink changed text')
    assert(h.field.firstChild.nodeType === Node.TEXT_NODE, 'Authored anchor survived Unlink')
    equal(locked.getAttribute('href'), '/locked')
    equal(action.getAttribute('href'), '/action')
    assert(locked.isConnected && action.isConnected, 'Unlink removed a neighboring protected anchor')
  } finally { h.dispose() }
})

test('Unlink preserves a shared hyperlink on protected descendants', () => {
  const h = fixture('<a href="/shared" target="articlePreview" class="article-accent">alpha'
    + '<span contenteditable="false"><i>Locked</i></span>'
    + '<button type="button"><i>Action</i></button>beta</a>')
  try {
    const locked = h.field.querySelector('[contenteditable="false"]')
    const action = h.field.querySelector('button')
    const lockedChild = locked.firstChild, actionChild = action.firstChild
    h.tool.toggle({ range: h.range })
    equal(h.field.textContent, 'alphaLockedActionbeta', 'Unlink changed text')
    assert(h.field.firstChild.nodeType === Node.TEXT_NODE && h.field.lastChild.nodeType === Node.TEXT_NODE,
      'Unlink kept authored text inside the shared hyperlink')
    for (const control of [locked, action]) {
      const anchor = control.closest('a')
      assert(anchor, 'Unlink removed the protected descendant’s hyperlink')
      equal(anchor.getAttribute('href'), '/shared')
      equal(anchor.getAttribute('target'), 'articlePreview')
      equal(anchor.className, 'article-accent')
    }
    equal(locked.firstChild, lockedChild, 'Unlink replaced locked markup')
    equal(action.firstChild, actionChild, 'Unlink replaced native-control markup')
  } finally { h.dispose() }
})

test('Unlink keeps the established whole-link behavior for a partial authored selection', () => {
  const h = fixture('before <a href="/author"><b>alpha</b> beta</a> after')
  try {
    const selected = h.field.querySelector('b').firstChild
    h.range.setStart(selected, 1)
    h.range.setEnd(selected, 3)
    h.tool.toggle({ range: h.range })
    equal(h.field.innerHTML, 'before <b>alpha</b> beta after', 'Ordinary partial unlink changed its established behavior')
  } finally { h.dispose() }
})

test('Unlink preserves authored line breaks alongside protected controls', () => {
  const h = fixture('<a href="/shared">alpha<br><span contenteditable="false">Locked</span><br>beta</a>')
  try {
    const breaks = [...h.field.querySelectorAll('br')]
    const locked = h.field.querySelector('[contenteditable="false"]')
    h.tool.toggle({ range: h.range })
    assert(breaks.every(lineBreak => lineBreak.isConnected && !lineBreak.closest('a')), 'Authored line break stayed linked or was replaced')
    equal(locked.closest('a')?.getAttribute('href'), '/shared', 'Control lost the shared hyperlink')
    equal(h.field.textContent, 'alphaLockedbeta')
  } finally { h.dispose() }
})

test('Link detects and unlinks selected line-break-only author content', () => {
  const h = fixture('alpha<a href="/break"><br></a>beta')
  try {
    const lineBreak = h.field.querySelector('br')
    h.range.selectNode(lineBreak)
    equal(h.tool.isActive({ range: h.range }), true)
    h.tool.toggle({ range: h.range })
    equal(h.field.innerHTML, 'alpha<br>beta')
    assert(lineBreak.isConnected, 'Unlink replaced the authored line break')
  } finally { h.dispose() }
})

function paragraphWithControls() {
  const paragraph = createParagraphPlugin()
  return {
    ...paragraph,
    setup(runtimeContext) {
      const runtime = paragraph.setup(runtimeContext)
      return { ...runtime, create(initial, context) {
        const instance = runtime.create(initial, context)
        const element = context.ownerDocument.createElement('div')
        element.append(instance.element)
        for (const tag of ['span', 'button']) {
          const control = context.ownerDocument.createElement(tag)
          control.dataset.linkControl = tag
          control.contentEditable = 'false'
          if (tag === 'button') control.type = 'button'
          const anchor = context.ownerDocument.createElement('a')
          anchor.href = '/protected-' + tag
          anchor.textContent = 'Protected ' + tag
          control.append(anchor)
          element.append(control)
        }
        return { ...instance, element }
      } }
    },
  }
}

for (const linked of [false, true]) test(`native cross-block Link ${linked ? 'removal' : 'application'} preserves plugin-owned control anchors and history`, async () => {
  const editor = make([
    para('a', linked ? '<a href="/first"><b>Alpha</b></a>' : '<b>Alpha</b>'),
    para('b', linked ? '<a href="/second"><i>Bravo</i></a>' : '<i>Bravo</i>'),
  ], { injectStyles: true, plugins: [paragraphWithControls()], inlineTools: createDefaultInlineTools({ types: ['link'] }) })
  const root = editorRoot(editor), before = editor.save().blocks
  const controls = [...root.querySelectorAll('[data-link-control] a')]
  const controlHtml = controls.map(anchor => anchor.outerHTML)
  await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 5, true)
  const button = root.querySelector('[data-tool="link"]')
  await clickNative(button)
  if (!linked) {
    const input = root.querySelector('.oe-inline-toolbar__link-input')
    assert(input, 'Control-owned links prevented the author Link panel from opening')
    await clickNative(input)
    await window.__testInput('Input.insertText', { text: 'https://example.test/new' })
    await dispatchKey('Enter', 'Enter', 13)
  }
  await pause(30)
  equal(editor.save().blocks.map(block => block.data.text), linked
    ? ['<b>Alpha</b>', '<i>Bravo</i>']
    : ['<b><a href="https://example.test/new" rel="noopener noreferrer" target="_blank">Alpha</a></b>',
      '<i><a href="https://example.test/new" rel="noopener noreferrer" target="_blank">Bravo</a></i>'])
  assert(controls.every(anchor => anchor.isConnected), 'Link action detached a plugin-owned control anchor')
  equal(controls.map(anchor => anchor.outerHTML), controlHtml, 'Link action changed a protected target or label')
  const after = editor.save().blocks
  const native = window.getSelection(), first = editableField(editor, 'a'), last = editableField(editor, 'b')
  equal(getTextOffset(last, native.anchorNode, native.anchorOffset), 5, 'Link changed the backward anchor')
  equal(getTextOffset(first, native.focusNode, native.focusOffset), 0, 'Link changed the backward focus')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'Link was not one undoable action')
  equal(editor.canUndo, false, 'Link produced an extra history entry')
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after, 'Link redo changed the authored result')
  equal([...root.querySelectorAll('[data-link-control] a')].map(anchor => anchor.outerHTML), controlHtml,
    'Link history changed control navigation')
})
