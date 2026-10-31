// Fixed source records are the oracle. Adapters translate only published API
// envelopes; a missing historical capability is declared before execution.
const pause = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (actual, expected) => JSON.stringify(stable(actual)) === JSON.stringify(stable(expected))
const withoutIds = files => files.map(({ id, ...file }) => file)
const seed = { id: 'existing-file', url: '/controlled/existing.csv?owner=old#kept', name: 'Existing <i>& Ω.csv', size: 1024, extension: 'CSV' }
const sourceFiles = [
  { name: 'Отчёт <b>& e\u0301😀.txt', type: 'text/plain', bytes: [0, 1, 2, 127, 255], extension: 'txt' },
  { name: 'empty.csv', type: 'text/csv', bytes: [], extension: 'csv' },
  { name: 'Отчёт <b>& e\u0301😀.txt', type: 'text/plain', bytes: [72, 101, 108, 108, 111, 10, 0], extension: 'txt' },
]
const libraryFiles = [
  { url: 'https://files.example.test/library/a.txt?download=1#part', name: 'Library <u>& e\u0301😀.txt', size: 2048, extension: 'TXT' },
  { url: '/controlled/library/empty.csv', name: 'empty.csv', size: 0, extension: 'csv' },
  { url: '/controlled/library/duplicate.txt?record=3', name: 'Library <u>& e\u0301😀.txt', size: 7, extension: 'txt' },
]
const uploadedUrl = index => `/controlled/upload/${index}.bin?batch=source#record-${index}`
const uploadedSize = index => index === 0 ? 2048 : index === 1 ? 0 : sourceFiles[index].bytes.length
const sizeText = value => ({ 0: '', 5: '5B', 7: '7B', 1024: '1KB', 2048: '2KB' })[value]
const sourceCase = (source, route, count, populated, extra = {}) => ({
  id: `ATTACHES_FILES/${source}/${route}/${count === 1 ? 'single' : 'multiple'}-${populated ? 'populated' : 'empty'}`,
  source, route, count, populated, ...extra,
})
export const attachesFilesCases = [
  ...['local', 'upload'].flatMap(source => [
    sourceCase(source, 'picker', 1, false), sourceCase(source, 'picker', 3, true),
    sourceCase(source, 'drop', 1, false), sourceCase(source, 'drop', 3, false), sourceCase(source, 'drop', 3, true),
  ]),
  sourceCase('action', 'action', 1, false), sourceCase('action', 'action', 3, true),
  sourceCase('upload', 'picker', 3, true, { id: 'ATTACHES_FILES/upload/picker/rejected-sibling', rejectIndex: 1 }),
  sourceCase('upload', 'drop', 3, false, { id: 'ATTACHES_FILES/upload/drop/unsafe-url-sibling', unsafeIndex: 1 }),
  sourceCase('action', 'action', 3, true, { id: 'ATTACHES_FILES/action/mixed-urls', unsafeIndex: 1 }),
  ...['null', 'empty', 'reject'].map(outcome => sourceCase('action', 'action', 0, true, {
    id: `ATTACHES_FILES/action/${outcome}`, outcome,
  })),
]
export const plannedAttachesFilesPhases = specification => ['load', 'source',
  ...(!specification.outcome ? ['rename', 'undo-rename', 'undo-source', 'redo-source', 'redo-rename'] : []),
  'read-only', 'editable', 'destroy']

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Attaches file-source styles did not load')
    await pause()
  }
  await pause()
}

export async function runAttachesFilesCase(specification, { sourceBase = '../../', legacy = false, native }) {
  // v1 installs drop listeners only with its empty selection view, and aborts
  // that view when files are displayed. Current populated-block drop is an
  // additional capability, not a historical execution error.
  if (legacy && specification.route === 'drop' && specification.populated) return {
    id: specification.id, unsupported: 'v1 Attaches exposes file drop only in the empty selection view; empty single/multiple drop remains executed.',
    observations: [], phases: [], completedPhases: [], trusted: [], pageErrors: [], error: null,
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, attaches, { EditorRenderer }] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/attaches/index.js', base).href),
    import(new URL('renderer/index.js', base).href),
  ])
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.cssText = 'width:640px;margin:100px 80px 40px'
  output.style.cssText = 'width:640px;margin:40px 80px'
  document.body.append(holder, output)
  const original = specification.populated ? [clone(seed)] : []
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'subject', type: 'attaches',
    ...(!legacy ? { dataVersion: 2 } : {}), data: { files: legacy ? withoutIds(original) : clone(original), variant: 'f' }, inline: {} }] }
  const supplied = clone(input), observations = [], phases = [], completedPhases = [], trusted = [], pageErrors = []
  const providerCalls = [], allocations = [], revoked = [], allocationReads = [], pickerEvents = [], pickerActivations = []
  const check = (phase, property, actual, expected) => {
    const observed = clone(actual), required = clone(expected)
    observations.push({ phase, property, actual: observed, expected: required, status: same(observed, required) ? 'PASS' : 'FAIL' })
  }
  let editor, renderer, currentPhase = 'load', error = null, expectedIds = null
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  const originalInputClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return originalInputClick.call(this)
    const record = { connected: this.isConnected, multiple: this.multiple, activeGesture: navigator.userActivation.isActive }
    let click
    this.addEventListener('click', event => { click = event }, { capture: true, once: true })
    pickerActivations.push(record)
    const result = originalInputClick.call(this)
    Object.assign(record, { clickReached: !!click, clickPrevented: click?.defaultPrevented ?? null, connectedAfterClick: this.isConnected })
    return result
  }
  const captureError = event => pageErrors.push({ phase: currentPhase, message: event.message ?? String(event.reason), stack: (event.error ?? event.reason)?.stack ?? null })
  const capturePicker = event => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'file') return
    pickerEvents.push({ type: event.type, trusted: event.isTrusted, multiple: event.target.multiple,
      files: [...event.target.files].map(file => ({ name: file.name, type: file.type, size: file.size })) })
  }
  addEventListener('error', captureError); addEventListener('unhandledrejection', captureError)
  document.addEventListener('change', capturePicker, true)
  URL.createObjectURL = function (blob) {
    const url = originalCreate.call(this, blob)
    const record = { url, name: blob.name, type: blob.type, size: blob.size, bytes: null }
    allocations.push(record)
    allocationReads.push(blob.arrayBuffer().then(buffer => { record.bytes = [...new Uint8Array(buffer)] }))
    return url
  }
  URL.revokeObjectURL = function (url) { revoked.push(String(url)); return originalRevoke.call(this, url) }
  const chosen = sourceFiles.slice(0, specification.count)
  const actionResult = specification.outcome === 'null' ? null : specification.outcome === 'empty' ? []
    : libraryFiles.slice(0, specification.count).map((entry, index) => ({ ...entry,
      ...(index === specification.unsafeIndex ? { url: 'javascript:window.__attachesUnexpectedEffect=1' } : {}),
    }))
  const actionSupplied = clone(actionResult)
  const config = {
    ...(specification.source === 'upload' ? { uploadFile: async (file, { signal }) => {
      const index = providerCalls.length
      const entry = { kind: 'upload', name: file.name, type: file.type, size: file.size,
        bytes: [...new Uint8Array(await file.arrayBuffer())], hasSignal: signal instanceof AbortSignal, abortedAtEntry: signal.aborted }
      providerCalls.push(entry)
      await pause(15)
      if (index === specification.rejectIndex) throw new Error('controlled upload rejection')
      return { url: index === specification.unsafeIndex ? 'javascript:window.__attachesUnexpectedEffect=1' : uploadedUrl(index),
        ...(index < 2 ? { size: uploadedSize(index) } : {}) }
    } } : {}),
    actions: [{ label: 'Controlled library', handler: async ({ signal }) => {
      providerCalls.push({ kind: 'action', hasSignal: signal instanceof AbortSignal, abortedAtEntry: signal.aborted })
      await pause(15)
      if (specification.outcome === 'reject') throw new Error('controlled library rejection')
      return actionResult
    } }],
  }
  try {
    const definition = legacy ? new attaches.Attaches(config) : attaches.createAttachesPlugin(config)
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'attaches', plugins: [definition], inlineTools: [], data: input,
      locale: { 'plugin.attaches.dropzoneUpload': 'Choose files', 'plugin.attaches.add': 'Choose files',
        'plugin.attaches.addFiles': 'Choose files', 'plugin.attaches.open': 'Open file' },
    })
    renderer = new EditorRenderer({ blockTypes: ['attaches'], injectStyles: true })
    holder.addEventListener('input', event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, inputType: event.inputType }))
    const wrapper = () => holder.querySelector('.oe-attaches')
    const fields = () => [...wrapper().querySelectorAll('.oe-attaches__name')]
    const clicked = async (element, files = null) => {
      if (!element) throw new Error(`Missing Attaches source control during ${currentPhase}`)
      await settled(); element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      if (!rect.width || !rect.height || !element.contains(document.elementFromPoint(x, y))) throw new Error(`Unavailable control: ${element.outerHTML}`)
      const listener = event => trusted.push({ phase: currentPhase, type: 'click', trusted: event.isTrusted, intendedControl: element.contains(event.target) })
      document.addEventListener('click', listener, { capture: true, once: true })
      try { return await native(files ? 'files' : 'click', { x, y, ...(files ? { files } : {}) }) }
      finally { document.removeEventListener('click', listener, true) }
    }
    const capture = (phase, files, history, readOnly = false) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      check(phase, 'documentLength', saved.blocks.length, 1)
      check(phase, 'blockIdentity', [block?.id, block?.type], ['subject', 'attaches'])
      check(phase, 'canonicalFiles', legacy ? block?.data.files : withoutIds(block?.data.files ?? []), withoutIds(files))
      check(phase, 'variant', block?.data.variant, 'f')
      check(phase, 'callerInput', input, supplied)
      check(phase, 'providerOutputUnchanged', actionResult, actionSupplied)
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'editorNames', fields().map(field => ({ name: field.textContent, elements: field.childElementCount })), files.map(file => ({ name: file.name, elements: 0 })))
      check(phase, 'editableCount', wrapper().querySelectorAll('[contenteditable="true"]').length, readOnly ? 0 : files.length)
      check(phase, 'editorMetadata', [...wrapper().querySelectorAll('.oe-attaches__notion-row')].map(row => ({
        size: row.querySelector('.oe-attaches__notion-size')?.textContent ?? '', extension: row.querySelector('.oe-attaches__notion-tag')?.textContent ?? '',
      })), files.map(file => ({ size: sizeText(file.size), extension: file.extension.toUpperCase() })))
      if (!legacy) {
        const ids = block.data.files.map(file => file.id)
        check(phase, 'fileIdsValid', ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length, true)
        if (expectedIds) check(phase, 'fileIdsStable', ids, phase === 'undo-source' ? original.map(file => file.id) : expectedIds)
        if (original.length) check(phase, 'existingId', ids[0], seed.id)
      }
      renderer.renderTo(saved, output)
      check(phase, 'rendererFiles', [...output.querySelectorAll('.editor-attaches__notion-row')].map(row => {
        const link = row.matches('a') ? row : row.querySelector('a')
        return { name: row.querySelector('.editor-attaches__notion-name')?.textContent,
          elements: row.querySelector('.editor-attaches__notion-name')?.childElementCount,
          url: link?.getAttribute('href'), download: link?.getAttribute('download'),
          size: row.querySelector('.editor-attaches__notion-size')?.textContent ?? '', extension: row.querySelector('.editor-attaches__notion-tag')?.textContent ?? '',
        }
      }), files.map(file => ({ name: file.name, elements: 0, url: file.url, download: file.name, size: sizeText(file.size), extension: file.extension.toUpperCase() })))
      check(phase, 'unsafeUrlEffect', window.__attachesUnexpectedEffect, undefined)
      phases.push({ phase, blocks: clone(saved.blocks) }); completedPhases.push(phase)
    }
    await settled()
    capture('load', original, { canUndo: false, canRedo: false })
    currentPhase = 'source'
    if (specification.route === 'action') {
      await clicked([...wrapper().querySelectorAll('button')].find(button => button.textContent.trim() === 'Controlled library'))
    } else if (specification.route === 'picker') {
      const picked = await clicked([...wrapper().querySelectorAll('button')].find(button => button.textContent.trim() === 'Choose files'), chosen)
      check('source', 'multipleFilePicker', picked.multiple, true)
    } else {
      const transfer = new DataTransfer()
      for (const file of chosen) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }))
      const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
      wrapper().dispatchEvent(event)
      trusted.push({ phase: currentPhase, type: 'drop', trusted: event.isTrusted, controlledDataTransfer: true })
      check('source', 'dropHandled', event.defaultPrevented, true)
    }
    await pause(100)
    const deadline = Date.now() + 5000
    while (wrapper().classList.contains('oe-attaches--loading')) {
      if (Date.now() > deadline) throw new Error('File source never settled')
      await pause()
    }
    await Promise.all(allocationReads); await settled()
    const acceptedIndexes = chosen.map((_, index) => index).filter(index => index !== specification.rejectIndex && index !== specification.unsafeIndex)
    const added = specification.source === 'action' ? (Array.isArray(actionSupplied) ? actionSupplied.filter((_, index) => index !== specification.unsafeIndex) : [])
      : acceptedIndexes.map(index => ({ url: specification.source === 'upload' ? uploadedUrl(index) : allocations[index]?.url,
        name: chosen[index].name, size: specification.source === 'upload' ? uploadedSize(index) : chosen[index].bytes.length, extension: chosen[index].extension }))
    const combined = [...original, ...added], changed = added.length > 0
    if (!legacy) expectedIds = editor.save().blocks[0].data.files.map(file => file.id)
    capture('source', combined, { canUndo: changed, canRedo: false })
    check('source', 'providerCalls', providerCalls, specification.source === 'upload'
      ? chosen.map(file => ({ kind: 'upload', name: file.name, type: file.type, size: file.bytes.length, bytes: file.bytes, hasSignal: true, abortedAtEntry: false }))
      : specification.source === 'action' ? [{ kind: 'action', hasSignal: true, abortedAtEntry: false }] : [])
    check('source', 'pickerEvents', pickerEvents, specification.route === 'picker' ? [{ type: 'change', trusted: true, multiple: true,
      files: chosen.map(file => ({ name: file.name, type: file.type, size: file.bytes.length })) }] : [])
    check('source', 'pickerActivations', pickerActivations, specification.route === 'picker' ? [{ connected: true, multiple: true, activeGesture: true,
      clickReached: true, clickPrevented: false, connectedAfterClick: true }] : [])
    check('source', 'pickerRemoved', document.querySelectorAll('input[type="file"]').length, 0)
    check('source', 'allocatedFiles', allocations.map(({ url, ...file }) => file), specification.source === 'local'
      ? chosen.map(file => ({ name: file.name, type: file.type, size: file.bytes.length, bytes: file.bytes })) : [])
    check('source', 'distinctObjectUrls', new Set(allocations.map(entry => entry.url)).size, allocations.length)
    check('source', 'noEarlyRevocation', revoked, [])
    let finalFiles = combined
    if (!specification.outcome) {
      currentPhase = 'rename'
      const field = fields()[original.length]
      if (!field) throw new Error('No accepted new filename available to edit')
      field.focus(); const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
      await native('type', 'X'); await settled()
      finalFiles = clone(combined); finalFiles[original.length].name += 'X'
      capture('rename', finalFiles, { canUndo: true, canRedo: false })
      editor.undo(); await settled(); capture('undo-rename', combined, { canUndo: true, canRedo: true })
      editor.undo(); await settled(); capture('undo-source', original, { canUndo: false, canRedo: true })
      editor.redo(); await settled(); capture('redo-source', combined, { canUndo: true, canRedo: true })
      editor.redo(); await settled(); capture('redo-rename', finalFiles, { canUndo: true, canRedo: false })
      for (const [index, allocation] of allocations.entries()) {
        const response = await fetch(allocation.url)
        check('redo-rename', `localBytes/${index}`, [...new Uint8Array(await response.arrayBuffer())], chosen[index].bytes)
      }
    }
    currentPhase = 'read-only'; editor.setReadOnly(true); await settled()
    capture('read-only', finalFiles, { canUndo: false, canRedo: false }, true)
    check('read-only', 'sourceControlsAbsent', [...wrapper().querySelectorAll('button')].filter(button => ['Choose files', 'Controlled library'].includes(button.textContent.trim())).length, 0)
    currentPhase = 'editable'; editor.setReadOnly(false); await settled()
    capture('editable', finalFiles, { canUndo: changed, canRedo: false })
    check('editable', 'noSourceRestart', providerCalls.length, specification.source === 'upload' ? chosen.length : specification.source === 'action' ? 1 : 0)
    currentPhase = 'destroy'; renderer.destroy(); renderer = null; editor.destroy(); editor = null
    check('destroy', 'releasedOwnedUrls', revoked.slice().sort(), allocations.map(entry => entry.url).sort())
    check('destroy', 'providerOutputUnchanged', actionResult, actionSupplied)
    completedPhases.push('destroy')
  } catch (failure) { error = failure?.stack ?? String(failure) }
  finally {
    renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove()
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke
    HTMLInputElement.prototype.click = originalInputClick
    document.removeEventListener('change', capturePicker, true)
    removeEventListener('error', captureError); removeEventListener('unhandledrejection', captureError)
  }
  return { id: specification.id, observations, phases, completedPhases, trusted, providerCalls, allocations, revoked, pickerEvents, pickerActivations, pageErrors, error }
}
