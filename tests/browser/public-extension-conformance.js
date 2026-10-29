// This suite accepts only the supported package entries. It is also copied into
// an independent tarball consumer; no core, built-in plugin or test-harness import.
export async function runPublicExtensionConformance({ createEditor, setSanitizedHtml, createEditorRenderer }) {
  const results = []
  const pause = () => new Promise(resolve => setTimeout(resolve, 0))
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  const rejects = operation => { let rejected = false; try { operation() } catch { rejected = true }; check(rejected, 'Expected rejection') }
  const copy = value => structuredClone(value)
  let holders, editors, renderers
  const makeHolder = () => { const holder = document.createElement('section'); document.body.append(holder); holders.push(holder); return holder }
  const create = (extensions, blocks, inlineTools = [], options = {}) => {
    const holder = makeHolder()
    const editor = createEditor({ ...options, holder, defaultBlock: 'external-note', plugins: [extensions.note],
      inlinePlugins: [extensions.badge], inlineTools, injectStyles: false,
      data: { version: '2.0.0', blocks } })
    editors.push(editor)
    return { editor, holder }
  }
  const noteData = (text = 'Alpha{{badge}}Beta') => ({ text, items: [{ id: 'hidden', html: '{{__proto__}}Hidden' }] })
  const block = (id = 'note', text) => ({ id, type: 'external-note', dataVersion: 1, data: noteData(text), inline: Object.fromEntries([
    ['badge', { type: 'external-badge', dataVersion: 1, data: { label: 'Badge' } }],
    ['__proto__', { type: 'external-badge', dataVersion: 1, data: { label: 'Hidden badge' } }],
  ]) })
  const field = holder => holder.querySelector('[data-external-field]')

  function extensions() {
    const blockContexts = [], inlineContexts = [], inlineRuntimes = []
    const flags = { readFailure: null, encodeProbe: null }
    const disposed = { block: 0, inline: 0 }
    const decodeNote = data => {
      if (!data || typeof data.text !== 'string' || !Array.isArray(data.items)) throw new TypeError('Invalid note')
      return { text: data.text, items: data.items.map(item => {
        if (typeof item.id !== 'string' || typeof item.html !== 'string') throw new TypeError('Invalid item')
        return { id: item.id, html: item.html }
      }) }
    }
    const noteSchema = {
      currentVersion: 1, createDefault: () => noteData(''),
      decode: input => ({ dataVersion: 1, data: decodeNote(input.data) }),
      encode(data) { flags.encodeProbe?.(); return { dataVersion: 1, data: decodeNote(data) } },
      mapRichText: (data, visit) => ({ text: visit(data.text, 'text'),
        items: data.items.map(item => ({ ...item, html: visit(item.html, `item:${item.id}`) })) }),
    }
    const badgeSchema = {
      currentVersion: 1, createDefault: () => ({ label: '' }),
      decode(input) { if (typeof input.data?.label !== 'string') throw new TypeError('Invalid badge'); return { dataVersion: 1, data: { label: input.data.label } } },
      encode(data) { if (typeof data?.label !== 'string') throw new TypeError('Invalid badge'); return { dataVersion: 1, data: { label: data.label } } },
    }
    const note = { type: 'external-note', icon: '', label: { key: 'note', fallback: 'External note' }, schema: noteSchema,
      capabilities: { formatting: { inlineTools: true }, empty: { isEmpty: data => !data.text } },
      setup(runtime) { return {
        create(initial, context) {
          blockContexts.push(context)
          let data = copy(initial)
          const element = runtime.ownerDocument.createElement('div')
          const text = runtime.ownerDocument.createElement('p')
          text.dataset.externalField = 'text'; element.append(text)
          const paint = () => setSanitizedHtml(text, data.text)
          paint()
          return { element,
            read() { if (flags.readFailure) { const fail = flags.readFailure; flags.readFailure = null; return fail() }; return copy(data) },
            update(next) { data = copy(next); paint() },
            editableFields: () => [{ key: 'text', mode: 'rich-text', element: text }],
            setReadOnly(value) { text.contentEditable = String(!value) },
            destroy() { element.remove() },
          }
        }, destroy() { disposed.block++ },
      } },
    }
    const badge = { type: 'external-badge', icon: '', label: { key: 'badge', fallback: 'External badge' }, schema: badgeSchema,
      setup(runtime) { inlineRuntimes.push(runtime); return {
        create(_id, initial, context) {
          inlineContexts.push(context)
          // Deliberately no host attributes or private DOM knowledge.
          const element = runtime.ownerDocument.createElement('span')
          element.contentEditable = 'false'; element.textContent = initial.label
          return { element, update(next) { element.textContent = next.label }, setReadOnly() {}, destroy() {} }
        }, destroy() { disposed.inline++ },
      } },
    }
    return { note, badge, noteSchema, badgeSchema, blockContexts, inlineContexts, inlineRuntimes, flags, disposed }
  }

  const cases = [
    ['public focus coordinates native acknowledgment, numeric carets and a newer observer decision', () => {
      const fixture = extensions(), { editor, holder } = create(fixture, [block('a', 'Alpha'), block('b', 'Bravo')])
      const [first, second] = holder.querySelectorAll('[data-external-field]')
      const before = editor.save().blocks
      const notices = []
      editor.on('currentBlock:changed', event => {
        notices.push({ id: event.currentId, offset: window.getSelection().anchorOffset })
      })
      equal(editor.blocks.focus('a', { fieldKey: 'text', offset: 2.9 }), true, 'fractional focus')
      equal(window.getSelection().anchorOffset, 2, 'fractional offset truncation')
      equal(editor.blocks.focus('a', { fieldKey: 'text', offset: -4 }), true, 'negative focus')
      equal(window.getSelection().anchorOffset, 0, 'negative offset clamp')
      for (const offset of [NaN, Infinity, -Infinity]) {
        equal(editor.blocks.focus('b', { fieldKey: 'text', offset }), false, 'nonfinite focus')
        check(document.activeElement === first, 'rejected numeric focus moved the active field')
      }
      equal(editor.blocks.focus('b', { fieldKey: 'text', offset: 100 }), true, 'large finite focus')
      check(document.activeElement === second, 'destination focus owner')
      equal(notices, [{ id: 'b', offset: 5 }], 'current notification preceded caret placement')
      editor.blocks.focus('a', { fieldKey: 'text', offset: 1 })
      const stop = editor.on('currentBlock:changed', event => {
        if (event.currentId === 'b') editor.blocks.focus('a', { fieldKey: 'text', offset: 3 })
      })
      equal(editor.blocks.focus('b', { fieldKey: 'text', offset: 2 }), true, 'accepted focus was retroactively rejected')
      equal(editor.blocks.currentId, 'a', 'newer observer decision was lost')
      equal(window.getSelection().anchorOffset, 3, 'older focus stole the newer caret')
      stop()
      equal(editor.save().blocks, before, 'focus changed author data')
      equal(editor.canUndo, false, 'focus created history')
    }],
    ['public keyed focus invokes plugin disclosure and re-resolves the resulting live field', () => {
      const fixture = extensions()
      const originalSetup = fixture.note.setup
      let hiddenField, disclosures = 0
      fixture.note.setup = runtime => {
        const blockRuntime = originalSetup(runtime)
        const originalCreate = blockRuntime.create
        return { ...blockRuntime, create(initial, context) {
          const instance = originalCreate(initial, context)
          const originalFields = instance.editableFields
          hiddenField = runtime.ownerDocument.createElement('p')
          setSanitizedHtml(hiddenField, initial.items[0].html)
          hiddenField.contentEditable = 'true'
          let revealed = false
          return { ...instance,
            focus(target) {
              if (target?.fieldKey === 'item:hidden') {
                disclosures++
                if (!revealed) instance.element.append(hiddenField)
                revealed = true
                hiddenField.focus()
              } else originalFields()[0].element.focus()
            },
            editableFields() { return [...originalFields(), ...(revealed
              ? [{ key: 'item:hidden', mode: 'rich-text', element: hiddenField }] : [])] },
          }
        } }
      }
      const record = block('note', 'Alpha')
      record.data.items[0].html = 'Hidden'
      const { editor } = create(fixture, [record])
      equal(hiddenField.isConnected, false, 'hidden field started mounted')
      equal(editor.blocks.focus('note', { fieldKey: 'item:hidden', offset: 2 }), true, 'disclosed field focus')
      equal(disclosures, 1, 'optional plugin disclosure was skipped or repeated')
      check(document.activeElement === hiddenField, 'wrong disclosed owner')
      check(window.getSelection().anchorNode === hiddenField.firstChild, 'wrong disclosed text node')
      equal(window.getSelection().anchorOffset, 2, 'wrong disclosed offset')
      equal(editor.canUndo, false, 'presentation disclosure authored history')
    }],
    ['native focus to another owner supersedes public focus without restoring over the new owner', () => {
      const fixture = extensions(), { editor, holder } = create(fixture, [block('a', 'Alpha'), block('b', 'Bravo')])
      editor.blocks.focus('a', { fieldKey: 'text', offset: 2 })
      const outside = document.createElement('input')
      makeHolder().append(outside)
      const second = holder.querySelectorAll('[data-external-field]')[1]
      second.addEventListener('focus', () => outside.focus(), { once: true })
      equal(editor.blocks.focus('b', { fieldKey: 'text', offset: 3 }), false, 'foreign native focus did not supersede')
      check(document.activeElement === outside, 'failed request restored over foreign focus')
      equal(editor.blocks.currentId, 'a', 'failed destination became current')
    }],
    ['public historyMaxBytes retains the newest whole action without a default cap', () => {
      for (const [options, remaining] of [[{}, true], [{ historyMaxBytes: undefined }, true], [{ historyMaxBytes: 1 }, false]]) {
        const fixture = extensions(), { editor, holder } = create(fixture, [block('note', 'Initial')], [], options)
        editor.blocks.update('note', current => ({ data: { ...current.data, text: 'First' } }))
        const first = editor.save().blocks
        editor.blocks.update('note', current => ({ data: { ...current.data, text: 'Second 🦎'.repeat(20) } }))
        const second = editor.save().blocks
        equal(editor.undo(), true, 'newest oversized action must remain undoable')
        equal(editor.save().blocks, first, 'Undo preserved the complete prior record')
        equal(field(holder).textContent, 'First', 'Undo projected accepted text')
        equal(editor.canUndo, remaining, 'configured byte budget did not reach the history owner')
        equal(editor.redo(), true, 'Redo must not prune the oversized action')
        equal(editor.save().blocks, second, 'Redo preserved complete author data')
        equal(editor.undo(), true, 'repeat Undo')
        equal(editor.canUndo, remaining, 'replay changed retained action count')
      }
    }],
    ['external partial projection preserves hidden data and own inline dictionary keys', async () => {
      const fixture = extensions(), { editor, holder } = create(fixture, [block()])
      const before = editor.save().blocks
      const widget = field(holder).querySelector('span')
      equal([widget.dataset.inlinePlugin, widget.dataset.id], ['external-badge', 'badge'], 'host widget identity')
      equal(Object.keys(fixture.inlineContexts[0]).sort(), ['id','blockId','fieldKey','signal','getData','updateData','commitDomMutation','beginTask','isReadOnly'].sort(), 'scoped context surface')
      fixture.blockContexts[0].commitDomMutation(() => { field(holder).firstChild.textContent = 'Authored' })
      const next = editor.save().blocks[0]
      equal(next.data.text, 'Authored{{badge}}Beta', 'canonical projected text')
      equal(next.data.items, before[0].data.items, 'hidden author fields')
      check(Object.hasOwn(next.inline, '__proto__'), 'hidden own dictionary key lost')
      equal(editor.undo(), true, 'single Undo')
      equal(editor.save().blocks, before, 'complete rollback')
      equal(editor.canUndo, false, 'one action history')
      editor.blocks.focus('note', { fieldKey: 'text', offset: 6 })
      const selection = window.getSelection(), parent = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement
      check(!parent.closest('[data-inline-plugin]'), 'public focus entered the atomic widget label')
      editor.blocks.update('note', current => ({ data: { ...current.data,
        items: [{ id: 'new', html: 'New hidden field' }, ...current.data.items] } }))
      fixture.blockContexts[0].commitDomMutation(() => { field(holder).firstChild.textContent = 'Changed' })
      equal(editor.save().blocks[0].data.items.map(item => item.id), ['new', 'hidden'], 'dynamic hidden membership/order')
      editor.blocks.update('note', current => ({ data: { ...current.data, items: current.data.items.slice(0, 1) } }))
      check(!Object.hasOwn(editor.save().blocks[0].inline, '__proto__'), 'removed hidden field retained its old reference')
      await pause()
    }],
    ['reusable external definitions keep editor scopes and popup close handles independent', () => {
      const fixture = extensions(), first = create(fixture, [block('one')]), second = create(fixture, [block('two')])
      const scope = fixture.inlineContexts[0], survivor = fixture.inlineContexts[1]
      const firstWidget = field(first.holder).querySelector('span'), secondWidget = field(second.holder).querySelector('span')
      const oldContent = document.createElement('div'), newContent = document.createElement('div')
      const old = fixture.inlineRuntimes[1].showPopup(secondWidget, oldContent)
      const current = fixture.inlineRuntimes[1].showPopup(secondWidget, newContent)
      check(Object.isFrozen(old) && Object.isFrozen(current), 'popup close handles are mutable')
      old.close(); check(newContent.isConnected, 'stale popup handle closed its successor')
      let producers = 0
      first.editor.destroy()
      check(scope.signal.aborted && !survivor.signal.aborted, 'editor lifetime leaked across definitions')
      scope.updateData(() => { producers++; return { label: 'Denied' } })
      equal(producers, 0, 'retired scope invoked producer')
      const task = survivor.beginTask()
      second.editor.setReadOnly(true)
      survivor.updateData(() => { producers++; return { label: 'Denied' } })
      equal(producers, 0, 'read-only scope invoked producer')
      second.editor.setReadOnly(false)
      check(task.signal.aborted, 'read-only round trip retained task authority')
      equal(task.commit(() => { producers++; return { label: 'Denied task' } }), false, 'revoked task committed')
      equal(producers, 0, 'revoked task invoked its producer')
      survivor.updateData(() => ({ label: 'Survivor' }))
      equal(second.editor.save().blocks[0].inline.badge.data, { label: 'Survivor' }, 'surviving editor update')
      current.close(); check(!newContent.isConnected, 'active popup handle did not close')
      check(!firstWidget.isConnected, 'destroyed widget remains mounted')
      second.editor.destroy()
      equal(fixture.disposed, { block: 2, inline: 2 }, 'per-editor runtime release')
    }],
    ['external widget DOM mutation removes one occurrence atomically and retires its old scope', () => {
      const fixture = extensions(), { editor, holder } = create(fixture, [block()])
      const before = editor.save().blocks
      const context = fixture.inlineContexts[0], widget = field(holder).querySelector('span')
      context.commitDomMutation(() => widget.remove())
      const next = editor.save().blocks[0]
      equal(next.data.text, 'AlphaBeta', 'removed occurrence text')
      check(!Object.hasOwn(next.inline, 'badge') && Object.hasOwn(next.inline, '__proto__'), 'removal changed an unrelated hidden payload')
      equal(editor.undo(), true, 'widget removal Undo')
      equal(editor.save().blocks, before, 'complete rollback')
      equal(editor.canUndo, false, 'widget removal history count')
      let denied = 0
      context.updateData(() => { denied++; return { label: 'Old occurrence' } })
      equal(denied, 0, 'removed occurrence regained authority after Undo')
      fixture.inlineContexts.at(-1).updateData(() => ({ label: 'Restored occurrence' }))
      equal(editor.save().blocks[0].inline.badge.data.label, 'Restored occurrence', 'restored occurrence has no current scope')
    }],
    ['external schema preparation rejects producer and control reentry without poisoning valid commands', () => {
      const fixture = extensions(), { editor } = create(fixture, [block()])
      let producers = 0
      fixture.flags.encodeProbe = () => {
        rejects(() => editor.blocks.update('note', () => { producers++; return {} }))
        rejects(() => editor.setReadOnly(true))
      }
      editor.blocks.update('note', () => ({ data: noteData('Valid') }))
      equal(producers, 0, 'nested producer during schema preparation')
      equal(editor.readOnly, false, 'control reentry changed read-only')
      equal(editor.save().blocks[0].data.text, 'Valid', 'valid outer command')
      fixture.flags.encodeProbe = null
      editor.undo(); equal(editor.canUndo, false, 'outer history')
    }],
    ['external Promise, callable thenable and throwing-then reads reject atomically and recover', () => {
      for (const fail of [
        () => Promise.resolve({}),
        () => Object.assign(function result() {}, { then(_resolve, reject) { reject(new Error('Callable thenable rejected')) } }),
        () => Object.defineProperty({}, 'then', { get() { throw new Error('Throwing then getter') } }),
      ]) {
        const fixture = extensions(), { editor } = create(fixture, [block()])
        const before = editor.save().blocks
        fixture.flags.readFailure = fail
        rejects(() => fixture.blockContexts[0].commitDomMutation(() => {}))
        equal(editor.save().blocks, before, 'invalid read changed canonical data')
        equal(editor.canUndo, false, 'failed read created history')
        editor.blocks.update('note', () => ({ data: noteData('After recovery') }))
        equal(editor.save().blocks[0].data.text, 'After recovery', 'scope did not recover')
      }
    }],
    ['external formatting tokens authorize one mount and retire after history or destruction', async () => {
      const fixture = extensions()
      let port, mutations, token, cleanup = 0, denied = 0
      const tool = { type: 'external-format', icon: '', title: 'External format', isActive: () => false, toggle() {},
        bindSelectionPort(value) { if (value) port = value },
        onMount(_button, context) { mutations = context }, destroy() { cleanup++ },
      }
      const { editor, holder } = create(fixture, [block('note', 'Alpha Beta')], [tool])
      const text = field(holder).firstChild
      field(holder).focus(); window.getSelection().setBaseAndExtent(text, 0, text, 5)
      document.dispatchEvent(new Event('selectionchange')); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      await pause()
      token = port.capture()
      check(token && Object.isFrozen(token) && Object.keys(token).length === 0, 'missing opaque token')
      equal(port.restore({ ...token }), false, 'forged token restored selection')
      mutations.mutate(token, range => {
        const strong = document.createElement('strong'); strong.append(range.extractContents()); range.insertNode(strong)
        check(port.restore(token), 'own synchronous restoration failed')
      })
      check(editor.save().blocks[0].data.text.includes('<b>Alpha</b>'), 'external formatter did not persist canonical bold text')
      equal(editor.undo(), true, 'formatter Undo')
      equal(port.restore(token), false, 'history-stale token restored')
      equal(mutations.mutate(token, () => { denied++ }), undefined, 'history-stale token invoked mutation')
      editor.destroy()
      equal(port.restore(token), false, 'destroyed port restored')
      rejects(() => mutations.mutate(token, () => { denied++ }))
      equal(denied, 0, 'stale formatter ran')
      equal(cleanup, 1, 'formatter cleanup')
    }],
    ['failed external tool acquisition cleans up and permits later reuse', () => {
      const fixture = extensions()
      let fail = true, cleanups = 0
      const tool = { type: 'external-failing', icon: '', isActive: () => false, toggle() {},
        onMount() { if (fail) return Promise.resolve() }, destroy() { cleanups++ },
      }
      rejects(() => create(fixture, [block()], [tool]))
      equal(cleanups, 1, 'failed acquisition cleanup')
      fail = false
      const { editor } = create(fixture, [block()], [tool])
      editor.destroy(); equal(cleanups, 2, 'released tool could not be reused')
    }],
    ['external block and inline renderers consume the complete saved public document', () => {
      const fixture = extensions(), { editor } = create(fixture, [block()])
      const renderer = createEditorRenderer({ blockTypes: [], injectStyles: false, ownerDocument: document,
        inlineRenderers: [{ type: 'external-badge', schema: fixture.badgeSchema,
          render(_id, data, context) { const span = context.ownerDocument.createElement('span'); span.textContent = data.label; return span },
        }],
      })
      renderers.push(renderer)
      renderer.registerRenderer({ type: 'external-note', schema: fixture.noteSchema,
        render(record, parseInline, context) {
          const element = context.ownerDocument.createElement('article')
          element.append(parseInline(record.data.text))
          for (const item of record.data.items) element.append(parseInline(item.html))
          return element
        },
      })
      const target = makeHolder()
      renderer.renderTo(editor.save(), target)
      equal(target.textContent, 'AlphaBadgeBetaHidden badgeHidden', 'paired renderer content')
      const before = target.innerHTML
      const invalid = editor.save(); invalid.blocks[0].dataVersion = 99
      rejects(() => renderer.renderTo(invalid, target))
      equal(target.innerHTML, before, 'renderer replaced valid output after invalid input')
    }],
  ]

  for (const [name, operation] of cases) {
    holders = []; editors = []; renderers = []
    const failures = []
    const capture = event => { failures.push(String(event.error?.stack ?? event.reason ?? event.message)); event.preventDefault() }
    window.addEventListener('error', capture); window.addEventListener('unhandledrejection', capture)
    try { await operation() } catch (error) { failures.push(error.stack ?? String(error)) }
    for (const editor of editors) { try { editor.destroy() } catch (error) { failures.push(String(error)) } }
    for (const renderer of renderers) { try { renderer.destroy() } catch (error) { failures.push(String(error)) } }
    for (const holder of holders) holder.remove()
    await pause()
    window.removeEventListener('error', capture); window.removeEventListener('unhandledrejection', capture)
    results.push(failures.length ? { name, status: 'FAIL', error: failures.join('\n') } : { name, status: 'PASS' })
  }
  return results
}
