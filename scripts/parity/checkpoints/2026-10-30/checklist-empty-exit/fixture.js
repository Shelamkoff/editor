// Fixed author input shared by the three immutable-source observations.
export const cases = ['empty', 'BR-only', 'formatting-only'].flatMap((name, index) =>
  ['sole', 'last'].map(position => ({ id: `${position}/${name}`, position, text: ['', '<br>', '<b></b>'][index] })))
cases.push({ id: 'visible/formatting', position: 'sole', text: '<b>Visible</b>', guard: 'formatting' },
  { id: 'visible/widgets', position: 'sole', text: '<b>{{mention}}</b> {{color}}', guard: 'widgets' })
const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))

export async function runCase(spec, { sourceBase, legacy, input }) {
  const base = new URL(sourceBase, location.href)
  const [core, paragraph, checklist, mention, color] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/paragraph/index.js', base).href),
    import(new URL('plugins/checklist/index.js', base).href), import(new URL('inline-plugins/mention/index.js', base).href),
    import(new URL('inline-plugins/color.js', base).href),
  ])
  const record = (id, type, data, extra = {}) => ({ id, type, ...(!legacy ? { dataVersion: 2 } : {}), data, ...extra })
  const sidecar = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const inline = { mention: sidecar('mention', { id: 'ada', name: 'Ada' }), color: sidecar('color', { value: '#123456' }) }
  const retained = { ...(!legacy ? { id: 'retained' } : {}), text: '<b>Keep</b> <i>{{mention}}</i> {{color}}', checked: true }
  const original = [
    record('before', 'paragraph', { text: 'Before' }),
    record('checklist', 'checklist', { items: [...(spec.position === 'last' ? [retained] : []),
      { ...(!legacy ? { id: 'empty' } : {}), text: spec.text, checked: false }] }, spec.position === 'last' || spec.guard === 'widgets' ? { inline } : {}),
    record('after', 'paragraph', { text: '<i>After</i> {{mention}} {{color}}' }, { inline }),
  ]
  const initial = { version: legacy ? '1.0.5' : '2.0.0', blocks: clone(original) }, callerBytes = JSON.stringify(initial)
  const edited = clone(original); edited[0].data.text = 'BeforeX'
  const holder = document.createElement('section'); holder.style.width = '640px'; document.body.append(holder)
  let editor, phase = 'create', providers = 0
  const observations = [], snapshots = [], events = []
  const check = (property, actual, expected) => observations.push({ phase, property,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL', actual, expected })
  const root = id => holder.querySelector(`.oe-block[data-block-id="${id}"]`)
  const empty = () => root('checklist')?.querySelector('.oe-checklist__item:last-child .oe-checklist__text')
  const remember = name => { phase = name; const value = editor.save().blocks; snapshots.push({ phase, blocks: value,
    activeBlock: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
    canUndo: editor.canUndo, canRedo: editor.canRedo }); return value }
  const caret = (field, offset = 0) => {
    const selection = getSelection(), range = document.createRange()
    const owned = !!field && field.contains(selection?.anchorNode)
    let actualOffset = null
    if (owned) { range.selectNodeContents(field); range.setEnd(selection.anchorNode, selection.anchorOffset); actualOffset = range.toString().length }
    check('nativeCaret', { focused: document.activeElement === field, owned, collapsed: selection?.isCollapsed, offset: actualOffset },
      { focused: true, owned: true, collapsed: true, offset })
  }
  const capture = event => events.push({ phase, type: event.type, key: event.key ?? null, trusted: event.isTrusted,
    inputType: event.inputType ?? null, block: event.target.closest?.('[data-block-id]')?.dataset.blockId ?? null })
  for (const type of ['input', 'keydown']) holder.addEventListener(type, capture, true)
  async function settled() {
    const deadline = Date.now() + 10000
    while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
      if (Date.now() > deadline) throw new Error('Checklist stylesheet did not load')
      await pause()
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await pause()
  }
  async function focus(field, atEnd) {
    field.scrollIntoView({ block: 'nearest' }); await settled()
    const rect = field.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error('Native click target is invisible')
    await input('click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    const range = document.createRange(); range.selectNodeContents(field); range.collapse(!atEnd)
    getSelection().removeAllRanges(); getSelection().addRange(range)
  }
  const planned = ['load', 'edit', 'exit', 'undo-exit', 'undo-edit', 'redo-edit', 'redo-exit', 'dispose']
  try {
    editor = core.createEditor({ holder, injectStyles: true, defaultBlock: 'paragraph', data: initial, inlineTools: [],
      plugins: legacy ? [new paragraph.Paragraph(), new checklist.Checklist()] : [paragraph.createParagraphPlugin(), checklist.createChecklistPlugin()],
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => { providers++; return [] } }), color.createColorSwatchPlugin()],
    })
    await settled()
    check('initialRecords', remember('load'), original)
    phase = 'edit'
    await focus(root('before').querySelector('[contenteditable="true"]'), true)
    await input('type', 'X'); await settled()
    check('editedRecords', remember('edit'), edited)
    check('trustedTextInput', events.filter(value => value.phase === 'edit' && value.type === 'input')
      .map(value => ({ trusted: value.trusted, type: value.inputType })), [{ trusted: true, type: 'insertText' }])
    phase = 'exit'
    await focus(empty(), !!spec.guard)
    await input('enter'); await settled()
    const exited = remember('exit')
    let targetField
    check('precedingRecord', exited[0], edited[0]); check('followingRecord', exited.at(-1), edited.at(-1))
    if (spec.guard) {
      check('blockTypes', exited.map(block => block.type), ['paragraph', 'checklist', 'paragraph'])
      check('splitItemCount', exited[1].data.items.length, 2)
      check('originalVisibleItem', exited[1].data.items[0], edited[1].data.items[0])
      check('visibleSidecars', exited[1].inline ?? null, edited[1].inline ?? null)
      check('newItemUnchecked', exited[1].data.items[1]?.checked, false)
      if (!legacy) check('newItemIdentity', exited[1].data.items[1]?.id !== 'empty', true)
      targetField = empty
    } else {
      const target = exited[spec.position === 'last' ? 2 : 1]
      check('blockTypes', exited.map(block => block.type), spec.position === 'last'
        ? ['paragraph', 'checklist', 'paragraph', 'paragraph'] : ['paragraph', 'paragraph', 'paragraph'])
      if (spec.position === 'last') check('retainedChecklist', exited[1], { ...edited[1], data: { items: [retained] } })
      if (!legacy && spec.position === 'sole') check('conversionIdentity', target.id, 'checklist')
      targetField = () => root(target.id)?.querySelector('[contenteditable="true"]')
    }
    check('exitText', targetField()?.textContent, ''); caret(targetField())
    check('trustedEnter', events.filter(value => value.phase === 'exit' && value.key === 'Enter').map(value => value.trusted), [true])
    for (const [name, action, expected, undo, redo] of [
      ['undo-exit', 'undo', edited, true, true], ['undo-edit', 'undo', original, false, true],
      ['redo-edit', 'redo', edited, true, true], ['redo-exit', 'redo', exited, true, false],
    ]) {
      phase = name; await input(action); await settled()
      check('historyRecords', remember(name), expected)
      check('historyAvailability', [editor.canUndo, editor.canRedo], [undo, redo])
      check('trustedHistory', events.filter(value => value.phase === name && value.key?.toLowerCase() === 'z').map(value => value.trusted), [true])
      if (name === 'undo-exit' && !spec.guard) caret(empty())
      if (name === 'redo-exit') caret(targetField())
    }
    check('callerInputUnchanged', JSON.stringify(initial), callerBytes)
    check('providerSilence', providers, 0)
    phase = 'dispose'; editor.destroy(); check('releasedHolder', holder.childElementCount, 0)
    snapshots.push({ phase })
  } catch (error) { observations.push({ phase, property: 'execution', status: 'ERROR', actual: error.stack ?? String(error) }) }
  finally { editor?.destroy(); holder.remove() }
  return { ...spec, legacy, observations, snapshots, events, failures: observations.filter(value => value.status !== 'PASS'),
    incompletePhases: planned.filter(name => !snapshots.some(value => value.phase === name)) }
}
