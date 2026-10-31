// Fixed authored records and user actions are the oracle. Source adapters only
// translate public wire/API names; historical failures are never normalized.
const pause = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))
const variants = ['a', 'b', 'f', 'g']
const labels = { a: 'Card', b: 'Inline', f: 'List', g: 'Elevated' }
const authored = [
  { id: 'report', url: '/controlled/report.pdf?download=1&lang=ru', name: 'Отчёт <b>& 😀 e\u0301.pdf', size: 2048, extension: 'pdf' },
  { id: 'data', url: 'https://files.example.test/data.csv#part', name: 'data.csv', size: 0, extension: 'CSV' },
  { id: 'duplicate', url: '/controlled/other.pdf', name: 'Отчёт <b>& 😀 e\u0301.pdf', size: 1048576, extension: 'pdf' },
]

export const attachesNamesVariantsCases = [
  ...variants.flatMap((initial, index) => [1, 3].flatMap(count => [initial, variants[(index + 1) % variants.length]].map(target => ({
    id: `ATTACHES_NAMES_VARIANTS/inline/${count}/${initial}-to-${target}`, route: 'inline', count, initial, target,
  })))),
  // Keep the original differential RED/GREEN scenario independently runnable.
  { id: 'ATTACHES_NAMES_VARIANTS/inline/3/a-to-f', route: 'inline', count: 3, initial: 'a', target: 'f' },
  ...variants.map(target => ({ id: `ATTACHES_NAMES_VARIANTS/settings/${target}`, route: 'settings', count: 3,
    initial: target === 'f' ? 'a' : 'f', target })),
  ...variants.map(variant => ({ id: `ATTACHES_NAMES_VARIANTS/reorder/${variant}`, route: 'reorder', count: 3,
    initial: variant, target: variant })),
  ...variants.map((initial, index) => ({ id: `ATTACHES_NAMES_VARIANTS/edge-space/${initial}`, route: 'inline', count: 3,
    initial, target: variants[(index + 1) % variants.length], edgeSpace: true })),
]

export const plannedAttachesPhases = specification => {
  const action = specification.route === 'reorder' ? 'reorder' : 'variant'
  const changed = action === 'reorder' || specification.initial !== specification.target
  return ['load', 'input', action,
    ...(action === 'reorder' ? ['reorder-input', 'undo-reorder-input', 'redo-reorder-input', 'restore-reorder'] : []),
    ...(changed ? [`undo-${action}`] : []), 'undo-input', 'redo-input', ...(changed ? [`redo-${action}`] : []),
    'read-only', 'editable', ...(specification.edgeSpace ? ['blank-input', 'blank-readonly', 'blank-editable'] : [])]
}

const withoutIds = files => files.map(({ id, ...file }) => file)
const sizeText = size => ({ 0: '', 2048: '2KB', 1048576: '1.0MB' })[size]
const rowSelector = (prefix, variant, count) => `.${prefix}__${variant === 'a' ? count > 1 ? 'row' : 'card'
  : variant === 'b' ? 'pill' : variant === 'f' ? 'notion-row' : 'material-card'}`

async function settled() {
  const deadline = Date.now() + 10000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Attaches comparison styles did not load')
    await pause()
  }
  await pause()
}

export async function runAttachesNamesVariantsCase(specification, { sourceBase = '../../', legacy = false, native }) {
  // These are source-inspected capability differences, decided before running
  // the case. v1's Attaches has only its own variant menu; its public block API
  // has no update producer. Execution errors never take this path.
  if (legacy && ['settings', 'reorder'].includes(specification.route)) return {
    id: specification.id, unsupported: specification.route === 'settings'
      ? 'v1 Attaches does not expose a core settings capability; its own A/B/F/G menu is covered by the common cases.'
      : 'v1 EditorBlocksApi has no update producer; saved input order and actual native renames remain covered by the common cases.',
    observations: [], phases: [], completedPhases: [], trusted: [], pageErrors: [], error: null,
  }
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, attaches, { EditorRenderer }] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL('plugins/attaches/index.js', base).href),
    import(new URL('renderer/index.js', base).href),
  ])
  const definition = legacy ? new attaches.Attaches() : attaches.createAttachesPlugin()
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.cssText = 'width:640px;margin:100px 80px 40px'
  output.style.cssText = 'width:640px;margin:40px 80px'
  document.body.append(holder, output)
  const original = clone(authored.slice(0, specification.count))
  if (specification.edgeSpace) {
    original[0].name = 'Report'
    original[1].name = '  Отчёт <b>& Ω e\u0301 .txt  '
  }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'subject', type: 'attaches',
    ...(!legacy ? { dataVersion: 2 } : {}),
    data: { files: legacy ? withoutIds(original) : clone(original), variant: specification.initial }, inline: {} }] }
  const supplied = clone(input), observations = [], phases = [], completedPhases = [], trusted = [], pageErrors = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected, status: same(actual, expected) ? 'PASS' : 'FAIL' })
  let editor, renderer, currentPhase = 'load'
  const captureError = event => pageErrors.push({ phase: currentPhase, message: event.message ?? String(event.reason),
    stack: (event.error ?? event.reason)?.stack ?? null })
  addEventListener('error', captureError); addEventListener('unhandledrejection', captureError)
  try {
    editor = createEditor({ holder, injectStyles: true, defaultBlock: 'attaches', plugins: [definition], inlineTools: [], data: input,
      locale: Object.fromEntries(variants.map(variant => [`plugin.attaches.variant${variant.toUpperCase()}`, labels[variant]])),
    })
    renderer = new EditorRenderer({ blockTypes: ['attaches'], injectStyles: true })
    holder.addEventListener('input', event => trusted.push({ phase: currentPhase, type: event.type, trusted: event.isTrusted, inputType: event.inputType }))
    await settled()
    const wrapper = () => holder.querySelector('.oe-attaches')
    const rows = (variant, count) => [...wrapper().querySelectorAll(rowSelector('oe-attaches', variant, count))]
    const fields = () => [...wrapper().querySelectorAll('.oe-attaches__name[contenteditable]')]
    const canonicalAndHistory = () => {
      // save().time describes this query, not authored document state.
      const { version, blocks } = editor.save()
      return { version, blocks, canUndo: editor.canUndo, canRedo: editor.canRedo }
    }
    const clicked = async element => {
      if (!element) throw new Error(`Missing Attaches control during ${currentPhase}`)
      await settled(); element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
      if (!rect.width || !rect.height || !element.contains(document.elementFromPoint(x, y))) throw new Error(`Unavailable control: ${element.outerHTML}`)
      const listener = event => trusted.push({ phase: currentPhase, type: 'click', trusted: event.isTrusted, intendedControl: element.contains(event.target) })
      document.addEventListener('click', listener, { capture: true, once: true })
      try { await native('click', { x, y }); await pause() }
      finally { document.removeEventListener('click', listener, true) }
    }
    const focusEnd = async () => {
      const chevron = wrapper().querySelector('.oe-attaches__chevron')
      if (chevron?.getAttribute('aria-expanded') === 'false') {
        const before = canonicalAndHistory()
        await clicked(chevron)
        check(currentPhase, 'groupExpansionIsViewOnly', canonicalAndHistory(), before)
      }
      const field = fields()[0]
      field.focus()
      const range = document.createRange(); range.selectNodeContents(field); range.collapse(false)
      getSelection().removeAllRanges(); getSelection().addRange(range)
      await pause()
    }
    const capture = (phase, files, variant, history, readOnly = false) => {
      currentPhase = phase
      const saved = editor.save(), block = saved.blocks[0]
      check(phase, 'documentLength', saved.blocks.length, 1)
      check(phase, 'blockIdentity', [block.id, block.type], ['subject', 'attaches'])
      check(phase, 'canonicalFiles', legacy ? block.data.files : withoutIds(block.data.files), withoutIds(files))
      if (!legacy) check(phase, 'fileIds', block.data.files.map(file => file.id), files.map(file => file.id))
      check(phase, 'variant', block.data.variant, variant)
      check(phase, 'callerInput', input, supplied)
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'editableNames', fields().map(field => field.contentEditable), files.map(() => String(!readOnly)))
      check(phase, 'editorRows', rows(variant, files.length).map(row => ({
        name: row.querySelector('.oe-attaches__name')?.textContent,
        elements: row.querySelector('.oe-attaches__name')?.childElementCount,
        size: row.querySelector('.oe-attaches__meta,.oe-attaches__row-size,.oe-attaches__pill-size,.oe-attaches__notion-size')?.textContent ?? '',
        extension: row.querySelector('.oe-attaches__ext,.oe-attaches__notion-tag')?.textContent ?? '',
      })), files.map(file => ({ name: file.name, elements: 0, size: sizeText(file.size),
        extension: variant === 'f' || variant === 'a' && files.length === 1 ? file.extension.toUpperCase() : '' })))
      if (variant === 'a' && files.length > 1) {
        check(phase, 'groupTotalSize', wrapper().querySelector('.oe-attaches__group-header .oe-attaches__meta')?.textContent ?? '', '1.0MB')
        check(phase, 'groupCount', wrapper().querySelector('.oe-attaches__group-header .oe-attaches__info')?.textContent.includes('3 files'), true)
      }
      if (readOnly) check(phase, 'noEditableControls', [...wrapper().querySelectorAll('button')]
        .filter(button => !button.matches('.oe-attaches__chevron') && !button.hidden && !button.disabled).length, 0)
      renderer.renderTo(saved, output)
      check(phase, 'rendererRows', [...output.querySelectorAll(rowSelector('editor-attaches', variant, files.length))].map(row => {
        const name = row.querySelector('.editor-attaches__name,.editor-attaches__row-name,.editor-attaches__notion-name')
          ?? row.querySelector('span:not([class])')
        const link = row.matches('a') ? row : row.querySelector('a')
        return { name: name?.textContent, elements: name?.childElementCount, href: link?.getAttribute('href'), download: link?.getAttribute('download'),
          size: row.querySelector('.editor-attaches__meta,.editor-attaches__row-size,.editor-attaches__pill-size,.editor-attaches__notion-size')?.textContent ?? '',
          extension: row.querySelector('.editor-attaches__ext,.editor-attaches__notion-tag')?.textContent ?? '' }
      }), files.map(file => ({ name: file.name, elements: 0, href: file.url, download: file.name, size: sizeText(file.size),
        extension: variant === 'f' || variant === 'a' && files.length === 1 ? file.extension.toUpperCase() : '' })))
      if (variant === 'a' && files.length > 1) check(phase, 'rendererGroupTotalSize',
        output.querySelector('.editor-attaches__group-header .editor-attaches__meta > span')?.textContent ?? '', '1.0MB')
      phases.push({ phase, blocks: clone(saved.blocks) }); completedPhases.push(phase)
    }
    capture('load', original, specification.initial, { canUndo: false, canRedo: false })
    currentPhase = 'input'; await focusEnd()
    await native(specification.edgeSpace ? 'key' : 'type', specification.edgeSpace ? 'Space' : 'X'); await pause()
    const renamed = clone(original)
    if (specification.edgeSpace) {
      const actualNativeText = fields()[0].textContent
      // Chromium may encode an edge SPACE as NBSP. Assert its logical value
      // independently, then require exact canonical/DOM equality without trim.
      check('input', 'nativeSpaceMeaning', actualNativeText.replace(/\u00a0/g, ' '), 'Report ')
      check('input', 'exactNativeFilename', editor.save().blocks[0].data.files[0].name, actualNativeText)
      renamed[0].name = actualNativeText
    } else renamed[0].name += 'X'
    capture('input', renamed, specification.initial, { canUndo: true, canRedo: false })
    const action = specification.route === 'reorder' ? 'reorder' : 'variant'
    const changed = action === 'reorder' || specification.initial !== specification.target
    let after = renamed
    currentPhase = action
    if (specification.route === 'reorder') {
      after = [renamed[2], renamed[0], renamed[1]]
      editor.blocks.update('subject', block => ({ data: { ...block.data,
        files: [block.data.files[2], block.data.files[0], block.data.files[1]] } }))
      await pause()
    } else if (specification.route === 'settings') {
      await clicked(holder.querySelector('.oe-toolbar__drag'))
      await clicked([...holder.querySelectorAll('.oe-settings-menu [role^="menuitem"]')]
        .find(button => button.querySelector('.oe-settings-menu__label')?.textContent === labels[specification.target]))
    } else {
      await clicked(wrapper().querySelector('.oe-attaches__dropdown > .oe-attaches__action-btn'))
      await clicked([...wrapper().querySelectorAll('.oe-attaches__tpl-btn')]
        .find(button => button.getAttribute('aria-label') === labels[specification.target]))
    }
    capture(action, after, specification.target, { canUndo: true, canRedo: false })
    if (action === 'reorder') {
      currentPhase = 'reorder-input'; await focusEnd(); await native('type', 'Y'); await pause()
      const movedRenamed = clone(after); movedRenamed[0].name += 'Y'
      capture('reorder-input', movedRenamed, specification.target, { canUndo: true, canRedo: false })
      await focusEnd(); currentPhase = 'undo-reorder-input'; await native('key', 'Control+z'); await pause()
      capture('undo-reorder-input', after, specification.target, { canUndo: true, canRedo: true })
      await focusEnd(); currentPhase = 'redo-reorder-input'; await native('key', 'Control+Shift+z'); await pause()
      capture('redo-reorder-input', movedRenamed, specification.target, { canUndo: true, canRedo: false })
      await focusEnd(); currentPhase = 'restore-reorder'; await native('key', 'Control+z'); await pause()
      capture('restore-reorder', after, specification.target, { canUndo: true, canRedo: true })
    }
    await focusEnd(); currentPhase = changed ? `undo-${action}` : 'undo-input'
    await native('key', 'Control+z'); await pause()
    if (changed) {
      capture(`undo-${action}`, renamed, specification.initial, { canUndo: true, canRedo: true })
      await focusEnd(); currentPhase = 'undo-input'; await native('key', 'Control+z'); await pause()
    }
    capture('undo-input', original, specification.initial, { canUndo: false, canRedo: true })
    await focusEnd(); currentPhase = 'redo-input'; await native('key', 'Control+Shift+z'); await pause()
    capture('redo-input', renamed, specification.initial, { canUndo: true, canRedo: changed })
    if (changed) {
      await focusEnd(); currentPhase = `redo-${action}`; await native('key', 'Control+Shift+z'); await pause()
      capture(`redo-${action}`, after, specification.target, { canUndo: true, canRedo: action === 'reorder' })
    }
    currentPhase = 'read-only'; editor.setReadOnly(true); await settled()
    capture('read-only', after, specification.target, { canUndo: false, canRedo: false }, true)
    currentPhase = 'editable'; editor.setReadOnly(false); await settled()
    capture('editable', after, specification.target, { canUndo: true, canRedo: action === 'reorder' })
    if (specification.edgeSpace) {
      currentPhase = 'blank-input'; await focusEnd()
      const field = fields()[0], range = document.createRange(); range.selectNodeContents(field)
      getSelection().removeAllRanges(); getSelection().addRange(range)
      await native('key', 'Backspace'); await pause()
      check('blank-input', 'canonicalNameFallback', editor.save().blocks[0].data.files[0].name, after[0].name)
      check('blank-input', 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, { canUndo: true, canRedo: false })
      phases.push({ phase: 'blank-input', blocks: clone(editor.save().blocks) }); completedPhases.push('blank-input')
      currentPhase = 'blank-readonly'; editor.setReadOnly(true); await settled()
      capture('blank-readonly', after, specification.target, { canUndo: false, canRedo: false }, true)
      currentPhase = 'blank-editable'; editor.setReadOnly(false); await settled()
      capture('blank-editable', after, specification.target, { canUndo: true, canRedo: false })
    }
    check(currentPhase, 'trustedInput', trusted.filter(event => event.type === 'input').map(event => event.trusted),
      Array(specification.edgeSpace || action === 'reorder' ? 2 : 1).fill(true))
    check('editable', 'trustedControls', trusted.filter(event => event.type === 'click').every(event => event.trusted && event.intendedControl), true)
    return { id: specification.id, observations, phases, completedPhases, trusted, pageErrors, error: null }
  } catch (error) {
    return { id: specification.id, observations, phases, completedPhases, trusted, pageErrors,
      error: { phase: currentPhase, name: error.name, message: error.message, stack: error.stack } }
  } finally {
    renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove()
    removeEventListener('error', captureError); removeEventListener('unhandledrejection', captureError)
  }
}
