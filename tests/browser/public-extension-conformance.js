// This suite accepts only the supported package entries. It is also copied into
// an independent tarball consumer; no core, built-in plugin or test-harness import.
export async function runPublicExtensionConformance({ createEditor, setSanitizedHtml, EditorRenderer }) {
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
      class ArticleRenderer extends EditorRenderer {
        renderCount = 0
        renderTo(data, target) {
          const output = super.renderTo(data, target)
          this.renderCount++
          return output
        }
      }
      const renderer = new ArticleRenderer({ blockTypes: [], injectStyles: false, ownerDocument: document,
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
      check(renderer instanceof EditorRenderer, 'public renderer subclass lost its base')
      equal(renderer.renderCount, 1, 'public renderer override did not run')
      equal(target.textContent, 'AlphaBadgeBetaHidden badgeHidden', 'paired renderer content')
      const before = target.innerHTML
      const invalid = editor.save(); invalid.blocks[0].dataVersion = 99
      rejects(() => renderer.renderTo(invalid, target))
      equal(target.innerHTML, before, 'renderer replaced valid output after invalid input')
      equal(renderer.renderCount, 1, 'failed super call was accepted by the override')
      renderer.destroy(target)
      equal(target.childNodes.length, 0, 'renderer disposal left its output mounted')
      renderer.renderTo(editor.save(), target)
      equal(renderer.renderCount, 2, 'renderer subclass could not be reused after disposal')
      equal(target.textContent, 'AlphaBadgeBetaHidden badgeHidden', 'reused subclass output')
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
  return [...results, ...await runRendererOutputConformance({ EditorRenderer })]
}

// Public-only renderer cases also run against installed package consumers.
// Keep DOM ownership observations here, outside the minimal unit DOM doubles.
export async function runRendererOutputConformance({ EditorRenderer, legacyEnvelope = false }) {
  const results = []
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected),
    message + ': ' + JSON.stringify({ actual, expected }))
  const schema = {
    currentVersion: 1, createDefault: () => ({ text: '' }),
    decode({ dataVersion, data }) {
      if (dataVersion !== 1 || typeof data?.text !== 'string') throw new TypeError('Invalid output fixture')
      return { dataVersion: 1, data }
    },
    encode(data) { return { dataVersion: 1, data } },
  }
  // The differential runner adapts only the public wire envelope and schema.
  const definition = value => ({ ...value, ...(!legacyEnvelope ? { schema } : {}) })
  const block = (id, type = 'owned-note', value = { text: 'Owned author text' }) => ({ id, type, ...(!legacyEnvelope ? { dataVersion: 1 } : {}), data: value })
  const data = blocks => ({ ...(!legacyEnvelope ? { version: '2.0.0' } : {}), blocks })
  const cases = []
  for (const revisionKind of ['string', 'number']) {
    cases.push([`renderer revisions: ${revisionKind} revisions skip deep reads and isolate a changed block`, context => {
      const renderer = context.renderer(), target = context.holder(), rendered = [], disposed = [], reads = []
      renderer.registerRenderer(definition({ type: 'owned-note',
        render(record) { rendered.push(record.id); const element = document.createElement('article'); element.textContent = record.data.text; return element },
        destroy(element) { disposed.push(element.dataset.blockId) },
      }))
      const initial = data(['a', 'b'].map(id => ({ ...block(id, 'owned-note', { text: id === 'a' ? 'Alpha' : 'Bravo' }),
        revision: revisionKind === 'string' ? id + ':r1' : 1,
        tunes: { textAlign: 'left' }, inline: { badge: { type: 'future-inline', dataVersion: 1, data: { label: 'Badge' } } },
      })))
      renderer.renderTo(initial, target)
      const wrapper = target.firstChild, first = wrapper.firstChild, second = wrapper.lastChild
      const watched = (name, value) => new Proxy(value, {
        get(object, key, receiver) { reads.push(name + ':get:' + String(key)); return Reflect.get(object, key, receiver) },
        ownKeys(object) { reads.push(name + ':ownKeys'); return Reflect.ownKeys(object) },
        getOwnPropertyDescriptor(object, key) { reads.push(name + ':descriptor:' + String(key)); return Reflect.getOwnPropertyDescriptor(object, key) },
      })
      const opaque = data(initial.blocks.map(record => ({ ...record,
        data: watched(record.id + '.data', { text: 'A stale producer revision must not traverse this replacement' }),
        tunes: watched(record.id + '.tunes', record.tunes), inline: watched(record.id + '.inline', record.inline),
      })))
      renderer.renderTo(opaque, target)
      context.observe({ phase: 'same revision', reads: [...reads], rendered: [...rendered], disposed: [...disposed],
        sameWrapper: target.firstChild === wrapper, sameBlocks: wrapper.firstChild === first && wrapper.lastChild === second })
      equal(reads, [], 'Unchanged producer revision traversed author payload')
      equal(rendered, ['a', 'b'], 'Unchanged producer revision rendered a block')
      equal(disposed, [], 'Unchanged producer revision disposed a block')
      check(target.firstChild === wrapper && wrapper.firstChild === first && wrapper.lastChild === second, 'Unchanged producer revision replaced output DOM')
      equal([first.textContent, second.textContent], ['Alpha', 'Bravo'], 'Opaque same-revision data changed mounted output')
      const changed = data([opaque.blocks[0], { ...initial.blocks[1], revision: revisionKind === 'string' ? 'b:r2' : 2, data: { text: 'Bravo changed' } }])
      renderer.renderTo(changed, target)
      context.observe({ phase: 'changed revision', reads: [...reads], rendered: [...rendered], disposed: [...disposed],
        firstPreserved: wrapper.firstChild === first, secondReplaced: wrapper.lastChild !== second, text: wrapper.textContent })
      equal(reads, [], 'Changing one revision traversed the unchanged neighbor payload')
      equal(rendered, ['a', 'b', 'b'], 'Changed revision repainted the wrong occurrences')
      equal(disposed, ['b'], 'Changed revision disposed an unrelated occurrence')
      check(target.firstChild === wrapper && wrapper.firstChild === first && wrapper.lastChild !== second, 'Changed revision failed to isolate output replacement')
      equal([first.textContent, wrapper.lastChild.textContent], ['Alpha', 'Bravo changed'], 'Changed revision did not update authored output')
    }])
  }
  cases.push(['renderer revisions: unchanged live output retains focus and custom-element connection state', context => {
    if (!customElements.get('rector-output-state-probe')) customElements.define('rector-output-state-probe', class extends HTMLElement {
      connectedCount = 0
      disconnectedCount = 0
      connectedCallback() { this.connectedCount++ }
      disconnectedCallback() { this.disconnectedCount++ }
    })
    const renderer = context.renderer(), target = context.holder(), disposed = []
    renderer.registerRenderer(definition({ type: 'owned-note',
      render(record) { const element = document.createElement('rector-output-state-probe'); const input = document.createElement('input'); input.value = record.data.text; element.append(input); return element },
      destroy(element) { disposed.push(element.dataset.blockId) },
    }))
    const initial = data([{ ...block('a'), revision: 1 }, { ...block('b'), revision: 1 }])
    renderer.renderTo(initial, target)
    const wrapper = target.firstChild, first = wrapper.firstChild, second = wrapper.lastChild, input = first.firstChild
    input.focus(); input.setSelectionRange(1, 5, 'backward')
    check(document.activeElement === input, 'Fixture could not focus the live renderer input')
    renderer.renderTo(initial, target)
    const observe = phase => context.observe({ phase, focused: document.activeElement === input,
      selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
      firstLifecycle: [first.connectedCount, first.disconnectedCount], secondLifecycle: [second.connectedCount, second.disconnectedCount] })
    observe('same revision')
    check(wrapper.firstChild === first && wrapper.lastChild === second, 'Unchanged live output replaced a DOM occurrence')
    check(document.activeElement === input, 'Unchanged live output lost author focus')
    equal([input.selectionStart, input.selectionEnd, input.selectionDirection], [1, 5, 'backward'], 'Unchanged live output lost its native input interval')
    equal([first.connectedCount, first.disconnectedCount, second.connectedCount, second.disconnectedCount], [1, 0, 1, 0], 'Unchanged live output reconnected a custom element')
    renderer.renderTo(data([initial.blocks[0], { ...initial.blocks[1], revision: 2, data: { text: 'Changed' } }]), target)
    observe('changed neighbor')
    check(wrapper.firstChild === first && wrapper.lastChild !== second && document.activeElement === input, 'Changed neighbor disturbed live author focus')
    equal([first.connectedCount, first.disconnectedCount, second.connectedCount, second.disconnectedCount], [1, 0, 1, 1], 'Changed neighbor reconnected an unaffected custom element')
    equal(disposed, ['b'], 'Changed neighbor disposed the focused occurrence')
  }])
  cases.push(['renderer revisions: unrevisioned in-place data changes replace only the affected output', context => {
    const renderer = context.renderer(), target = context.holder(), rendered = [], disposed = []
    renderer.registerRenderer(definition({ type: 'owned-note',
      render(record) { rendered.push(record.id); const element = document.createElement('article'); element.textContent = record.data.text + ':' + record.data.nested.count; return element },
      destroy(element) { disposed.push(element.dataset.blockId) },
    }))
    const initial = data(['a', 'b'].map(id => block(id, 'owned-note', { text: id === 'a' ? 'Alpha' : 'Bravo', nested: { count: 1 } })))
    renderer.renderTo(initial, target)
    const wrapper = target.firstChild, first = wrapper.firstChild, second = wrapper.lastChild
    initial.blocks[1].data.text = 'Bravo changed'; initial.blocks[1].data.nested.count = 2
    renderer.renderTo(initial, target)
    context.observe({ rendered: [...rendered], disposed: [...disposed], firstPreserved: wrapper.firstChild === first,
      secondReplaced: wrapper.lastChild !== second, text: [first.textContent, wrapper.lastChild.textContent] })
    equal(rendered, ['a', 'b', 'b'], 'In-place JSON change repainted the wrong occurrences')
    equal(disposed, ['b'], 'In-place JSON change disposed an unrelated occurrence')
    check(wrapper.firstChild === first && wrapper.lastChild !== second, 'In-place JSON mutation was not detected or replaced its neighbor')
    equal([first.textContent, wrapper.lastChild.textContent], ['Alpha:1', 'Bravo changed:2'], 'In-place JSON mutation lost authored data')
  }])
  cases.push(['renderer revisions: JSON object key order preserves output while array order changes it', context => {
    const renderer = context.renderer(), target = context.holder(), disposed = []
    let rendered = 0
    renderer.registerRenderer(definition({ type: 'owned-note',
      render(record) { rendered++; const element = document.createElement('article'); element.textContent = record.data.text + ':' + record.data.items.map(item => item.label).join(','); return element },
      destroy(element) { disposed.push(element.dataset.blockId) },
    }))
    const initial = { ...block('a', 'owned-note', { text: 'Alpha', nested: { left: 'L', right: 'R' }, items: [{ id: 'one', label: 'First' }, { id: 'two', label: 'Second' }] }),
      tunes: { textAlign: 'center', padding: 2 }, inline: { badge: { type: 'future-inline', dataVersion: 1, data: { id: 1, name: 'Ada' } } } }
    const reordered = { ...block('a', 'owned-note', { items: [{ label: 'First', id: 'one' }, { label: 'Second', id: 'two' }], nested: { right: 'R', left: 'L' }, text: 'Alpha' }),
      tunes: { padding: 2, textAlign: 'center' }, inline: { badge: { data: { name: 'Ada', id: 1 }, dataVersion: 1, type: 'future-inline' } } }
    renderer.renderTo(data([initial]), target)
    const wrapper = target.firstChild, first = wrapper.firstChild
    renderer.renderTo(data([reordered]), target)
    context.observe({ phase: 'object key order', rendered, disposed: [...disposed], sameBlock: wrapper.firstChild === first, text: wrapper.textContent })
    check(rendered === 1 && wrapper.firstChild === first && disposed.length === 0, 'Equivalent object key order repainted live output')
    reordered.data.items.reverse()
    renderer.renderTo(data([reordered]), target)
    context.observe({ phase: 'array order', rendered, disposed: [...disposed], blockReplaced: wrapper.firstChild !== first, text: wrapper.textContent })
    check(rendered === 2 && wrapper.firstChild !== first, 'Array reordering did not invalidate output')
    equal(disposed, ['a'], 'Array reordering did not release exactly the replaced output')
    equal(wrapper.textContent, 'Alpha:Second,First', 'Array reordering lost author order')
  }])
  for (const connection of ['connected', 'detached']) {
    for (const method of ['renderBlock', 'render', 'renderTo']) cases.push([`renderer output ownership: ${method} rejects ${connection} application descendants`, context => {
      const renderer = context.renderer(), applicationOwner = context.holder(), target = context.holder()
      const foreign = document.createElement('article'); foreign.className = 'application-note'; foreign.dataset.owner = 'application'
      const input = document.createElement('input'); input.value = 'Application input'; foreign.append(input); applicationOwner.append(foreign)
      const targetOutput = document.createElement('nav'); target.append(targetOutput)
      if (connection === 'detached') applicationOwner.remove()
      else { input.focus(); input.setSelectionRange(2, 6, 'backward') }
      const before = foreign.outerHTML
      let disposed = 0
      renderer.registerRenderer(definition({ type: 'owned-note', render() { return foreign }, destroy() { disposed++ } }))
      let failure
      try {
        if (method === 'renderBlock') renderer.renderBlock(block('borrowed'))
        else if (method === 'render') renderer.render(data([block('borrowed')]))
        else renderer.renderTo(data([block('borrowed')]), target)
      } catch (error) { failure = error }
      context.observe({ method, connection, rejected: failure instanceof TypeError, htmlUnchanged: foreign.outerHTML === before,
        parentUnchanged: foreign.parentNode === applicationOwner, targetUnchanged: target.firstChild === targetOutput,
        focused: document.activeElement === input, disposed })
      check(failure instanceof TypeError, 'Renderer accepted a node belonging to an application subtree')
      check(foreign.parentNode === applicationOwner && applicationOwner.childNodes.length === 1 && foreign.outerHTML === before, 'Rejected renderer decorated or stole application DOM')
      check(target.firstChild === targetOutput && target.childNodes.length === 1 && disposed === 0, 'Rejected renderer changed target DOM or disposed an unacquired node')
      if (connection === 'connected') {
        check(document.activeElement === input, 'Rejected renderer lost application focus')
        equal([input.selectionStart, input.selectionEnd, input.selectionDirection], [2, 6, 'backward'], 'Rejected renderer changed application input selection')
      }
      renderer.registerRenderer(definition({ type: 'owned-note', render() { return document.createElement('article') }, destroy() { disposed++ } }))
      const fresh = renderer.renderBlock(block('fresh'))
      check(fresh !== foreign && fresh.parentNode === null, 'Rejected render did not permit a fresh detached output')
      renderer.destroy(fresh)
      check(disposed === 1 && foreign.parentNode === applicationOwner, 'Fresh output cleanup affected the application owner')
    }])
  }
  for (const replacement of ['application', 'successor renderer']) {
    for (const release of ['target', 'all']) cases.push([`renderer output ownership: destroy ${release} preserves displaced ${replacement} output`, context => {
      const first = context.renderer(), second = context.renderer(), target = context.holder()
      let releasedFirst = 0, releasedSecond = 0
      const render = record => { const element = document.createElement('article'); element.textContent = record.data.text; return element }
      first.registerRenderer(definition({ type: 'owned-note', render, destroy() { releasedFirst++ } }))
      second.registerRenderer(definition({ type: 'owned-note', render, destroy() { releasedSecond++ } }))
      first.renderTo(data([block('first')]), target)
      const original = target.firstChild
      if (replacement === 'application') {
        const application = document.createElement('aside'); application.textContent = 'Application replacement'; target.replaceChildren(application)
      } else second.renderTo(data([block('second', 'owned-note', { text: 'Successor output' })]), target)
      const retained = target.firstChild, before = target.innerHTML
      if (release === 'all') first.destroy()
      else first.destroy(target)
      context.observe({ releasedFirst, releasedSecond, replacementPreserved: target.firstChild === retained && target.innerHTML === before,
        originalDetached: original.parentNode === null })
      check(releasedFirst === 1 && releasedSecond === 0, 'Displaced renderer did not isolate its resource release')
      check(target.firstChild === retained && target.childNodes.length === 1 && target.innerHTML === before, 'Displaced renderer removed replacement application or successor output')
      first.destroy()
      const reused = first.renderBlock(block('again'))
      first.destroy(reused)
      check(releasedFirst === 2 && releasedSecond === 0 && target.firstChild === retained, 'Displaced renderer could not be reused without affecting its successor')
      if (replacement === 'successor renderer') {
        second.destroy(target); second.destroy(target)
        check(releasedSecond === 1 && target.childNodes.length === 0, 'Successor did not retain exclusive disposal ownership')
      }
    }])
  }
  for (const origin of ['render', 'displaced renderTo', 'unknown renderBlock', 'registered renderBlock']) {
    for (const release of ['target', 'all']) cases.push([`renderer output ownership: ${origin}, destroy ${release}, then reuse`, context => {
      const first = context.renderer({ throwOnUnknown: false })
      const second = context.renderer()
      const target = context.holder()
      const application = document.createElement('aside')
      application.textContent = 'Application output'
      target.append(application)
      let releasedFirst = 0, releasedSecond = 0
      first.registerRenderer(definition({ type: 'owned-note',
        render(record) { const element = document.createElement('article'); element.textContent = record.data.text; return element },
        destroy() { releasedFirst++ },
      }))
      let owned, originalTarget, replacement
      if (origin === 'render') owned = first.render(data([block('owned')]))
      else if (origin === 'displaced renderTo') {
        originalTarget = context.holder()
        first.renderTo(data([block('owned')]), originalTarget)
        owned = originalTarget.firstElementChild
        replacement = document.createElement('nav')
        originalTarget.replaceChildren(replacement)
      } else owned = first.renderBlock(block('single', origin === 'unknown renderBlock' ? 'unregistered-output' : 'owned-note'))
      const before = owned.outerHTML
      check(owned.parentNode === null && !owned.isConnected, 'The fixture must exercise an unparented owned output')
      second.registerRenderer(definition({ type: 'borrowed-output',
        render() { return owned }, destroy() { releasedSecond++ },
      }))
      let failure = null
      try { second.renderTo(data([block('borrower', 'borrowed-output')]), target) }
      catch (error) { failure = error }
      context.observe({ origin, rejected: failure instanceof TypeError, ownerHtmlUnchanged: owned.outerHTML === before,
        ownerRemainedDetached: owned.parentNode === null, applicationPreserved: target.firstChild === application,
        releasedFirst, releasedSecond })
      check(failure instanceof TypeError, 'A live renderer-owned output was accepted as another renderer\'s fresh block')
      check(owned.outerHTML === before && owned.parentNode === null, 'Rejected borrowing changed the original output')
      check(target.childNodes.length === 1 && target.firstChild === application, 'Rejected borrowing replaced application output')
      check(releasedFirst === 0 && releasedSecond === 0, 'Rejected borrowing disposed an unacquired resource')
      if (release === 'all') first.destroy()
      else first.destroy(originalTarget ?? owned)
      check(releasedFirst === (origin === 'unknown renderBlock' ? 0 : 1), 'The original output was not released exactly once')
      if (originalTarget) check(originalTarget.firstChild === replacement && originalTarget.childNodes.length === 1, 'Original disposal removed replacement application DOM')
      const reused = second.renderBlock(block('released', 'borrowed-output'))
      check(reused === owned, 'A previously released output cannot be reused')
      const reusedHtml = reused.outerHTML
      first.destroy()
      check(reused.outerHTML === reusedHtml && releasedSecond === 0, 'Retired owner changed or disposed the successor output')
      second.destroy(reused)
      second.destroy(reused)
      check(releasedSecond === 1, 'Reused output disposal was not exactly once')
      context.observe({ release, originalReleased: releasedFirst, successorReleased: releasedSecond, reusable: true })
    }])
  }
  cases.push(['renderer output ownership: failed render releases its provisional wrapper', context => {
    const first = context.renderer(), second = context.renderer()
    const expected = new Error('Expected block failure')
    let element, failedWrapper, released = 0, borrowedReleased = 0
    first.registerRenderer(definition({ type: 'owned-note',
      render(record) {
        if (record.id === 'fail') throw expected
        element = document.createElement('article'); element.textContent = record.data.text; return element
      },
      destroy(value) { released++; failedWrapper = value.parentElement },
    }))
    let failure
    try { first.render(data([block('ok'), block('fail')])) } catch (error) { failure = error }
    check(failure === expected && released === 1, 'Failed render did not release the successfully created occurrence')
    check(failedWrapper && failedWrapper.parentNode === null && failedWrapper.firstChild === element, 'Fixture lost the unreturned provisional wrapper')
    second.registerRenderer(definition({ type: 'borrowed-output', render() { return failedWrapper }, destroy() { borrowedReleased++ } }))
    const reused = second.renderBlock(block('recovered', 'borrowed-output'))
    check(reused === failedWrapper, 'Failed render leaked its provisional wrapper ownership')
    first.destroy()
    check(borrowedReleased === 0 && released === 1, 'Failed operation retained or disposed the successor lease')
    second.destroy(reused)
    check(borrowedReleased === 1, 'Recovered wrapper did not release once')
    context.observe({ originalReleased: released, successorReleased: borrowedReleased, provisionalWrapperReusable: true })
  }])
  cases.push(['renderer output ownership: failed renderTo restores application DOM and releases its wrapper', context => {
    const first = context.renderer(), second = context.renderer(), target = context.holder()
    const application = document.createElement('aside'); application.textContent = 'Application output'; target.append(application)
    let failedWrapper, released = 0, borrowedReleased = 0
    first.registerRenderer(definition({ type: 'owned-note',
      render(record) { const element = document.createElement('article'); element.textContent = record.data.text; return element },
      destroy() { released++ },
    }))
    const originalReplace = target.replaceChildren, expected = new Error('Expected post-mutation host failure')
    target.replaceChildren = function (...children) {
      failedWrapper = children[0]
      originalReplace.apply(this, children)
      throw expected
    }
    let failure
    try { first.renderTo(data([block('failed')]), target) } catch (error) { failure = error }
    finally { target.replaceChildren = originalReplace }
    context.observe({ originalError: failure === expected, originalReleased: released,
      applicationPreserved: target.firstChild === application && target.childNodes.length === 1,
      provisionalWrapperDetached: failedWrapper?.parentNode === null })
    check(failure === expected && released === 1, 'Failed renderTo did not release its created occurrence')
    check(target.firstChild === application && target.childNodes.length === 1, 'Failed renderTo lost application DOM')
    check(failedWrapper?.parentNode === null, 'Failed renderTo left its wrapper mounted')
    second.registerRenderer(definition({ type: 'borrowed-output', render() { return failedWrapper }, destroy() { borrowedReleased++ } }))
    const reused = second.renderBlock(block('recovered', 'borrowed-output'))
    check(reused === failedWrapper, 'Failed renderTo leaked its provisional wrapper ownership')
    first.destroy()
    check(borrowedReleased === 0 && released === 1 && target.firstChild === application, 'Failed operation retained a published owner')
    second.destroy(reused)
    check(borrowedReleased === 1, 'Recovered wrapper did not release once')
  }])
  for (const origin of ['block callback', 'style callback']) {
    cases.push([`renderer output ownership: nested detached result survives a failed ${origin}`, context => {
      let nested, active = false
      const expected = new Error('Expected outer acquisition failure')
      class StyleCallbackRenderer extends EditorRenderer {
        getStyleUrls() {
          if (active) { active = false; nested = this.render(data([])); throw expected }
          return []
        }
      }
      const first = context.renderer({ injectStyles: origin === 'style callback' }, origin === 'style callback' ? StyleCallbackRenderer : EditorRenderer)
      const second = context.renderer()
      first.registerRenderer(definition({ type: 'owned-note', render() {
        nested = first.render(data([])); throw expected
      } }))
      active = origin === 'style callback'
      let failure
      try { first.render(data([block('fail')])) } catch (error) { failure = error }
      check(failure === expected && nested?.parentNode === null, 'Fixture did not retain its independent nested output')
      let disposed = 0
      second.registerRenderer(definition({ type: 'borrowed-output', render() { return nested }, destroy() { disposed++ } }))
      let rejected
      try { second.renderBlock(block('borrowed', 'borrowed-output')) } catch (error) { rejected = error }
      context.observe({ rejected: rejected instanceof TypeError, originalDetached: nested.parentNode === null, borrowedReleased: disposed })
      check(rejected instanceof TypeError && disposed === 0, 'Failed outer acquisition lost ownership of its nested output')
      first.destroy(nested)
      check(second.renderBlock(block('released', 'borrowed-output')) === nested, 'Released nested output cannot be reused')
      second.destroy()
      check(disposed === 1, 'Nested successor resources did not release once')
    }])
  }
  for (const [name, operation] of cases) {
    const renderers = [], holders = [], observations = [], failures = [], failureMessages = []
    const context = {
      renderer(config = {}, Renderer = EditorRenderer) { const renderer = new Renderer({ blockTypes: [], injectStyles: false, ...config }); renderers.push(renderer); return renderer },
      holder() { const holder = document.createElement('section'); document.body.append(holder); holders.push(holder); return holder },
      observe(value) { observations.push(value) },
    }
    const fail = error => { failures.push(String(error?.stack ?? error)); failureMessages.push(error?.message ?? String(error)) }
    const capture = event => { fail(event.error ?? event.reason ?? event.message); event.preventDefault() }
    window.addEventListener('error', capture); window.addEventListener('unhandledrejection', capture)
    try { await operation(context) } catch (error) { fail(error) }
    for (const renderer of renderers) { try { renderer.destroy() } catch (error) { fail(error) } }
    for (const holder of holders) holder.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    window.removeEventListener('error', capture); window.removeEventListener('unhandledrejection', capture)
    results.push({ name, status: failures.length ? 'FAIL' : 'PASS', observations, failureCount: failures.length,
      ...(failures.length ? { firstErrorMessage: failureMessages[0], error: failures.join('\n') } : {}) })
  }
  return results
}
