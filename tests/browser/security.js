import { createEditor } from '../../core/index.js'
import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import {
  createHeadingPlugin,
  createParagraphPlugin,
  createRawPlugin,
} from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { sanitizeHtml, sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/index.js'
import { normalizeRichText } from '../../shared/richTextCodec.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertNoActiveMarkup(root, label) {
  assert(!root.querySelector('script, iframe, object, embed, form, meta, link, base'), `${label} kept an active element`)
  assert(![...root.querySelectorAll('*')].some(element => [...element.attributes].some(attr => attr.name.startsWith('on'))), `${label} kept an event handler`)
}

function editorRoot(holder) {
  const root = holder.querySelector('.oe-editor')
  assert(root instanceof HTMLElement, 'editor root is missing')
  return root
}

function blockElement(holder, id) {
  const block = [...editorRoot(holder).querySelectorAll('.oe-block')]
    .find(element => element.dataset.blockId === id)
  assert(block instanceof HTMLElement, `block ${id} is missing`)
  return block
}

function editable(holder, id) {
  const block = blockElement(holder, id)
  if (block.matches('[contenteditable="true"]')) return block
  const field = block.querySelector('[contenteditable="true"]')
  assert(field instanceof HTMLElement, `editable field for ${id} is missing`)
  return field
}

function createHolder(sandbox) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  return holder
}

function createFailingDefinition() {
  const schema = Object.freeze({
    currentVersion: 1,
    legacyVersion: 1,
    createDefault: () => ({ text: '' }),
    decode(input) {
      if (typeof input.data?.text !== 'string') throw new TypeError('text required')
      return { dataVersion: 1, data: { text: input.data.text } }
    },
    encode(data) {
      if (typeof data?.text !== 'string') throw new TypeError('text required')
      return { dataVersion: 1, data: { text: data.text } }
    },
    mapRichText(data, transform) {
      return { text: transform(data.text, 'text') }
    },
  })
  return Object.freeze({
    type: 'transactional',
    label: Object.freeze({ key: 'title', fallback: 'Transactional' }),
    icon: '',
    schema,
    setup() {
      let destroyed = false
      return {
        create(initial, context) {
          if (destroyed) throw new Error('runtime destroyed')
          if (initial.text === 'Broken') throw new Error('intentional projection failure')
          const element = context.ownerDocument.createElement('p')
          element.contentEditable = context.isReadOnly() ? 'false' : 'true'
          element.textContent = initial.text
          let data = { ...initial }
          let dead = false
          return {
            element,
            read: () => ({ text: element.textContent ?? '' }),
            update(next) {
              if (dead) return
              data = { ...next }
              element.textContent = data.text
            },
            editableFields: () => Object.freeze([
              Object.freeze({ key: 'text', element, mode: 'rich-text' }),
            ]),
            setReadOnly(value) { element.contentEditable = value ? 'false' : 'true' },
            focus() { element.focus() },
            destroy() { dead = true },
          }
        },
        destroy() { destroyed = true },
      }
    },
  })
}

async function run() {
  const sandbox = document.querySelector('#sandbox')
  window.__editorSecurityProbe = 0

  const unsafeInline = '<b>safe</b><img src=x onerror="window.__editorSecurityProbe++"><script>window.__editorSecurityProbe++</script><a href="java\nscript:alert(1)" onclick="window.__editorSecurityProbe++">link</a><span style="color:red;background-image:url(javascript:alert(1))">styled</span>'
  const sanitized = sanitizeHtml(unsafeInline)
  const sanitizedHost = document.createElement('div')
  sanitizedHost.innerHTML = sanitized
  sandbox.appendChild(sanitizedHost)
  assertNoActiveMarkup(sanitizedHost, 'inline sanitizer')
  assert(sanitizedHost.querySelector('a')?.getAttribute('href') === '#', 'inline sanitizer kept a dangerous URL')
  assert(!sanitized.includes('background-image'), 'inline sanitizer kept a dangerous CSS property')
  assert(window.__editorSecurityProbe === 0, 'inline sanitizer executed an inert payload')

  const normalizedRichText = normalizeRichText(
    '<strong>one</strong><b>two</b><em>three</em><i>four</i><strike>five</strike><s>six</s><span style="font-size: 12px; color: red; background-image:url(javascript:alert(1))">styled</span><script>bad()</script>',
    document,
  )
  assert(
    normalizedRichText === '<b>onetwo</b><i>threefour</i><s>fivesix</s><span style="color: red; font-size: 12px;">styled</span>bad()',
    `rich-text canonicalization is unstable: ${normalizedRichText}`,
  )
  assert(normalizeRichText(normalizedRichText, document) === normalizedRichText, 'rich-text canonicalization is not idempotent')
  const crossRealmRichText = document.implementation.createHTMLDocument('rich-text-realm')
  assert(normalizeRichText('<strong>realm</strong>', crossRealmRichText) === '<b>realm</b>', 'rich-text normalization ignored ownerDocument')

  const paragraph = createParagraphPlugin({ injectStyles: false })
  const canonicalHolder = createHolder(sandbox)
  const canonicalEditor = createEditor({
    holder: canonicalHolder,
    plugins: [paragraph],
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [{ id: 'canonical-save', type: 'paragraph', data: { text: '' } }],
    },
  })
  const canonicalField = editable(canonicalHolder, 'canonical-save')
  canonicalField.innerHTML = '<strong>one</strong><b>two</b><em>three</em><i>four</i><span style="font-size: 12px; color: red">styled</span>'
  canonicalField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  const canonicalSaved = canonicalEditor.save().blocks[0]
  assert(
    canonicalSaved.data.text === '<b>onetwo</b><i>threefour</i><span style="color: red; font-size: 12px;">styled</span>',
    `native input did not enter canonical rich text: ${canonicalSaved.data.text}`,
  )
  assert(canonicalSaved.dataVersion === paragraph.schema.currentVersion, 'canonical input lost dataVersion')
  const publicSnapshot = canonicalEditor.blocks.get('canonical-save')
  assert(publicSnapshot && !('element' in publicSnapshot) && !('contentElement' in publicSnapshot) && !('plugin' in publicSnapshot), 'mutable Block DOM leaked through public API')
  canonicalEditor.destroy()
  canonicalHolder.remove()

  const previousBoldAllowlist = Object.getOwnPropertyDescriptor(Object.prototype, 'b')
  Object.defineProperty(Object.prototype, 'b', { configurable: true, value: new Set(['onclick']) })
  try {
    const polluted = sanitizeHtml('<b onclick="window.__editorSecurityProbe++">prototype-safe</b>')
    assert(!/onclick/i.test(polluted), 'sanitizer trusted inherited allowlist entries')
  } finally {
    if (previousBoldAllowlist) Object.defineProperty(Object.prototype, 'b', previousBoldAllowlist)
    else delete Object.prototype.b
  }

  const rawHost = document.createElement('div')
  const unsafeRaw = `<section>
    <img src="data:image/svg+xml,<svg onload=alert(1)>" srcset="javascript:alert(1) 1x, ${pixel} 2x" onerror="window.__editorSecurityProbe++">
    <img id="safe-srcset" srcset="/safe.png 1x" alt="safe raster">
    <script>window.__editorSecurityProbe++</script>
    <a href="javascript:alert(1)">raw</a>
    <div id="unsafe-style" style="color:red;width:10px;background-image:url(javascript:alert(1))">unsafe style</div>
    <div id="safe-style" style="background-image:url('${pixel}');width:12px">safe style</div>
  </section>`
  setSanitizedRawHtml(rawHost, unsafeRaw)
  sandbox.appendChild(rawHost)
  assertNoActiveMarkup(rawHost, 'Raw sanitizer')
  assert(!rawHost.querySelector('a')?.hasAttribute('href'), 'Raw sanitizer kept a dangerous URL')
  const rawImage = rawHost.querySelector('img')
  assert(!rawImage?.hasAttribute('src'), 'Raw sanitizer kept active SVG media')
  assert(!/javascript|svg\+xml/i.test(rawImage?.getAttribute('srcset') || ''), 'Raw sanitizer kept an unsafe srcset')
  assert((rawHost.querySelector('#safe-srcset')?.getAttribute('srcset') || '').includes('/safe.png'), 'Raw sanitizer removed safe srcset')
  assert(!rawHost.querySelector('#unsafe-style')?.style.backgroundImage, 'Raw sanitizer kept unsafe CSS URL')
  assert(!/javascript|svg\+xml/i.test(sanitizeRawHtml(unsafeRaw)), 'string Raw sanitizer kept active URL')
  assert(window.__editorSecurityProbe === 0, 'Raw sanitizer executed an inert payload')

  const rawDefinition = createRawPlugin({ injectStyles: false })
  const rawHolder = createHolder(sandbox)
  const rawEditor = createEditor({
    holder: rawHolder,
    plugins: [rawDefinition],
    defaultBlock: 'raw',
    injectStyles: false,
    readOnly: true,
    data: oneBlock('raw', { html: unsafeRaw }, 'raw-preview'),
  })
  const rawFrame = rawHolder.querySelector('.oe-raw__preview iframe')
  assert(rawFrame instanceof HTMLIFrameElement, 'read-only Raw did not create its preview')
  assert(!/script|javascript|svg\+xml/i.test(rawFrame.srcdoc), 'Raw preview bypassed sanitizer')
  const rawToggle = rawHolder.querySelector('.oe-raw__toggle')
  assert(rawToggle instanceof HTMLButtonElement && rawToggle.hidden && rawToggle.disabled, 'read-only Raw exposed editing toggle')
  rawEditor.destroy()
  rawHolder.remove()

  const forgedHolder = createHolder(sandbox)
  const forgedEditor = createEditor({
    holder: forgedHolder,
    plugins: [createParagraphPlugin({ injectStyles: false })],
    inlinePlugins: [createColorSwatchPlugin()],
    injectStyles: false,
    data: {
      version: '2.0.0',
      blocks: [{
        id: 'forged',
        type: 'paragraph',
        data: { text: 'Owned {{owned}}' },
        inline: { owned: { type: 'color', data: { value: '#123456' } } },
      }],
    },
  })
  const forgedField = editable(forgedHolder, 'forged')
  const fake = document.createElement('span')
  fake.dataset.inlinePlugin = 'color'
  fake.dataset.id = 'forged-widget'
  fake.textContent = 'FORGED'
  forgedField.append(' ', fake)
  forgedField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  const forgedSaved = forgedEditor.save().blocks[0]
  assert(!Object.hasOwn(forgedSaved.inline ?? {}, 'forged-widget'), 'forged inline DOM became canonical widget data')
  assert(Object.hasOwn(forgedSaved.inline ?? {}, 'owned'), 'owned widget was lost while rejecting forged DOM')
  forgedEditor.destroy()
  forgedHolder.remove()

  const unknownInlineHolder = createHolder(sandbox)
  const unknownInlineEditor = createEditor({
    holder: unknownInlineHolder,
    plugins: [createParagraphPlugin({ injectStyles: false })],
    injectStyles: false,
    validationMode: 'preserve',
    data: {
      version: '2.0.0',
      blocks: [{
        id: 'unknown-inline',
        type: 'paragraph',
        data: { text: 'Before {{future}} after' },
        inline: { future: { type: 'future-widget', dataVersion: 9, data: { html: '<img onerror=bad()>' } } },
      }],
    },
  })
  assert(!unknownInlineHolder.querySelector('[data-inline-plugin="future-widget"]'), 'unknown inline payload executed')
  assert(unknownInlineEditor.save().blocks[0].inline.future.type === 'future-widget', 'unknown inline payload was not preserved')
  unknownInlineEditor.destroy()
  unknownInlineHolder.remove()

  const colorDefinition = createColorSwatchPlugin()
  const futureInlineHolder = createHolder(sandbox)
  const futureInlineEditor = createEditor({
    holder: futureInlineHolder,
    plugins: [createParagraphPlugin({ injectStyles: false })],
    inlinePlugins: [colorDefinition],
    injectStyles: false,
    validationMode: 'preserve',
    data: {
      version: '2.0.0',
      blocks: [{
        id: 'future-inline',
        type: 'paragraph',
        data: { text: 'Future {{future}}' },
        inline: {
          future: {
            type: 'color',
            dataVersion: colorDefinition.schema.currentVersion + 1,
            data: { value: '#123456' },
          },
        },
      }],
    },
  })
  assert(!futureInlineHolder.querySelector('[data-inline-plugin="color"]'), 'future registered inline payload was activated')
  assert(futureInlineEditor.save().blocks[0].inline.future.dataVersion === colorDefinition.schema.currentVersion + 1, 'future inline payload was rewritten')
  futureInlineEditor.destroy()
  futureInlineHolder.remove()

  const strictFutureInlineHolder = createHolder(sandbox)
  let strictFutureInlineRejected = false
  try {
    createEditor({
      holder: strictFutureInlineHolder,
      plugins: [createParagraphPlugin({ injectStyles: false })],
      inlinePlugins: [createColorSwatchPlugin()],
      injectStyles: false,
      validationMode: 'strict',
      data: {
        version: '2.0.0',
        blocks: [{
          id: 'strict-future-inline',
          type: 'paragraph',
          data: { text: '{{future}}' },
          inline: {
            future: {
              type: 'color',
              dataVersion: colorDefinition.schema.currentVersion + 1,
              data: { value: '#123456' },
            },
          },
        }],
      },
    })
  } catch {
    strictFutureInlineRejected = true
  }
  assert(strictFutureInlineRejected && strictFutureInlineHolder.childNodes.length === 0, 'strict mode accepted future inline payload')
  strictFutureInlineHolder.remove()

  const invalidJsonHolder = createHolder(sandbox)
  let invalidJsonRejected = false
  try {
    createEditor({
      holder: invalidJsonHolder,
      plugins: [createParagraphPlugin({ injectStyles: false })],
      injectStyles: false,
      data: { version: '2.0.0', blocks: [undefined] },
    })
  } catch {
    invalidJsonRejected = true
  }
  assert(invalidJsonRejected && invalidJsonHolder.childNodes.length === 0, 'non-JSON document was accepted or leaked DOM')
  invalidJsonHolder.remove()

  const duplicateIdHolder = createHolder(sandbox)
  let duplicateIdRejected = false
  try {
    createEditor({
      holder: duplicateIdHolder,
      plugins: [createParagraphPlugin({ injectStyles: false })],
      injectStyles: false,
      data: {
        version: '2.0.0',
        blocks: [
          { id: 'duplicate', type: 'paragraph', data: { text: 'First' } },
          { id: 'duplicate', type: 'paragraph', data: { text: 'Second' } },
        ],
      },
    })
  } catch {
    duplicateIdRejected = true
  }
  assert(duplicateIdRejected && duplicateIdHolder.childNodes.length === 0, 'duplicate block IDs were not rejected atomically')
  duplicateIdHolder.remove()

  const preservedHolder = createHolder(sandbox)
  const preservedParagraph = createParagraphPlugin({ injectStyles: false })
  const futureVersion = preservedParagraph.schema.currentVersion + 1
  const preservedEditor = createEditor({
    holder: preservedHolder,
    plugins: [preservedParagraph],
    injectStyles: false,
    validationMode: 'preserve',
    data: {
      version: '2.0.0',
      blocks: [
        { id: 'safe', type: 'paragraph', data: { text: unsafeInline } },
        {
          id: 'bad-known',
          type: 'paragraph',
          dataVersion: futureVersion,
          data: { text: '<script>opaque()</script>' },
          revision: 'r1',
        },
        {
          id: 'future',
          type: 'future-block',
          dataVersion: 99,
          revision: 'producer-r2',
          tunes: { custom: { value: 1 } },
          data: { html: '<img onerror="window.__editorSecurityProbe++">' },
          inline: { x: { type: 'future-widget', data: { payload: 1 } } },
        },
      ],
    },
  })
  assert(preservedEditor.blocks.get('safe').status === 'active', 'valid known block was not active')
  assert(preservedEditor.blocks.get('bad-known').status === 'preserved', 'future known block was activated')
  assert(preservedEditor.blocks.get('future').status === 'preserved', 'unknown block was activated')
  assert(preservedHolder.querySelectorAll('.oe-preserved-block').length === 2, 'preserved blocks were not projected inertly')
  assertNoActiveMarkup(editorRoot(preservedHolder), 'preserved block projection')
  const preservedSaved = preservedEditor.save()
  assert(preservedSaved.blocks.find(block => block.id === 'future')?.revision === 'producer-r2', 'preserved revision was lost')
  assert(preservedSaved.blocks.find(block => block.id === 'future')?.inline?.x?.type === 'future-widget', 'preserved inline payload was lost')
  preservedEditor.destroy()
  preservedHolder.remove()

  const strictKnownHolder = createHolder(sandbox)
  let strictKnownRejected = false
  try {
    createEditor({
      holder: strictKnownHolder,
      plugins: [createParagraphPlugin({ injectStyles: false })],
      injectStyles: false,
      validationMode: 'strict',
      data: {
        version: '2.0.0',
        blocks: [{ id: 'bad-known', type: 'paragraph', data: { nope: true } }],
      },
    })
  } catch {
    strictKnownRejected = true
  }
  assert(strictKnownRejected && strictKnownHolder.childNodes.length === 0, 'strict mode accepted malformed known block')
  strictKnownHolder.remove()

  const documentModeHolder = createHolder(sandbox)
  const sourceTime = 123456789
  const documentModeEditor = createEditor({
    holder: documentModeHolder,
    plugins: [createParagraphPlugin({ injectStyles: false })],
    injectStyles: false,
    documentVersionPolicy: 'preserve',
    data: {
      version: 'future-envelope',
      time: sourceTime,
      blocks: [{ id: 'opaque', type: 'paragraph', data: { text: '<b>opaque</b>' } }],
    },
  })
  assert(documentModeEditor.documentMode === 'preserved' && documentModeEditor.readOnly, 'unknown document version was exposed as writable')
  const preservedEnvelope = documentModeEditor.save()
  assert(preservedEnvelope.version === 'future-envelope' && preservedEnvelope.time === sourceTime, 'preserved document envelope metadata changed')
  let writableBypassRejected = false
  try { documentModeEditor.setReadOnly(false) } catch { writableBypassRejected = true }
  assert(writableBypassRejected, 'setReadOnly(false) bypassed preserved document mode')
  documentModeEditor.render({
    version: '2.0.0',
    blocks: [{ id: 'current', type: 'paragraph', data: { text: 'Current' } }],
  })
  assert(documentModeEditor.documentMode === 'editable' && !documentModeEditor.readOnly, 'current document did not leave preserved mode')
  documentModeEditor.destroy()
  documentModeHolder.remove()

  const defaultHolder = createHolder(sandbox)
  const heading = createHeadingPlugin({ injectStyles: false })
  const defaultEditor = createEditor({
    holder: defaultHolder,
    plugins: [heading],
    defaultBlock: 'heading',
    injectStyles: false,
  })
  assert(defaultEditor.save().blocks[0]?.type === 'heading', 'configured default block was ignored')
  defaultEditor.clear()
  assert(defaultEditor.save().blocks[0]?.type === 'heading', 'clear() ignored configured default block')
  defaultEditor.destroy()
  defaultHolder.remove()

  const reusableDefinition = createParagraphPlugin({ injectStyles: false })
  const ownerA = createHolder(sandbox)
  const ownerB = createHolder(sandbox)
  const editorA = createEditor({ holder: ownerA, plugins: [reusableDefinition], injectStyles: false })
  const editorB = createEditor({ holder: ownerB, plugins: [reusableDefinition], injectStyles: false })
  assert(editorA.save().blocks[0].type === 'paragraph' && editorB.save().blocks[0].type === 'paragraph', 'immutable definition was not reusable across editors')
  editorA.destroy()
  editorB.destroy()
  ownerA.remove()
  ownerB.remove()

  const duplicateDefinitionHolder = createHolder(sandbox)
  let duplicateDefinitionRejected = false
  try {
    createEditor({
      holder: duplicateDefinitionHolder,
      plugins: [reusableDefinition, reusableDefinition],
      injectStyles: false,
    })
  } catch {
    duplicateDefinitionRejected = true
  }
  assert(duplicateDefinitionRejected && duplicateDefinitionHolder.childNodes.length === 0, 'duplicate definition type was not rejected atomically')
  duplicateDefinitionHolder.remove()

  const failingDefinition = createFailingDefinition()
  const transactionHolder = createHolder(sandbox)
  const transactionEditor = createEditor({
    holder: transactionHolder,
    plugins: [failingDefinition],
    defaultBlock: 'transactional',
    injectStyles: false,
    data: oneBlock('transactional', { text: 'Stable' }, 'stable'),
  })
  const beforeFailedRender = JSON.stringify(transactionEditor.save().blocks)
  const beforeElement = blockElement(transactionHolder, 'stable')
  let renderFailed = false
  try {
    transactionEditor.render(oneBlock('transactional', { text: 'Broken' }, 'broken'))
  } catch {
    renderFailed = true
  }
  assert(renderFailed, 'failing projection was silently committed')
  assert(JSON.stringify(transactionEditor.save().blocks) === beforeFailedRender, 'failed render mutated canonical document')
  assert(blockElement(transactionHolder, 'stable') === beforeElement, 'failed render replaced committed projection')
  transactionEditor.destroy()
  transactionHolder.remove()

  const renderer = new EditorRenderer({ blockTypes: ['paragraph', 'raw'], injectStyles: false, throwOnUnknown: true })
  const rendererContainer = document.createElement('main')
  sandbox.appendChild(rendererContainer)
  renderer.renderTo({
    version: '2.0.0',
    blocks: [
      { id: 'render-paragraph', type: 'paragraph', data: { text: unsafeInline } },
      { id: 'render-raw', type: 'raw', data: { html: unsafeRaw } },
    ],
  }, rendererContainer)
  assertNoActiveMarkup(rendererContainer, 'renderer')
  assert(window.__editorSecurityProbe === 0, 'renderer executed untrusted markup')
  renderer.destroy(rendererContainer)
  renderer.destroy()
  rendererContainer.remove()

  assert(window.__editorSecurityProbe === 0, 'security payload executed')
  sandbox.replaceChildren()

  return {
    sanitizers: ['rich text', 'raw html', 'renderer'],
    editor: ['canonical native input', 'no mutable Block DOM', 'forged widget rejection'],
    preservation: ['unknown block', 'future known block', 'unknown/future inline', 'future document'],
    validation: ['strict known', 'strict inline', 'non-JSON', 'duplicate ids', 'duplicate definitions'],
    lifecycle: ['reusable immutable definitions', 'projection rollback'],
  }
}

function oneBlock(type, data, id = type) {
  return { version: '2.0.0', blocks: [{ id, type, data }] }
}

const result = document.querySelector('#result')
try {
  const summary = await run()
  document.body.dataset.status = 'pass'
  result.textContent = JSON.stringify(summary)
} catch (error) {
  document.body.dataset.status = 'fail'
  result.textContent = error?.stack || String(error)
}
