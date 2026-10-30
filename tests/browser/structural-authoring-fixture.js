// Fixed public-editor inputs shared by functional controls and the paired
// structural benchmark. Timed observations never supply their own data oracle.
export const structuralShapes = [
  { id: 'paragraph-small', type: 'paragraph', size: 1 },
  { id: 'table-small', type: 'table', size: 2 },
  { id: 'table-large', type: 'table', size: 20 },
  { id: 'gallery-small', type: 'gallery', size: 3 },
  { id: 'gallery-large', type: 'gallery', size: 48 },
  { id: 'columns-small', type: 'columns', size: 2, words: 2 },
  { id: 'columns-large', type: 'columns', size: 3, words: 256 },
]
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const first = '<b>Alpha</b> {{mention}} {{opaque}} tail'
const last = '<i>Last</i> {{second}} tail'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (actual, expected, message) => {
  if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) throw new Error(message)
}
const check = (condition, message) => { if (!condition) throw new Error(message) }

function payload(shape) {
  if (shape.type === 'paragraph') return { text: first + ' {{second}} tail' }
  if (shape.type === 'table') return { withHeadings: false, rows: Array.from({ length: shape.size }, (_, row) => ({
    id: `row-${row}`, cells: Array.from({ length: shape.size }, (_, column) => ({
      id: `cell-${row}-${column}`, text: row === 0 && column === 0 ? first
        : row === shape.size - 1 && column === shape.size - 1 ? last : `<b>Cell ${row}:${column}</b> tail`,
    })),
  })) }
  if (shape.type === 'gallery') return { images: Array.from({ length: shape.size }, (_, index) => ({
    id: `image-${index}`, url: pixel, caption: index === 0 ? first : index === shape.size - 1 ? last : `<b>Image ${index}</b> tail`,
  })), layout: '3a', styles: {}, options: {
    loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false,
  } }
  return { layout: shape.size === 3 ? '1-1-1' : '1-1', columns: Array.from({ length: shape.size }, (_, index) => ({
    id: `column-${index}`, content: `<b>Column ${index}</b> ` + '<i>word</i> '.repeat(shape.words)
      + (index === 0 ? first : index === shape.size - 1 ? last : 'Middle tail'),
  })) }
}
function edit(shape, data) {
  const next = clone(data)
  if (shape.type === 'paragraph') next.text += 'X'
  else if (shape.type === 'table') next.rows[0].cells[0].text += 'X'
  else if (shape.type === 'gallery') next.images[0].caption += 'X'
  else next.columns[0].content += 'X'
  return next
}
const fieldDetails = shape => shape.type === 'table' ? { selector: '.oe-table__cell', key: 'cell:row-0:cell-0-0' }
  : shape.type === 'gallery' ? { selector: '.oe-gallery__slot-caption', key: 'image:image-0:caption' }
  : shape.type === 'columns' ? { selector: '.oe-columns__col', key: 'column:column-0' }
  : { selector: '.oe-paragraph', key: 'text' }

const authoredFields = (shape, data) => shape.type === 'table' ? data.rows.flatMap(row => row.cells.map(cell => cell.text))
  : shape.type === 'gallery' ? data.images.map(image => image.caption)
  : shape.type === 'columns' ? data.columns.map(column => column.content) : [data.text]
const visibleText = html => {
  const template = document.createElement('template')
  // An independent browser parser for these fixed authored strings; no product
  // serializer, schema or output snapshot supplies the expected presentation.
  template.innerHTML = html.replaceAll('{{mention}}', '@Ada').replaceAll('{{second}}', '@Grace')
  return template.content.textContent
}
const fieldText = element => element.textContent.replace(/[\u200b\ufeff]/g, '')

function counters() {
  const values = { jsonRecordVisits: 0, structuredPayloadVisits: 0, childListsRead: 0, nodeClones: 0, elementsCreated: 0 }
  const symbols = Object.getOwnPropertySymbols
  const children = Object.getOwnPropertyDescriptor(Node.prototype, 'childNodes')
  const cloneNode = Node.prototype.cloneNode, createElement = Document.prototype.createElement
  Object.getOwnPropertySymbols = value => {
    values.jsonRecordVisits++
    if (['rows', 'images', 'columns'].some(key => Array.isArray(Object.getOwnPropertyDescriptor(value, key)?.value))) values.structuredPayloadVisits++
    return symbols(value)
  }
  Object.defineProperty(Node.prototype, 'childNodes', { ...children, get() {
    values.childListsRead++
    return children.get.call(this)
  } })
  Node.prototype.cloneNode = function (...args) { values.nodeClones++; return Reflect.apply(cloneNode, this, args) }
  Document.prototype.createElement = function (...args) { values.elementsCreated++; return Reflect.apply(createElement, this, args) }
  return { values, restore() {
    Object.getOwnPropertySymbols = symbols
    Object.defineProperty(Node.prototype, 'childNodes', children)
    Node.prototype.cloneNode = cloneNode
    Document.prototype.createElement = createElement
  } }
}

export async function createStructuralFixture(shape, { prefix = '', native, sensitivity = null } = {}) {
  const [{ createEditor }, plugins, mention] = await Promise.all([
    import(prefix + '/core/index.js'), import(prefix + '/plugins/index.js'),
    import(prefix + '/inline-plugins/mention/index.js'),
  ])
  const factory = { paragraph: 'createParagraphPlugin', table: 'createTablePlugin', gallery: 'createGalleryPlugin', columns: 'createColumnsPlugin' }[shape.type]
  const baseData = payload(shape), changedData = edit(shape, baseData)
  const record = data => ({ id: 'probe', type: shape.type, dataVersion: 2, data, tunes: { textAlign: 'left' }, inline: {
    mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
    second: { type: 'mention', dataVersion: 1, data: { id: 'grace', name: 'Grace' } },
    opaque: { type: 'structural-unloaded-control', dataVersion: 7, data: { label: 'Opaque', nested: { value: 1 } } },
  } })
  const blocks = data => [{ id: 'before', type: 'paragraph', dataVersion: 2, data: { text: '<b>Before</b>' } },
    record(data), { id: 'after', type: 'paragraph', dataVersion: 2, data: { text: '<i>After</i>' } }]
  const input = { version: '2.0.0', blocks: blocks(clone(baseData)) }, originalInput = JSON.stringify(input)
  const holder = document.createElement('section')
  holder.style.width = '1000px'; document.body.appendChild(holder)
  let active = null, notices = 0, providerCalls = 0, retention = null
  let editor
  try { editor = createEditor({ holder, injectStyles: true, historyMaxStack: 1, changeDebounceMs: 0,
    plugins: shape.type === 'paragraph' ? [plugins.createParagraphPlugin()] : [plugins.createParagraphPlugin(), plugins[factory]()],
    inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providerCalls++; return [] } })],
    inlineTools: [], data: input,
    onChange(document) {
      notices++
      if (retention) retention.released.push(new WeakRef(document))
      if (active) {
        active.notice = document; active.notifiedAt = performance.now()
        if (sensitivity !== 'missing-notification') active.notify()
      }
    },
  }) } catch (error) { holder.remove(); throw error }
  const stop = [editor.on('transaction:committed', event => {
    if (retention) retention.released.push(new WeakRef(event))
    if (active) { active.transactions++; active.action = event.action }
  }), editor.on('document:changed', event => {
    if (retention) retention.released.push(new WeakRef(event))
    if (active) active.documents++
  })]
  const beforeInput = event => { if (active && holder.contains(event.target)) { active.inputAt = performance.now(); active.trusted = event.isTrusted } }
  const afterInput = event => { if (active && holder.contains(event.target)) active.inputFinishedAt = performance.now() }
  document.addEventListener('beforeinput', beforeInput, true); document.addEventListener('input', afterInput)
  const destroy = () => {
    stop.forEach(dispose => dispose())
    document.removeEventListener('beforeinput', beforeInput, true); document.removeEventListener('input', afterInput)
    editor.destroy(); holder.remove()
  }
  try {
  await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.sheet ? null : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Structural stylesheet did not load: ' + link.href)), 5000)
    link.addEventListener('load', () => { clearTimeout(timer); resolve() }, { once: true })
    link.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Structural stylesheet failed: ' + link.href)) }, { once: true })
  })))
  await Promise.all([...holder.querySelectorAll('img')].map(image => image.decode()))
  await frames(); await pause(20)
  const root = holder.querySelector('.oe-editor'), probe = root.querySelector('[data-block-id="probe"]')
  const details = fieldDetails(shape), fields = [...probe.querySelectorAll(details.selector)]
  const neighbors = ['before', 'after'].map(id => root.querySelector(`[data-block-id="${id}"]`))
  check(fields.length === (shape.type === 'table' ? shape.size ** 2 : shape.type === 'paragraph' ? 1 : shape.size), 'Wrong mounted field count')
  check(fields.every(field => field.isConnected && field.getBoundingClientRect().width > 0), 'A structural field is not laid out')
  same(editor.save().blocks, blocks(baseData), 'Initial data differs from the fixed structural oracle')
  const siblingDescendants = fields.slice(1).map(field => [...field.querySelectorAll('*')])
  let serial = 0
  const verify = data => {
    const saved = editor.save()
    if (retention) retention.released.push(new WeakRef(saved))
    same(saved.blocks, blocks(data), 'Structural document or sidecars changed unexpectedly')
    check(JSON.stringify(input) === originalInput, 'Caller input was mutated')
    check(providerCalls === 0, 'Fixture unexpectedly called a provider')
    check(neighbors.every((node, index) => node === root.querySelector(`[data-block-id="${index ? 'after' : 'before'}"]`)), 'Neighbor identity changed')
    const current = [...probe.querySelectorAll(details.selector)]
    check(fields.every((node, index) => node === current[index]), 'Unchanged structural field host was replaced')
    check(fields.slice(1).every(field => field.isConnected), 'Sibling field was detached')
    same(current.map(fieldText), authoredFields(shape, data).map(visibleText), 'Structural DOM differs from fixed authored text')
    check(siblingDescendants.every((nodes, index) => {
      const currentNodes = [...current[index + 1].querySelectorAll('*')]
      return currentNodes.length === nodes.length && nodes.every((node, at) => node === currentNodes[at])
    }), 'An untouched sibling mark or inline instance was replaced')
  }
  async function step(kind, expected, { instrument = false, traceId = '' } = {}) {
    const changes = !kind.startsWith('noop'), beforeNotices = notices
    const bookmark = { canUndo: editor.canUndo, canRedo: editor.canRedo }
    let notify, timer
    const notified = new Promise((resolve, reject) => { notify = resolve; if (changes) timer = setTimeout(() => reject(new Error('Missing scheduled onChange')), sensitivity === 'missing-notification' ? 80 : 5000) })
    active = { transactions: 0, documents: 0, notice: null, notify, trusted: false, inputAt: null, inputFinishedAt: null }
    const state = active, count = instrument ? counters() : null
    const label = traceId || `structural-${++serial}`
    performance.mark(label + ':start')
    const began = performance.now()
    let synchronousMs
    try {
      if (kind === 'native') await native('type', 'X')
      else if (kind === 'composition') {
        let trustedStart = false
        const started = event => { trustedStart = event.isTrusted }
        fields[0].addEventListener('compositionstart', started, { once: true })
        try {
          await native('compose', { text: 'に', selectionStart: 1, selectionEnd: 1 })
          await pause(30)
          same(editor.save().blocks, blocks(baseData), 'Live composition published preedit text')
          same([state.transactions, state.documents, notices - beforeNotices], [0, 0, 0], 'Live composition published notifications')
          check(trustedStart, 'Composition did not start through the browser input method')
          await native('insert', 'X')
        } finally { fields[0].removeEventListener('compositionstart', started) }
        synchronousMs = null // The input-method round trip is not a synchronous call.
      }
      else {
        if (kind === 'public') editor.blocks.update('probe', () => ({ data: clone(changedData) }))
        else if (kind === 'noop-empty') editor.blocks.update('probe', () => ({}))
        else if (kind === 'noop-equal') editor.blocks.update('probe', () => ({ data: clone(baseData) }))
        else if (kind === 'undo' || kind === 'reset') check(editor.undo(), 'Undo was unavailable')
        else if (kind === 'redo') check(editor.redo(), 'Redo was unavailable')
        else throw new Error('Unknown structural operation')
        synchronousMs = performance.now() - began
      }
      if (changes) await notified
      else await pause(50)
      clearTimeout(timer)
      await frames()
      performance.mark(label + ':end')
      const finished = performance.now(), start = kind === 'native' ? state.inputAt : began
      count?.restore()
      if (kind === 'native') check(state.trusted && state.inputFinishedAt >= state.inputAt, 'Expected trusted complete native input')
      same([state.transactions, state.documents, notices - beforeNotices], changes ? [1, 1, 1] : [0, 0, 0], 'Wrong complete-path notification count')
      if (changes) same(state.notice.blocks, blocks(expected), 'Scheduled onChange delivered stale or wrong data')
      else same({ canUndo: editor.canUndo, canRedo: editor.canRedo }, bookmark, 'No-op moved history')
      if (sensitivity === 'sibling-data' && expected === changedData) fields.at(-1).textContent = 'Deliberate sibling poison'
      try { verify(expected) } catch (error) { throw new Error(`${shape.id}/${kind}: ${error.message}`, { cause: error }) }
      return { kind, traceId: label, synchronousMs: kind === 'native' ? state.inputFinishedAt - state.inputAt : synchronousMs,
        notificationMs: changes ? state.notifiedAt - start : null, settledRenderOpportunityMs: finished - start,
        driverRoundTripMs: finished - began, transactions: state.transactions, documents: state.documents,
        notifications: notices - beforeNotices, trustedNativeInput: kind === 'native' ? state.trusted : null,
        counters: count?.values ?? null }
    } finally { clearTimeout(timer); count?.restore(); active = null }
  }
  return {
    metadata: { shape, documentUtf8Bytes: new TextEncoder().encode(JSON.stringify(input)).length, fields: fields.length,
      widgets: probe.querySelectorAll('[data-inline-plugin]').length, opaqueSidecars: 1, configuredHistoryMaxStack: 1,
      configuredChangeDebounceMs: 0, viewport: { width: innerWidth, height: innerHeight } },
    beginRetention() {
      const positive = editor.save()
      retention = { positive, positiveReference: new WeakRef(positive), released: [] }
    },
    observeRetention() {
      check(retention, 'Retention controls were not initialized')
      return { observedReleasedObjects: retention.released.length,
        retainedReleasedObjects: retention.released.filter(reference => reference.deref()).length,
        livePositiveControl: retention.positiveReference.deref() === retention.positive,
        liveFieldControls: fields.filter(field => field.isConnected).length,
        canUndo: editor.canUndo, canRedo: editor.canRedo }
    },
    async sample(kind, options = {}) {
      verify(baseData)
      check(editor.blocks.focus('probe', { fieldKey: details.key, offset: 'end' }), 'Public field focus was rejected')
      await frames()
      const traceId = options.traceId ?? `structural-sample-${++serial}`
      const result = [await step(kind, kind.startsWith('noop') ? baseData : changedData, { ...options, traceId: traceId + ':edit' })]
      if (!kind.startsWith('noop')) {
        result.push(await step('undo', baseData, { ...options, traceId: traceId + ':undo' }))
        check(!editor.canUndo, 'One edit produced more than one Undo action')
        result.push(await step('redo', changedData, { ...options, traceId: traceId + ':redo' }))
        await step('reset', baseData)
      }
      return result
    },
    destroy,
  }
  } catch (error) { destroy(); throw error }
}
