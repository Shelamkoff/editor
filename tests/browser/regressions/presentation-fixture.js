import { createEditor } from '../../../core/index.js'
import { ExtensionRegistry } from '../../../core/ExtensionRegistry.js'
import { DocumentRuntime } from '../../../core/DocumentRuntime.js'
import { BlockReconciler } from '../../../core/BlockReconciler.js'
import { InlineProjectionRuntime } from '../../../core/InlineProjectionRuntime.js'
import { Diagnostics } from '../../../core/Diagnostics.js'

const clone = value => structuredClone(value)

export function createPresentationDefinitions(options = {}) {
  const panels = new Map(), widgets = new Map(), faults = new Map()
  const state = {
    attempts: [], reports: [], reportOriginals: [], diagnostics: [], validation: [], transactions: [],
    created: [], destroyed: [], blocks: [], blockDestroyed: [], capHit: false,
    descriptorFailure: null, repurposed: new Set(), onCreate: null, onWidgetDestroy: null, onBlockMode: null,
  }
  const arm = (kind, label, count = 1, error = new Error(`controlled ${kind} failure ${label}`)) => {
    faults.set(`${kind}:${label}`, { remaining: count, attempts: 0, error }); return error
  }
  const disarm = (kind, label) => faults.delete(`${kind}:${label}`)
  const maybeFail = (kind, label) => {
    const fault = faults.get(`${kind}:${label}`), armed = Boolean(fault && fault.remaining !== 0)
    state.attempts.push({ kind, label, armed })
    if (!armed) return
    if (fault.attempts++ >= 6) { state.capHit = true; faults.delete(`${kind}:${label}`); return }
    if (fault.remaining !== 'persistent') fault.remaining--
    throw fault.error
  }
  const block = {
    type: 'presentation-fixture', icon: '', label: { key: 'title', fallback: 'Presentation fixture' },
    schema: {
      currentVersion: 1, createDefault: () => ({ name: '', front: '', back: '', note: '' }),
      decode: input => ({ dataVersion: 1, data: clone(input.data) }), encode: data => ({ dataVersion: 1, data: clone(data) }),
      mapRichText: (data, visit) => ({ ...data, ...Object.fromEntries(['front', 'back', 'note'].map(key => [key, visit(data[key], key)])) }),
    },
    setup() { return { create(initial, context) {
      let data = clone(initial), active = 'front', mounted, mountedShell, readOnly = context.isReadOnly()
      const document = context.ownerDocument, root = document.createElement('div'), controls = document.createElement('nav')
      const note = document.createElement('div'), noteWrapper = document.createElement('div'), fields = new Map(), shells = new Map()
      if (options.modeAncestor) root.contentEditable = String(!readOnly)
      note.contentEditable = String(!readOnly); note.innerHTML = data.note
      const panel = { context, root, note, field: () => mounted, cachedShell: side => shells.get(side), active: () => active }
      const paint = () => {
        let next = options.cacheTabs ? fields.get(active) : null
        if (!next) { next = document.createElement('div'); next.contentEditable = String(!readOnly); fields.set(active, next) }
        if (readOnly) next.contentEditable = 'false'
        next.innerHTML = data[active]
        let shell = options.cacheWrappers ? shells.get(active) : next
        if (!shell) { shell = document.createElement('section'); shell.append(next) }
        shells.set(active, shell)
        if (mountedShell?.parentNode === root) mountedShell.replaceWith(shell); else root.prepend(shell)
        mounted = next; mountedShell = shell
        if (options.layoutMove && note.isConnected) {
          const selection = document.defaultView.getSelection(), anchor = selection.anchorNode, focus = selection.focusNode
          const anchorOffset = selection.anchorOffset, focusOffset = selection.focusOffset, local = note.contains(anchor) && note.contains(focus)
          const layout = document.createElement('div'); root.append(layout); layout.moveBefore(noteWrapper, null)
          if (local) { note.focus({ preventScroll: true }); selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset) }
          panel.layout = { local, anchor, anchorOffset, focus, focusOffset, html: note.innerHTML, text: note.firstChild, active: document.activeElement }
        }
      }
      panel.switchTab = side => { active = side; paint() }
      for (const side of ['front', 'back']) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.side = side; button.textContent = side
        button.addEventListener('mousedown', event => event.preventDefault(), { signal: context.signal })
        button.addEventListener('click', () => panel.switchTab(side), { signal: context.signal }); controls.append(button)
      }
      panel.button = side => controls.querySelector(`[data-side="${side}"]`)
      root.append(controls); paint()
      if (options.layoutMove) { noteWrapper.append(note); root.append(noteWrapper) } else root.append(note)
      panels.set(data.name, panel); state.blocks.push(panel)
      return {
        element: root,
        read: () => ({ ...data, [active]: mounted.innerHTML, note: note.innerHTML }),
        update(next) { data = clone(next) },
        editableFields() {
          const failure = state.descriptorFailure
          if (data.name === 'a' && failure?.remaining > 0) { failure.remaining--; throw failure.value }
          return [{ key: active, mode: 'rich-text', element: mounted }, { key: 'note', mode: 'rich-text', element: note }]
        },
        setReadOnly(value) {
          readOnly = value
          const targets = options.cacheTabs && !options.visibleModeOnly ? [...fields.values(), note] : [mounted, note]
          for (const target of targets) if (!state.repurposed.has(target)) target.contentEditable = String(!value)
          if (options.modeAncestor) root.contentEditable = String(!value)
          state.onBlockMode?.(value, panel)
        },
        focus(target) {
          if (target?.fieldKey && target.fieldKey !== 'note' && target.fieldKey !== active) panel.switchTab(target.fieldKey)
          ;(target?.fieldKey === 'note' ? note : mounted).focus()
        },
        destroy() { state.blockDestroyed.push(panel) },
      }
    }, destroy() {} } },
  }
  const inline = {
    type: 'presentation-fixture-widget', icon: '', label: { key: 'title', fallback: 'Widget' },
    schema: {
      currentVersion: 1, createDefault: () => ({ label: '' }),
      decode(input) { maybeFail('decode', input.data.label); return { dataVersion: 1, data: clone(input.data) } },
      encode: data => ({ dataVersion: 1, data: clone(data) }),
    },
    setup({ ownerDocument }) { return { create(id, data, context) {
      state.onCreate?.(id, data, context); maybeFail('create', data.label)
      const element = ownerDocument.createElement('span'); element.contentEditable = 'false'; element.textContent = data.label
      const instance = { id, element, context, ordinal: widgets.get(id)?.length ?? 0 }
      if (!widgets.has(id)) widgets.set(id, [])
      widgets.get(id).push(instance); state.created.push(instance)
      return { element, update(next) { element.textContent = next.label }, setReadOnly() {},
        destroy() { state.destroyed.push(instance); state.onWidgetDestroy?.(instance) } }
    }, destroy() {} } },
  }
  const records = ['a', 'b'].map(name => ({ id: name, type: block.type, dataVersion: 1,
    data: { name, front: `Front {{${name}-front}}`, back: `Back {{${name}-back}} {{${name}-opaque}}`, note: `Note {{${name}-note}} tail` },
    inline: { ...Object.fromEntries(['front', 'back', 'note'].map(side => [`${name}-${side}`, { type: inline.type, dataVersion: 1, data: { label: `${name}-${side}` } }])),
      [`${name}-opaque`]: { type: 'unregistered-presentation-widget', dataVersion: 9, data: { label: 'keep opaque' } } },
  }))
  if (options.partialFailure) {
    records[0].data.back = 'Back {{a-back}} {{a-late}} {{a-opaque}}'
    records[0].inline['a-late'] = { type: inline.type, dataVersion: 1, data: { label: 'a-late' } }
  }
  return { block, inline, records, state, panels, widgets, latest: id => widgets.get(id)?.at(-1), arm, disarm }
}

export function createPresentationOwnerFixture(options = {}) {
  const h = createPresentationDefinitions(options), holder = document.createElement('section'); document.body.append(holder)
  const registry = new ExtensionRegistry({ ownerDocument: document, blocks: [h.block], inline: [h.inline], defaultBlock: h.block.type, acquireStyles: false })
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  let reconciler
  const runtime = new DocumentRuntime({ registry, ownerDocument: document, data: { version: '2.0.0', blocks: h.records },
    diagnostics: new Diagnostics(item => h.state.diagnostics.push(item)), onValidationError: issue => h.state.validation.push(issue),
    onCommit: event => h.state.transactions.push(event),
    projectorFactory: ports => {
      reconciler = new BlockReconciler({ container: holder, registry, inlineProjection: projection, ...ports,
        reportPresentationFailure(error, original = error) { h.state.reports.push(error); h.state.reportOriginals.push(original); ports.reportPresentationFailure(error, original) } })
      return reconciler
    },
  })
  return { ...h, holder, registry, projection, reconciler, runtime,
    dispose() { runtime.destroy(); projection.destroy(); registry.destroy(); holder.remove() } }
}

export function createPresentationNativeFixture(options = {}) {
  const h = createPresentationDefinitions(options), holder = document.createElement('section'); document.body.append(holder)
  const editor = createEditor({ holder, injectStyles: true, plugins: [h.block], inlinePlugins: [h.inline], defaultBlock: h.block.type,
    data: { version: '2.0.0', blocks: h.records }, onDiagnostic: item => h.state.diagnostics.push(item), onValidationError: issue => h.state.validation.push(issue) })
  editor.on('transaction:committed', event => h.state.transactions.push(event))
  return { ...h, holder, editor, dispose() { editor.destroy(); holder.remove() } }
}
