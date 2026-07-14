import { createColorSwatchPlugin, createEditor } from '../../core/index.js'
import { Attaches, Checklist, Heading, LinkPreview, List, Paragraph } from '../../plugins/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { deserializeInlineHtml, serializeInlineHtml } from '../../shared/inlineMarshal.js'
import { sanitizeHtml, sanitizeRawHtml, setSanitizedRawHtml } from '../../shared/sanitize/index.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Av7lWQAAAABJRU5ErkJggg=='

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function placeholderIds(html) {
  return [...String(html).matchAll(/\{\{([A-Za-z0-9_-]+)\}\}/g)].map(match => match[1])
}

function setCaretToEnd(element) {
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function assertNoActiveMarkup(root, label) {
  assert(!root.querySelector('script, iframe, object, embed, form, meta, link, base'), `${label} kept an active element`)
  assert(![...root.querySelectorAll('*')].some(element => [...element.attributes].some(attr => attr.name.startsWith('on'))), `${label} kept an event handler`)
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
  assert(!/javascript|svg\+xml/i.test(rawImage?.getAttribute('srcset') || ''), 'Raw sanitizer kept an unsafe srcset candidate')
  assert((rawHost.querySelector('#safe-srcset')?.getAttribute('srcset') || '').includes('/safe.png'), 'Raw sanitizer removed a safe srcset')
  const unsafeStyle = rawHost.querySelector('#unsafe-style')
  assert(unsafeStyle?.style.color === 'red' && unsafeStyle.style.width === '10px', 'Raw sanitizer removed safe inline styles')
  assert(!unsafeStyle.style.backgroundImage, 'Raw sanitizer kept an unsafe CSS URL')
  assert(rawHost.querySelector('#safe-style')?.style.backgroundImage.includes('data:image/png'), 'Raw sanitizer removed a safe CSS media URL')
  assert(!/javascript|svg\+xml/i.test(sanitizeRawHtml(unsafeRaw)), 'string Raw sanitizer kept an active URL')
  assert(window.__editorSecurityProbe === 0, 'Raw sanitizer executed an inert payload')

  const widgetPlugin = {
    type: 'test',
    getData(element) {
      return { value: element.dataset.value || '' }
    },
    createWidget(data, id) {
      if (data.throw) throw new Error('malformed widget')
      const element = document.createElement('span')
      element.dataset.inlinePlugin = 'test'
      element.dataset.id = id
      element.dataset.value = String(data.value || '')
      element.textContent = String(data.value || '')
      return element
    },
  }
  const registry = new Map([['test', widgetPlugin]])
  const serialized = serializeInlineHtml([
    '<span data-inline-plugin="test" data-id="duplicate" data-value="first">first</span>',
    '<span data-inline-plugin="test" data-id="duplicate" data-value="second">second</span>',
    '<span data-inline-plugin="test" data-id="__proto__" data-value="third">third</span>',
  ].join(' '), registry)
  const serializedIds = placeholderIds(serialized.html)
  assert(serializedIds.length === 3, 'inline serializer lost a widget')
  assert(new Set(serializedIds).size === 3, 'inline serializer kept duplicate widget IDs')
  assert(Object.keys(serialized.inline).length === 3, 'inline serializer lost widget data')
  assert(Object.getPrototypeOf(serialized.inline) === Object.prototype, 'inline serializer changed the map prototype')
  assert(!Object.hasOwn(serialized.inline, '__proto__'), 'inline serializer kept a reserved widget ID')

  const inheritedInline = Object.create({ ghost: { type: 'test', data: { value: 'polluted' } } })
  assert(
    deserializeInlineHtml('before {{ghost}} after', inheritedInline, registry) === 'before {{ghost}} after',
    'inline deserializer consumed inherited data',
  )
  const malformedInline = { bad: { type: 'test', data: { throw: true } }, primitive: 'invalid' }
  assert(
    deserializeInlineHtml('{{bad}} {{primitive}}', malformedInline, registry) === '{{bad}} {{primitive}}',
    'inline deserializer did not preserve malformed entries',
  )

  const nestedHolder = document.createElement('section')
  sandbox.appendChild(nestedHolder)
  const nestedEditor = createEditor({
    holder: nestedHolder,
    plugins: [new Paragraph(), new List(), new Checklist()],
    inlineTools: [],
    inlinePlugins: [createColorSwatchPlugin()],
    data: {
      version: 'legacy-inline',
      blocks: [
        {
          id: 'nested-list',
          type: 'list',
          data: { style: 'unordered', items: ['First {{shared}}', 'Second {{shared}}'] },
          inline: { shared: { type: 'color', data: { value: '#123456' } } },
        },
        {
          id: 'nested-checklist',
          type: 'checklist',
          data: { items: [{ text: 'First {{shared}}', checked: true }, { text: 'Second {{shared}}', checked: false }] },
          inline: { shared: { type: 'color', data: { value: '#654321' } } },
        },
      ],
    },
  })
  const nestedSaved = await nestedEditor.save()
  for (const block of nestedSaved.blocks) {
    const fields = block.type === 'list' ? block.data.items : block.data.items.map(item => item.text)
    const ids = fields.flatMap(placeholderIds)
    assert(ids.length === 2 && new Set(ids).size === 2, `${block.type} nested fields reused a widget ID`)
    assert(Object.keys(block.inline || {}).length === 2, `${block.type} lost nested widget data`)
  }
  nestedEditor.destroy()

  const malformedHolder = document.createElement('section')
  sandbox.appendChild(malformedHolder)
  let nonJsonRejected = false
  try {
    createEditor({
      holder: malformedHolder,
      plugins: [new Paragraph()],
      inlineTools: [],
      data: { version: 'invalid-json', blocks: [undefined] },
    })
  } catch (error) {
    nonJsonRejected = /non-JSON undefined/.test(String(error))
  }
  assert(nonJsonRejected, 'editor accepted document data that JSON cannot represent')
  assert(malformedHolder.childNodes.length === 0, 'rejected non-JSON document leaked editor DOM')

  const malformedEditor = createEditor({
    holder: malformedHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: {
      version: 'malformed',
      blocks: [
        null,
        'invalid',
        { id: 'safe', type: 'paragraph', data: { text: unsafeInline } },
        {
          id: 'legacy',
          type: 'legacyUnknown',
          revision: 'producer-r1',
          tunes: { wide: true },
          data: { text: 'Legacy content', nested: { value: 1 } },
          inline: { legacyWidget: { type: 'futureWidget', data: { value: 'kept' } } },
        },
      ],
    },
  })
  const malformedSaved = await malformedEditor.save()
  assert(malformedSaved.blocks.length === 2, 'malformed block entries were not isolated')
  const preservedUnknown = malformedSaved.blocks.find(block => block.type === 'legacyUnknown')
  assert(preservedUnknown?.id === 'legacy', 'unknown block identity was not preserved')
  assert(preservedUnknown?.revision === 'producer-r1', 'unknown block revision was not preserved')
  assert(preservedUnknown?.tunes?.wide === true, 'unknown block tunes were not preserved')
  assert(preservedUnknown?.data?.nested?.value === 1, 'unknown block data was not preserved')
  assert(preservedUnknown?.inline?.legacyWidget?.type === 'futureWidget', 'unknown block inline data was not preserved')
  assert(malformedSaved.version === 'malformed', 'preserve version policy relabelled the document')
  assertNoActiveMarkup(malformedEditor.rootElement, 'malformed OutputData')
  assert(window.__editorSecurityProbe === 0, 'malformed OutputData executed an inert payload')
  malformedEditor.destroy()

  const defaultHolder = document.createElement('section')
  sandbox.appendChild(defaultHolder)
  const defaultEditor = createEditor({
    holder: defaultHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: { version: 'malformed', blocks: { not: 'an array' } },
  })
  assert((await defaultEditor.save()).blocks.length === 1, 'non-array blocks did not produce a safe default block')
  defaultEditor.destroy()

  const configuredDefaultHolder = document.createElement('section')
  sandbox.appendChild(configuredDefaultHolder)
  const configuredDefaultEditor = createEditor({
    holder: configuredDefaultHolder,
    plugins: [new Heading()],
    defaultBlock: 'heading',
    inlineTools: [],
  })
  assert((await configuredDefaultEditor.save()).blocks[0]?.type === 'heading', 'configured default block was replaced with paragraph')
  configuredDefaultEditor.clear()
  assert((await configuredDefaultEditor.save()).blocks[0]?.type === 'heading', 'clear() ignored the configured default block')
  configuredDefaultEditor.destroy()

  const duplicateHolder = document.createElement('section')
  sandbox.appendChild(duplicateHolder)
  const duplicateEditor = createEditor({
    holder: duplicateHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: {
      version: 'duplicate-ids',
      blocks: [
        { id: 'duplicate', type: 'paragraph', data: { text: 'First' } },
        { id: 'duplicate', type: 'paragraph', data: { text: 'Second' } },
      ],
    },
  })
  const duplicateSaved = await duplicateEditor.save()
  assert(new Set(duplicateSaved.blocks.map(block => block.id)).size === 2, 'duplicate block IDs corrupted manager identity')
  assert(duplicateSaved.blocks.map(block => block.data.text).join('|') === 'First|Second', 'duplicate ID remap lost block data/order')
  assert(!('captureSnapshotSync' in duplicateEditor), 'internal snapshot API leaked through the public handle')
  assert(!('registerDestroyable' in duplicateEditor) && !('markReady' in duplicateEditor), 'composition methods leaked through the public handle')
  assert(!('emit' in duplicateEditor.events) && !('clear' in duplicateEditor.events), 'mutable event bus leaked through the public handle')
  const publicBlock = duplicateEditor.blocks.getBlockByIndex(0)
  assert(publicBlock && !('destroy' in publicBlock) && !('markDirty' in publicBlock) && !('plugin' in publicBlock), 'internal Block leaked through public blocks API')
  duplicateEditor.destroy()

  let rejectTransactionalRender = false
  const transactionalPlugin = {
    type: 'transactional',
    title: 'Transactional',
    icon: '',
    render(data) {
      if (rejectTransactionalRender) throw new Error('intentional render failure')
      const element = document.createElement('p')
      element.contentEditable = 'true'
      element.textContent = String(data?.text || '')
      return element
    },
    save(element) { return { text: element.textContent || '' } },
  }
  const transactionalHolder = document.createElement('section')
  sandbox.appendChild(transactionalHolder)
  const transactionalEditor = createEditor({
    holder: transactionalHolder,
    plugins: [transactionalPlugin],
    defaultBlock: 'transactional',
    inlineTools: [],
    data: { version: 'transactional', blocks: [{ id: 'stable', type: 'transactional', data: { text: 'Stable' } }] },
  })
  const beforeFailedRender = JSON.stringify((await transactionalEditor.save()).blocks)
  rejectTransactionalRender = true
  let renderFailed = false
  try {
    transactionalEditor.render({ version: 'transactional', blocks: [{ id: 'broken', type: 'transactional', data: { text: 'Broken' } }] })
  } catch {
    renderFailed = true
  }
  rejectTransactionalRender = false
  assert(renderFailed, 'failing plugin render was silently committed')
  assert(JSON.stringify((await transactionalEditor.save()).blocks) === beforeFailedRender, 'failed public render replaced the live document')
  transactionalEditor.destroy()

  const migrationHolder = document.createElement('section')
  sandbox.appendChild(migrationHolder)
  const migrationEditor = createEditor({
    holder: migrationHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    documentVersionPolicy: 'strict',
    migrations: [{
      from: 'legacy-v0',
      to: '1.0.0',
      migrate(document) {
        return {
          ...document,
          blocks: document.blocks.map(block => ({
            ...block,
            data: { text: String(block.data.body || '') },
          })),
        }
      },
    }],
    data: {
      version: 'legacy-v0',
      blocks: [{ id: 'migrated', type: 'paragraph', data: { body: 'Initial migration' } }],
    },
  })
  assert((await migrationEditor.save()).blocks[0].data.text === 'Initial migration', 'initial document migration was not applied')
  assert((await migrationEditor.save()).version === '1.0.0', 'completed migration did not save the current document version')
  migrationEditor.render({
    version: 'legacy-v0',
    blocks: [{ id: 'render-migrated', type: 'paragraph', data: { body: 'Render migration' } }],
  })
  assert((await migrationEditor.save()).blocks[0].data.text === 'Render migration', 'render() bypassed document migrations')
  assert((await migrationEditor.save()).version === '1.0.0', 'render migration did not update the saved version')
  const beforeUnknownVersion = JSON.stringify((await migrationEditor.save()).blocks)
  let unknownVersionRejected = false
  try {
    migrationEditor.render({ version: 'unknown-version', blocks: [] })
  } catch {
    unknownVersionRejected = true
  }
  assert(unknownVersionRejected, 'strict document policy accepted an unknown version')
  assert(JSON.stringify((await migrationEditor.save()).blocks) === beforeUnknownVersion, 'failed migration changed the live document')
  migrationEditor.destroy()

  const failedCreateHolder = document.createElement('section')
  sandbox.appendChild(failedCreateHolder)
  rejectTransactionalRender = true
  let createFailed = false
  try {
    createEditor({
      holder: failedCreateHolder,
      plugins: [transactionalPlugin],
      defaultBlock: 'transactional',
      inlineTools: [],
    })
  } catch {
    createFailed = true
  }
  rejectTransactionalRender = false
  assert(createFailed, 'failing default plugin did not abort createEditor')
  assert(failedCreateHolder.childNodes.length === 0, 'failed createEditor leaked root DOM')

  const duplicatePluginHolder = document.createElement('section')
  sandbox.appendChild(duplicatePluginHolder)
  let duplicatePluginRejected = false
  try {
    createEditor({ holder: duplicatePluginHolder, plugins: [new Paragraph(), new Paragraph()], inlineTools: [] })
  } catch {
    duplicatePluginRejected = true
  }
  assert(duplicatePluginRejected && duplicatePluginHolder.childNodes.length === 0, 'duplicate block plugin type was not rejected atomically')

  const duplicateInlineHolder = document.createElement('section')
  sandbox.appendChild(duplicateInlineHolder)
  const repeatedInlinePlugin = createColorSwatchPlugin()
  let duplicateInlineRejected = false
  try {
    createEditor({
      holder: duplicateInlineHolder,
      plugins: [new Paragraph()],
      inlinePlugins: [repeatedInlinePlugin, repeatedInlinePlugin],
      inlineTools: [],
    })
  } catch {
    duplicateInlineRejected = true
  }
  assert(duplicateInlineRejected && duplicateInlineHolder.childNodes.length === 0, 'duplicate inline plugin type was not rejected atomically')

  for (const [label, plugin] of [
    ['render contract', {
      type: 'invalidRender', title: 'Invalid render', icon: '',
      render: () => ({}),
      save: () => ({}),
    }],
    ['save contract', {
      type: 'invalidSave', title: 'Invalid save', icon: '',
      render() { const element = document.createElement('p'); element.contentEditable = 'true'; return element },
      save: () => null,
    }],
  ]) {
    const invalidHolder = document.createElement('section')
    sandbox.appendChild(invalidHolder)
    let rejected = false
    try {
      createEditor({ holder: invalidHolder, plugins: [plugin], inlineTools: [] })
    } catch {
      rejected = true
    }
    assert(rejected && invalidHolder.childNodes.length === 0, `${label} was not rejected atomically`)
  }

  const sharedPlugin = new Paragraph()
  const ownerHolder = document.createElement('section')
  const competingHolder = document.createElement('section')
  sandbox.append(ownerHolder, competingHolder)
  const owningEditor = createEditor({ holder: ownerHolder, plugins: [sharedPlugin], inlineTools: [] })
  let sharedInstanceRejected = false
  try {
    createEditor({ holder: competingHolder, plugins: [sharedPlugin], inlineTools: [] })
  } catch {
    sharedInstanceRejected = true
  }
  assert(sharedInstanceRejected && competingHolder.childNodes.length === 0, 'one plugin instance was shared by live editors')
  owningEditor.destroy()
  const reusedAfterDestroy = createEditor({ holder: competingHolder, plugins: [sharedPlugin], inlineTools: [] })
  reusedAfterDestroy.destroy()

  let readOnlyMutations = 0
  let readOnlyRequests = 0
  const readOnlyProbe = {
    type: 'readOnlyProbe', title: 'Read-only probe', icon: '',
    render(data, context) {
      const element = document.createElement('div')
      element.textContent = String(data?.value || '')
      element.addEventListener('click', () => context.mutate(() => {
        readOnlyMutations += 1
        element.textContent = 'changed'
      }))
      return element
    },
    save(element) { return { value: element.textContent || '' } },
  }
  const readOnlyHolder = document.createElement('section')
  sandbox.appendChild(readOnlyHolder)
  const readOnlyEditor = createEditor({
    holder: readOnlyHolder,
    readOnly: true,
    plugins: [readOnlyProbe, new Attaches(), new LinkPreview({
      async fetchMeta() {
        readOnlyRequests += 1
        return { title: 'Unexpected request' }
      },
    })],
    defaultBlock: 'readOnlyProbe',
    inlineTools: [],
    data: {
      version: 'read-only',
      blocks: [
        { id: 'probe', type: 'readOnlyProbe', data: { value: 'unchanged' } },
        { id: 'attachment', type: 'attaches', data: { files: [{ url: 'https://cdn.example/read-only.pdf', name: 'read-only.pdf', size: 42, extension: 'pdf' }], variant: 'f' } },
        { id: 'link', type: 'linkPreview', data: { url: 'https://example.com', title: '', description: '', image: '', favicon: '', domain: '', template: 'notion' } },
      ],
    },
  })
  readOnlyEditor.rootElement.querySelector('[data-block-id="probe"] > *')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 30))
  const readOnlySaved = await readOnlyEditor.save()
  assert(readOnlyMutations === 0, 'read-only plugin mutation capability changed state')
  assert(readOnlyRequests === 0, 'read-only plugin started a metadata request')
  assert(readOnlySaved.blocks[0]?.data?.value === 'unchanged', 'read-only editor persisted a UI mutation')
  assert(!readOnlyEditor.rootElement.querySelector('.oe-attaches__name[contenteditable="true"]'), 'read-only attachments kept editable file names')
  assert(!readOnlyEditor.rootElement.querySelector('.oe-attaches__remove:not([hidden])'), 'read-only attachments exposed remove controls')
  readOnlyEditor.destroy()

  const unsafeUploadHolder = document.createElement('section')
  sandbox.appendChild(unsafeUploadHolder)
  let uploadReceivedSignal = false
  const unsafeUploadEditor = createEditor({
    holder: unsafeUploadHolder,
    plugins: [new Attaches({
      async uploadFile(_file, { signal }) {
        uploadReceivedSignal = signal instanceof AbortSignal
        return { url: 'javascript:alert(1)' }
      },
    })],
    defaultBlock: 'attaches',
    inlineTools: [],
  })
  const uploadTransfer = new DataTransfer()
  uploadTransfer.items.add(new File(['unsafe'], 'unsafe.txt', { type: 'text/plain' }))
  unsafeUploadEditor.rootElement.querySelector('.oe-attaches')?.dispatchEvent(new DragEvent('drop', {
    dataTransfer: uploadTransfer,
    bubbles: true,
    cancelable: true,
  }))
  await new Promise(resolve => setTimeout(resolve, 30))
  const unsafeUploadSaved = await unsafeUploadEditor.save()
  assert(uploadReceivedSignal, 'attachment uploader did not receive an AbortSignal')
  assert(unsafeUploadSaved.blocks[0]?.data?.files?.length === 0, 'attachment uploader persisted an unsafe callback URL')
  unsafeUploadEditor.destroy()

  const sourceHolder = document.createElement('section')
  sandbox.appendChild(sourceHolder)
  let sourceReceivedSignal = false
  const sourceEditor = createEditor({
    holder: sourceHolder,
    plugins: [new Attaches({
      actions: [{
        label: 'Library',
        async handler({ signal }) {
          sourceReceivedSignal = signal instanceof AbortSignal
          return [
            { url: 'javascript:alert(1)', name: 'unsafe.txt' },
            { url: 'https://cdn.example/safe.pdf', name: 'safe.pdf', size: 42 },
          ]
        },
      }],
    })],
    defaultBlock: 'attaches',
    inlineTools: [],
  })
  const sourceButton = sourceEditor.rootElement.querySelector('.oe-attaches__select-action')
  assert(sourceButton instanceof HTMLButtonElement, 'attachment application source is missing in the empty state')
  sourceButton.click()
  await new Promise(resolve => setTimeout(resolve, 30))
  const sourceSaved = await sourceEditor.save()
  assert(sourceReceivedSignal, 'attachment application source did not receive an AbortSignal')
  assert(sourceSaved.blocks[0]?.data?.files?.length === 1, 'attachment application source did not filter unsafe callback URLs')
  assert(sourceSaved.blocks[0]?.data?.files?.[0]?.name === 'safe.pdf', 'attachment application source changed the selected file metadata')
  assert(sourceEditor.rootElement.querySelector('.oe-attaches__actions'), 'attachment application source did not enter the filled state')
  sourceEditor.destroy()

  const pasteHolder = document.createElement('section')
  sandbox.appendChild(pasteHolder)
  const pasteEditor = createEditor({
    holder: pasteHolder,
    plugins: [new Paragraph()],
    inlineTools: [],
    data: { version: 'paste-security', blocks: [{ id: 'paste', type: 'paragraph', data: { text: '' } }] },
    tuning: { undo: { debounceMs: 0 }, change: { debounceMs: 0 } },
  })
  const pasteTarget = pasteEditor.blocks.getBlockByIndex(0).contentElement
  setCaretToEnd(pasteTarget)
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/html', unsafeInline)
  clipboardData.setData('text/plain', 'safe link styled')
  pasteTarget.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 30))
  assertNoActiveMarkup(pasteEditor.rootElement, 'HTML paste')
  const pastedJson = JSON.stringify(await pasteEditor.save())
  assert(!/onerror|onclick|javascript:/i.test(pastedJson), 'HTML paste persisted active markup')
  assert(window.__editorSecurityProbe === 0, 'HTML paste executed an inert payload')
  pasteEditor.destroy()

  const renderer = new EditorRenderer({
    blockTypes: ['image', 'linkPreview', 'person', 'attaches'],
    throwOnUnknown: true,
  })
  const renderHost = document.createElement('section')
  sandbox.appendChild(renderHost)
  renderer.renderTo({
    version: 'unsafe-urls',
    blocks: [
      { id: 'image', type: 'image', data: { file: { url: 'javascript:alert(1)' }, caption: 'Unsafe' } },
      { id: 'preview', type: 'linkPreview', data: { url: 'javascript:alert(1)', title: 'Unsafe', favicon: 'data:image/svg+xml,<svg onload=alert(1)>' } },
      { id: 'person', type: 'person', data: { persons: [{ name: 'Unsafe', avatar: 'data:image/svg+xml,<svg onload=alert(1)>', links: [{ type: 'website', url: 'javascript:alert(1)' }] }] } },
      { id: 'file', type: 'attaches', data: { files: [{ url: 'data:text/html,<script>alert(1)</script>', name: 'unsafe.html', size: 1, extension: 'html' }] } },
    ],
  }, renderHost)
  const unsafeAttributes = [...renderHost.querySelectorAll('[href], [src]')]
    .flatMap(element => ['href', 'src'].map(name => element.getAttribute(name)).filter(Boolean))
    .filter(value => /^(?:javascript|data:text\/html|data:image\/svg\+xml)/i.test(value))
  assert(unsafeAttributes.length === 0, `renderer kept unsafe URL attributes: ${unsafeAttributes.join(', ')}`)
  renderer.destroy(renderHost)

  await new Promise(resolve => setTimeout(resolve, 30))
  assert(window.__editorSecurityProbe === 0, 'an inert HTML payload executed')
  sandbox.replaceChildren()
  return {
    inlineWidgets: 3,
    nestedInlineBlocks: 2,
    malformedBlocksPreserved: malformedSaved.blocks.length,
    securitySurfaces: ['inline HTML', 'Raw HTML', 'paste', 'inline marshal', 'renderer URLs', 'upload callback URLs', 'application file sources'],
  }
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
