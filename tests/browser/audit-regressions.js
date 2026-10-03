import { CropperDialog } from '@shelamkoff/cropper'
import { createEditor } from '../../core/index.js'
import {
  assembleCanonicalRecord,
  prepareCanonicalInlineMerge,
} from '../../core/CanonicalTransforms.js'
import {
  createAttachesPlugin,
  createCarouselPlugin,
  createEmbedPlugin,
  createLinkPreviewPlugin,
  createParagraphPlugin,
  createPersonPlugin,
  createPollPlugin,
} from '../../plugins/index.js'

const sandbox = document.querySelector('#sandbox')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function canonicalTransformProof() {
  const definition = {
    schema: {
      mapRichText(data, transform) {
        return { ...data, text: transform(data.text, 'text') }
      },
    },
  }
  let sequence = 0
  const prepared = prepareCanonicalInlineMerge({
    definition,
    target: { data: { text: 'literal {{same}}' } },
    source: {
      data: { text: 'reference {{same}}' },
      inline: {
        same: { type: 'future-inline', dataVersion: 7, data: { opaque: true } },
      },
    },
    ownerDocument: document,
    allocateInlineId(reserved) {
      let id
      do { id = `generated-${++sequence}` } while (reserved.has(id))
      return id
    },
  })
  assert(prepared.targetData.text === 'literal {{same}}', 'literal placeholder was rewritten during merge preparation')
  assert(prepared.sourceData.text === 'reference {{generated-1}}', 'colliding owned reference was not remapped')
  assert(!Object.hasOwn(prepared.inline, 'same'), 'colliding source reference kept literal id')
  assert(prepared.inline['generated-1']?.data?.opaque === true, 'remapped opaque inline payload was lost')

  const record = assembleCanonicalRecord({
    id: 'record',
    type: 'probe',
    definition,
    data: { text: 'keep {{owned}} literal {{literal}}' },
    inlineSource: {
      owned: { type: 'future-inline', dataVersion: 7, data: { value: 1 } },
      unused: { type: 'future-inline', dataVersion: 7, data: { value: 2 } },
    },
    ownerDocument: document,
    normalizeData: (_definition, data) => ({ dataVersion: 1, data: { ...data } }),
    normalizeTunes: tunes => tunes,
  })
  assert(Object.keys(record.inline ?? {}).join(',') === 'owned', 'canonical assembly did not prune unused sidecar entries')
  assert(record.data.text.includes('{{literal}}'), 'literal placeholder was not preserved as text')
}

async function settle(times = 2) {
  for (let index = 0; index < times; index++) await tick()
}

function mount(definition, data, options = {}) {
  const holder = document.createElement('section')
  sandbox.appendChild(holder)
  const editor = createEditor({
    holder,
    plugins: [definition],
    defaultBlock: definition.type,
    inlineTools: [],
    injectStyles: options.injectStyles ?? false,
    changeDebounceMs: 0,
    locale: options.locale,
    data: {
      version: '2.0.0',
      blocks: [{ id: options.id ?? definition.type, type: definition.type, dataVersion: definition.schema.currentVersion, data }],
    },
  })
  const root = holder.querySelector('.oe-editor')
  const wrapper = holder.querySelector(`.oe-block[data-block-id="${options.id ?? definition.type}"]`)?.firstElementChild
  assert(root instanceof HTMLElement && wrapper instanceof HTMLElement, `${definition.type}: editor projection missing`)
  return { holder, editor, root, wrapper, id: options.id ?? definition.type }
}

function assertNoMarkup(root, payload, name) {
  assert(root.textContent?.includes(payload), `${name} label was not preserved as literal text`)
  assert(!root.querySelector('script, iframe, object, embed'), `${name} label created an active element`)
  assert(
    ![...root.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => attribute.name.startsWith('on'))),
    `${name} label created an event handler`,
  )
}

function taskProbeDefinition(tasks) {
  const schema = Object.freeze({
    currentVersion: 1,
    createDefault: () => ({ value: 0 }),
    decode(input) {
      if (input.dataVersion !== 1) throw new RangeError('unsupported task-probe data version')
      return { dataVersion: 1, data: { value: Number(input.data?.value) || 0 } }
    },
    encode(data) {
      return { dataVersion: 1, data: { value: Number(data?.value) || 0 } }
    },
  })
  return Object.freeze({
    type: 'task-probe',
    label: Object.freeze({ key: 'title', fallback: 'Task probe' }),
    icon: '',
    schema,
    setup() {
      return {
        create(initial, context) {
          let data = { ...initial }
          let readOnly = context.isReadOnly()
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = 'Start task'
          button.addEventListener('click', () => {
            if (readOnly) return
            tasks.push(context.beginTask())
          }, { signal: context.signal })
          return {
            element: button,
            read: () => ({ ...data }),
            update(next) { data = { ...next } },
            editableFields: () => Object.freeze([]),
            setReadOnly(value) { readOnly = value === true; button.disabled = readOnly },
            destroy() {},
          }
        },
        destroy() {},
      }
    },
  })
}

async function taskLifetimeOwnership() {
  const tasks = []
  const definition = taskProbeDefinition(tasks)
  const entry = mount(definition, { value: 1 }, { id: 'same' })
  try {
    const start = () => {
      const button = entry.holder.querySelector('.oe-block[data-block-id="same"] button')
      assert(button instanceof HTMLButtonElement, 'task probe button is missing')
      button.click()
      return tasks.at(-1)
    }

    const staleByReplacement = start()
    assert(staleByReplacement && !staleByReplacement.signal.aborted, 'task probe did not start')
    entry.editor.render({
      version: '2.0.0',
      blocks: [{ id: 'same', type: 'task-probe', dataVersion: 1, data: { value: 7 } }],
    })
    assert(staleByReplacement.signal.aborted, 'same-id render did not revoke old task scope')
    let staleProducerCalls = 0
    assert(staleByReplacement.commit(current => {
      staleProducerCalls++
      return { ...current, value: 99 }
    }) === false, 'revoked replacement task committed')
    assert(staleProducerCalls === 0, 'revoked replacement task invoked producer')
    assert(entry.editor.save().blocks[0].data.value === 7, 'revoked replacement task changed model')

    const staleByReadOnly = start()
    entry.editor.setReadOnly(true)
    assert(staleByReadOnly.signal.aborted, 'read-only transition did not cancel task')
    entry.editor.setReadOnly(false)
    let epochProducerCalls = 0
    assert(staleByReadOnly.commit(current => {
      epochProducerCalls++
      return { ...current, value: 88 }
    }) === false, 'pre-readOnly task revived after readOnly false')
    assert(epochProducerCalls === 0, 'pre-readOnly task invoked producer after epoch change')

    const fresh = start()
    assert(fresh.commit(current => ({ ...current, value: 8 })) === true, 'fresh post-readOnly task did not commit')
    await settle()
    assert(entry.editor.save().blocks[0].data.value === 8, 'fresh post-readOnly task result was not persisted')
  } finally {
    entry.editor.destroy()
    entry.holder.remove()
  }
}

async function localeMarkupBoundary() {
  const payload = '<img src="x" onerror="window.__localeAuditProbe++">Localized'
  window.__localeAuditProbe = 0

  const definitions = [
    createAttachesPlugin({ injectStyles: false }),
    createLinkPreviewPlugin({ injectStyles: false }),
    createPollPlugin({ injectStyles: false }),
  ]

  for (const definition of definitions) {
    const locale = {
      __lang: 'en',
      [`plugin.${definition.type}.title`]: payload,
    }
    const entry = mount(definition, definition.schema.createDefault(), {
      locale,
      id: `locale-${definition.type}`,
    })
    try {
      entry.editor.blocks.focus(entry.id)
      await settle()
      const plus = entry.root.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
      const toolbox = entry.root.querySelector('.oe-toolbox')
      assert(plus instanceof HTMLButtonElement && toolbox instanceof HTMLElement, `${definition.type}: v2 toolbox is missing`)
      plus.click()
      await settle()
      assert(toolbox.style.display !== 'none', `${definition.type}: v2 toolbox did not open`)
      assertNoMarkup(toolbox, payload, definition.type)
    } finally {
      entry.editor.destroy()
      entry.holder.remove()
    }
  }

  await new Promise(resolve => setTimeout(resolve, 30))
  assert(window.__localeAuditProbe === 0, 'a locale label payload executed')
}

async function linkPreviewOwnership() {
  const requests = []
  const definition = createLinkPreviewPlugin({
    injectStyles: false,
    fetchMeta(url, { signal }) {
      return new Promise(resolve => requests.push({ url, signal, resolve }))
    },
  })
  const entry = mount(definition, {
    ...definition.schema.createDefault(),
    url: 'https://example.com',
    domain: 'example.com',
  }, { id: 'link' })

  try {
    await settle()
    assert(requests.length === 1, 'initial link-preview metadata request did not start')
    const input = entry.wrapper.querySelector('.oe-lp__url-input')
    assert(input instanceof HTMLInputElement, 'link-preview URL input is missing')
    input.value = 'https://example.com'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    assert(requests.length === 2, 'same-URL replacement request did not start')
    assert(requests[0].signal.aborted, 'same-URL replacement did not abort previous request')
    assert(!requests[1].signal.aborted, 'replacement request started aborted')

    requests[0].resolve({ title: 'Stale title' })
    await settle()
    assert(entry.editor.save().blocks[0].data.title !== 'Stale title', 'stale metadata request committed')
    requests[1].resolve({ title: 'Fresh title' })
    await settle(3)
    assert(entry.editor.save().blocks[0].data.title === 'Fresh title', 'fresh metadata request did not win')
    assert(entry.wrapper.querySelector('.oe-lp__title')?.textContent === 'Fresh title', 'fresh metadata was not projected')
  } finally {
    entry.editor.destroy()
    entry.holder.remove()
  }
}

async function embedCoverOwnership() {
  const requests = []
  const definition = createEmbedPlugin({
    injectStyles: false,
    resolvePreview: false,
    uploadFile(file, { signal }) {
      return new Promise(resolve => requests.push({ file, signal, resolve }))
    },
  })
  const entry = mount(definition, {
    service: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    caption: '',
    cover: '',
    title: '',
    duration: '',
  }, { id: 'embed' })

  const originalClick = HTMLInputElement.prototype.click
  let fileIndex = 0
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && this.accept === 'image/*') {
      const file = new File([`cover-${++fileIndex}`], `cover-${fileIndex}.png`, { type: 'image/png' })
      Object.defineProperty(this, 'files', { configurable: true, value: [file] })
      this.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    return originalClick.call(this)
  }

  try {
    const cover = [...entry.wrapper.querySelectorAll('.oe-embed__action-btn')]
      .find(button => button.textContent?.trim().includes('Cover'))
    assert(cover instanceof HTMLButtonElement, 'embed Cover control is missing')
    cover.click()
    cover.click()
    assert(requests.length === 2, 'embed replacement uploads did not both start')
    assert(requests[0].signal.aborted, 'new embed cover upload did not abort old upload')

    requests[0].resolve({ url: 'https://example.test/stale.png' })
    await settle()
    assert(entry.editor.save().blocks[0].data.cover === '', 'stale embed cover committed while replacement was pending')

    requests[1].resolve({ url: 'https://example.test/fresh.png' })
    await settle(3)
    assert(entry.editor.save().blocks[0].data.cover === 'https://example.test/fresh.png', 'fresh embed cover did not win')

    cover.click()
    cover.click()
    assert(requests.length === 4, 'second embed cover race did not start both uploads')
    requests[3].resolve({ url: 'https://example.test/newest.png' })
    await settle(3)
    requests[2].resolve({ url: 'https://example.test/late-stale.png' })
    await settle(3)
    assert(entry.editor.save().blocks[0].data.cover === 'https://example.test/newest.png', 'late stale embed cover overwrote newest upload')
  } finally {
    HTMLInputElement.prototype.click = originalClick
    entry.editor.destroy()
    entry.holder.remove()
  }
}

async function carouselAbortedBatchUrls() {
  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL)
  const created = []
  const revoked = []
  URL.createObjectURL = blob => {
    const url = originalCreateObjectURL(blob)
    created.push(url)
    return url
  }
  URL.revokeObjectURL = url => {
    revoked.push(String(url))
    return originalRevokeObjectURL(url)
  }

  const definition = createCarouselPlugin({ injectStyles: false })
  const entry = mount(definition, definition.schema.createDefault(), { id: 'carousel' })
  let commits = 0
  entry.editor.on('transaction:committed', () => { commits++ })

  try {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['video'], 'transient.webm', { type: 'video/webm' }))
    transfer.items.add(new File(['image'], 'pending.png', { type: 'image/png' }))
    entry.wrapper.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    assert(created.length === 1, 'carousel did not create transient video URL before pending image read')
    const transientUrl = created[0]
    const beforeDestroy = commits
    entry.editor.destroy()
    await settle()
    assert(commits === beforeDestroy, 'destroyed carousel committed aborted local file batch')
    assert(revoked.includes(transientUrl), 'aborted carousel batch retained uncommitted object URL')
  } finally {
    try { entry.editor.destroy() } catch {}
    entry.holder.remove()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
}

async function personAvatarOwnership() {
  const originalInputClick = HTMLInputElement.prototype.click
  const originalCropperOpen = CropperDialog.prototype.open
  let inputSequence = 0
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && this.accept === 'image/*') {
      const file = new File([`avatar-${++inputSequence}`], `avatar-${inputSequence}.png`, { type: 'image/png' })
      Object.defineProperty(this, 'files', { configurable: true, value: [file] })
      this.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    return originalInputClick.call(this)
  }
  CropperDialog.prototype.open = function () {
    this.result = Promise.resolve(new Blob(['cropped-avatar'], { type: 'image/webp' }))
  }

  const requests = []
  const definition = createPersonPlugin({
    injectStyles: false,
    uploadFile(file, { signal }) {
      return new Promise(resolve => requests.push({ file, signal, resolve }))
    },
  })
  const entry = mount(definition, {
    persons: [{ avatar: '', name: 'Ada', role: '', bio: '', links: [] }],
  }, { id: 'person' })

  const clickUpload = async () => {
    const button = entry.wrapper.querySelector('.oe-person__avatar-upload')
    assert(button instanceof HTMLButtonElement, 'person avatar upload button is missing')
    button.click()
    await settle(3)
  }

  try {
    await clickUpload()
    assert(requests.length === 1, 'first person avatar upload did not start')
    await clickUpload()
    assert(requests.length === 2, 'replacement person avatar upload did not start')
    assert(requests[0].signal.aborted, 'replacement avatar upload did not abort previous upload')

    requests[0].resolve({ url: 'https://example.test/stale-avatar.png' })
    await settle()
    assert(entry.editor.save().blocks[0].data.persons[0].avatar === '', 'stale avatar committed while replacement pending')

    requests[1].resolve({ url: 'https://example.test/fresh-avatar.png' })
    await settle(3)
    assert(entry.editor.save().blocks[0].data.persons[0].avatar === 'https://example.test/fresh-avatar.png', 'fresh avatar upload did not win')

    await clickUpload()
    await clickUpload()
    assert(requests.length === 4, 'second avatar race did not start both requests')
    assert(requests[2].signal.aborted, 'second avatar replacement did not abort predecessor')
    requests[3].resolve({ url: 'https://example.test/newest-avatar.png' })
    await settle(3)
    requests[2].resolve({ url: 'https://example.test/late-stale-avatar.png' })
    await settle(3)
    assert(entry.editor.save().blocks[0].data.persons[0].avatar === 'https://example.test/newest-avatar.png', 'late stale avatar overwrote latest upload')
  } finally {
    entry.editor.destroy()
    entry.holder.remove()
    HTMLInputElement.prototype.click = originalInputClick
    CropperDialog.prototype.open = originalCropperOpen
  }
}

async function toolbarOwnership() {
  const definition = createParagraphPlugin({ injectStyles: false })
  const entry = mount(definition, { text: 'Frame ownership' }, { id: 'toolbar' })
  try {
    entry.editor.blocks.focus('toolbar')
    await settle()
    const plus = entry.root.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)')
    const toolbox = entry.root.querySelector('.oe-toolbox')
    assert(plus instanceof HTMLButtonElement && toolbox instanceof HTMLElement, 'v2 toolbox controls are missing')
    plus.click()
    plus.click()
    assert(toolbox.style.display === 'none', 'rapid toolbox open/close left toolbox visible')

    const drag = entry.root.querySelector('.oe-toolbar__drag')
    const settings = entry.root.querySelector('.oe-settings-menu')
    assert(drag instanceof HTMLButtonElement && settings instanceof HTMLElement, 'v2 settings controls are missing')
    drag.click()
    drag.click()
    assert(settings.style.display === 'none', 'rapid settings open/close left settings visible')
  } finally {
    entry.editor.destroy()
    entry.holder.remove()
  }
}

async function run() {
  canonicalTransformProof()
  const cases = [
    ['locale-markup-boundary', localeMarkupBoundary],
    ['link-preview-request-ownership', linkPreviewOwnership],
    ['embed-cover-ownership', embedCoverOwnership],
    ['carousel-aborted-batch-object-urls', carouselAbortedBatchUrls],
    ['person-avatar-ownership', personAvatarOwnership],
    ['task-lifetime-ownership', taskLifetimeOwnership],
    ['toolbar-ownership', toolbarOwnership],
  ]
  const results = []
  for (const [name, callback] of cases) {
    sandbox.replaceChildren()
    await callback()
    results.push(name)
  }
  sandbox.replaceChildren()
  return results
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
