export const warningMergeCases = ['source', 'target'].flatMap(placement => ['rich', 'first-plain', 'first-mark', 'last-plain', 'last-mark', 'both-plain', 'both-mark'].flatMap(content => ['Backspace', 'Delete'].map(key => ({ id: placement + '/' + content + '/' + key, placement, content, key }))))
export async function runWarningMergeCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url), [core, paragraph, warning, color] = await Promise.all(['core/index.js', 'plugins/paragraph/index.js', 'plugins/warning/index.js', 'inline-plugins/color.js'].map(path => import(new URL(path, base))))
  const copy = value => JSON.parse(JSON.stringify(value)), pause = () => new Promise(resolve => setTimeout(resolve, 75)), ref = value => ({ type: 'color', ...(!legacy ? { dataVersion: 1 } : {}), data: { value } })
  const record = (id, type, data, inline) => ({ id, type, ...(!legacy ? { dataVersion: type === 'paragraph' ? 2 : 1 } : {}), data, ...(inline ? { inline } : {}) })
  const emptyFirst = /^(first|both)-/.test(spec.content), emptyLast = /^(last|both)-/.test(spec.content), mark = spec.content.endsWith('-mark')
  const title = emptyFirst ? mark ? '<b></b>' : '' : '<b>Next</b>', message = emptyLast ? mark ? '<i></i>' : '' : '<i>Body</i> {{swatchB}}'
  const onTarget = spec.placement === 'target'
  const target = record('target', 'warning', { title: onTarget && emptyFirst ? title : '<b>First</b>', message: onTarget && emptyLast ? message : '<i>Keep</i> {{swatchA}}' }, onTarget && emptyLast ? undefined : { swatchA: ref('#123456') })
  const source = record('source', 'warning', { title: onTarget ? '<b>Next</b>' : title, message: onTarget ? '<i>Body</i> {{swatchB}}' : message }, !onTarget && emptyLast ? undefined : { swatchB: ref('#aBcDef') })
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('prefix', 'paragraph', { text: 'Before' }), target, source, record('suffix', 'paragraph', { text: 'After' })] }, original = copy(input)
  const holder = document.createElement('section'); holder.style.cssText = 'width:850px;margin:100px auto'; document.body.append(holder)
  const observations = [], nativeEvents = [], transactions = [], diagnostics = [], unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy transaction/diagnostic subscriptions are absent; empty fixture arrays are not legacy event counts.' }] : [], planned = ['load', 'merge', 'undo', 'redo', 'dispose'], completedPhases = []
  const editor = core.createEditor({ holder, injectStyles: true, plugins: [legacy ? new paragraph.Paragraph() : paragraph.createParagraphPlugin(), legacy ? new warning.Warning() : warning.createWarningPlugin()], inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: [], data: input, onDiagnostic: value => diagnostics.push(value) })
  if (!legacy) editor.on('transaction:committed', e => transactions.push({ action: e.action, origin: e.origin, name: e.name }))
  const state = () => editor.save().blocks, flags = () => [editor.canUndo, editor.canRedo], check = (property, actual, expected) => observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
  const key = async (key, modifiers, role) => {
    const [code, number] = key === 'Backspace' ? ['Backspace', 8] : key === 'Delete' ? ['Delete', 46] : ['KeyZ', 90]
    document.addEventListener('keydown', e => nativeEvents.push({ role, type: 'keydown', key: e.key, trusted: e.isTrusted, modifiers: (e.ctrlKey ? 2 : 0) | (e.shiftKey ? 8 : 0) }), { capture: true, once: true })
    for (const type of ['rawKeyDown', 'keyUp']) await nativeInput('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers }); await pause()
  }
  let phase = 'load', error = null
  try {
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await pause(); const initial = state()
    check('canonical', initial, input.blocks); check('history', flags(), [false, false]); completedPhases.push(phase)
    phase = 'merge'; const field = spec.key === 'Backspace' ? holder.querySelectorAll('.oe-warning__title')[1] : holder.querySelectorAll('.oe-warning__message')[0]
    field.focus(); const range = document.createRange(); range.selectNodeContents(field); range.collapse(spec.key === 'Backspace'); getSelection().removeAllRanges(); getSelection().addRange(range)
    await key(spec.key, 0, 'merge'); const after = state(), wanted = [copy(input.blocks[0]), copy(target), copy(input.blocks[3])]
    if (onTarget && emptyFirst) wanted[1].data.title = '<b>Next</b>'
    else if (onTarget || !emptyFirst) wanted[1].data.title += '<br><b>Next</b>'
    if (onTarget && emptyLast) wanted[1].data.message = '<i>Body</i> {{swatchB}}'
    else if (onTarget || !emptyLast) wanted[1].data.message += '<br><i>Body</i> {{swatchB}}'
    if (onTarget || !emptyLast) { wanted[1].inline ??= {}; wanted[1].inline.swatchB = ref('#aBcDef') }
    check('canonical', after, wanted); check('history', flags(), [true, false]); check('widgetCount', holder.querySelectorAll('[data-inline-plugin]').length, emptyLast ? 1 : 2); completedPhases.push(phase)
    phase = 'undo'; await key('z', 2, 'undo'); check('canonical', state(), initial); check('history', flags(), [false, true]); completedPhases.push(phase)
    phase = 'redo'; await key('z', 10, 'redo'); check('canonical', state(), after); check('history', flags(), [true, false]); check('caller', input, original); check('diagnostics', diagnostics, []); completedPhases.push(phase)
    phase = 'dispose'; editor.destroy(); check('removed', !holder.querySelector('.oe-editor'), true); completedPhases.push(phase)
  } catch (caught) { error = String(caught.stack ?? caught) }
  finally { editor.destroy(); holder.remove() }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error }
}
