// Exact recognizers for executed, pinned historical Gallery differences.
// They do not change inputs, observations or candidate acceptance.
import { isDeepStrictEqual as same } from 'node:util'

export const galleryCaseIds = Object.freeze([
  'BLOCK_GALLERY_ROUNDTRIP/default',
  'BLOCK_GALLERY_ROUNDTRIP/populated',
  'BLOCK_GALLERY_ROUNDTRIP/populated-widgets',
  'BLOCK_GALLERY_ROUNDTRIP/populated-widgets-unwrapped-control',
])
const phases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const mark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const defaults = { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false }
const options = { loop: false, zoom: true, navigation: true, captions: true, fullscreen: false, thumbnails: true }
const styles = { gap: '8px', height: '180px', borderRadius: '6px' }
const widgets = [
  { id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' },
]
const prefixOwner = {
  active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
  anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
  focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
}
const editedPhase = phase => phase === 'edit' || phase === 'redo'

function captions({ legacy, rich, wrapped, edited, canonical = false }) {
  const suffix = edited ? 'X' : ''
  if (legacy) return rich
    ? ['Alpha & {{mention}} tail' + suffix, 'Second & {{swatch}}']
    : ['Alpha & <b>literal</b> {{literal}} tail' + suffix, 'Second & <i>literal</i>']
  if (!rich) return canonical
    ? [['Alpha & <b>literal</b> {{literal}} tail' + suffix], ['Second & <i>literal</i>']]
    : ['Alpha &amp; &lt;b&gt;literal&lt;/b&gt; {{literal}} tail' + suffix, 'Second &amp; &lt;i&gt;literal&lt;/i&gt;']
  if (canonical) return [
    [mark('b', 'Alpha &'), ...(wrapped ? [' ', mark('i', '{{mention}}'), ' tail' + suffix] : [' {{mention}} tail' + suffix])],
    [mark('mark', 'Second &'), ...(wrapped ? [' ', mark('s', '{{swatch}}')] : [' {{swatch}}'])],
  ]
  return ['<b>Alpha &amp;</b> ' + (wrapped ? '<i>{{mention}}</i>' : '{{mention}}') + ' tail' + suffix,
    '<mark>Second &amp;</mark> ' + (wrapped ? '<s>{{swatch}}</s>' : '{{swatch}}')]
}

const visibleCaptions = (rich, edited) => rich
  ? ['Alpha & @Ada tail' + (edited ? 'X' : ''), 'Second & #123456']
  : ['Alpha & <b>literal</b> {{literal}} tail' + (edited ? 'X' : ''), 'Second & <i>literal</i>']

function records({ legacy, populated, rich, wrapped, edited, id, canonical = false, sidecars = false }) {
  const record = (id, type, version, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: version } : {}), data,
    ...(inline ? { inline } : {}) })
  if (!populated) return [record(id, 'gallery', 2, { images: [], layout: 'auto', styles: {}, options: defaults })]
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = sidecars ? {
    mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }),
  } : undefined
  const values = captions({ legacy, rich, wrapped, edited, canonical })
  return [record('prefix', 'paragraph', 2, { text: canonical ? [mark('b', 'Before')] : '<b>Before</b>' }),
    record('probe', 'gallery', 2, { images: values.map((caption, index) => ({
      ...(!legacy ? { id: index ? 'second' : 'first' } : {}), url: pixel, caption,
    })), layout: '2', styles, options }, inline),
    record('suffix', 'paragraph', 2, { text: canonical ? [mark('i', 'After')] : '<i>After</i>' })]
}

const rendered = labels => [[mark('b', 'Before')], {
  layout: ['eg--2'], styles: { gap: '8px', height: '180px' },
  items: labels.map(label => ({ tag: 'FIGURE', role: 'button', tabIndex: 0,
    label: 'Open image: ' + label, radius: '6px', src: pixel, alt: label })),
}, [mark('i', 'After')]]

function fields(context, phase, labels) {
  return captions({ ...context, edited: editedPhase(phase), canonical: !context.legacy }).map((caption, index) => ({
    tag: 'DIV', caption, editable: phase !== 'read-only', src: pixel, alt: labels[index],
  }))
}

export function classifyGalleryDifference(source, entry, failure) {
  if (!['v1', 'spec-baseline'].includes(source) || !galleryCaseIds.includes(entry.id)) return null
  const legacy = source === 'v1', populated = entry.id !== galleryCaseIds[0]
  const rich = entry.id === galleryCaseIds[2] || entry.id === galleryCaseIds[3]
  const wrapped = entry.id === galleryCaseIds[2]
  const expectedPhases = populated ? phases : phases.slice(0, 3)
  const partial = !legacy && rich && same(entry.completedPhases, ['load'])
    && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])
  const complete = same(entry.completedPhases, [...expectedPhases, 'dispose']) && !entry.incompletePhases?.length
  if (!complete && !partial) return null
  const observedPhases = partial ? ['load'] : expectedPhases
  if (!same(entry.phases?.map(phase => phase.phase), observedPhases)) return null
  const id = populated ? 'probe' : entry.phases[0].blocks?.[0]?.id
  if (typeof id !== 'string' || !id) return null
  const context = { legacy, populated, rich, wrapped, id }
  // All independent author records, including neighbors and sidecars, must
  // match the captured historical behavior. Unknown data never earns a label.
  if (!entry.phases.every(phase => same(phase.blocks, records({ ...context,
    edited: editedPhase(phase.phase), sidecars: rich && !legacy,
  })) && phase.readOnly === (phase.phase === 'read-only'))) return null
  if (failure.status !== (failure.property === 'execution' ? 'ERROR' : 'FAIL')) return null
  if (failure.property === 'execution') {
    if (partial && failure.phase === 'read-only-transition'
      && failure.actual === 'Inline widget root left its projection boundary before hydration'
      && failure.expected === undefined) return 'repaired-baseline-gallery-widget-mode-failure'
    return null
  }
  if (!observedPhases.includes(failure.phase)) return null
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const edited = editedPhase(failure.phase)

  if (legacy) {
    const remount = ['read-only', 'editable-again', ...(populated ? ['undo', 'redo'] : [])].includes(failure.phase)
    const size = failure.property === 'galleryWrapperIdentity' ? 1 : failure.property === 'blockDomIdentity' ? populated ? 3 : 1 : 0
    if (remount && size && matches(Array(size).fill(false), Array(size).fill(true))) {
      return ['undo', 'redo'].includes(failure.phase) ? 'repaired-v1-gallery-history-remount' : 'repaired-v1-gallery-mode-remount'
    }
    if (populated && failure.phase === 'undo' && failure.property === 'nativeSelection'
      && matches({ focused: false, anchor: null, focus: null, collapsed: true },
        { focused: true, anchor: rich ? 24 : 39, focus: rich ? 24 : 39, collapsed: true })
      && same(entry.phases.find(phase => phase.phase === 'undo').selectionOwner, prefixOwner)) {
      return 'repaired-v1-gallery-first-undo-caret'
    }
    if (!rich) return null
    if (failure.property === 'canonicalRecords'
      && matches(records({ ...context, edited, canonical: true }), records({ ...context, edited, canonical: true, sidecars: true }))) {
      return 'unsupported-v1-gallery-persistent-sidecars'
    }
    if (failure.property === 'editorWidgets' && matches([], widgets)) return 'unsupported-v1-gallery-persistent-widgets'
    if (failure.property === 'galleryAuthorFields'
      && matches(fields(context, failure.phase, captions({ ...context, edited })), fields(context, failure.phase, visibleCaptions(rich, edited)))) {
      return 'unsupported-v1-gallery-widget-alternative-text'
    }
    if (['detachedAuthoredMarkup', 'attachedDetachedAuthoredMarkup', 'mountedAuthoredMarkup'].includes(failure.property)
      && matches(rendered(captions({ ...context, edited })), rendered(visibleCaptions(rich, edited)))) {
      return 'unsupported-v1-gallery-renderer-widget-labels'
    }
    return null
  }

  if (!populated) return null
  if (failure.phase === 'edit' && ['galleryAddress:first', 'galleryAddress:second'].includes(failure.property)
    && matches({ accepted: false, active: true }, { accepted: true, active: true })) return 'repaired-baseline-gallery-focus-acknowledgment'
  if (failure.property === 'galleryAuthorFields') {
    const oldLabels = rich ? ['Alpha &amp; {{mention}} tail', 'Second &amp; {{swatch}}']
      : captions({ ...context, edited: failure.phase === 'redo' })
    if (matches(fields(context, failure.phase, oldLabels), fields(context, failure.phase, visibleCaptions(rich, edited)))) {
      return 'repaired-baseline-gallery-derived-alternative-text'
    }
  }
  if (['detachedAuthoredMarkup', 'attachedDetachedAuthoredMarkup', 'mountedAuthoredMarkup'].includes(failure.property)
    && matches(rendered(captions({ ...context, edited })), rendered(visibleCaptions(rich, edited)))) {
    return 'repaired-baseline-gallery-renderer-caption-labels'
  }
  return null
}
