import './html-root-parity.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createMentionPlugin } from '../../inline-plugins/mention/index.js'
import { toTrustedHtml } from '../../shared/sanitize/trustedHtml.js'
import { createParagraphPlugin, createTablePlugin } from '../../plugins/index.js'
import { getTextLength, restoreSelectionByOffsets } from '../../shared/textOffset.js'
import { CLIPBOARD_FRAGMENT_MIME, CLIPBOARD_FRAGMENT_VERSION } from '../../core/ClipboardFragment.js'
import { test, make, para, editableField, editorRoot, select, paste, assert, equal, texts, run } from './regressions/harness.js'
import { dispatchKey, selectAcross, decodeInline } from './native-input-helpers.js'

for (const backwards of [false, true]) {
  test(`physical Ctrl+X cuts the full ${backwards ? 'backward' : 'forward'} cross-block selection`, async () => {
    const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
    const first = editableField(editor, 'a')
    const last = editableField(editor, 'b')
    await selectAcross(editor, first, 2, last, 3, backwards)
    let cuts = 0
    editorRoot(editor).addEventListener('cut', event => { assert(event.isTrusted, 'native cut event was synthesized'); cuts++ }, { once: true })
    await dispatchKey('x', 'KeyX', 88, 2)
    equal(cuts, 1, 'native cut event was not delivered')
    equal(texts(editor), ['Alvo'])
    editor.undo()
    equal(texts(editor), ['Alpha', 'Bravo'])
    equal(editor.canUndo, false)
    editor.redo()
    equal(texts(editor), ['Alvo'])
  })
}

for (const backwards of [false, true]) {
  for (const operation of ['copy', 'cut']) {
    test(`native ${operation}/paste preserves a ${backwards ? 'backward' : 'forward'} fragment between independent editors`, async () => {
      const source = make([para('a', 'Alpha'), para('b', 'Bravo')])
      const destination = make([para('target', '')])
      await selectAcross(source, editableField(source, 'a'), 2, editableField(source, 'b'), 3, backwards)
      let copied = null
      editorRoot(source).addEventListener(operation, event => {
        assert(event.isTrusted, 'clipboard event was synthesized')
        copied = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
      }, { once: true })
      await dispatchKey(operation === 'copy' ? 'c' : 'x', operation === 'copy' ? 'KeyC' : 'KeyX', operation === 'copy' ? 67 : 88, 2)
      assert(copied, 'native clipboard did not receive the private fragment')
      equal(texts(source), operation === 'copy' ? ['Alpha', 'Bravo'] : ['Alvo'])
      const target = editableField(destination, 'target')
      select(target, 0)
      let received = null
      editorRoot(destination).addEventListener('paste', event => {
        assert(event.isTrusted, 'paste event was synthesized')
        received = event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
      }, { once: true })
      await dispatchKey('v', 'KeyV', 86, 2)
      equal(received, copied, 'private MIME did not survive native clipboard transfer')
      equal(texts(destination), ['pha', 'Bra'])
      destination.undo()
      equal(texts(destination), [''])
      equal(destination.canUndo, false, 'native paste was not one history entry')
      destination.redo()
      equal(texts(destination), ['pha', 'Bra'])
      if (operation === 'cut') {
        source.undo()
        equal(texts(source), ['Alpha', 'Bravo'])
        equal(source.canUndo, false, 'native cut was not one history entry')
      }
    })
  }
}

test('native private clipboard carries only the selected atomic widget', async () => {
  const options = () => ({ inlinePlugins: [createColorSwatchPlugin()] })
  const source = make([para('widgets', 'A{{selected}}B{{outside}}C', { inline: {
    selected: { type: 'color', dataVersion: 1, data: { value: '#ff0000' } },
    outside: { type: 'color', dataVersion: 1, data: { value: '#00ff00' } },
  } })], options())
  const destination = make([para('target', '')], options())
  const field = editableField(source, 'widgets')
  field.focus()
  restoreSelectionByOffsets(field, 0, 3)
  let copied = null
  editorRoot(source).addEventListener('copy', event => {
    assert(event.isTrusted, 'widget copy event was synthesized')
    copied = JSON.parse(event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME))
  }, { once: true })
  await dispatchKey('c', 'KeyC', 67, 2)
  assert(copied, 'widget copy did not populate private MIME')
  const values = copied.parts.flatMap(part => Object.values(part.inline ?? {}).map(item => item.data.value))
  equal(values, ['#ff0000'], 'clipboard leaked an unselected widget payload')
  select(editableField(destination, 'target'), 0)
  await dispatchKey('v', 'KeyV', 86, 2)
  equal(decodeInline(destination), ['A#ff0000B'])
  const widget = editorRoot(destination).querySelector('[data-inline-plugin="color"]')
  assert(widget instanceof HTMLElement && widget.contentEditable === 'false', 'pasted widget lost its atomic projection')
  destination.undo()
  equal(texts(destination), [''])
  destination.redo()
  equal(decodeInline(destination), ['A#ff0000B'])
})

test('external multi-paragraph HTML replaces a local selection and is one Undo step', async () => {
  const editor = make([para('a', 'abcDEFghi')])
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, {
    'text/html': '<p>X</p><p>Y</p>',
    'text/plain': 'X\nY',
  })
  equal(texts(editor), ['abcXghi', 'Y'], 'leading paragraph did not replace selected text')
  assert(editor.canUndo, 'HTML paste was not recorded as an authored edit')
  editor.undo()
  equal(texts(editor), ['abcDEFghi'], 'Undo must restore selected author text and remove inserted block')
  equal(editor.canUndo, false, 'the paste created more than one history entry')
  editor.redo()
  equal(texts(editor), ['abcXghi', 'Y'])
})

test('external structural-first HTML does not delete selected paragraph text', async () => {
  const editor = make([para('a', 'abcDEFghi')], {
    plugins: [createParagraphPlugin(), createTablePlugin()],
  })
  const target = editableField(editor, 'a')
  select(target, 3, 6)
  await paste(target, {
    'text/html': '<table><tr><td>Q</td></tr></table>',
    'text/plain': 'Q',
  })
  const blocks = editor.save().blocks
  equal(blocks.length, 2)
  equal(blocks[0].data.text, 'abcDEFghi', 'structural-first HTML erased selected author text')
  equal(blocks[1].type, 'table')
  equal(blocks[1].data.rows[0].cells[0].text, 'Q')
  editor.undo()
  equal(texts(editor), ['abcDEFghi'])
  equal(editor.canUndo, false)
  editor.redo()
  equal(editor.save().blocks[0].data.text, 'abcDEFghi')
  equal(editor.save().blocks[1].type, 'table')
})


test('failed owned Cut preserves both canonical model and native contenteditable text', async () => {
  const paragraph = createParagraphPlugin({ injectStyles: false })
  const failing = Object.freeze({
    ...paragraph,
    type: 'cut-failure',
    capabilities: Object.freeze({
      clipboard: Object.freeze({
        slice() { throw new Error('expected clipboard slice failure') },
      }),
    }),
  })
  const editor = make([{
    id: 'a', type: 'cut-failure', dataVersion: failing.schema.currentVersion,
    data: { text: 'Alpha' },
  }], { plugins: [paragraph, failing] })
  const field = editableField(editor, 'a')
  const before = editor.save().blocks
  select(field, 1, 4)
  let nativeCuts = 0
  editorRoot(editor).addEventListener('cut', event => {
    assert(event.isTrusted, 'Cut rejection was not tested with a native keyboard event')
    nativeCuts++
    assert(event.defaultPrevented, 'Rector failed to cancel destructive native Cut')
  }, { once: true })
  await dispatchKey('x', 'KeyX', 88, 2)
  equal(nativeCuts, 1)
  equal(field.textContent, 'Alpha', 'Browser removed selected text after rejected Cut')
  equal(editor.save().blocks, before, 'Rejected Cut mutated canonical model')
  equal(editor.canUndo, false, 'Rejected Cut created a history entry')
})

test('editor chrome button keeps native clipboard ownership with selected blocks', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')])
  editor.blocks.select(['a'])
  const root = editorRoot(editor)
  const button = document.createElement('button')
  button.textContent = 'Independent auxiliary control'
  root.appendChild(button)
  const before = editor.save().blocks
  try {
    for (const type of ['copy', 'cut', 'paste']) {
      const clipboard = new DataTransfer()
      const event = new ClipboardEvent(type, {
        bubbles: true, cancelable: true, clipboardData: clipboard,
      })
      button.dispatchEvent(event)
      assert(!event.defaultPrevented,
        'editor chrome button lost native ' + type + ' ownership to an old selection')
      equal(clipboard.getData(CLIPBOARD_FRAGMENT_MIME), '',
        'editor exposed selected canonical block data to a toolbar button')
      equal(editor.save().blocks, before)
    }
  } finally {
    button.remove()
    editor.blocks.clearSelection()
  }
})


const externalClipboardFixtures = [
  { name: 'line breaks', text: 'Alpha<br>Bravo', expected: 'Alpha\nBravo' },
  { name: 'terminal authored break without caret padding', text: 'Alpha<br>', expected: 'Alpha\n' },
  { name: 'consecutive authored breaks', text: 'Alpha<br><br>Bravo', expected: 'Alpha\n\nBravo' },
  { name: 'mention label', text: 'A{{who}}B', mention: 'Ada', expected: 'A@AdaB' },
  { name: 'color label', text: 'A{{swatch}}B', color: '#ff0000', expected: 'A#ff0000B' },
  { name: 'visible RGB color', text: 'A{{swatch}}B', color: '#ff0000', expected: 'Argb(255, 0, 0)B',
    prepare(field) { field.querySelector('.oe-ip__label').textContent = 'rgb(255, 0, 0)' } },
  { name: 'escaped visible label', text: 'A{{who}}B', mention: '<b>Ada & Co</b>', expected: 'A@<b>Ada & Co</b>B' },
  { name: 'authored literal beside a widget', text: '{{literal}} A{{who}}B', mention: 'Ada', expected: '{{literal}} A@AdaB' },
]

function clipboardEditor(fixture) {
  const inline = {}
  if (fixture.mention !== undefined) inline.who = { type: 'mention', dataVersion: 1, data: { id: 'ada', name: fixture.mention } }
  if (fixture.color !== undefined) inline.swatch = { type: 'color', dataVersion: 1, data: { value: fixture.color } }
  const editor = make([para('source', fixture.text, { inline })], {
    inlinePlugins: [createMentionPlugin({ injectStyles: false }), createColorSwatchPlugin()],
  })
  const field = editableField(editor, 'source')
  fixture.prepare?.(field)
  return { editor, field }
}

function visibleClipboardText(root) {
  const clone = root.cloneNode(true)
  for (const br of clone.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
  return clone.textContent
}

function inspectStandardClipboard(html, expected) {
  const template = document.createElement('template')
  // Parse the actual output without sanitizing it in the assertion.
  template.innerHTML = toTrustedHtml(html, document)
  const root = template.content
  equal(visibleClipboardText(root), expected, 'Standard HTML changed the selected visible text')
  assert(!root.querySelector('script,style,template,iframe,object,embed,img,svg,math,form,input,textarea,select,option,button'),
    'Active markup or an internal control escaped into the standard clipboard')
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      assert(!/^on/i.test(attribute.name), 'An event handler escaped into the standard clipboard')
      assert(!/^(?:contenteditable|tabindex|role|data-inline-plugin|data-oe-inline-reference)$/i.test(attribute.name),
        'An internal projection attribute escaped into the standard clipboard')
    }
    for (const attribute of ['href', 'src', 'action', 'formaction', 'poster']) {
      if (!element.hasAttribute(attribute)) continue
      const url = new URL(element.getAttribute(attribute), location.href)
      assert(!['javascript:', 'vbscript:', 'data:', 'file:', 'filesystem:'].includes(url.protocol), 'An active URL escaped')
      assert(!url.username && !url.password, 'A credential URL escaped')
    }
  }
  return root
}

async function nativeStandardClipboard(editor, field, expected, { operation = 'copy', start = 0, end = getTextLength(field), backwards = false } = {}) {
  field.focus()
  restoreSelectionByOffsets(field, start, end)
  if (backwards) {
    const selection = window.getSelection()
    selection.setBaseAndExtent(selection.focusNode, selection.focusOffset, selection.anchorNode, selection.anchorOffset)
  }
  let copied = null
  const capture = event => {
    copied = { trusted: event.isTrusted, prevented: event.defaultPrevented,
      text: event.clipboardData.getData('text/plain'), html: event.clipboardData.getData('text/html'),
      fragment: event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME) }
  }
  const root = editorRoot(editor)
  root.addEventListener(operation, capture, { once: true })
  try {
    await dispatchKey(operation === 'copy' ? 'c' : 'x', operation === 'copy' ? 'KeyC' : 'KeyX', operation === 'copy' ? 67 : 88, 2)
  } finally { root.removeEventListener(operation, capture) }
  assert(copied?.trusted && copied.prevented, 'The editor did not own the real native clipboard event')
  equal(copied.text, expected, 'Standard text/plain changed the selected visible text')
  assert(copied.html, 'Standard text/html is missing')
  assert(copied.fragment, 'Private fragment is missing')
  JSON.parse(copied.fragment)
  return { ...copied, parsed: inspectStandardClipboard(copied.html, expected) }
}

for (const operation of ['copy', 'cut']) for (const fixture of externalClipboardFixtures) {
  test(`external standard clipboard ${operation} preserves ${fixture.name}`, async () => {
    const { editor, field } = clipboardEditor(fixture)
    const before = editor.save().blocks
    await nativeStandardClipboard(editor, field, fixture.expected, { operation })
    if (operation === 'copy') {
      equal(editor.save().blocks, before, 'Copy changed the canonical source')
      equal([editor.canUndo, editor.canRedo], [false, false], 'Copy created history')
    } else {
      const after = editor.save().blocks
      equal(texts(editor), [''], 'Cut did not delete exactly the selected source content')
      equal([editor.canUndo, editor.canRedo], [true, false])
      editor.undo()
      equal(editor.save().blocks, before, 'Cut Undo did not restore the source')
      equal(editor.canUndo, false, 'Cut was not one history entry')
      editor.redo()
      equal(editor.save().blocks, after, 'Cut Redo changed the canonical result')
    }
  })
}

for (const backwards of [false, true]) test(`external standard clipboard preserves marks in a ${backwards ? 'backward' : 'forward'} partial selection`, async () => {
  const { editor, field } = clipboardEditor({ text: '<b>XXAlpha</b><i>BravoYY</i>' })
  const before = editor.save().blocks
  const copied = await nativeStandardClipboard(editor, field, 'AlphaBravo', { start: 2, end: 12, backwards })
  equal(copied.parsed.querySelector('b,strong')?.textContent, 'Alpha')
  equal(copied.parsed.querySelector('i,em')?.textContent, 'Bravo')
  equal(editor.save().blocks, before)
  equal([editor.canUndo, editor.canRedo], [false, false])
})

test('external standard clipboard retains enclosing marks and links when pasted into another editing host', async () => {
  const { editor, field } = clipboardEditor({ text: '<a href="https://example.test/story"><b>XXA</b>{{who}}<i>B<br>TailYY</i></a>', mention: 'Ada' })
  const before = editor.save().blocks
  const expected = 'A@AdaB\nTail'
  const copied = await nativeStandardClipboard(editor, field, expected, { start: 2, end: getTextLength(field) - 2 })
  const inspectMarks = root => {
    equal(root.querySelector('a')?.getAttribute('href'), 'https://example.test/story')
    equal(root.querySelector('b,strong')?.textContent, 'A')
    equal(root.querySelector('i,em')?.textContent, 'BTail')
    equal(root.querySelectorAll('br').length, 1)
  }
  inspectMarks(copied.parsed)
  const external = document.createElement('div')
  external.contentEditable = 'true'
  external.style.cssText = 'min-height:50px;white-space:pre-wrap'
  document.body.append(external)
  try {
    let received = null
    external.addEventListener('paste', event => {
      received = { trusted: event.isTrusted, text: event.clipboardData.getData('text/plain'), html: event.clipboardData.getData('text/html') }
    }, { once: true })
    external.focus(); restoreSelectionByOffsets(external, 0, 0)
    await dispatchKey('v', 'KeyV', 86, 2)
    assert(received?.trusted, 'Paste into the independent editing host was not native')
    equal(received.text, expected)
    inspectStandardClipboard(received.html, expected)
    equal(visibleClipboardText(external), expected)
    inspectMarks(external)
    equal(editor.save().blocks, before)
    equal([editor.canUndo, editor.canRedo], [false, false])
  } finally { external.remove() }
})

test('external standard clipboard excludes controls and nested editing hosts between logical endpoints', async () => {
  const { editor, field } = clipboardEditor({ text: 'A{{who}}B', mention: 'Ada' })
  const widget = field.querySelector('[data-inline-plugin]')
  for (const [tag, attributes] of [['button', {}], ['input', {}], ['textarea', {}], ['select', {}], ['span', { role: 'button' }], ['span', { contenteditable: 'true' }], ['span', { contenteditable: 'false' }], ['span', { hidden: '' }]]) {
    const control = document.createElement(tag)
    for (const [key, value] of Object.entries(attributes)) control.setAttribute(key, value)
    control.textContent = 'DO_NOT_EXPORT'
    widget.after(control)
  }
  const button = document.createElement('button'); button.textContent = 'DO_NOT_EXPORT'; widget.append(button)
  const before = editor.save().blocks
  await nativeStandardClipboard(editor, field, 'A@AdaB')
  equal(editor.save().blocks, before)
  equal([editor.canUndo, editor.canRedo], [false, false])
})

for (const kind of ['inert', 'aria-hidden', 'multiline', 'locked-label']) test(`external standard clipboard preserves a visible ${kind} atomic label`, async () => {
  const { editor, field } = clipboardEditor({ text: 'A{{who}}B', mention: 'Ada' })
  const widget = field.querySelector('[data-inline-plugin]'), label = document.createElement('span')
  label.textContent = '@Ada'
  if (kind === 'inert') label.setAttribute('inert', '')
  if (kind === 'aria-hidden') label.setAttribute('aria-hidden', 'true')
  if (kind === 'locked-label') label.contentEditable = 'false'
  if (kind === 'multiline') label.append(document.createElement('br'), document.createTextNode('Byron'))
  widget.replaceChildren(label)
  const before = editor.save().blocks
  await nativeStandardClipboard(editor, field, kind === 'multiline' ? 'A@Ada\nByronB' : 'A@AdaB')
  equal(editor.save().blocks, before)
  equal([editor.canUndo, editor.canRedo], [false, false])
})

function customCssClipboardWidget(kind) {
  const color = createColorSwatchPlugin()
  return Object.freeze({
    ...color,
    type: 'css-clipboard-label',
    setup(runtimeContext) {
      const runtime = color.setup(runtimeContext)
      return {
        ...runtime,
        create(id, initial, context) {
          const instance = runtime.create(id, initial, context)
          const doc = runtimeContext.ownerDocument
          const hidden = doc.createElement('span')
          hidden.className = 'clipboard-hidden-label'
          hidden.textContent = 'INTERNAL'
          if (kind === 'display:none') hidden.style.display = 'none'
          else {
            hidden.style.visibility = 'hidden'
            // Visibility can be restored by a descendant; dropping the whole
            // hidden ancestor would incorrectly discard this visible text.
            const visible = doc.createElement('span')
            visible.className = 'clipboard-visible-child'
            visible.style.visibility = 'visible'
            visible.textContent = 'VISIBLE'
            hidden.append(visible)
          }
          const control = doc.createElement('button')
          control.type = 'button'
          control.textContent = 'CONTROL'
          control.style.display = 'none'
          instance.element.append(hidden, control)
          return instance
        },
      }
    },
  })
}

async function captureNativeClipboard(element, operation) {
  let observed = null
  const capture = event => {
    observed = { trusted: event.isTrusted, prevented: event.defaultPrevented,
      text: event.clipboardData.getData('text/plain'), html: event.clipboardData.getData('text/html'),
      fragment: event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME) }
  }
  const [key, code, keyCode] = operation === 'copy' ? ['c', 'KeyC', 67]
    : operation === 'cut' ? ['x', 'KeyX', 88] : ['v', 'KeyV', 86]
  element.addEventListener(operation, capture, { once: true })
  try { await dispatchKey(key, code, keyCode, 2) }
  finally { element.removeEventListener(operation, capture) }
  assert(observed?.trusted, `The ${operation} control did not receive a trusted native clipboard event`)
  return observed
}

function selectNativeHostContents(element) {
  element.focus()
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  const selection = element.ownerDocument.defaultView.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

for (const kind of ['display:none', 'visibility:hidden']) for (const operation of ['copy', 'cut']) {
  const description = kind === 'display:none' ? 'display:none descendants'
    : 'visibility:hidden text while preserving visible descendants'
  test(`custom widget clipboard ${operation} excludes ${description}`, async () => {
    const expected = kind === 'display:none' ? 'A#ff0000B' : 'A#ff0000VISIBLEB'
    const editor = make([para('source', 'A{{badge}}B', { inline: {
      badge: { type: 'css-clipboard-label', dataVersion: 1, data: { value: '#ff0000' } },
    } })], { inlinePlugins: [customCssClipboardWidget(kind)] })
    const field = editableField(editor, 'source')
    const before = editor.save().blocks
    const control = document.createElement('div'), receiver = document.createElement('div')
    for (const host of [control, receiver]) {
      host.contentEditable = 'true'
      host.style.cssText = 'display:block;min-height:24px;white-space:pre-wrap'
      document.body.append(host)
    }
    control.append(...[...field.childNodes].map(node => node.cloneNode(true)))
    const diagnostics = { kind, operation, expected }
    try {
      const state = host => {
        const hidden = host.querySelector('.clipboard-hidden-label')
        const visible = host.querySelector('.clipboard-visible-child')
        return { visibleText: host.innerText, html: host.innerHTML,
          connected: host.isConnected, width: host.getBoundingClientRect().width,
          hidden: { display: getComputedStyle(hidden).display, visibility: getComputedStyle(hidden).visibility },
          visibleChild: visible ? { visibility: getComputedStyle(visible).visibility, text: visible.textContent } : null,
          controlDisplay: getComputedStyle(host.querySelector('button')).display }
      }
      diagnostics.source = state(field)
      diagnostics.controlBefore = state(control)
      for (const observed of [diagnostics.source, diagnostics.controlBefore]) {
        assert(observed.connected && observed.width > 0, 'CSS clipboard visibility control is not rendered')
        equal(observed.visibleText, expected, 'CSS clipboard source visibility setup differs from the intended label')
        equal(observed.controlDisplay, 'none')
        if (kind === 'display:none') equal(observed.hidden.display, 'none')
        else {
          equal(observed.hidden.visibility, 'hidden')
          equal(observed.visibleChild, { visibility: 'visible', text: 'VISIBLE' })
        }
      }
      selectNativeHostContents(control)
      diagnostics.controlCopy = await captureNativeClipboard(control, operation)
      assert(!diagnostics.controlCopy.prevented, 'The independent clipboard control was intercepted')
      selectNativeHostContents(receiver)
      diagnostics.controlPaste = await captureNativeClipboard(receiver, 'paste')
      diagnostics.controlPastedHtml = receiver.innerHTML
      diagnostics.controlPastedVisibleText = receiver.innerText
      assert(!diagnostics.controlPaste.prevented, 'The independent native paste was intercepted')
      equal(diagnostics.controlPaste.text, expected, 'Native browser clipboard control did not preserve the visible label')
      equal(diagnostics.controlPastedVisibleText, expected, 'Native browser paste control changed visible text')
      equal(diagnostics.controlPaste.fragment, '', 'The independent control acquired editor private MIME')
      equal(editor.save().blocks, before, 'Independent clipboard control changed the source editor')
      equal([editor.canUndo, editor.canRedo], [false, false])

      receiver.replaceChildren()
      field.focus()
      equal(getTextLength(field), 3, 'The custom widget is not one atomic parent-field unit')
      restoreSelectionByOffsets(field, 0, getTextLength(field))
      diagnostics.copied = await captureNativeClipboard(editorRoot(editor), operation)
      assert(diagnostics.copied.prevented, 'The editor did not own the native clipboard event')
      equal(JSON.parse(diagnostics.copied.fragment), { version: CLIPBOARD_FRAGMENT_VERSION,
        parts: [{ kind: 'rich-text', html: before[0].data.text, inline: before[0].inline }] },
      'Custom widget clipboard changed the canonical private fragment')
      selectNativeHostContents(receiver)
      diagnostics.pasted = await captureNativeClipboard(receiver, 'paste')
      diagnostics.pastedHtml = receiver.innerHTML
      diagnostics.pastedVisibleText = receiver.innerText
      assert(!diagnostics.pasted.prevented, 'The external native paste was intercepted')
      equal(diagnostics.pasted.fragment, diagnostics.copied.fragment, 'Private MIME changed during native clipboard transport')
      const after = editor.save().blocks
      diagnostics.after = { blocks: after, canUndo: editor.canUndo, canRedo: editor.canRedo }
      if (operation === 'copy') {
        equal(after, before, 'Custom widget Copy changed canonical source data')
        equal([editor.canUndo, editor.canRedo], [false, false])
      } else {
        equal(after.length, 1)
        equal(after[0].data.text, '', 'Custom widget Cut left selected author text')
        equal(Object.keys(after[0].inline ?? {}), [], 'Custom widget Cut retained selected inline data')
        equal([editor.canUndo, editor.canRedo], [true, false])
        editor.undo()
        equal(editor.save().blocks, before, 'Custom widget Cut Undo changed the original payload')
        equal(editor.canUndo, false, 'Custom widget Cut was not one history entry')
        editor.redo()
        equal(editor.save().blocks, after, 'Custom widget Cut Redo changed its canonical result')
      }
      // Inspect both the captured export and the real browser transport only
      // after recording controls and validating the unchanged private contract.
      equal(diagnostics.copied.text, expected, 'Custom widget standard text/plain exposed CSS-hidden text')
      inspectStandardClipboard(diagnostics.copied.html, expected)
      equal(diagnostics.pasted.text, expected, 'Custom widget native clipboard transport exposed CSS-hidden text')
      equal(diagnostics.pastedVisibleText, expected, 'Custom widget external paste exposed CSS-hidden text')
    } catch (error) {
      diagnostics.failureStack = error?.stack ?? String(error)
      throw new Error(`${error?.message ?? String(error)}\nCustom widget clipboard diagnostics: ${JSON.stringify(diagnostics)}`, { cause: error })
    } finally { control.remove(); receiver.remove() }
  })
}

await run()
