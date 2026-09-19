import { createLinkTool } from '../../../inline-tools/link.js'
import { test, make, para, select, assert, equal, pause } from './harness.js'

function linkEditor() {
  const editor = make([para('a', 'FIRST'), para('b', 'SECOND')], {
    inlineTools: [createLinkTool('URL', 'Link')],
  })
  function open(id) {
    const field = editor.blocks.getBlockById(id).contentElement
    select(field, 0, field.textContent.length)
    document.dispatchEvent(new Event('selectionchange'))
    editor.rootElement.querySelector('[data-tool="link"]').click()
    const panel = editor.rootElement.querySelector('.oe-inline-toolbar__panel--link')
    assert(panel, 'link panel must open')
    return {panel, input: panel.querySelector('input'), apply: panel.querySelector('.oe-inline-tool--apply'),
      back: panel.querySelector('.oe-inline-tool--back')}
  }
  return { editor, open }
}

export function register() {
  test('retired Link panel cannot apply to or close a newly opened panel', async () => {
    const {editor, open} = linkEditor()
    const old = open('a')
    old.input.value = 'https://example.com/stale'
    old.back.click()
    const current = open('b')
    const before = editor.save().blocks
    old.apply.click(); old.back.click()
    equal(editor.save().blocks, before)
    assert(current.panel.isConnected, 'old close must not close the new session')
    current.input.value = 'https://example.com/current'
    current.apply.click()
    equal(editor.save().blocks[0].data.text, 'FIRST')
    assert(editor.save().blocks[1].data.text.includes('https://example.com/current'))
    editor.undo()
    equal(editor.save().blocks, before)
    editor.redo()
    assert(editor.save().blocks[1].data.text.includes('https://example.com/current'))
    await pause()
  })

  test('Link controls retained across read-only reconstruction cannot change the document', async () => {
    const {editor, open} = linkEditor()
    const old = open('a')
    old.input.value = 'https://example.com/stale'
    const oldTool = editor.rootElement.querySelector('[data-tool="link"]')
    editor.setReadOnly(true)
    editor.setReadOnly(false)
    const before = editor.save().blocks
    select(editor.blocks.getBlockById('b').contentElement, 0, 6)
    old.apply.click(); oldTool.click()
    equal(editor.save().blocks, before)
    equal(editor.rootElement.querySelectorAll('.oe-inline-toolbar__panel--link').length, 0)
    await pause()
  })

  test('retired onMount mutation context cannot act on a newly reconstructed selection', () => {
    const mounts = []
    const tool = { type: 'probe', title: 'Probe', icon: '', toggle() {},
      onMount(_button, context) { mounts.push(context) } }
    const editor = make([para('a', 'KEEP')], { inlineTools: [tool] })
    const old = mounts[0]
    editor.setReadOnly(true); editor.setReadOnly(false)
    assert(mounts.length === 2)
    const field = editor.blocks.getBlockById('a').contentElement
    select(field, 0, 4)
    const range = window.getSelection().getRangeAt(0).cloneRange()
    let called = 0
    equal(old.mutate(range, () => called++), undefined)
    equal(called, 0)
    equal(mounts[1].mutate(range, () => 42), 42)
    equal(editor.save().blocks[0].data.text, 'KEEP')
  })
}
