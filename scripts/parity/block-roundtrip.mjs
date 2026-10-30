// Portable public block ROUNDTRIP differential. Supply immutable baseline roots
// and an installed Playwright module; no production module is transformed.
// See block-roundtrip.md for the exact invocation and result boundaries.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { classifyLinkPollDifference, linkPollCaseIds } from './link-poll-roundtrip-classifiers.mjs'
import { classifyGalleryDifference, galleryCaseIds } from './gallery-roundtrip-classifiers.mjs'

// These fixed values recognize only captured historical Embed failures. They
// never adapt browser input, rewrite observations or grant candidate exceptions.
const embedCaseIds = ['BLOCK_EMBED_ROUNDTRIP/default', 'BLOCK_EMBED_ROUNDTRIP/populated',
  'BLOCK_EMBED_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_EMBED_ROUNDTRIP/populated-literal']
const embedPhases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const embedCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const embedMark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const embedCaption = (wrapped, edited, canonical = true) => canonical
  ? [embedMark('b', 'Alpha'), ...(wrapped
    ? [' ', embedMark('i', '{{mention}}'), ' ', embedMark('s', '{{swatch}}'), ' tail' + (edited ? 'X' : '')]
    : [' {{mention}} {{swatch}} tail' + (edited ? 'X' : '')])]
  : '<b>Alpha</b> ' + (wrapped ? '<i>{{mention}}</i> <s>{{swatch}}</s>' : '{{mention}} {{swatch}}') + ' tail' + (edited ? 'X' : '')
function embedRecords({ legacy = false, wrapped = false, edited = false, sidecars = true, canonical = true }) {
  const record = (id, type, version, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: version } : {}), data,
    ...(inline ? { inline } : {}) })
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }) }
  return [
    record('prefix', 'paragraph', 2, { text: canonical ? [embedMark('b', 'Before')] : '<b>Before</b>' }),
    record('probe', 'embed', 1, { service: 'vimeo', videoId: '12345678', caption: embedCaption(wrapped, edited, canonical),
      cover: embedCover, title: 'Local preview', duration: '1:23' }, sidecars ? inline : undefined),
    record('suffix', 'paragraph', 2, { text: canonical ? [embedMark('i', 'After')] : '<i>After</i>' }),
  ]
}
const embedRendered = edited => [[embedMark('b', 'Before')], {
  children: ['DIV', 'FIGCAPTION'], caption: embedCaption(false, edited),
  preview: embedCover, previewAlt: 'Local preview', title: 'Local preview', duration: '1:23', frames: 0,
}, [embedMark('i', 'After')]]
const embedWidgets = [{ id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' }]
const embedCaret = offset => ({ focused: true, anchor: offset, focus: offset, collapsed: true })
const embedSelectionOwner = (text, offset) => ({
  active: { block: 'probe', node: 'DIV', className: 'oe-embed__caption' },
  anchor: { block: 'probe', node: '#text', text, offset },
  focus: { block: 'probe', node: '#text', text, offset },
})
function classifyEmbedDifference(source, entry, failure) {
  if (!embedCaseIds.includes(entry.id) || !['v1', 'spec-baseline'].includes(source)) return null
  if (failure.status !== (failure.property === 'execution' ? 'ERROR' : 'FAIL')) return null
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const phase = name => entry.phases?.find(item => item.phase === name)
  const empty = entry.id === 'BLOCK_EMBED_ROUNDTRIP/default'
  const wrapped = entry.id === 'BLOCK_EMBED_ROUNDTRIP/populated'
  const widgetCase = wrapped || entry.id === 'BLOCK_EMBED_ROUNDTRIP/populated-unwrapped-control'
  const completed = same(entry.completedPhases, empty ? ['load', 'read-only', 'editable-again', 'dispose'] : [...embedPhases, 'dispose'])
  if (source === 'v1' && completed) {
    const mode = ['read-only', 'editable-again'].includes(failure.phase)
    const remountPhase = mode || !empty && ['undo', 'redo'].includes(failure.phase)
    const size = failure.property === 'blockDomIdentity' ? empty ? 1 : 3
      : failure.property === 'embedWrapperIdentity' || failure.property === 'embedCaptionIdentity' && !empty && mode ? 1 : 0
    if (remountPhase && size && matches(Array(size).fill(false), Array(size).fill(true))) {
      return mode ? 'repaired-v1-mode-remount' : 'repaired-v1-history-remount'
    }
    const id = phase('load')?.blocks?.[0]?.id
    if (empty && failure.phase === 'editable-again' && failure.property === 'foreignFocusPreserved'
      && typeof id === 'string' && id.length > 0 && matches(false, true)
      && same(phase('editable-again')?.selectionOwner, {
        active: { block: id, node: 'INPUT', className: 'oe-embed__url-input' },
        anchor: { block: id, node: 'DIV', text: '', offset: 1 },
        focus: { block: id, node: 'DIV', text: '', offset: 1 },
      })) return 'repaired-v1-empty-embed-mode-focus'
    if (widgetCase && embedPhases.includes(failure.phase)) {
      const edited = ['edit', 'redo'].includes(failure.phase)
      if (failure.property === 'canonicalRecords'
        && matches(embedRecords({ legacy: true, wrapped, edited, sidecars: false }), embedRecords({ legacy: true, wrapped, edited }))) {
        return 'unsupported-v1-embed-caption-sidecars'
      }
      if (['editorWidgets', 'detachedWidgets', 'attachedDetachedWidgets', 'mountedWidgets'].includes(failure.property)
        && matches([], embedWidgets)) return 'unsupported-v1-embed-caption-widgets'
      const owner = embedSelectionOwner(wrapped ? ' tailX' : ' {{mention}} {{swatch}} tailX', wrapped ? 6 : 29)
      if (failure.phase === 'edit' && failure.property === 'fixtureCaret' && matches(embedCaret(33), embedCaret(14))
        && same(phase('edit')?.selectionOwner, owner)) return 'unsupported-v1-embed-widget-caret'
      if (['edit', 'redo'].includes(failure.phase) && failure.property === 'nativeSelection'
        && matches(embedCaret(34), embedCaret(15)) && same(phase(failure.phase)?.selectionOwner, owner)) {
        return 'unsupported-v1-embed-widget-caret'
      }
    }
    if (!empty && failure.phase === 'undo' && failure.property === 'nativeSelection'
      && matches({ focused: false, anchor: null, focus: null, collapsed: true }, embedCaret(widgetCase ? 14 : 18))
      && same(phase('undo')?.selectionOwner, {
        active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
        anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
        focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
      })) return 'repaired-v1-first-undo-caret'
  }
  if (source === 'spec-baseline' && wrapped && failure.phase === 'read-only-transition' && failure.property === 'execution'
    && failure.actual === 'Inline widget root left its projection boundary before hydration'
    && !Object.hasOwn(failure, 'expected')
    && same(entry.completedPhases, ['load'])
    && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) {
    return 'repaired-baseline-formatted-widget-mode-failure'
  }
  if (source === 'spec-baseline' && entry.id === 'BLOCK_EMBED_ROUNDTRIP/populated-unwrapped-control'
    && completed && failure.phase === 'redo'
    && same(phase('edit')?.blocks, embedRecords({ edited: true, canonical: false }))
    && same(phase('undo')?.blocks, embedRecords({ canonical: false }))
    && same(phase('redo')?.blocks, embedRecords({ canonical: false }))
    && same(phase('redo')?.selectionOwner, embedSelectionOwner(' tail', 5))) {
    const values = {
      canonicalRecords: [embedRecords({}), embedRecords({ edited: true })],
      editorAuthoredMarkup: [embedCaption(false, false), embedCaption(false, true)],
      embedWrapperIdentity: [[false], [true]],
      historyState: [{ canUndo: false, canRedo: true }, { canUndo: true, canRedo: false }],
      blockDomIdentity: [[true, false, true], [true, true, true]],
      widgetDomIdentity: [[false, false], [true, true]],
      nativeSelection: [embedCaret(14), embedCaret(15)],
      detachedAuthoredMarkup: [embedRendered(false), embedRendered(true)],
      attachedDetachedAuthoredMarkup: [embedRendered(false), embedRendered(true)],
      mountedAuthoredMarkup: [embedRendered(false), embedRendered(true)],
      exactEditedRecords: [embedRecords({ canonical: false }), embedRecords({ edited: true, canonical: false })],
    }
    const value = Object.hasOwn(values, failure.property) ? values[failure.property] : null
    if (value && matches(value[0], value[1])) return 'repaired-baseline-embed-redo'
  }
  return null
}

function classifyEmbedPageErrors(source, cases, errors, pageErrors, origin) {
  const unmatched = { classifiedPageErrors: [], unexpectedErrors: errors, unexpectedPageErrors: pageErrors }
  // Preserve both raw channels. Only the observed one-to-one error pair can
  // be attributed; duplicates, orphan reports and every other source fail.
  if (source !== 'spec-baseline' || errors.length !== 1 || pageErrors.length !== 1) return unmatched
  const error = pageErrors[0]
  const stack = `Error: Inline widget root left its projection boundary before hydration
    at #hydrateField (${origin}/spec-baseline/core/InlineProjectionRuntime.js:788:17)
    at #projectState (${origin}/spec-baseline/core/InlineProjectionRuntime.js:603:25)
    at InlineProjectionRuntime.reconcileBlock (${origin}/spec-baseline/core/InlineProjectionRuntime.js:99:27)
    at Object.apply (${origin}/spec-baseline/core/BlockReconciler.js:466:36)
    at #replayObserved (${origin}/spec-baseline/core/TransactionEngine.js:331:34)
    at ${origin}/spec-baseline/core/TransactionEngine.js:298:80
    at #observeCommand (${origin}/spec-baseline/core/TransactionEngine.js:500:14)
    at #replay (${origin}/spec-baseline/core/TransactionEngine.js:298:32)
    at TransactionEngine.redo (${origin}/spec-baseline/core/TransactionEngine.js:273:31)
    at DocumentRuntime.redo (${origin}/spec-baseline/core/DocumentRuntime.js:768:25)`
  if (error.source !== source || error.caseId !== 'BLOCK_EMBED_ROUNDTRIP/populated-unwrapped-control'
    || error.phase !== 'redo' || error.name !== 'Error'
    || error.message !== 'Inline widget root left its projection boundary before hydration'
    || error.stack !== stack || errors[0] !== stack) return unmatched
  const entry = cases.find(item => item.id === error.caseId)
  const properties = ['canonicalRecords', 'editorAuthoredMarkup', 'embedWrapperIdentity', 'historyState',
    'blockDomIdentity', 'widgetDomIdentity', 'nativeSelection', 'detachedAuthoredMarkup',
    'attachedDetachedAuthoredMarkup', 'mountedAuthoredMarkup', 'exactEditedRecords']
  if (!entry || entry.failures.length !== properties.length
    || JSON.stringify(entry.failures.map(failure => failure.property).sort()) !== JSON.stringify(properties.sort())
    || !entry.failures.every(failure => classifyEmbedDifference(source, entry, failure) === 'repaired-baseline-embed-redo')) return unmatched
  for (const [phase, actual, expected] of [
    ['edit', { canUndo: true, canRedo: false }, { canUndo: true, canRedo: false }],
    ['undo', { canUndo: false, canRedo: true }, { canUndo: false, canRedo: true }],
    ['redo', { canUndo: false, canRedo: true }, { canUndo: true, canRedo: false }],
  ]) {
    const history = entry.observations?.find(item => item.phase === phase && item.property === 'historyState')
    if (JSON.stringify(history?.actual) !== JSON.stringify(actual) || JSON.stringify(history?.expected) !== JSON.stringify(expected)) return unmatched
  }
  return { classifiedPageErrors: [{ ...error, classification: 'repaired-baseline-embed-redo-pageerror' }],
    unexpectedErrors: [], unexpectedPageErrors: [] }
}

// Table has its own exact three-case boundary. Default-grid differences are
// recognized only for the pinned pre-repair schema, never for the candidate.
const tableCaseIds = ['BLOCK_TABLE_ROUNDTRIP/default', 'BLOCK_TABLE_ROUNDTRIP/populated',
  'BLOCK_TABLE_ROUNDTRIP/populated-unwrapped-control']
const tablePhases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
function tableDefaultRecord(id, size, edited, canonical = false) {
  return [{ id, type: 'table', dataVersion: 2, data: { withHeadings: false,
    rows: Array.from({ length: size }, (_, rowIndex) => ({ id: 'row-' + rowIndex,
      cells: Array.from({ length: size }, (_, columnIndex) => {
        const text = edited && rowIndex === 0 && columnIndex === 0 ? 'X' : ''
        return { id: `cell-${rowIndex}-${columnIndex}`, text: canonical ? text ? [text] : [] : text }
      }),
    })),
  } }]
}
function tableDefaultFields(size, edited, readOnly, renderer = false) {
  return Array.from({ length: size }, (_, rowIndex) => ({ tag: 'TR',
    cells: Array.from({ length: size }, (_, columnIndex) => ({ tag: 'TD',
      markup: edited && rowIndex === 0 && columnIndex === 0 ? ['X'] : [],
      ...(!renderer ? { editable: !readOnly } : {}),
    })),
  }))
}
function classifyTableDifference(source, entry, failure) {
  if (!tableCaseIds.includes(entry.id) || !['v1', 'spec-baseline'].includes(source)) return null
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const populated = entry.id !== tableCaseIds[0]
  const phase = name => entry.phases.find(item => item.phase === name)
  const completed = same(entry.completedPhases, [...tablePhases, 'dispose']) && !entry.incompletePhases?.length
  if (source === 'v1' && failure.status === 'FAIL' && completed) {
    const size = failure.property === 'blockDomIdentity' ? populated ? 3 : 1
      : failure.property === 'tableDomIdentity' ? populated ? 8 : 14
        : failure.property === 'widgetDomIdentity' && populated ? 2 : 0
    if (size && ['read-only', 'editable-again', 'undo', 'redo'].includes(failure.phase)
      && matches(Array(size).fill(false), Array(size).fill(true))) {
      return ['read-only', 'editable-again'].includes(failure.phase) ? 'repaired-v1-table-mode-remount' : 'repaired-v1-table-history-remount'
    }
    if (failure.phase === 'undo' && failure.property === 'nativeSelection') {
      const id = phase('load')?.blocks[0]?.id
      if (!populated && typeof id === 'string' && id.length > 0
        && matches({ focused: true, anchor: null, focus: null, collapsed: true }, { focused: true, anchor: 0, focus: 0, collapsed: true })
        && same(phase('undo')?.selectionOwner, {
          active: { block: id, node: 'TD', className: 'oe-table__cell' },
          anchor: { block: id, node: 'DIV', text: '', offset: 1 },
          focus: { block: id, node: 'DIV', text: '', offset: 1 },
        })) return 'repaired-v1-empty-table-caret'
      if (populated
        && matches({ focused: false, anchor: null, focus: null, collapsed: true }, { focused: true, anchor: 12, focus: 12, collapsed: true })
        && same(phase('undo')?.selectionOwner, {
          active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
          anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
          focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
        })) return 'repaired-v1-table-history-focus'
    }
  }
  if (source !== 'spec-baseline') return null
  if (entry.id === tableCaseIds[1] && failure.phase === 'read-only-transition'
    && failure.property === 'execution' && failure.status === 'ERROR'
    && matches('Inline widget root left its projection boundary before hydration', undefined)
    && same(entry.completedPhases, ['load'])
    && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) {
    return 'repaired-baseline-table-formatted-widget-mode'
  }
  if (populated || !completed || failure.status !== 'FAIL' || !tablePhases.includes(failure.phase)) return null
  const id = phase('load')?.blocks[0]?.id
  if (typeof id !== 'string' || !id.length || !tablePhases.every(name =>
    same(phase(name)?.blocks, tableDefaultRecord(id, 1, ['edit', 'redo'].includes(name))))) return null
  const edited = ['edit', 'redo'].includes(failure.phase)
  const readOnly = failure.phase === 'read-only'
  const ids = size => Array.from({ length: size }, (_, rowIndex) => ({ id: 'row-' + rowIndex,
    cells: Array.from({ length: size }, (_, columnIndex) => ({ rowId: 'row-' + rowIndex, id: `cell-${rowIndex}-${columnIndex}` })),
  }))
  const rendered = size => [{ children: ['TABLE'], sections: [{ tag: 'TBODY', rows: tableDefaultFields(size, edited, readOnly, true) }] }]
  const pairs = {
    canonicalRecords: [tableDefaultRecord(id, 1, edited, true), tableDefaultRecord(id, 3, edited, true)],
    tableFields: [tableDefaultFields(1, edited, readOnly), tableDefaultFields(3, edited, readOnly)],
    tableDomIds: [ids(1), ids(3)],
    detachedAuthoredMarkup: [rendered(1), rendered(3)],
    attachedDetachedAuthoredMarkup: [rendered(1), rendered(3)],
    mountedAuthoredMarkup: [rendered(1), rendered(3)],
  }
  if (Object.hasOwn(pairs, failure.property) && matches(...pairs[failure.property])) return 'repaired-baseline-table-default-grid'
  return null
}

// Image's two current widget-capability controls have their own captured
// records and phase guards. The earlier literal Image cases stay unchanged.
const imageRichCaseIds = ['BLOCK_IMAGE_ROUNDTRIP/populated-widgets', 'BLOCK_IMAGE_ROUNDTRIP/populated-widgets-unwrapped-control']
const imageRichPhases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const imageRichPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const imageRichMark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const imageRichCaption = (wrapped, edited, canonical = false) => canonical
  ? [imageRichMark('b', 'Alpha'), ...(wrapped
    ? [' ', imageRichMark('i', '{{mention}}'), ' ', imageRichMark('s', '{{swatch}}'), ' tail' + (edited ? 'X' : '')]
    : [' {{mention}} {{swatch}} tail' + (edited ? 'X' : '')])]
  : '<b>Alpha</b> ' + (wrapped ? '<i>{{mention}}</i> <s>{{swatch}}</s>' : '{{mention}} {{swatch}}') + ' tail' + (edited ? 'X' : '')
const imageRichStyles = {
  width: '120px', height: '64px', objectFit: 'contain', objectPosition: 'center',
  borderStyle: 'dashed', borderWidth: '2px', borderColor: '#123456', borderRadius: '6px', backgroundColor: '#ffeecc',
}
const imageRichCss = {
  width: '120px', height: '64px', objectFit: 'contain', objectPosition: 'center center',
  borderStyle: 'dashed', borderWidth: '2px', borderColor: 'rgb(18, 52, 86)', borderRadius: '6px',
}
const imageRichAlt = (edited, resolved) => (resolved ? 'Alpha @Ada #123456 tail' : 'Alpha {{mention}} {{swatch}} tail') + (edited ? 'X' : '')
const imageRichMeaning = (edited, resolved) => ({ src: imageRichPixel, alt: imageRichAlt(edited, resolved),
  styles: imageRichCss, background: 'rgb(255, 238, 204)' })
function imageRichRecords({ legacy, wrapped, edited, sidecars, canonical = false }) {
  const record = (id, type, dataVersion, data, inline) => ({ id, type, ...(!legacy ? { dataVersion } : {}), data,
    ...(inline ? { inline } : {}) })
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }) }
  return [
    record('prefix', 'paragraph', 2, { text: canonical ? [imageRichMark('b', 'Before')] : '<b>Before</b>' }),
    record('probe', 'image', 1, { file: { url: imageRichPixel, width: 1, height: 1 }, caption: imageRichCaption(wrapped, edited, canonical),
      withBorder: true, expanded: false, withBackground: true, styles: imageRichStyles }, sidecars ? inline : undefined),
    record('suffix', 'paragraph', 2, { text: canonical ? [imageRichMark('i', 'After')] : '<i>After</i>' }),
  ]
}
const imageRichRendered = (wrapped, edited, resolved) => [[imageRichMark('b', 'Before')], {
  children: ['IMG', 'FIGCAPTION'], src: imageRichPixel, alt: imageRichAlt(edited, resolved), width: '1', height: '1', loading: 'lazy',
  caption: imageRichCaption(wrapped, edited, true), styles: imageRichCss, background: 'rgb(255, 238, 204)', flags: [true, false, true],
}, [imageRichMark('i', 'After')]]
const imageRichWidgets = [{ id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' }]
const imageRichCaret = offset => ({ focused: true, anchor: offset, focus: offset, collapsed: true })
function classifyImageRichDifference(source, entry, failure) {
  if (!imageRichCaseIds.includes(entry.id) || !['v1', 'spec-baseline'].includes(source)) return null
  if (failure.status !== (failure.property === 'execution' ? 'ERROR' : 'FAIL')) return null
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const phase = name => entry.phases?.find(item => item.phase === name)
  const wrapped = entry.id === imageRichCaseIds[0]
  const legacy = source === 'v1'
  const partial = !legacy && wrapped
  const executed = partial ? ['load'] : imageRichPhases
  if (!same(entry.completedPhases, partial ? ['load'] : [...imageRichPhases, 'dispose'])
    || !same(entry.incompletePhases ?? [], partial ? ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'] : [])
    || !same(entry.phases?.map(item => item.phase), executed)
    || !executed.every(name => same(phase(name)?.blocks, imageRichRecords({ legacy, wrapped,
      edited: ['edit', 'redo'].includes(name), sidecars: !legacy })) && phase(name)?.readOnly === (name === 'read-only'))) return null
  for (const name of executed) {
    const history = entry.observations?.filter(item => item.phase === name && item.property === 'historyState')
    const expected = { canUndo: ['edit', 'redo'].includes(name), canRedo: name === 'undo' }
    if (history?.length !== 1 || !same(history[0].actual, expected) || !same(history[0].expected, expected)) return null
  }
  const edited = ['edit', 'redo'].includes(failure.phase)
  if (legacy) {
    if (imageRichPhases.includes(failure.phase)) {
      if (failure.property === 'canonicalRecords' && matches(
        imageRichRecords({ legacy, wrapped, edited, sidecars: false, canonical: true }),
        imageRichRecords({ legacy, wrapped, edited, sidecars: true, canonical: true }))) return 'unsupported-v1-image-caption-sidecars'
      if (['editorWidgets', 'detachedWidgets', 'attachedDetachedWidgets', 'mountedWidgets'].includes(failure.property)
        && matches([], imageRichWidgets)) return 'unsupported-v1-image-caption-widgets'
      if (failure.property === 'editorImageMeaning'
        && matches(imageRichMeaning(edited, false), imageRichMeaning(edited, true))) return 'unsupported-v1-image-caption-labels'
      if (['detachedAuthoredMarkup', 'attachedDetachedAuthoredMarkup', 'mountedAuthoredMarkup'].includes(failure.property)
        && matches(imageRichRendered(wrapped, edited, false), imageRichRendered(wrapped, edited, true))) return 'unsupported-v1-image-caption-labels'
    }
    if (['read-only', 'editable-again', 'undo', 'redo'].includes(failure.phase)
      && ['imageDomIdentity', 'blockDomIdentity'].includes(failure.property)
      && matches([false, false, false], [true, true, true])) {
      return ['read-only', 'editable-again'].includes(failure.phase) ? 'repaired-v1-image-mode-remount' : 'repaired-v1-image-history-remount'
    }
    const text = wrapped ? ' tailX' : ' {{mention}} {{swatch}} tailX'
    const offset = wrapped ? 6 : 29
    const owner = { active: { block: 'probe', node: 'DIV', className: 'oe-image__caption' },
      anchor: { block: 'probe', node: '#text', text, offset }, focus: { block: 'probe', node: '#text', text, offset } }
    if (failure.phase === 'edit' && failure.property === 'fixtureCaret'
      && matches(imageRichCaret(33), imageRichCaret(14)) && same(phase('edit')?.selectionOwner, owner)) return 'unsupported-v1-image-widget-caret'
    if (['edit', 'redo'].includes(failure.phase) && failure.property === 'nativeSelection'
      && matches(imageRichCaret(34), imageRichCaret(15)) && same(phase(failure.phase)?.selectionOwner, owner)) return 'unsupported-v1-image-widget-caret'
    if (failure.phase === 'undo' && failure.property === 'nativeSelection'
      && matches({ focused: false, anchor: null, focus: null, collapsed: true }, imageRichCaret(14))
      && same(phase('undo')?.selectionOwner, {
        active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
        anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
        focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
      })) return 'repaired-v1-image-first-undo-caret'
    return null
  }
  if (partial && failure.phase === 'read-only-transition' && failure.property === 'execution'
    && failure.actual === 'Inline widget root left its projection boundary before hydration'
    && !Object.hasOwn(failure, 'expected')) return 'repaired-baseline-image-formatted-widget-mode'
  if ((partial ? ['load'] : ['load', 'read-only', 'editable-again', 'undo', 'redo']).includes(failure.phase)
    && failure.property === 'editorImageMeaning'
    && matches(imageRichMeaning(edited, false), imageRichMeaning(edited, true))) return 'repaired-baseline-image-derived-alt'
  return null
}

const repo = fileURLToPath(new URL('../../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const baselineRoot = name => {
  assert(process.env[name], `${name} must name an immutable Git archive directory`)
  return resolve(process.env[name])
}
const playwright = process.env.EDITOR_PLAYWRIGHT_PATH
const { chromium } = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright')
const startedAt = new Date().toISOString()
const sourceSha256 = digest(await readFile(fileURLToPath(import.meta.url)))
const classifierPath = new URL('./link-poll-roundtrip-classifiers.mjs', import.meta.url)
const classifierSha256 = digest(await readFile(classifierPath))
const galleryClassifierPath = new URL('./gallery-roundtrip-classifiers.mjs', import.meta.url)
const galleryClassifierSha256 = digest(await readFile(galleryClassifierPath))
const fixturePath = join(repo, 'tests/browser/block-roundtrip-fixture.js')
const fixtureBytes = await readFile(fixturePath)
const fixtureSha256 = digest(fixtureBytes)
const headBefore = git('rev-parse', 'HEAD').toString().trim()
const requestedFilter = process.env.EDITOR_ROUNDTRIP_FILTER ?? ''
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: baselineRoot('EDITOR_V1_ROOT'), legacy: true },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', root: baselineRoot('EDITOR_SPEC_BASELINE_ROOT'), legacy: false },
  { label: 'candidate', sha: process.env.EDITOR_CANDIDATE_SHA ?? headBefore, root: resolve(process.env.EDITOR_CANDIDATE_ROOT ?? repo), legacy: false },
].map(source => ({ ...source, loaded: {} }))

const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? join(repo, 'node_modules'))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }
const dependencyVersions = { dompurify: JSON.parse(await readFile(join(dependencyRoot, 'dompurify/package.json'), 'utf8')).version }
const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
const pendingPackages = Object.keys(manifest.dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pendingPackages.length) {
  const name = pendingPackages.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const dependency = JSON.parse(await readFile(join(dependencyRoot, name, 'package.json'), 'utf8'))
  const entry = dependency.exports?.['.']
  const imported = typeof entry === 'string' ? entry : entry?.import
  assert.equal(typeof imported, 'string', `No public ESM entry for ${name}`)
  imports[name] = '/dependencies/' + name + '/' + imported.replace(/^\.\//, '')
  dependencyVersions[name] = dependency.version
  pendingPackages.push(...Object.keys(dependency.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}

const loaded = new Map(), dependencyFiles = {}, serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Block roundtrip differential</title>'
        + '<script type="importmap">' + JSON.stringify({ imports }) + '</script></head><body></body></html>')
      return
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    if (pathname === '/fixture.js') { response.end(fixtureBytes); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected fixture URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencyRoot
      const path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Fixture URL escaped its source root')
      const bytes = await readFile(path)
      if (source) {
        assert.deepEqual(bytes, git('show', `${source.sha}:${relative}`), `${source.label}/${relative} differs from its pinned Git source`)
        source.loaded[relative] = digest(bytes)
      } else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, { bytes, path })
    }
    response.end(loaded.get(pathname).bytes)
  } catch (error) {
    serverErrors.push(String(error))
    response.statusCode = 500
    response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  browser = await chromium.launch({
    ...(process.env.EDITOR_CHROME_PATH ? { executablePath: process.env.EDITOR_CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const source of sources) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.exposeFunction('__roundtripInput', async (action, text) => {
      if (action === 'type') await page.keyboard.type(text)
      else if (action === 'click') await page.mouse.click(text.x, text.y)
      else if (action === 'undo') await page.keyboard.press('Control+z')
      else if (action === 'redo') await page.keyboard.press('Control+Shift+z')
      else throw new Error('Unknown native input action: ' + action)
    })
    await page.goto(origin + '/')
    const { cases, pageErrors } = await page.evaluate(async ({ source, filter }) => {
      const { blockRoundtripCases, runBlockRoundtripCase } = await import('/fixture.js')
      const results = [], pageErrors = []
      let activeCase = null, activePhase = null
      const onError = event => pageErrors.push({ source: source.label, caseId: activeCase, phase: activePhase,
        name: event.error?.name ?? null, message: event.error?.message ?? event.message,
        stack: event.error?.stack ?? null })
      window.addEventListener('error', onError)
      for (const specification of blockRoundtripCases.filter(entry => !filter || entry.id.includes(filter))) {
        activeCase = specification.id
        activePhase = 'import'
        try {
          results.push(await runBlockRoundtripCase(specification, {
            sourceBase: '/' + source.label + '/', legacy: source.legacy,
            onPhase: phase => { activePhase = phase },
            focusField: field => {
              const rect = field.getBoundingClientRect()
              return window.__roundtripInput('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            },
            typeText: text => window.__roundtripInput('type', text),
            shortcut: action => window.__roundtripInput(action),
          }))
        } catch (error) {
          results.push({ id: specification.id, error: error.stack ?? String(error), failures: [{ property: 'execution', status: 'ERROR', actual: String(error) }] })
        }
      }
      window.removeEventListener('error', onError)
      return { cases: results, pageErrors }
    }, { source, filter: requestedFilter })
    assert(cases.length > 0, 'The roundtrip filter selected no cases')
    for (const entry of cases) {
      const observedIds = ['BLOCK_PARAGRAPH_ROUNDTRIP/default', 'BLOCK_PARAGRAPH_ROUNDTRIP/populated',
        'BLOCK_PARAGRAPH_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_HEADING_ROUNDTRIP/default',
        'BLOCK_HEADING_ROUNDTRIP/populated', 'BLOCK_HEADING_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/populated',
        'BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/populated-neighbor-edit',
        'BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/populated',
        'BLOCK_TOGGLE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed',
        'BLOCK_SPOILER_ROUNDTRIP/default', 'BLOCK_SPOILER_ROUNDTRIP/populated', 'BLOCK_SPOILER_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_COLUMNS_ROUNDTRIP/default', 'BLOCK_COLUMNS_ROUNDTRIP/populated', 'BLOCK_COLUMNS_ROUNDTRIP/populated-unwrapped-control',
        'BLOCK_ATTACHES_ROUNDTRIP/default', 'BLOCK_ATTACHES_ROUNDTRIP/populated',
        'BLOCK_RAW_ROUNDTRIP/default', 'BLOCK_RAW_ROUNDTRIP/populated']
      const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
      const classify = failure => {
        if (galleryCaseIds.includes(entry.id)) return classifyGalleryDifference(source.label, entry, failure)
        if (linkPollCaseIds.includes(entry.id)) return classifyLinkPollDifference(source.label, entry, failure)
        if (embedCaseIds.includes(entry.id)) return classifyEmbedDifference(source.label, entry, failure)
        if (tableCaseIds.includes(entry.id)) return classifyTableDifference(source.label, entry, failure)
        if (imageRichCaseIds.includes(entry.id)) return classifyImageRichDifference(source.label, entry, failure)
        if (!observedIds.includes(entry.id)) return null
        if (source.label === 'v1') {
          const populated = !['BLOCK_PARAGRAPH_ROUNDTRIP/default', 'BLOCK_HEADING_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/default', 'BLOCK_SPOILER_ROUNDTRIP/default', 'BLOCK_COLUMNS_ROUNDTRIP/default', 'BLOCK_ATTACHES_ROUNDTRIP/default', 'BLOCK_RAW_ROUNDTRIP/default'].includes(entry.id)
          const listCase = ['BLOCK_LIST_ROUNDTRIP/default', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const quoteCase = ['BLOCK_QUOTE_ROUNDTRIP/default', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const warningCase = ['BLOCK_WARNING_ROUNDTRIP/default', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const codeCase = ['BLOCK_CODE_ROUNDTRIP/default', 'BLOCK_CODE_ROUNDTRIP/populated'].includes(entry.id)
          const checklistCase = ['BLOCK_CHECKLIST_ROUNDTRIP/default', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const delimiterCase = ['BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_DELIMITER_ROUNDTRIP/populated-neighbor-edit'].includes(entry.id)
          const imageCase = ['BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/populated'].includes(entry.id)
          const toggleCase = ['BLOCK_TOGGLE_ROUNDTRIP/default', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed'].includes(entry.id)
          const spoilerCase = ['BLOCK_SPOILER_ROUNDTRIP/default', 'BLOCK_SPOILER_ROUNDTRIP/populated', 'BLOCK_SPOILER_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const columnsCase = ['BLOCK_COLUMNS_ROUNDTRIP/default', 'BLOCK_COLUMNS_ROUNDTRIP/populated', 'BLOCK_COLUMNS_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)
          const attachesCase = ['BLOCK_ATTACHES_ROUNDTRIP/default', 'BLOCK_ATTACHES_ROUNDTRIP/populated'].includes(entry.id)
          const rawCase = ['BLOCK_RAW_ROUNDTRIP/default', 'BLOCK_RAW_ROUNDTRIP/populated'].includes(entry.id)
          if (rawCase && !same(entry.completedPhases, ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) return null
          const size = failure.property === 'blockDomIdentity' ? populated ? 3 : 1
            : failure.property === 'widgetDomIdentity' && populated && !codeCase && !delimiterCase && !imageCase && !attachesCase && !rawCase ? 2
              : failure.property === 'itemDomIdentity' && listCase ? populated ? 2 : 1
                : failure.property === 'quoteFieldDomIdentity' && quoteCase ? 2
                  : failure.property === 'warningFieldDomIdentity' && warningCase ? 2
                    : failure.property === 'toggleFieldDomIdentity' && toggleCase ? 2
                    : failure.property === 'spoilerFieldDomIdentity' && spoilerCase ? 2
                    : failure.property === 'columnDomIdentity' && columnsCase ? 2
                    : failure.property === 'attachmentWrapperIdentity' && attachesCase ? 1
                    : failure.property === 'attachmentFieldDomIdentity' && attachesCase && populated && ['undo', 'redo'].includes(failure.phase) ? 2
                    : failure.property === 'plainFieldDomIdentity' && (codeCase || rawCase) ? 1
                      : failure.property === 'checklistDomIdentity' && checklistCase ? populated ? 6 : 3
                        : failure.property === 'delimiterDomIdentity' && delimiterCase ? 1
                          : failure.property === 'imageDomIdentity' && imageCase ? populated ? 3 : 1 : 0
          const remountPhases = ['BLOCK_DELIMITER_ROUNDTRIP/default', 'BLOCK_IMAGE_ROUNDTRIP/default', 'BLOCK_ATTACHES_ROUNDTRIP/default'].includes(entry.id) ? ['read-only', 'editable-again'] : ['read-only', 'editable-again', 'undo', 'redo']
          if (size && remountPhases.includes(failure.phase)
            && same(failure.actual, Array(size).fill(false)) && same(failure.expected, Array(size).fill(true))) {
            return ['read-only', 'editable-again'].includes(failure.phase) ? 'repaired-v1-mode-remount' : 'repaired-v1-history-remount'
          }
          const undo = entry.phases?.find(phase => phase.phase === 'undo')
          const generatedId = entry.phases?.find(phase => phase.phase === 'load')?.blocks?.[0]?.id
          if (entry.id === 'BLOCK_LIST_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'LI', className: 'oe-list__item' },
              anchor: { block: generatedId, node: 'UL', text: '', offset: 1 },
              focus: { block: generatedId, node: 'UL', text: '', offset: 1 },
            })) return 'repaired-v1-empty-list-caret'
          if (entry.id === 'BLOCK_QUOTE_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'BLOCKQUOTE', className: 'oe-quote__text' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-quote-caret'
          if (entry.id === 'BLOCK_WARNING_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-warning__title' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-warning-caret'
          if (entry.id === 'BLOCK_TOGGLE_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-toggle__title' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-toggle-caret'
          if (entry.id === 'BLOCK_SPOILER_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-spoiler__label' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-spoiler-caret'
          if (entry.id === 'BLOCK_COLUMNS_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-columns__col' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 2 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 2 },
            })) return 'repaired-v1-empty-columns-caret'
          if (entry.id === 'BLOCK_CHECKLIST_ROUNDTRIP/default' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && typeof generatedId === 'string' && generatedId.length > 0
            && same(failure.actual, { focused: true, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: generatedId, node: 'DIV', className: 'oe-checklist__text' },
              anchor: { block: generatedId, node: 'DIV', text: '', offset: 1 },
              focus: { block: generatedId, node: 'DIV', text: '', offset: 1 },
            })) return 'repaired-v1-empty-checklist-caret'
          if (entry.id === 'BLOCK_CODE_ROUNDTRIP/populated' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && same(failure.actual, { focused: false, anchor: 61, focus: 61, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 61, focus: 61, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
              anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
              focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
            })) return 'repaired-v1-first-undo-caret'
          if (entry.id === 'BLOCK_RAW_ROUNDTRIP/populated' && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && same(failure.actual, { focused: false, anchor: 83, focus: 83, collapsed: true })
            && same(failure.expected, { focused: true, anchor: 83, focus: 83, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
              anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
              focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
            })) return 'repaired-v1-first-undo-caret'
          const rawId = populated ? 'probe' : generatedId
          const rawEnd = populated ? 84 : 1
          if (rawCase && failure.phase === 'redo' && failure.property === 'nativeSelection'
            && typeof rawId === 'string' && rawId.length > 0
            && same(failure.actual, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(failure.expected, { focused: true, anchor: rawEnd, focus: rawEnd, collapsed: true })
            && same(entry.phases?.find(phase => phase.phase === 'redo')?.selectionOwner, {
              active: { block: rawId, node: 'TEXTAREA', className: 'oe-raw__textarea' },
              anchor: { block: rawId, node: '#text', text: 'Preview', offset: 7 },
              focus: { block: rawId, node: '#text', text: 'Preview', offset: 7 },
            })) return 'repaired-v1-raw-redo-caret'
          const codeId = populated ? 'probe' : generatedId
          const redo = entry.phases?.find(phase => phase.phase === 'redo')
          const codeEnd = populated ? 62 : 1
          if (codeCase && failure.phase === 'redo' && failure.property === 'nativeSelection'
            && typeof codeId === 'string' && codeId.length > 0
            && same(failure.actual, { focused: true, anchor: 0, focus: 0, collapsed: true })
            && same(failure.expected, { focused: true, anchor: codeEnd, focus: codeEnd, collapsed: true })
            && same(redo?.selectionOwner, {
              active: { block: codeId, node: 'TEXTAREA', className: 'oe-code-textarea' },
              anchor: { block: codeId, node: '#text', text: '\n', offset: 1 },
              focus: { block: codeId, node: '#text', text: '\n', offset: 1 },
            })) return 'repaired-v1-code-redo-caret'
          const offset = attachesCase ? 26 : imageCase ? 18 : quoteCase || warningCase || toggleCase || spoilerCase || columnsCase ? 12 : 14
          if (populated && !codeCase && !rawCase && !delimiterCase && failure.phase === 'undo' && failure.property === 'nativeSelection'
            && same(failure.actual, { focused: false, anchor: null, focus: null, collapsed: true })
            && same(failure.expected, { focused: true, anchor: offset, focus: offset, collapsed: true })
            && same(undo?.selectionOwner, {
              active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
              anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
              focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
            })) return 'repaired-v1-first-undo-caret'
        }
        if (source.label === 'spec-baseline' && entry.id === 'BLOCK_ATTACHES_ROUNDTRIP/populated'
          && failure.phase === 'edit' && ['attachmentAddress:first', 'attachmentAddress:second'].includes(failure.property)
          && same(failure.actual, { accepted: false, active: true })
          && same(failure.expected, { accepted: true, active: true })
          && same(entry.completedPhases, ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) {
          return 'repaired-baseline-native-focus-acknowledgment'
        }
        if (source.label === 'spec-baseline'
          && ['BLOCK_PARAGRAPH_ROUNDTRIP/populated', 'BLOCK_HEADING_ROUNDTRIP/populated', 'BLOCK_LIST_ROUNDTRIP/populated', 'BLOCK_QUOTE_ROUNDTRIP/populated', 'BLOCK_WARNING_ROUNDTRIP/populated', 'BLOCK_CHECKLIST_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated', 'BLOCK_TOGGLE_ROUNDTRIP/populated-closed', 'BLOCK_SPOILER_ROUNDTRIP/populated', 'BLOCK_COLUMNS_ROUNDTRIP/populated'].includes(entry.id)
          && failure.phase === 'read-only-transition' && failure.property === 'execution'
          && failure.actual === 'Inline widget root left its projection boundary before hydration'
          && same(entry.completedPhases, ['load'])
          && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])) {
          return 'repaired-baseline-formatted-widget-mode-failure'
        }
        return null
      }
      entry.classifiedDifferences = entry.failures.flatMap(failure => {
        const classification = classify(failure)
        return classification ? [{ ...failure, classification }] : []
      })
      entry.unexpectedFailures = entry.failures.filter(failure => !classify(failure))
      if (source.label === 'v1' && ['BLOCK_EMBED_ROUNDTRIP/populated', 'BLOCK_EMBED_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)) {
        entry.referenceCapability = { supported: false, feature: 'Persistent Embed caption widgets',
          reason: 'Pinned v1 Embed declares no mapTextFields hook required by its block contract and public inline insertion gate. This is a current-capability control, not proof of v1 widget parity.' }
      }
      if (source.label === 'v1' && imageRichCaseIds.includes(entry.id)) {
        entry.referenceCapability = { supported: false, feature: 'Persistent Image caption widgets',
          reason: 'Pinned v1 Image and its abstract base declare no mapTextFields hook; its public inline insertion gate rejects such blocks. These are current-capability controls, not proof of v1 widget parity.' }
      }
      if (source.label === 'v1' && ['BLOCK_POLL_ROUNDTRIP/populated', 'BLOCK_POLL_ROUNDTRIP/populated-unwrapped-control'].includes(entry.id)) {
        entry.referenceCapability = { supported: false, feature: 'Persistent Poll question and option widgets',
          reason: 'Pinned v1 Poll declares no mapTextFields hook required by the public persistent inline insertion gate. Its literal question/option data remains compared; the two sidecar cases prove current capability, not v1 widget parity.' }
      }
      if (source.label === 'v1' && galleryCaseIds.slice(2).includes(entry.id)) {
        entry.referenceCapability = { supported: false, feature: 'Persistent Gallery caption widgets and rich marks',
          reason: 'Pinned v1 Gallery has inlineTools=false, no mapTextFields hook, and plain textContent captions. The fixed historical wire adapter preserves visible plain caption text; rich marks and persistent sidecars are current-capability controls, not proof of v1 support.' }
      }
    }
    results.push({ source: source.label, cases, errors, pageErrors })
    await page.close()
  }
  for (const { bytes, path } of loaded.values()) assert.deepEqual(await readFile(path), bytes, 'Source changed during probe: ' + path)
  assert.deepEqual(await readFile(fixturePath), fixtureBytes, 'The browser fixture changed during its probe')
  assert.equal(digest(await readFile(fileURLToPath(import.meta.url))), sourceSha256, 'The runner changed during its probe')
  assert.equal(digest(await readFile(classifierPath)), classifierSha256, 'The LinkPreview/Poll classifier changed during its probe')
  assert.equal(digest(await readFile(galleryClassifierPath)), galleryClassifierSha256, 'The Gallery classifier changed during its probe')
  // All source pages are closed before pairing the two independent raw error
  // channels, so a later Playwright report cannot bypass this decision.
  for (const result of results) Object.assign(result, classifyEmbedPageErrors(result.source, result.cases, result.errors, result.pageErrors, origin))
  const failed = results.some(result => result.unexpectedErrors.length || result.unexpectedPageErrors.length || result.cases.some(entry => entry.unexpectedFailures.length))
  console.log(JSON.stringify({
    scope: 'Public ROUNDTRIP template; actual implemented and selected coverage is listed in selectedCaseIds. Default/populated construction, detached/mounted renderer, read-only and back, native declared-field edit and one Undo/Redo where applicable (Delimiter records a labeled neighbor edit, while empty Delimiter/Image/Attaches/Embed record explicit not-applicable phases), fixed canonical marks/sidecars/IDs/order and cleanup. This does not accept detailed behavior rows or all built-in blocks.',
    requestedFilter, selectedCaseIds: results[0]?.cases.map(entry => entry.id) ?? [],
    incompleteCases: results.flatMap(source => source.cases.filter(entry => entry.incompletePhases?.length)
      .map(entry => ({ source: source.source, id: entry.id, completed: entry.completedPhases, incomplete: entry.incompletePhases }))),
    notApplicableCases: results.flatMap(source => source.cases.filter(entry => entry.notApplicablePhases?.length)
      .map(entry => ({ source: source.source, id: entry.id, phases: entry.notApplicablePhases, reason: entry.reason }))),
    unsupportedReferenceCases: results.flatMap(source => source.cases.filter(entry => entry.referenceCapability?.supported === false)
      .map(entry => ({ source: source.source, id: entry.id, ...entry.referenceCapability }))),
    startedAt, finishedAt: new Date().toISOString(), node: process.version, browser: await browser.version(),
    sourceSha256, classifierSha256, galleryClassifierSha256, fixtureSha256, headBefore, headAfter: git('rev-parse', 'HEAD').toString().trim(),
    sourceUnchanged: true, sourceIdentityVerified: serverErrors.length === 0,
    sources, dependencyVersions, dependencyFiles, serverErrors, results,
  }, null, 2))
  if (failed || serverErrors.length) process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
