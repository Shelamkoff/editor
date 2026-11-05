const richCell = '<b>Alpha</b> {{tone}}<br>tail'
const normalGrid = [[richCell, '<i>Bravo</i>'], ['<s>Charlie</s>', 'Delta']]
const pastedGrid = [['<b>Q</b>', '<i>R</i>'], ['S', 'T']]
const conversionRanges = { middle: [2, 4], widget: [6, 7], cell: [0, 12], emptyNeighbors: [0, 12], all: [0, 5] }

export const tableTransferCases = ['paste', ...Object.keys(conversionRanges)].flatMap(kind =>
  [false, true].flatMap(headings => [false, true].map(backward => ({
    id: kind === 'paste' ? `paste/${headings}/${backward}` : `convert/${kind}/${headings}/${backward}`,
    kind, headings, backward,
  }))))

const copy = structuredClone
const pause = () => new Promise(resolve => setTimeout(resolve, 80))

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]))
}

function rowRecords(grid) {
  return grid.map((row, index) => ({
    id: `row-${index}`,
    cells: row.map((text, column) => ({ id: `cell-${column}`, text })),
  }))
}

function atomic(node) {
  return node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')
}

function logicalLength(node) {
  if (node.nodeType === 3) return node.data.length
  if (atomic(node)) return node.hasAttribute('data-oe-caret-padding') ? 0 : 1
  return [...node.childNodes].reduce((length, child) => length + logicalLength(child), 0)
}

function pointAt(node, offset) {
  const children = [...node.childNodes]
  for (const [index, child] of children.entries()) {
    const length = logicalLength(child)
    if (offset <= length) {
      if (child.nodeType === 3) return [child, offset]
      if (atomic(child)) return [node, index + (offset ? 1 : 0)]
      return pointAt(child, offset)
    }
    offset -= length
  }
  return [node, children.length]
}

function makeClipboardSource(headings) {
  const source = document.createElement('div')
  source.contentEditable = 'true'
  const table = source.appendChild(document.createElement('table'))
  for (let row = 0; row < 2; row++) {
    const tr = table.appendChild(document.createElement('tr'))
    for (let column = 0; column < 2; column++) {
      const cell = tr.appendChild(document.createElement(headings && row === 0 ? 'th' : 'td'))
      const label = row === 0 ? cell.appendChild(document.createElement(column ? 'i' : 'b')) : cell
      label.textContent = 'QRST'[row * 2 + column]
    }
  }
  return source
}

export async function runTableTransferCase({ sourceBase = '../../', legacy = false, spec, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const paths = ['core/index.js', 'plugins/paragraph/index.js', 'plugins/table/index.js', 'inline-plugins/color.js']
  const [core, paragraph, table, color] = await Promise.all(paths.map(path => import(new URL(path, base))))
  const isPaste = spec.kind === 'paste'
  const grid = spec.kind === 'emptyNeighbors' ? [[richCell, ''], ['', '']] : normalGrid
  const sidecars = { tone: { type: 'color', ...(!legacy && { dataVersion: 1 }), data: { value: '#123456' } } }
  const record = (id, type, data, inline) => ({
    id, type, ...(!legacy && { dataVersion: 2 }), data, ...(inline && { inline: copy(inline) }),
  })
  const paragraphRecord = (id, text, inline) => record(id, 'paragraph', { text }, inline)
  const tableRecord = (id, values, inline) => record(id, 'table', {
    withHeadings: spec.headings,
    ...(legacy ? { content: copy(values) } : { rows: rowRecords(values) }),
  }, inline)
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [
    ...(isPaste ? [paragraphRecord('seed', 'abcDEFghi')]
      : [paragraphRecord('prefix', 'Before'), tableRecord('seed', grid, sidecars)]),
    paragraphRecord('suffix', 'After'),
  ] }
  const caller = copy(input)
  const holder = document.createElement('section')
  holder.style.cssText = 'width:850px;margin:100px auto'
  const source = isPaste ? makeClipboardSource(spec.headings) : document.createElement('div')
  document.body.append(holder, source)

  const observations = [], nativeEvents = [], transactions = [], diagnostics = []
  const unsupported = legacy ? [{ property: 'currentObservers', reason: 'Legacy current transaction and diagnostic observers are absent.' }] : []
  const planned = ['load', 'select'], completedPhases = []
  let phase = 'load', error = null, targetId = null, clipboard = null, available = null, rawAfter = null, editor

  function check(property, actual, expected) {
    const matches = JSON.stringify(ordered(actual)) === JSON.stringify(ordered(expected))
    observations.push({ phase, property, actual: copy(actual), expected: copy(expected), status: matches ? 'PASS' : 'FAIL' })
  }
  const state = () => editor.save().blocks
  const history = (undo, redo) => check('history', [editor.canUndo, editor.canRedo], [undo, redo])
  function select(first, from, last, to) {
    first.focus()
    const start = pointAt(first, from), end = pointAt(last, to)
    getSelection().setBaseAndExtent(...(spec.backward ? [...end, ...start] : [...start, ...end]))
  }
  async function key(letter, role, modifiers = 2) {
    document.addEventListener('keydown', event => nativeEvents.push({
      role, type: 'keydown', key: event.key, trusted: event.isTrusted,
      modifiers: (event.ctrlKey ? 2 : 0) | (event.shiftKey ? 8 : 0),
    }), { capture: true, once: true })
    const capital = letter.toUpperCase()
    for (const type of ['rawKeyDown', 'keyUp']) {
      await nativeInput('Input.dispatchKeyEvent', { type, key: letter, code: 'Key' + capital, windowsVirtualKeyCode: capital.charCodeAt(0), modifiers })
    }
    await pause()
  }
  async function click(selector, role) {
    const control = holder.querySelector(selector)
    if (!control?.getClientRects().length) throw Error('Missing ' + selector)
    control.scrollIntoView({ block: 'nearest' })
    await pause()
    const bounds = control.getBoundingClientRect()
    document.addEventListener('mousedown', event => nativeEvents.push({ role, type: 'mousedown', trusted: event.isTrusted }), { capture: true, once: true })
    await nativeInput('Input.click', { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    await pause()
  }
  function normalize(blocks) {
    return copy(blocks).map(block => {
      if (block.id === targetId) block.id = 'converted'
      if (block.type === 'table' && !legacy && isPaste) {
        block.data.rows = rowRecords(block.data.rows.map(row => row.cells.map(cell => cell.text)))
      }
      // Widget-only extraction can leave a visually inert empty bold tag.
      // Its exact source and replay remain in rawAfter and the redo record.
      if (spec.kind === 'widget') {
        const meaning = text => text.replaceAll('<b></b>', '')
        if (block.type === 'paragraph') block.data.text = meaning(block.data.text)
        if (block.type === 'table') {
          if (legacy) block.data.content = block.data.content.map(row => row.map(meaning))
          else for (const row of block.data.rows) for (const cell of row.cells) cell.text = meaning(cell.text)
        }
      }
      return block
    })
  }

  try {
    editor = core.createEditor({
      holder, data: input, injectStyles: true,
      plugins: legacy ? [new paragraph.Paragraph(), new table.Table()] : [paragraph.createParagraphPlugin(), table.createTablePlugin()],
      inlinePlugins: [color.createColorSwatchPlugin()], inlineTools: [],
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    if (!legacy) editor.on('transaction:committed', ({ action, origin, name }) => transactions.push({ action, origin, name }))
    await nativeInput('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    await pause()
    const initial = state()
    check('canonical', initial, input.blocks)
    history(false, false)
    completedPhases.push(phase)

    phase = 'select'
    if (isPaste) {
      source.focus()
      const copied = document.createRange()
      copied.selectNode(source.firstChild)
      getSelection().removeAllRanges()
      getSelection().addRange(copied)
      source.addEventListener('copy', event => nativeEvents.push({ role: 'external-copy', type: 'copy', trusted: event.isTrusted }), { once: true })
      await key('c', 'copy-key')
      const field = holder.querySelector('[data-block-id="seed"] .oe-paragraph')
      select(field, 3, field, 6)
      check('sourceUnchanged', source.textContent, 'QRST')
    } else {
      const [start, end] = conversionRanges[spec.kind]
      const cells = [...holder.querySelector('.oe-table').rows].flatMap(row => [...row.cells])
      select(cells[0], start, spec.kind === 'all' ? cells[3] : cells[0], end)
    }
    await pause()
    check('canonical', state(), initial)
    history(false, false)
    completedPhases.push(phase)

    if (isPaste) {
      planned.push('paste', 'undo', 'redo', 'dispose')
      phase = 'paste'
      holder.addEventListener('paste', event => {
        clipboard = {
          trusted: event.isTrusted,
          tableHTML: /<table\b/i.test(event.clipboardData.getData('text/html')),
          private: Boolean(event.clipboardData.getData('application/x-rector-fragment')),
        }
        nativeEvents.push({ role: 'paste', type: 'paste', trusted: event.isTrusted })
      }, { capture: true, once: true })
      await key('v', 'paste-key')
      check('clipboard', clipboard, { trusted: true, tableHTML: true, private: false })
      rawAfter = state()
      const added = rawAfter.find(block => block.type === 'table')
      targetId = added?.id ?? null
      check('canonical', normalize(rawAfter), [initial[0], tableRecord('converted', pastedGrid), initial[1]])
      check('targetIdentity', typeof targetId === 'string' && !initial.some(block => block.id === targetId), true)
      if (!legacy) {
        const unique = entries => entries.every(entry => typeof entry.id === 'string' && entry.id.length) && new Set(entries.map(entry => entry.id)).size === entries.length
        check('pastedFieldIdentities', Boolean(added && unique(added.data.rows) && added.data.rows.every(row => unique(row.cells))), true)
      }
      history(true, false)
      completedPhases.push(phase)
    } else {
      available = Boolean(holder.querySelector('.oe-inline-toolbar__type-select')?.getClientRects().length)
      if (legacy && !available) {
        planned.push('availability', 'dispose')
        phase = 'availability'
        unsupported.push({ property: 'selectionConversionUI', reason: 'The actual old chooser is absent. Its conversion and Undo/Redo bodies are unexecuted.' })
        check('chooserAvailable', available, false)
        check('canonical', state(), initial)
        history(false, false)
        completedPhases.push(phase)
      } else {
        planned.push('convert', 'undo', 'redo', 'dispose')
        phase = 'convert'
        await click('.oe-inline-toolbar__type-select', 'type-open')
        await click('.oe-inline-toolbar__type-dropdown [data-plugin-type="paragraph"]', 'type-choose')
        rawAfter = state()
        targetId = rawAfter.find(block => block.type === 'paragraph' && !['prefix', 'suffix'].includes(block.id))?.id ?? null
        const remaining = copy(grid)
        const selectsAll = spec.kind === 'all', selectsText = spec.kind === 'middle'
        const selected = {
          middle: '<b>ph</b>', widget: '{{tone}}', cell: richCell, emptyNeighbors: richCell,
          all: `${richCell}<br><i>Bravo</i><br><s>Charlie</s><br>Delta`,
        }[spec.kind]
        remaining[0][0] = { middle: '<b>Ala</b> {{tone}}<br>tail', widget: '<b>Alpha</b> <br>tail' }[spec.kind] ?? ''
        const expected = [initial[0]]
        if (!selectsAll) expected.push(tableRecord('seed', remaining, selectsText ? sidecars : null))
        expected.push(paragraphRecord('converted', selected, selectsText ? null : sidecars), initial[2])
        check('canonical', normalize(rawAfter), expected)
        check('targetIdentity', {
          exists: typeof targetId === 'string', reuse: targetId === 'seed', unique: new Set(rawAfter.map(block => block.id)).size === rawAfter.length,
        }, { exists: true, reuse: selectsAll, unique: true })
        history(true, false)
        completedPhases.push(phase)
      }
    }

    if (planned.includes('undo')) {
      phase = 'undo'
      await key('z', 'undo')
      check('canonical', state(), initial)
      history(false, true)
      completedPhases.push(phase)
      phase = 'redo'
      await key('z', 'redo', 10)
      check('canonical', state(), rawAfter)
      history(true, false)
      check('caller', input, caller)
      check('diagnostics', diagnostics, [])
      completedPhases.push(phase)
    }

    phase = 'dispose'
    editor.destroy()
    check('editorRemoved', !holder.querySelector('.oe-editor'), true)
    check('caller', input, caller)
    completedPhases.push(phase)
  } catch (exception) {
    error = String(exception.stack ?? exception)
  } finally {
    editor?.destroy()
    holder.remove()
    source.remove()
  }
  return { id: spec.id, spec, observations, nativeEvents, transactions, diagnostics, unsupported, planned, completedPhases, error, targetId, clipboard, available, rawAfter }
}
