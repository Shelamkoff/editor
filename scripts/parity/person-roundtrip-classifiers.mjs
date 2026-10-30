// Exact observations from the pinned historical Person implementations.
// These recognizers never alter browser input or accept candidate failures.
import { isDeepStrictEqual as same } from 'node:util'

export const personCaseIds = Object.freeze([
  'BLOCK_PERSON_ROUNDTRIP/default', 'BLOCK_PERSON_ROUNDTRIP/populated',
  'BLOCK_PERSON_ROUNDTRIP/populated-unwrapped-control', 'BLOCK_PERSON_ROUNDTRIP/populated-literal',
])
const contentPhases = ['load', 'read-only', 'editable-again', 'edit', 'undo', 'redo']
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const mark = (tag, text) => ({ tag, attributes: {}, children: [text] })
const caret = (offset, focused = true) => ({ focused, anchor: offset, focus: offset, collapsed: true })
const widgets = [{ id: 'mention', type: 'mention', text: '@Ada', value: 'ada' },
  { id: 'swatch', type: 'color', text: '#123456', value: '#123456' }]
const record = (legacy, id, type, dataVersion, data, inline) => ({ id, type, ...(!legacy ? { dataVersion } : {}), data,
  ...(inline ? { inline } : {}) })
const nameText = (literal, edited) => (literal ? 'Alpha author & name tail' : 'Alpha @Ada tail') + (edited ? 'X' : '')
function personRecords({ legacy, populated, literal, wrapped, edited, id, canonical = false, sidecars = false, filtered = false }) {
  const empty = canonical ? [] : ''
  if (!populated) return [record(legacy, id, 'person', 2, { persons: filtered && !edited ? [] : [{
    ...(!legacy ? { id: 'person-0' } : {}), avatar: '', name: edited ? canonical ? ['X'] : 'X' : empty,
    role: empty, bio: empty, links: [],
  }] })]
  const firstName = canonical ? [mark('b', 'Alpha'), ...(wrapped
    ? [' ', mark('i', literal ? 'author & name' : '{{mention}}'), ' tail' + (edited ? 'X' : '')]
    : [' {{mention}} tail' + (edited ? 'X' : '')])]
    : '<b>Alpha</b> ' + (wrapped ? '<i>' + (literal ? 'author &amp; name' : '{{mention}}') + '</i>' : '{{mention}}') + ' tail' + (edited ? 'X' : '')
  const firstBio = canonical ? [mark('b', 'Biography'), ...(wrapped
    ? [' ', mark('s', literal ? 'literal & text' : '{{swatch}}')] : [' {{swatch}}'])]
    : '<b>Biography</b> ' + (wrapped ? '<s>' + (literal ? 'literal &amp; text' : '{{swatch}}') + '</s>' : '{{swatch}}')
  const inline = sidecars ? {
    mention: { type: 'mention', ...(!legacy ? { dataVersion: 1 } : {}), data: { id: 'ada', name: 'Ada' } },
    swatch: { type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value: '#123456' } },
  } : undefined
  return [record(legacy, 'prefix', 'paragraph', 2, { text: canonical ? [mark('b', 'Before')] : '<b>Before</b>' }),
    record(legacy, 'probe', 'person', 2, { persons: [
      { ...(!legacy ? { id: 'ada' } : {}), avatar: pixel, name: firstName,
        role: canonical ? [mark('mark', 'Research & team')] : '<mark>Research &amp; team</mark>', bio: firstBio,
        links: [{ ...(!legacy ? { id: 'site' } : {}), type: 'website', url: 'https://example.test/ada' }] },
      { ...(!legacy ? { id: 'grace' } : {}), avatar: '', name: canonical ? [mark('i', 'Grace & Co')] : '<i>Grace &amp; Co</i>',
        role: canonical ? [mark('b', 'Architect')] : '<b>Architect</b>',
        bio: canonical ? [mark('mark', 'Second biography')] : '<mark>Second biography</mark>',
        links: [{ ...(!legacy ? { id: 'code' } : {}), type: 'github', url: 'https://github.com/grace' }] },
    ] }, inline), record(legacy, 'suffix', 'paragraph', 2, { text: canonical ? [mark('i', 'After')] : '<i>After</i>' })]
}
function rendered(args, { absent = false, rawAlt = false } = {}) {
  const data = personRecords({ ...args, canonical: true })[1].data.persons
  const name = personRecords({ ...args, canonical: false })[1].data.persons[0].name
  return [[mark('b', 'Before')], absent ? [] : data.map((entry, index) => ({
    name: entry.name, role: entry.role, bio: entry.bio,
    avatar: index ? null : { src: pixel, alt: rawAlt ? name : nameText(args.literal, args.edited), loading: 'lazy' },
    links: entry.links.map(link => ({ href: link.url, target: '_blank', rel: 'noopener noreferrer', title: link.type,
      text: link.url.replace(/^https?:\/\//, ''), icon: true })),
  })), [mark('i', 'After')]]
}
const nameOwner = (id, text, offset) => ({ active: { block: id, node: 'DIV', className: 'oe-person__name' },
  anchor: { block: id, node: '#text', text, offset }, focus: { block: id, node: '#text', text, offset } })
const prefixOwner = { active: { block: 'prefix', node: 'P', className: 'oe-paragraph' },
  anchor: { block: 'prefix', node: '#text', text: 'Before', offset: 6 },
  focus: { block: 'prefix', node: '#text', text: 'Before', offset: 6 } }

export function classifyPersonDifference(source, entry, failure) {
  if (!['v1', 'spec-baseline'].includes(source) || !personCaseIds.includes(entry.id)) return null
  const legacy = source === 'v1', populated = !entry.id.endsWith('/default')
  const literal = entry.id.endsWith('/populated-literal'), wrapped = !entry.id.endsWith('/populated-unwrapped-control')
  const fullPhases = populated ? ['load', 'read-only', 'editable-again', 'view-second', 'view-return', 'edit', 'undo', 'redo'] : contentPhases
  const complete = same(entry.completedPhases, [...fullPhases, 'dispose']) && !entry.incompletePhases?.length
  const partial = !legacy && populated && !literal && same(entry.completedPhases, ['load'])
    && same(entry.incompletePhases, [...fullPhases.slice(1), 'dispose'])
  if (!complete && !partial) return null
  const observedPhases = partial ? ['load'] : fullPhases
  const phase = name => entry.phases?.find(value => value.phase === name)
  const id = populated ? 'probe' : phase('load')?.blocks?.[0]?.id
  if (typeof id !== 'string' || !id.length || !same(entry.phases?.map(value => value.phase), observedPhases)) return null
  const args = { legacy, populated, literal, wrapped, id }
  // Every exception is bound to the complete fixed author records, sidecars,
  // identities, mode and history in every actually executed phase.
  for (const name of observedPhases) {
    if (!same(phase(name)?.blocks, personRecords({ ...args, edited: ['edit', 'redo'].includes(name),
      sidecars: !legacy && populated && !literal, filtered: legacy }))) return null
    if (phase(name)?.readOnly !== (name === 'read-only')) return null
    const history = { canUndo: ['edit', 'redo'].includes(name), canRedo: name === 'undo' }
    const observations = entry.observations?.filter(value => value.phase === name
      && value.property === (name.startsWith('view-') ? 'personViewHistory' : 'historyState'))
    if (observations?.length !== 1 || observations[0].status !== 'PASS'
      || !same(observations[0].actual, history) || !same(observations[0].expected, history)) return null
  }
  if (partial && failure.phase === 'read-only-transition' && failure.property === 'execution' && failure.status === 'ERROR'
    && failure.actual === 'Inline widget root left its projection boundary before hydration' && !Object.hasOwn(failure, 'expected')) {
    return 'repaired-baseline-person-widget-mode-failure'
  }
  if (failure.status !== 'FAIL' || !observedPhases.includes(failure.phase)) return null
  const matches = (actual, expected) => same(failure.actual, actual) && same(failure.expected, expected)
  const edited = ['edit', 'redo'].includes(failure.phase)
  if (legacy && ['read-only', 'editable-again', 'undo', 'redo'].includes(failure.phase)
    && failure.property === 'blockDomIdentity' && matches(Array(populated ? 3 : 1).fill(false), Array(populated ? 3 : 1).fill(true))) {
    return 'repaired-v1-person-mode-history-remount'
  }
  if (legacy && !populated && !edited && failure.property === 'canonicalRecords'
    && matches(personRecords({ ...args, edited, canonical: true, filtered: true }), personRecords({ ...args, edited, canonical: true }))) {
    return 'v1-person-empty-draft-wire-representation'
  }
  if (!populated && failure.property === 'personTabs' && failure.phase !== 'redo'
    && matches(['Person {number}'], [edited ? 'X' : 'Person 1'])) {
    return legacy && edited ? 'repaired-v1-person-native-tab-label' : 'repaired-person-fallback-label-interpolation'
  }
  if (populated && ['personTabs', 'personViewTabs'].includes(failure.property)) {
    const expected = [nameText(literal, edited), 'Grace & Co']
    if (legacy && matches(personRecords({ ...args, edited: failure.phase === 'redo' })[1].data.persons.map(person => person.name), expected)) {
      return 'repaired-v1-person-literal-tab-markup'
    }
    if (partial && failure.phase === 'load' && matches(['Alpha {{mention}} tail', 'Grace & Co'], expected)) {
      return 'repaired-baseline-person-derived-tab-label'
    }
  }
  if (populated && contentPhases.includes(failure.phase)) {
    if (['detachedAuthoredMarkup', 'attachedDetachedAuthoredMarkup'].includes(failure.property)
      && matches(rendered({ ...args, edited }, { absent: true }), rendered({ ...args, edited }))) return 'repaired-person-detached-card-output'
    if (failure.property === 'mountedAuthoredMarkup'
      && matches(rendered({ ...args, edited }, { rawAlt: true }), rendered({ ...args, edited }))) return 'repaired-person-renderer-avatar-alternative'
    if (!literal && ['detachedWidgets', 'attachedDetachedWidgets'].includes(failure.property) && matches([], widgets)) {
      return 'repaired-person-detached-card-output'
    }
  }
  if (legacy && populated && !literal) {
    if (['canonicalRecords', 'personViewCanonical'].includes(failure.property)
      && matches(personRecords({ ...args, edited, canonical: true }), personRecords({ ...args, edited, canonical: true, sidecars: true }))) {
      return 'unsupported-v1-person-persistent-widgets'
    }
    if (['editorWidgets', 'mountedWidgets', 'personViewWidgets'].includes(failure.property) && matches([], widgets)) return 'unsupported-v1-person-persistent-widgets'
    if (failure.phase === 'edit' && same(phase('edit')?.selectionOwner, nameOwner('probe', wrapped ? ' tailX' : ' {{mention}} tailX', wrapped ? 6 : 18))
      && ((failure.property === 'fixtureCaret' && matches(caret(22), caret(12)))
        || (failure.property === 'nativeSelection' && matches(caret(23), caret(13))))) return 'unsupported-v1-person-persistent-widget-caret'
  }
  if (legacy && failure.property === 'nativeSelection') {
    if (!populated && ['undo', 'redo'].includes(failure.phase) && matches(caret(null), caret(edited ? 1 : 0))
      && same(phase(failure.phase)?.selectionOwner, nameOwner(id, 'Links', 5))) return 'repaired-v1-empty-person-history-caret'
    if (populated && failure.phase === 'undo' && matches(caret(null, false), caret(literal ? 24 : 12))
      && same(phase('undo')?.selectionOwner, prefixOwner)) return 'repaired-v1-person-first-undo-focus'
    if (populated && failure.phase === 'redo' && matches(caret(literal ? 24 : 22), caret(literal ? 25 : 13))
      && same(phase('redo')?.selectionOwner, nameOwner('probe', wrapped ? ' tailX' : ' {{mention}} tailX', wrapped ? 5 : 17))) {
      return 'repaired-v1-person-redo-caret'
    }
  }
  return null
}
