import { ExtensionRegistry } from '../../../core/ExtensionRegistry.js'
import { DocumentRuntime } from '../../../core/DocumentRuntime.js'
import { BlockReconciler } from '../../../core/BlockReconciler.js'
import { InlineProjectionRuntime } from '../../../core/InlineProjectionRuntime.js'
import { test, assert, equal, pause } from './harness.js'

const clone = value => structuredClone(value)

function fixture() {
  const panels = new Map(), widgets = new Map(), reports = [], repurposed = new Set()
  const controlledFailure = new Error('controlled failed field creation')
  let fail = false, reconciler
  const container = document.createElement('section')
  document.body.append(container)
  const block = {
    type: 'presentation-ownership', icon: '', label: { key: 'title', fallback: 'Presentation ownership' },
    schema: {
      currentVersion: 1,
      createDefault: () => ({ name: '', front: '', back: '', note: '' }),
      decode: input => ({ dataVersion: 1, data: clone(input.data) }),
      encode: data => ({ dataVersion: 1, data: clone(data) }),
      mapRichText: (data, visit) => ({
        ...data,
        ...Object.fromEntries(['front', 'back', 'note'].map(key => [key, visit(data[key], key)])),
      }),
    },
    setup() {
      return {
        create(initial, context) {
          let data = clone(initial), active = 'front', mounted, noteKey = 'note', noteMode = 'rich-text'
          const root = context.ownerDocument.createElement('div')
          const note = context.ownerDocument.createElement('div')
          note.contentEditable = 'true'
          note.innerHTML = data.note
          const paint = () => {
            const next = context.ownerDocument.createElement('div')
            next.contentEditable = 'true'
            next.innerHTML = data[active]
            if (mounted) mounted.replaceWith(next)
            else root.append(next)
            mounted = next
          }
          paint()
          root.append(note)
          panels.set(data.name, {
            root, note, field: () => mounted,
            switchBack: () => { active = 'back'; paint() },
            setNoteDescriptor: (key, mode) => { noteKey = key; noteMode = mode },
          })
          return {
            element: root,
            editableFields: () => [
              { key: active, mode: 'rich-text', element: mounted },
              { key: noteKey, mode: noteMode, element: note },
            ],
            read: () => ({ ...data, [active]: mounted.innerHTML, note: note.innerHTML }),
            update(next) { data = clone(next) },
            setReadOnly(value) {
              // Once the caller repurposes a host, this fixture's plugin does
              // not write it. Any later attribute overwrite belongs to core.
              for (const field of [mounted, note]) {
                if (!repurposed.has(field)) field.contentEditable = String(!value)
              }
            },
            destroy() {},
          }
        },
        destroy() {},
      }
    },
  }
  const inline = {
    type: 'presentation-ownership-widget', icon: '', label: { key: 'title', fallback: 'Widget' },
    schema: {
      currentVersion: 1, createDefault: () => ({ label: '' }),
      decode: input => ({ dataVersion: 1, data: clone(input.data) }),
      encode: data => ({ dataVersion: 1, data: clone(data) }),
    },
    setup({ ownerDocument }) {
      return {
        create(id, data, context) {
          if (fail && id === 'a-back') throw controlledFailure
          const element = ownerDocument.createElement('span')
          element.contentEditable = 'false'
          element.textContent = data.label
          widgets.set(id, { element, context })
          return {
            element,
            update(next) { element.textContent = next.label },
            setReadOnly() {}, destroy() {},
          }
        },
        destroy() {},
      }
    },
  }
  const records = ['a', 'b'].map(name => ({
    id: name, type: block.type, dataVersion: 1,
    data: {
      name, front: 'Front {{' + name + '-front}}', back: 'Back {{' + name + '-back}}',
      note: 'Note {{' + name + '-note}}',
    },
    inline: Object.fromEntries(['front', 'back', 'note'].map(side => [name + '-' + side, {
      type: inline.type, dataVersion: 1, data: { label: name + '-' + side },
    }])),
  }))
  const registry = new ExtensionRegistry({
    ownerDocument: document, blocks: [block], inline: [inline], defaultBlock: block.type, acquireStyles: false,
  })
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  const runtime = new DocumentRuntime({
    registry, ownerDocument: document, data: { version: '2.0.0', blocks: records },
    projectorFactory: ports => {
      reconciler = new BlockReconciler({
        container, registry, inlineProjection: projection, ...ports,
        reportPresentationFailure(error, original) {
          reports.push(error)
          ports.reportPresentationFailure(error, original)
        },
      })
      return reconciler
    },
  })
  return {
    panels, widgets, reports, repurposed, runtime, reconciler,
    failBack() {
      fail = true
      panels.get('a').switchBack()
      let thrown
      try { reconciler.getEditableFields('a') } catch (error) { thrown = error }
      assert(thrown === controlledFailure, 'The failed field precondition must throw the exact controlled creation error')
    },
    dispose() {
      try { runtime.destroy() }
      finally {
        try { registry.destroy() }
        finally { container.remove() }
      }
    },
  }
}

function acceptedState(runtime) {
  assert(Number.isInteger(runtime.generation) && Number.isInteger(runtime.revision), 'Version checks require real runtime counters')
  return {
    blocks: runtime.save().blocks, generation: runtime.generation, revision: runtime.revision,
    canUndo: runtime.canUndo, canRedo: runtime.canRedo,
  }
}

for (const kind of ['layout', 'editable', 'widget', 'other-block']) {
  test('presentation ownership: unchanged descriptor under ' + kind, async () => {
    const h = fixture()
    try {
      await pause(25)
      const field = h.panels.get('a').note, widget = h.widgets.get('a-note')
      const task = widget.context.beginTask(), independentTask = h.widgets.get('b-note').context.beginTask()
      const before = acceptedState(h.runtime)
      let parent
      if (kind === 'other-block') parent = h.panels.get('b').root
      else {
        parent = document.createElement('div')
        if (kind === 'editable') parent.contentEditable = 'true'
        if (kind === 'widget') parent.dataset.inlinePlugin = 'foreign-widget'
        h.panels.get('a').root.append(parent)
      }
      parent.append(field)
      let fields, owner
      if (kind === 'layout') {
        fields = h.reconciler.getEditableFields('a')
        owner = h.reconciler.resolveEditableTarget(field)
        assert(fields.some(item => item.element === field) && owner?.blockId === 'a', 'Harmless layout preserves the accepted field owner')
        assert(!widget.context.signal.aborted && !task.signal.aborted, 'Harmless layout preserves inline scope and task')
      } else {
        // A discovery may synchronously reject the new ownership boundary.
        // Either outcome must revoke the predecessor before returning control.
        try { fields = h.reconciler.getEditableFields('a') } catch (error) { assert(error instanceof Error) }
        try { owner = h.reconciler.resolveEditableTarget(field) } catch (error) { assert(error instanceof Error) }
        assert(!fields?.some(item => item.element === field) && owner?.blockId !== 'a', 'Foreign adoption must not recapture the old authoring lease')
        assert(widget.context.signal.aborted && task.signal.aborted, 'Foreign adoption retires the old inline scope and task')
      }
      assert(!independentTask.signal.aborted, 'An independent block keeps its task')
      equal(acceptedState(h.runtime), before, 'Presentation ownership discovery preserves accepted data, versions and history')
    } finally { h.dispose() }
  })
}

for (const action of ['query', 'mode']) for (const change of ['attribute', 'role', 'widget']) {
  test('presentation ownership: reassigned failed host / ' + action + ' / ' + change, async () => {
    const h = fixture()
    try {
      await pause(25)
      h.failBack()
      await pause(25)
      const field = h.panels.get('a').field()
      equal(field.contentEditable, 'false', 'Failure initially disables its exact owned field')
      h.repurposed.add(field)
      if (change === 'role') field.setAttribute('role', 'textbox')
      if (change === 'widget') field.dataset.inlinePlugin = 'foreign-control'
      field.contentEditable = 'plaintext-only'
      const before = acceptedState(h.runtime)
      if (action === 'query') h.reconciler.getEditableFields('a')
      else { h.runtime.setReadOnly(true); h.runtime.setReadOnly(false) }
      equal(field.contentEditable, 'plaintext-only', 'A settled query or mode transition must not overwrite caller-owned attributes')
      equal(field.getAttribute('role'), change === 'role' ? 'textbox' : null)
      equal(field.getAttribute('data-inline-plugin'), change === 'widget' ? 'foreign-control' : null)
      equal(acceptedState(h.runtime), before, 'Presentation and mode work preserve accepted data, versions and history')
    } finally { h.dispose() }
  })
}

for (const change of ['renamed-key', 'invalid-mode']) {
  test('presentation ownership: rejected descriptor metadata / ' + change, async () => {
    const h = fixture()
    try {
      await pause(25)
      const field = h.panels.get('a').note, widget = h.widgets.get('a-note'), task = widget.context.beginTask()
      const independentTask = h.widgets.get('b-note').context.beginTask(), before = acceptedState(h.runtime)
      h.panels.get('b').root.append(field)
      h.panels.get('a').setNoteDescriptor(
        change === 'renamed-key' ? 'note-renamed' : 'note', change === 'invalid-mode' ? 'invalid-mode' : 'rich-text',
      )
      let fields, error
      try { fields = h.reconciler.getEditableFields('a') } catch (caught) { error = caught }
      assert(error instanceof TypeError, 'Invalid metadata must retain its descriptor boundary failure')
      equal(error.message, change === 'renamed-key'
        ? 'Editable field must belong to its owning block DOM' : 'Invalid editable field mode')
      assert(!fields?.some(item => item.element === field), 'The foreign descriptor remains rejected')
      assert(widget.context.signal.aborted && task.signal.aborted, 'Descriptor rejection also retires the previously accepted foreign-adopted occurrence')
      assert(!independentTask.signal.aborted, 'An invalid descriptor in A does not retire B')
      equal(acceptedState(h.runtime), before, 'Descriptor rejection preserves accepted data, versions and history')
    } finally { h.dispose() }
  })
}
