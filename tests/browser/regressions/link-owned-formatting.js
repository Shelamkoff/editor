import { createLinkTool } from '../../../inline-tools/link.js'
import { createDefaultInlineTools } from '../../../inline-tools/defaults.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { getTextOffset } from '../../../shared/textOffset.js'
import { clickNative, dispatchKey, dragAcross, pointAt } from '../native-input-helpers.js'
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

test('Link excludes nested editing-host line breaks while unlinking an adjacent authored break', () => {
  const h = fixture('alpha<span contenteditable="true"><a href="/nested"><br></a></span>beta')
  try {
    const nested = h.field.querySelector('[contenteditable="true"]')
    const nestedAnchor = nested.querySelector('a'), nestedBreak = nested.querySelector('br')
    const before = h.field.innerHTML
    equal(h.tool.isActive({ range: h.range }), false, 'Nested editing-host BR activated the outer Link tool')
    h.tool.toggle({ range: h.range })
    equal(h.field.innerHTML, before, 'Outer Unlink edited a nested host')
    const author = document.createElement('a'), authorBreak = document.createElement('br')
    author.href = '/author'
    author.append(authorBreak)
    h.field.append(author)
    h.range.selectNodeContents(h.field)
    equal(h.tool.isActive({ range: h.range }), true, 'Adjacent authored BR did not activate Link')
    h.tool.toggle({ range: h.range })
    assert(authorBreak.isConnected && !authorBreak.closest('a'), 'Adjacent authored BR was not unlinked')
    assert(nestedAnchor.isConnected && nestedBreak.parentElement === nestedAnchor, 'Adjacent action changed nested-host ownership')
    equal(nestedAnchor.getAttribute('href'), '/nested')
  } finally { h.dispose() }
})

test('cross-block Link excludes nested editing-host text while unlinking authored text', () => {
  const first = fixture('Alpha<span contenteditable="true"><a href="/nested">Nested</a></span>')
  const last = fixture('Bravo'), shell = document.createElement('div')
  shell.append(first.root, last.root); document.body.append(shell)
  try {
    const nested = first.field.querySelector('[contenteditable="true"]')
    const anchor = nested.firstChild, text = anchor.firstChild, before = shell.innerHTML
    first.range.setStart(first.field.firstChild, 0); first.range.setEnd(last.field.firstChild, 5)
    equal(first.tool.isActive({ range: first.range }), false, 'Nested editing-host Text activated cross-block Link')
    first.tool.toggle({ range: first.range })
    equal(shell.innerHTML, before, 'Cross-block Unlink edited a nested host')
    const author = document.createElement('a')
    author.href = '/author'; author.textContent = ' linked'
    last.field.append(author); first.range.setEnd(author.firstChild, 7)
    equal(first.tool.isActive({ range: first.range }), true, 'Authored adjacent text did not activate Link')
    first.tool.toggle({ range: first.range })
    assert(!last.field.querySelector('a'), 'Cross-block Unlink retained the authored link')
    assert(nested.isConnected && anchor.parentNode === nested && anchor.firstChild === text,
      'Cross-block Unlink changed nested-host nodes')
    equal(anchor.getAttribute('href'), '/nested')
  } finally { first.dispose(); last.dispose(); shell.remove() }
})

test('cross-block Link Apply formats authored text without entering a nested editing host', () => {
  const first = fixture('Alpha<span contenteditable="true"><b>Nested</b> label</span>')
  const last = fixture('Bravo'), shell = document.createElement('div')
  shell.append(first.root, last.root); document.body.append(shell)
  let panel
  try {
    const nested = first.field.querySelector('[contenteditable="true"]')
    const children = [...nested.childNodes], text = nested.firstChild.firstChild, markup = nested.innerHTML
    first.range.setStart(first.field.firstChild, 0); first.range.setEnd(last.field.firstChild, 5)
    const native = window.getSelection(); native.removeAllRanges(); native.addRange(first.range)
    let closed = false
    panel = first.tool.renderActions({
      get range() { return first.range }, mutate: mutation => mutation(first.range),
      close: () => { closed = true }, showTooltip() {}, hideTooltip() {}, backLabel: 'Back',
    })
    assert(panel, 'An unlinked author selection did not open the Link panel')
    document.body.append(panel)
    panel.querySelector('input').value = 'https://example.test/new'
    panel.querySelector('.oe-inline-tool--apply').click()
    assert(closed, 'Successful Apply did not close its panel')
    equal(nested.innerHTML, markup, 'Apply formatted text owned by a nested editing host')
    assert(nested.isConnected && children.every((node, index) => nested.childNodes[index] === node)
      && nested.firstChild.firstChild === text, 'Apply replaced nested-host children')
    equal(first.field.firstChild.outerHTML,
      '<a href="https://example.test/new" rel="noopener noreferrer" target="_blank">Alpha</a>')
    equal(last.field.innerHTML,
      '<a href="https://example.test/new" rel="noopener noreferrer" target="_blank">Bravo</a>')
  } finally {
    window.getSelection().removeAllRanges()
    panel?.remove(); first.dispose(); last.dispose(); shell.remove()
  }
})

for (const content of ['atomic-only', 'mixed', 'partial']) test(`Unlink removes an authored wrapper around a complete atomic widget / ${content}`, () => {
  const h = fixture('alpha<a href="/author">'
    + (content === 'atomic-only' ? '' : '<b>prefix</b>')
    + '<span data-inline-plugin="mention" contenteditable="false"></span>'
    + (content === 'atomic-only' ? '' : ' suffix') + '</a>beta')
  try {
    const widget = h.field.querySelector('[data-inline-plugin]')
    const ownedAnchor = document.createElement('a')
    ownedAnchor.href = '/widget-owned'
    ownedAnchor.textContent = 'Widget'
    widget.append(ownedAnchor)
    const innerText = ownedAnchor.firstChild
    if (content === 'partial') {
      const text = h.field.querySelector('b').firstChild
      h.range.setStart(text, 1); h.range.setEnd(text, 3)
    }
    equal(h.tool.isActive({ range: h.range }), true, 'Complete atomic author content did not activate Link')
    h.tool.toggle({ range: h.range })
    assert(!h.field.querySelector('a[href="/author"]'), 'Authored outer link survived Unlink')
    assert(widget.isConnected && ownedAnchor.parentNode === widget && ownedAnchor.firstChild === innerText,
      'Unlink changed widget-owned DOM')
    equal(ownedAnchor.getAttribute('href'), '/widget-owned')
    equal(h.field.textContent, content === 'atomic-only' ? 'alphaWidgetbeta' : 'alphaprefixWidget suffixbeta')
  } finally { h.dispose() }
})

test('native Unlink preserves a real atomic inline occurrence while removing its authored link', async () => {
  const editor = make([para('a', 'alpha<a href="/author">{{swatch}}</a>beta', {
    inline: { swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } } },
  })], { injectStyles: true, inlinePlugins: [createColorSwatchPlugin()], inlineTools: createDefaultInlineTools({ types: ['link'] }) })
  const field = editableField(editor, 'a'), root = editorRoot(editor)
  const widget = field.querySelector('[data-inline-plugin="color"]'), before = editor.save().blocks
  await pause(60)
  const from = pointAt(field, 10), to = pointAt(field, 0)
  await window.__testInput('Input.drag', {
    from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY },
  })
  await pause(30)
  equal(getTextOffset(field, window.getSelection().anchorNode, window.getSelection().anchorOffset), 10)
  equal(getTextOffset(field, window.getSelection().focusNode, window.getSelection().focusOffset), 0)
  await clickNative(root.querySelector('[data-tool="link"]'))
  equal(editor.save().blocks, [{ ...before[0], data: { text: 'alpha{{swatch}}beta' } }])
  assert(widget.isConnected && field.querySelector('[data-inline-plugin="color"]') === widget,
    'Unlink replaced the real widget occurrence')
  const after = editor.save().blocks
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(editor.save().blocks, after)
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
