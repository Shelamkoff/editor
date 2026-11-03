import { createEditor } from '../../core/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { test, assert, equal, para, blockElement, pause, run, editorHolder } from './regressions/harness.js'
import { optionalInlineFixture as fixture } from './optional-inline-fixture.js'

async function optionalKey(name, phase, key, code, number, modifiers = 0) {
  const params = { key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers }
  await window.__testInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params }, { name, phase })
  await window.__testInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, { name, phase })
}

async function nativeOptionalEdit(h, name, supersede = null) {
  const old = h.root('x'), field = blockElement(h.editor, 'a').querySelector('[contenteditable="true"]')
  const selection = window.getSelection(), before = [], input = []
  const collectBefore = event => { if (event.inputType === 'deleteContentBackward') before.push(event) }
  const collectInput = event => { if (event.isTrusted) input.push(event.inputType) }
  window.addEventListener('beforeinput', collectBefore, true); window.addEventListener('input', collectInput, true)
  let observer, hook = null, hookError = null
  if (supersede) {
    observer = new MutationObserver(() => {
      observer.disconnect()
      const current = h.root('x'), native = window.getSelection()
      hook = { label: current.textContent, caretAlreadyInside: current.contains(native.anchorNode), oldConnected: old.isConnected }
      try { supersede(current) } catch (error) { hookError = error }
    })
    observer.observe(field, { childList: true, subtree: true, characterData: true })
  }
  field.focus(); selection.setBaseAndExtent(old.firstChild, 3, old.firstChild, 3)
  try {
    await optionalKey(name, 'edit', 'Backspace', 'Backspace', 8)
    await pause(0)
    if (hookError) throw hookError
    const events = before.map(event => ({ type: event.inputType, trusted: event.isTrusted, prevented: event.defaultPrevented }))
    equal(events, [{ type: 'deleteContentBackward', trusted: true, prevented: true }])
    equal(input, [])
    if (supersede) equal(hook, { label: 'Updated', caretAlreadyInside: false, oldConnected: false })
    return { old, field, events, hook }
  } finally {
    observer?.disconnect()
    window.removeEventListener('beforeinput', collectBefore, true); window.removeEventListener('input', collectInput, true)
  }
}

for (const withUpdate of [false, true]) {
  const name = `trusted immediate ${withUpdate ? 'update' : 'replacement'} preserves caret and keyboard history`
  test(name, async () => {
    const h = fixture({ editable: true, withUpdate }), before = h.data(), context = h.context('x'), pending = context.beginTask(), events = []
    h.editor.on('transaction:committed', event => events.push(event.action))
    const edited = await nativeOptionalEdit(h, name), current = h.root('x'), selection = window.getSelection()
    equal(h.data()[0].inline.x.data, { label: 'Updated' }); equal(current.textContent, 'Updated')
    equal(current === edited.old, withUpdate)
    equal([context.signal.aborted, pending.signal.aborted], [!withUpdate, !withUpdate])
    equal({ anchor: selection.anchorNode === current.firstChild, focus: selection.focusNode === current.firstChild,
      anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, collapsed: selection.isCollapsed },
    { anchor: true, focus: true, anchorOffset: 2, focusOffset: 2, collapsed: true })
    const after = h.data()
    await optionalKey(name, 'undo', 'z', 'KeyZ', 90, 2); await pause(0)
    equal(h.data(), before); equal([h.editor.canUndo, h.editor.canRedo], [false, true])
    await optionalKey(name, 'redo', 'y', 'KeyY', 89, 2); await pause(0)
    equal(h.data(), after); equal([h.editor.canUndo, h.editor.canRedo], [true, false])
    equal(events, ['commit', 'undo', 'redo'])
    ;(window.__optionalNativeResults ??= []).push({ name, beforeInput: edited.events, final: h.data(), actions: events })
  })
}

test('trusted immediate missing caret retains exterior logical completion', async () => {
  const h = fixture({ editable: true }); h.flags.caret = null
  const edited = await nativeOptionalEdit(h, 'trusted immediate missing caret retains exterior logical completion')
  const current = h.root('x'), selection = window.getSelection()
  equal(h.data()[0].inline.x.data, { label: 'Updated' }); equal(current.textContent, 'Updated')
  equal({ collapsed: selection.isCollapsed, insideWidget: current.contains(selection.anchorNode), insideField: edited.field.contains(selection.anchorNode) },
    { collapsed: true, insideWidget: false, insideField: true })
  ;(window.__optionalNativeResults ??= []).push({ name: 'trusted immediate missing caret retains exterior logical completion', beforeInput: edited.events })
})

for (const supersession of ['selection', 'mode', 'same-id-owner', 'rollback', 'destroy']) {
  const name = `trusted immediate ${supersession} supersedes the old queued caret`
  test(name, async () => {
    const h = fixture({ editable: true }), holder = editorHolder(h.editor)
    let target, replacement, rejected = false
    try {
      const edited = await nativeOptionalEdit(h, name, () => {
        if (supersession === 'mode') { h.editor.setReadOnly(true); h.editor.setReadOnly(false) }
        if (supersession === 'same-id-owner') h.context('x').updateData(() => ({ label: 'Superseding' }))
        if (supersession === 'rollback') {
          const failure = new Error('rejected successor acquisition'); h.flags.failCreation = failure
          try { h.context('x').updateData(() => ({ label: 'Rejected' })) } catch (error) { rejected = error === failure }
        }
        if (supersession === 'destroy') {
          h.editor.destroy()
          replacement = createEditor({ holder, plugins: [createParagraphPlugin()], injectStyles: false,
            data: { version: '2.0.0', blocks: [para('live', 'Successor')] } })
          target = holder.querySelector('[contenteditable="true"]')
        } else target = blockElement(h.editor, 'b').querySelector('[contenteditable="true"]')
        target.focus(); window.getSelection().setBaseAndExtent(target.firstChild, 1, target.firstChild, 1)
      })
      const selection = window.getSelection()
      equal({ anchor: selection.anchorNode === target.firstChild, focus: selection.focusNode === target.firstChild,
        anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, active: document.activeElement === target },
      { anchor: true, focus: true, anchorOffset: 1, focusOffset: 1, active: true })
      if (replacement) {
        equal(replacement.save().blocks, [para('live', 'Successor')]); h.editor.destroy(); assert(holder.querySelector('.oe-editor'))
      } else {
        const label = supersession === 'same-id-owner' ? 'Superseding' : 'Updated'
        equal(h.data()[0].inline.x.data, { label }); equal(h.root('x').textContent, label)
        equal(h.editor.readOnly, false)
        equal(rejected, supersession === 'rollback')
      }
      ;(window.__optionalNativeResults ??= []).push({ name, beforeInput: edited.events, hook: edited.hook })
    } finally { replacement?.destroy() }
  })
}

await run()
