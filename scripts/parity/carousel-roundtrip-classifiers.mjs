// Exact recognizers for observed, pinned historical Carousel differences.
// Candidate failures and unknown historical values never receive an exception.
import { isDeepStrictEqual as same } from 'node:util'

export const carouselCaseIds = Object.freeze([
  'BLOCK_CAROUSEL_ROUNDTRIP/default',
  'BLOCK_CAROUSEL_ROUNDTRIP/populated',
  'BLOCK_CAROUSEL_ROUNDTRIP/populated-widgets',
  'BLOCK_CAROUSEL_ROUNDTRIP/populated-widgets-unwrapped-control',
])
const phases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const video = '/tests/browser/carousel-roundtrip-16x16.webm'
const html = '<section><h3>Local &amp; HTML</h3><p><a href="https://example.test/more">More</a></p></section>'
const mark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const widgets = [
  { id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' },
]
const editedPhase = phase => phase === 'edit' || phase === 'redo'
const options = populated => ({ loop: false, autoplay: false, autoplayDelay: 3000,
  navigation: true, pagination: true, thumbnails: populated })

function captions({ legacy, rich, wrapped, edited, canonical = false }) {
  const suffix = edited ? 'X' : ''
  if (legacy) {
    const values = [rich ? 'Alpha {{mention}} {{swatch}} tail' + suffix : 'Alpha & <caption> tail' + suffix,
      'Second & caption', 'HTML & caption']
    return canonical ? values.map(value => [value]) : values
  }
  if (!rich) return canonical
    ? [['Alpha & <caption> tail' + suffix], ['Second & caption'], ['HTML & caption']]
    : ['Alpha &amp; &lt;caption&gt; tail' + suffix, 'Second &amp; caption', 'HTML &amp; caption']
  if (canonical) return [[mark('b', 'Alpha'), ...(wrapped
    ? [' ', mark('i', '{{mention}}'), ' ', mark('s', '{{swatch}}'), ' tail' + suffix]
    : [' {{mention}} {{swatch}} tail' + suffix])], ['Second & caption'], ['HTML & caption']]
  return ['<b>Alpha</b> ' + (wrapped ? '<i>{{mention}}</i> <s>{{swatch}}</s>' : '{{mention}} {{swatch}}') + ' tail' + suffix,
    'Second &amp; caption', 'HTML &amp; caption']
}

function records({ legacy, populated, rich, wrapped, edited, id, canonical = false, sidecars = false }) {
  const record = (id, type, version, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: version } : {}), data,
    ...(inline ? { inline } : {}) })
  if (!populated) return [record(id, 'carousel', 1, { slides: [], options: options(false) })]
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = sidecars ? {
    mention: widget('mention', { id: 'ada', name: 'Ada' }), swatch: widget('color', { value: '#123456' }),
  } : undefined
  const values = captions({ legacy, rich, wrapped, edited, canonical })
  return [record('prefix', 'paragraph', 2, { text: canonical ? [mark('b', 'Before')] : '<b>Before</b>' }),
    record('probe', 'carousel', 1, { slides: [
      { id: 'first', type: 'image', src: pixel, alt: 'First <&> image', caption: values[0] },
      { id: 'second', type: 'video', src: video, poster: pixel, alt: 'Second & video', caption: values[1] },
      { id: 'third', type: 'html', html, caption: values[2] },
    ], options: options(true) }, inline),
    record('suffix', 'paragraph', 2, { text: canonical ? [mark('i', 'After')] : '<i>After</i>' })]
}

const rendered = values => [[mark('b', 'Before')], {
  label: 'Content carousel', aspectRatio: '', fixedRatio: false,
  slides: [
    { tag: 'FIGURE', mediaTag: 'IMG', src: pixel, alt: 'First <&> image', loading: 'lazy', caption: values[0] },
    { tag: 'FIGURE', mediaTag: 'VIDEO', src: video, poster: pixel, controls: true, preload: 'metadata', label: 'Second & video', caption: values[1] },
    { tag: 'FIGURE', mediaTag: 'DIV', html: [{ tag: 'section', attributes: {}, children: [mark('h3', 'Local & HTML'),
      { tag: 'p', attributes: {}, children: [{ tag: 'a', attributes: { href: 'https://example.test/more' }, children: ['More'] }] }] }], caption: values[2] },
  ],
  navigation: ['Previous slide', 'Next slide'].map(label => ({ label, tag: 'BUTTON' })),
  pagination: [0, 1, 2].map(index => ({ label: 'Go to page ' + (index + 1), current: index ? 'false' : 'page' })),
  thumbnails: [0, 1, 2].map(index => ({ label: 'Go to slide ' + (index + 1), current: index ? 'false' : 'page', src: index === 2 ? null : pixel })),
}, [mark('i', 'After')]]

export function classifyCarouselDifference(source, entry, failure) {
  if (!['v1', 'spec-baseline'].includes(source) || !carouselCaseIds.includes(entry.id)) return null
  const legacy = source === 'v1', populated = entry.id !== carouselCaseIds[0]
  const rich = entry.id === carouselCaseIds[2] || entry.id === carouselCaseIds[3]
  const wrapped = entry.id === carouselCaseIds[2]
  if (legacy && rich && !same(entry.referenceCapability, {
    supported: false, capability: 'persistent rich-caption inline widgets',
    reason: 'v1 Carousel disables inline tools, declares no rich-field mapper and saves captions as literal text. Its observed differences remain explicit.',
  })) return null
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
  if (!entry.phases.every(phase => same(phase.blocks, records({ ...context,
    edited: editedPhase(phase.phase), sidecars: rich && !legacy,
  })) && phase.readOnly === (phase.phase === 'read-only'))) return null
  if (failure.property === 'execution') {
    return partial && failure.status === 'ERROR' && failure.phase === 'read-only-transition'
      && failure.actual === 'Inline widget root left its projection boundary before hydration'
      && !Object.hasOwn(failure, 'expected') ? 'repaired-baseline-carousel-widget-mode-failure' : null
  }
  if (failure.status !== 'FAIL' || !observedPhases.includes(failure.phase)) return null
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const edited = editedPhase(failure.phase)

  if (legacy) {
    const remount = ['read-only', 'editable-again', ...(populated ? ['undo', 'redo'] : [])].includes(failure.phase)
    if (remount && failure.property === 'carouselWrapperIdentity' && matches(false, true)) {
      return ['undo', 'redo'].includes(failure.phase) ? 'repaired-v1-carousel-history-remount' : 'repaired-v1-carousel-mode-remount'
    }
    if (remount && failure.property === 'blockDomIdentity'
      && matches(Array(populated ? 3 : 1).fill(false), Array(populated ? 3 : 1).fill(true))) {
      return ['undo', 'redo'].includes(failure.phase) ? 'repaired-v1-carousel-history-remount' : 'repaired-v1-carousel-mode-remount'
    }
    if (populated && failure.phase === 'undo' && failure.property === 'nativeSelection'
      && matches({ focused: false, anchor: null, focus: null, collapsed: true },
        { focused: true, anchor: rich ? 33 : 22, focus: rich ? 33 : 22, collapsed: true })
      && same(entry.phases.find(phase => phase.phase === 'undo').selectionOwner, {
        active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
        anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
        focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
      })) return 'repaired-v1-carousel-first-undo-caret'
    if (!rich) return null
    if (failure.property === 'canonicalRecords'
      && matches(records({ ...context, edited, canonical: true }), records({ ...context, edited, canonical: true, sidecars: true }))) {
      return 'unsupported-v1-carousel-persistent-sidecars'
    }
    if (['editorWidgets', 'detachedWidgets', 'attachedDetachedWidgets', 'mountedWidgets'].includes(failure.property)
      && matches([], widgets)) return 'unsupported-v1-carousel-persistent-widgets'
    return null
  }
  if (populated && ['detachedAuthoredMarkup', 'attachedDetachedAuthoredMarkup', 'mountedAuthoredMarkup'].includes(failure.property)
    && matches(rendered(captions({ ...context, edited }).map(caption => [caption])),
      rendered(captions({ ...context, edited, canonical: true })))) return 'repaired-baseline-carousel-literalized-rich-captions'
  if (populated && rich && ['detachedWidgets', 'attachedDetachedWidgets', 'mountedWidgets'].includes(failure.property)
    && matches([], widgets)) return 'repaired-baseline-carousel-renderer-widgets'
  return null
}
