// Recognize only complete, executed differences of the two pinned references.
// A candidate failure or a changed source/case/phase/record/vector is fatal.
import { isDeepStrictEqual as same } from 'node:util'
import { galleryCaptionOrderCases, galleryCaptionOrderInput as input } from '../../tests/browser/gallery-caption-order-fixture.js'

export const galleryCaptionOrderDifferences = Object.freeze({
  'v1-rich-caption-unsupported': { kind: 'reference-capability-limit', reason: 'v1 Gallery renders and reads caption.textContent, so input HTML remains literal author text.' },
  'v1-caption-sidecar-unsupported': { kind: 'reference-capability-limit', reason: 'v1 Gallery has no rich-field mapper for persistent caption widgets; its loaded records omit their sidecars.' },
  'v1-remove-loses-keyboard-owner': { kind: 'historical-defect', reason: 'Removing the natively edited image detaches its focused caption and prevents subsequent keyboard history delivery.' },
  'baseline-swap-loses-keyboard-owner': { kind: 'historical-defect', reason: 'A real image swap retires the focused caption and strands native Undo/Redo outside the editor.' },
  'baseline-alt-not-derived-from-projection': { kind: 'historical-defect', reason: 'Image alternative text retains encoded entities, widget placeholders or the caption from before native input.' },
  'baseline-widget-remount-fails': { kind: 'historical-defect', reason: 'Structural widget-caption projection throws at the previous inline root boundary; the transaction rolls back and keyboard history can also fail.' },
})

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const mark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const isReplay = phase => ['undo-action', 'undo-edit', 'redo-edit', 'redo-action'].includes(phase)
const phasesFor = entry => ['load', 'edit', entry.action, 'undo-action', 'undo-edit', 'redo-edit', 'redo-action', 'dispose']

function intended(entry, phase) {
  const order = [entry.action, 'redo-action'].includes(phase) ? entry.action === 'swap' ? [2, 1, 0] : [0, 2] : [0, 1, 2]
  return { order, edited: !['load', 'undo-edit'].includes(phase),
    canUndo: !['load', 'undo-edit'].includes(phase), canRedo: ['undo-action', 'undo-edit', 'redo-edit'].includes(phase), shortcut: true }
}

function historical(source, entry, phase) {
  const normal = intended(entry, phase)
  if (['load', 'edit'].includes(phase)) return normal
  if (source === 'v1' && entry.action === 'remove') return { order: [0, 2], edited: true, canUndo: true, canRedo: false, shortcut: false }
  if (source === 'spec-baseline' && entry.mode === 'widgets') return { order: [0, 1, 2], edited: true, canUndo: true, canRedo: false, shortcut: entry.action === 'swap' }
  if (source === 'spec-baseline' && entry.action === 'swap') return { order: [2, 1, 0], edited: true, canUndo: true, canRedo: false, shortcut: false }
  return normal
}

function caption(entry, index, edited, legacy) {
  const value = entry.mode === 'literal' ? legacy ? input.plain[index] : escape(input.plain[index]) : input[entry.mode][index]
  return value + (edited && index === 1 ? 'X' : '')
}

function meaning(entry, index, edited) {
  const suffix = edited && index === 1 ? 'X' : ''
  if (entry.mode === 'literal') return [input.plain[index] + suffix]
  const values = [['b', 'Alpha', 'i', entry.mode === 'widgets' ? '{{mention}}' : 'one'],
    ['mark', 'Bravo', 's', entry.mode === 'widgets' ? '{{swatch}}' : 'two'], ['code', 'Charlie', 'b', 'three']][index]
  return [mark(values[0], values[1]), ' ', mark(values[2], values[3]), ' tail' + suffix]
}

function records(entry, state, legacy, { canonical = false, omitInline = false } = {}) {
  const record = (id, type, data, extra = {}) => ({ id, type, ...(!legacy ? { dataVersion: 2 } : {}), data, ...extra })
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = {
    ...(state.order.includes(0) ? { mention: widget('mention', { id: 'ada', name: 'Ada' }) } : {}),
    ...(state.order.includes(1) ? { swatch: widget('color', { value: '#123456' }) } : {}),
  }
  return [record('prefix', 'paragraph', { text: '<b>Before</b>' }), record('probe', 'gallery', {
    images: state.order.map(index => ({ ...(!legacy ? { id: input.ids[index] } : {}), url: input.pictures[index],
      caption: canonical && !(legacy && entry.mode === 'literal') ? meaning(entry, index, state.edited) : caption(entry, index, state.edited, legacy) })),
    layout: '3c', styles: { gap: '8px', height: '240px', borderRadius: '6px' },
    options: { loop: false, zoom: true, navigation: true, captions: true, fullscreen: false, thumbnails: true },
  }, entry.mode === 'widgets' && !omitInline ? { inline } : {}), record('suffix', 'paragraph', { text: '<i>After</i>' })]
}

function vector(property, source, entry, phase, observed) {
  const legacy = source === 'v1', state = observed ? historical(source, entry, phase) : intended(entry, phase)
  switch (property) {
    case 'canonicalRecords': return records(entry, state, legacy, { canonical: true, omitInline: observed && legacy })
    case 'authorCaptionOrder': return state.order.map(index => ({ url: input.pictures[index],
      markup: observed && legacy ? [caption(entry, index, state.edited, legacy)] : meaning(entry, index, state.edited) }))
    case 'alternativeTextOrder': return state.order.map(index => {
      if (observed && legacy) return caption(entry, index, state.edited, true)
      if (observed) return caption(entry, index, phase === 'edit' ? false : state.edited, false).replace(/<[^>]*>/g, '')
      const values = entry.mode === 'literal' ? input.plain : ['Alpha ' + (entry.mode === 'widgets' ? '@Ada' : 'one') + ' tail',
        'Bravo ' + (entry.mode === 'widgets' ? '#123456' : 'two') + ' tail', 'Charlie three tail']
      return values[index] + (state.edited && index === 1 ? 'X' : '')
    })
    case 'imageIdOrder': return legacy ? undefined : state.order.map(index => ({ slot: input.ids[index], caption: input.ids[index] }))
    case 'inlineWidgetsByImage': return state.order.map(index => ({ url: input.pictures[index], widgets: entry.mode !== 'widgets' || observed && legacy ? []
      : index === 0 ? [{ id: 'mention', type: 'mention', text: '@Ada' }]
        : index === 1 ? [{ id: 'swatch', type: 'color', text: '#123456' }] : [] }))
    case 'historyState': return { canUndo: state.canUndo, canRedo: state.canRedo }
    case 'trustedHistoryShortcut': return isReplay(phase) ? state.shortcut ? [true] : [] : undefined
    default: return undefined
  }
}

function knownCase(source, entry) {
  if (!['v1', 'spec-baseline'].includes(source)) return false
  const specification = galleryCaptionOrderCases.find(value => value.id === entry.id)
  if (!specification || entry.mode !== specification.mode || entry.action !== specification.action || entry.legacy !== (source === 'v1')) return false
  const phases = phasesFor(entry)
  if (!same(entry.completedPhases, phases) || !same(entry.incompletePhases, []) || !same(entry.phases?.map(value => value.phase), phases)) return false
  // Canonical data and both history flags are checked independently of the
  // individual failing observation, including every neighboring Paragraph.
  for (const snapshot of entry.phases.slice(0, -1)) {
    const state = historical(source, entry, snapshot.phase)
    if (!same(snapshot.blocks, records(entry, state, source === 'v1', { omitInline: source === 'v1' }))
      || snapshot.canUndo !== state.canUndo || snapshot.canRedo !== state.canRedo) return false
    if (!state.shortcut && !same(snapshot.active, { blockId: null, className: '' })) return false
  }
  const observed = (phase, property, expected) => {
    const values = entry.observations?.filter(value => value.phase === phase && value.property === property) ?? []
    return values.length === 1 && values[0].status === 'PASS' && same(values[0].actual, expected) && same(values[0].expected, expected)
  }
  const original = JSON.stringify({ version: source === 'v1' ? '1.0.5' : '2.0.0', blocks: records(entry, intended(entry, 'load'), source === 'v1') })
  return observed('edit', 'trustedCaptionInput', [{ trusted: true, image: 1, inputType: 'insertText' }])
    && (entry.action === 'swap'
      ? observed('swap', 'trustedSwapGesture', { starts: [{ trusted: true, image: 0 }], drops: [{ trusted: true, image: 2 }] })
      : observed('remove', 'trustedRemoveClick', [{ trusted: true, image: 1 }]))
    && observed('dispose', 'editorReleased', 0)
    && phases.slice(0, -1).every(phase => observed(phase, 'callerInputUnchanged', original) && observed(phase, 'providerCalls', 0))
}

export function classifyGalleryCaptionOrderDifference(source, entry, failure) {
  if (!knownCase(source, entry) || failure.status !== 'FAIL' || !phasesFor(entry).slice(0, -1).includes(failure.phase)) return null
  const actual = vector(failure.property, source, entry, failure.phase, true)
  const expected = vector(failure.property, source, entry, failure.phase, false)
  if (actual === undefined || expected === undefined || same(actual, expected)
    || !same(failure.actual, actual) || !same(failure.expected, expected)) return null
  const causes = []
  if (source === 'v1') {
    if (entry.mode !== 'literal' && ['authorCaptionOrder', 'alternativeTextOrder'].includes(failure.property)) causes.push('v1-rich-caption-unsupported')
    if (entry.mode === 'widgets' && ['canonicalRecords', 'inlineWidgetsByImage'].includes(failure.property)) causes.push('v1-caption-sidecar-unsupported')
    if (entry.action === 'remove' && isReplay(failure.phase)) causes.push('v1-remove-loses-keyboard-owner')
  } else {
    if (failure.property === 'alternativeTextOrder') causes.push('baseline-alt-not-derived-from-projection')
    if (entry.mode === 'widgets' && !['load', 'edit'].includes(failure.phase)) causes.push('baseline-widget-remount-fails')
    if (entry.mode !== 'widgets' && entry.action === 'swap' && isReplay(failure.phase)) causes.push('baseline-swap-loses-keyboard-owner')
  }
  return causes.length ? causes : null
}

const message = 'Inline widget root left its projection boundary before hydration'
const sharedStack = `Error: ${message}\n    at #hydrateField (SOURCE/spec-baseline/core/InlineProjectionRuntime.js:788:17)\n    at #projectState (SOURCE/spec-baseline/core/InlineProjectionRuntime.js:603:25)\n    at InlineProjectionRuntime.reconcileBlock (SOURCE/spec-baseline/core/InlineProjectionRuntime.js:99:27)\n    at Object.apply (SOURCE/spec-baseline/core/BlockReconciler.js:466:36)`
const updateStack = sharedStack + '\n    at #executeOuter (SOURCE/spec-baseline/core/TransactionEngine.js:223:34)\n    at SOURCE/spec-baseline/core/TransactionEngine.js:167:72\n    at #observeCommand (SOURCE/spec-baseline/core/TransactionEngine.js:500:14)\n    at TransactionEngine.execute (SOURCE/spec-baseline/core/TransactionEngine.js:167:32)\n    at DocumentRuntime.update (SOURCE/spec-baseline/core/DocumentRuntime.js:622:18)\n    at updateData (SOURCE/spec-baseline/core/DocumentRuntime.js:1661:14)'
const replayStack = sharedStack + '\n    at #replayObserved (SOURCE/spec-baseline/core/TransactionEngine.js:331:34)\n    at SOURCE/spec-baseline/core/TransactionEngine.js:298:80\n    at #observeCommand (SOURCE/spec-baseline/core/TransactionEngine.js:500:14)\n    at #replay (SOURCE/spec-baseline/core/TransactionEngine.js:298:32)\n    at TransactionEngine.undo (SOURCE/spec-baseline/core/TransactionEngine.js:272:31)\n    at DocumentRuntime.undo (SOURCE/spec-baseline/core/DocumentRuntime.js:763:25)'

export function classifyGalleryCaptionOrderErrors(result, origin) {
  const unexpected = { classifiedPageErrors: [], unexpectedErrors: result.errors, unexpectedPageErrors: result.pageErrors }
  if (result.source !== 'spec-baseline') return unexpected
  const cases = result.cases.filter(entry => entry.mode === 'widgets')
  if (!cases.every(entry => knownCase(result.source, entry) && entry.failures.every(failure => classifyGalleryCaptionOrderDifference(result.source, entry, failure)))) return unexpected
  const expected = cases.flatMap(entry => [entry.action, ...(entry.action === 'swap' ? ['undo-action', 'undo-edit'] : [])]
    .map(phase => ({ caseId: entry.id, phase, message })))
  const stacks = expected.map(error => isReplay(error.phase) ? replayStack : updateStack)
  if (!same(result.pageErrors, expected) || !same(result.errors.map(error => error.replaceAll(origin, 'SOURCE')), stacks)) return unexpected
  return { classifiedPageErrors: expected.map(error => ({ ...error, classification: 'baseline-widget-remount-fails' })), unexpectedErrors: [], unexpectedPageErrors: [] }
}
