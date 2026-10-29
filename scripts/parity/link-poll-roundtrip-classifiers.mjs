// Historical observations only. No browser input, canonical record, expected
// value or candidate failure is changed by these exact recognizers.
import { isDeepStrictEqual as same } from 'node:util'

export const linkPollCaseIds = Object.freeze([
  'BLOCK_LINK_PREVIEW_ROUNDTRIP/default', 'BLOCK_LINK_PREVIEW_ROUNDTRIP/populated',
  'BLOCK_POLL_ROUNDTRIP/default', 'BLOCK_POLL_ROUNDTRIP/populated', 'BLOCK_POLL_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_POLL_ROUNDTRIP/populated-literal',
])
const phases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const mark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const caret = (offset, focused = true) => ({ focused, anchor: offset, focus: offset, collapsed: true })
const record = (legacy, id, type, dataVersion, data, inline) => ({ id, type, ...(!legacy ? { dataVersion } : {}), data,
  ...(inline ? { inline } : {}) })
const widgets = [
  { id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' },
]
function pollRecords({ legacy, populated, wrapped, literal, edited, canonical = false, sidecars = false, id, optionIds }) {
  const text = (tag, value) => canonical ? [mark(tag, value)] : `<${tag}>${value}</${tag}>`
  if (!populated) return [record(legacy, id, 'poll', 1, {
    question: canonical ? edited ? ['X'] : [] : edited ? 'X' : '', type: 'single',
    options: optionIds.map(id => ({ id, text: canonical ? [] : '' })), resultsMode: 'always',
  })]
  const mention = literal ? 'question' : '{{mention}}', color = literal ? 'choice' : '{{swatch}}'
  const question = canonical
    ? [mark('b', 'Alpha'), ...(wrapped ? [' ', mark('i', mention), ' tail' + (edited ? 'X' : '')] : [' ' + mention + ' tail' + (edited ? 'X' : '')])]
    : '<b>Alpha</b> ' + (wrapped ? '<i>' + mention + '</i>' : mention) + ' tail' + (edited ? 'X' : '')
  const first = canonical
    ? [mark('mark', 'First answer'), ...(wrapped ? [' ', mark('s', color)] : [' ' + color])]
    : '<mark>First answer</mark> ' + (wrapped ? '<s>' + color + '</s>' : color)
  const inline = sidecars ? {
    mention: { type: 'mention', ...(!legacy ? { dataVersion: 1 } : {}), data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#123456' } },
  } : undefined
  return [record(legacy, 'prefix', 'paragraph', 2, { text: text('b', 'Before') }),
    record(legacy, 'probe', 'poll', 1, { question, type: 'multiple',
      options: [{ id: 'first', text: first }, { id: 'second', text: canonical ? [mark('i', 'Second & answer')] : '<i>Second &amp; answer</i>' }],
      resultsMode: 'always', pollId: 'roundtrip-poll',
      initialResults: { total: 3, options: [{ id: 'first', votes: 2 }, { id: 'second', votes: 1 }], currentUserVote: ['second'] },
    }, inline), record(legacy, 'suffix', 'paragraph', 2, { text: text('i', 'After') })]
}
function linkRecords({ legacy, populated, edited, id }) {
  const data = { url: '', title: '', description: '', image: '', favicon: '', domain: '', template: populated ? 'horizontal' : 'notion' }
  if (edited) Object.assign(data, { url: populated ? 'https://example.test/storyX' : 'https://example.test/roundtrip', domain: 'example.test' })
  else if (populated) Object.assign(data, { url: 'https://example.test/story', title: 'Literal <b>headline</b> & {{literal}}',
    description: 'Description & <script>literal</script>', image: pixel, favicon: pixel, domain: 'display.example' })
  const block = record(legacy, populated ? 'probe' : id, 'linkPreview', 1, data)
  return populated ? [record(legacy, 'prefix', 'paragraph', 2, { text: '<b>Before</b>' }), block,
    record(legacy, 'suffix', 'paragraph', 2, { text: '<i>After</i>' })] : [block]
}
const inputOwner = (id, node, text, offset) => ({ active: { block: id, node: 'INPUT', className: 'oe-lp__url-input' },
  anchor: { block: id, node, text, offset }, focus: { block: id, node, text, offset } })
const pollOwner = (id, text, offset) => ({ active: { block: id, node: 'DIV', className: 'oe-poll__question' },
  anchor: { block: id, node: '#text', text, offset }, focus: { block: id, node: '#text', text, offset } })
const prefixOwner = { active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
  anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
  focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 } }
const card = (populated, edited) => {
  if (!populated && !edited) return null
  const data = linkRecords({ populated, edited, id: 'unused' }).find(block => block.type === 'linkPreview').data
  return { href: data.url, target: '_blank', rel: 'noopener noreferrer', title: data.title || data.url, titleElements: 0,
    description: data.description, descriptionElements: 0, domain: data.domain,
    image: data.image || null, favicon: data.favicon || null }
}

export function classifyLinkPollDifference(source, entry, failure) {
  if (!['v1', 'spec-baseline'].includes(source) || !linkPollCaseIds.includes(entry.id)) return null
  const legacy = source === 'v1', populated = !entry.id.endsWith('/default')
  const poll = entry.id.startsWith('BLOCK_POLL_'), literal = entry.id.endsWith('/populated-literal')
  const wrapped = entry.id.endsWith('/populated') || literal
  const phase = name => entry.phases?.find(value => value.phase === name)
  const complete = same(entry.completedPhases, [...phases, 'dispose']) && !entry.incompletePhases?.length
  const partial = poll && populated && !literal && !legacy && same(entry.completedPhases, ['load'])
    && same(entry.incompletePhases, ['read-only', 'editable-again', 'edit', 'undo', 'redo', 'dispose'])
  if (!complete && !partial) return null
  const id = populated ? 'probe' : phase('load')?.blocks?.[0]?.id
  if (typeof id !== 'string' || !id.length) return null
  const options = phase('load')?.blocks?.[0]?.data?.options
  if (poll && !populated && !Array.isArray(options)) return null
  const optionIds = poll && !populated ? options.map(option => option.id) : undefined
  if (optionIds && (optionIds.length !== 2 || new Set(optionIds).size !== 2 || optionIds.some(id => typeof id !== 'string' || !id.length))) return null
  const args = { legacy, populated, wrapped, literal, id, optionIds }
  const expectedRecords = name => poll
    ? pollRecords({ ...args, edited: ['edit', 'redo'].includes(name), sidecars: !legacy && !literal })
    : linkRecords({ ...args, edited: ['edit', 'redo'].includes(name) })
  const observedPhases = partial ? ['load'] : phases
  // Bind all exceptions to the independently fixed author records and phase
  // accounting, not just the particular field that happened to differ.
  if (!same(entry.phases?.map(value => value.phase), observedPhases)
    || !observedPhases.every(name => same(phase(name)?.blocks, expectedRecords(name)))) return null
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  if (partial && failure.phase === 'read-only-transition' && failure.property === 'execution'
    && failure.status === 'ERROR' && failure.actual === 'Inline widget root left its projection boundary before hydration'
    && !Object.hasOwn(failure, 'expected')) return 'repaired-baseline-poll-widget-mode-failure'
  if (failure.status !== 'FAIL' || !observedPhases.includes(failure.phase)) return null
  const edited = ['edit', 'redo'].includes(failure.phase)
  if (legacy) {
    const size = failure.property === 'blockDomIdentity' ? populated ? 3 : 1 : !poll && failure.property === 'plainFieldDomIdentity' ? 1 : 0
    if (size && ['read-only', 'editable-again', 'undo', 'redo'].includes(failure.phase)
      && matches(Array(size).fill(false), Array(size).fill(true))) return `repaired-v1-${poll ? 'poll' : 'link-preview'}-${['undo', 'redo'].includes(failure.phase) ? 'history' : 'mode'}-remount`
  }
  if (poll) {
    if (populated && !literal && (legacy || partial)) {
      if (failure.property === 'pollResultsText' && matches(['First answer {{swatch}}', 'Second & answer'], ['First answer #123456', 'Second & answer'])) {
        return legacy ? 'unsupported-v1-poll-persistent-widgets' : 'repaired-baseline-poll-derived-label'
      }
      const resultMarkup = value => [[mark('mark', 'First answer'), ...(wrapped ? [' ', mark('s', value)] : [' ' + value])], [mark('i', 'Second & answer')]]
      if (failure.property === 'pollResultsMarkup' && matches(resultMarkup('{{swatch}}'), resultMarkup('#123456'))) {
        return legacy ? 'unsupported-v1-poll-persistent-widgets' : 'repaired-baseline-poll-derived-label'
      }
      if (legacy && failure.property === 'canonicalRecords'
        && matches(pollRecords({ ...args, edited, canonical: true }), pollRecords({ ...args, edited, canonical: true, sidecars: true }))) return 'unsupported-v1-poll-persistent-widgets'
      if (legacy && ['editorWidgets', 'detachedWidgets', 'attachedDetachedWidgets', 'mountedWidgets'].includes(failure.property)
        && matches([], widgets)) return 'unsupported-v1-poll-persistent-widgets'
      if (legacy && same(phase(failure.phase)?.selectionOwner, pollOwner('probe', wrapped ? ' tailX' : ' {{mention}} tailX', wrapped ? 6 : 18))
        && ((failure.property === 'fixtureCaret' && failure.phase === 'edit' && matches(caret(22), caret(12)))
          || (failure.property === 'nativeSelection' && edited && matches(caret(23), caret(13))))) return 'unsupported-v1-poll-persistent-widget-caret'
    }
    if (legacy && failure.phase === 'undo' && failure.property === 'nativeSelection') {
      if (!populated && matches(caret(null), caret(0)) && same(phase('undo')?.selectionOwner, pollOwner(id, ' Sort', 5))) return 'repaired-v1-empty-poll-caret'
      if (populated && matches(caret(null, false), caret(literal ? 19 : 12)) && same(phase('undo')?.selectionOwner, prefixOwner)) return 'repaired-v1-poll-first-undo-focus'
    }
    return null
  }
  if (legacy) {
    if (!populated && failure.phase === 'editable-again' && failure.property === 'foreignFocusPreserved' && matches(false, true)
      && same(phase('editable-again')?.selectionOwner, inputOwner(id, 'DIV', '', 1))) return 'repaired-v1-empty-link-preview-focus-theft'
    if (failure.property === 'nativeSelection' && ['undo', 'redo'].includes(failure.phase) && (populated || edited)) {
      const text = edited ? populated ? 'https://example.test/storyX' : 'https://example.test/roundtrip' : 'Literal <b>headline</b> & {{literal}}'
      const expectedOffset = populated ? edited ? 27 : 26 : 30
      if (matches(caret(0), caret(expectedOffset)) && same(phase(failure.phase)?.selectionOwner, inputOwner(id, '#text', text, 0))) return 'repaired-v1-link-preview-history-caret'
    }
    return null
  }
  if (failure.phase === 'edit' && failure.property === 'linkPreviewCard' && matches(card(populated, false), card(populated, true))) return 'repaired-baseline-link-preview-native-card'
  if (failure.phase === 'undo' && same(phase('undo')?.selectionOwner, inputOwner(id, 'DIV', '', 1))) {
    if (failure.property === 'editorAuthoredSource' && matches(populated ? 'https://example.test/storyX' : 'https://example.test/roundtrip', populated ? 'https://example.test/story' : '')) return 'repaired-baseline-link-preview-native-undo'
    if (!populated && failure.property === 'nativeSelection' && matches(caret(8), caret(0))) return 'repaired-baseline-link-preview-native-undo-caret'
  }
  return null
}
