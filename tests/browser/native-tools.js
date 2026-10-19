import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import ru from '../../locale/ru.js'
import en from '../../locale/en.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import { LogicalSelection } from '../../core/LogicalSelection.js'
import { NativeInputController } from '../../core/NativeInputController.js'
import { InlineProjectionRuntime } from '../../core/InlineProjectionRuntime.js'
import { scanRichTextPlaceholders, getRichTextLogicalLength, replaceRichTextRange, replaceRichTextReference, remapRichTextReferences } from '../../shared/richTextOperations.js'
import { renderInlineWidgets } from '../../renderer/inlineWidgets.js'
import { normalizeRichText } from '../../shared/richTextCodec.js'
import { InlineWidgetInputController } from '../../core/InlineWidgetInputController.js'
import { KeyboardRouter } from '../../core/KeyboardRouter.js'
import { createCaseTransformTool } from '../../inline-tools/caseTransform.js'
import { createClearFormattingTool } from '../../inline-tools/clearFormatting.js'
import { createFontSizeTool } from '../../inline-tools/fontSize.js'
import { collectTextTargets, toggleTag, removeEmptyInlineTags, normalizeAfterEdit } from '../../inline-tools/utils.js'
import { findNodeAtOffset, getTextLength, getTextOffset, editableTextWalker, firstTextNode, lastTextNode } from '../../shared/textOffset.js'
import { test, make, para, editableField, editorRoot, pause, select, assert, equal, expectError, run } from './regressions/harness.js'
import { clickNative, dragAcross, dispatchKey } from './native-input-helpers.js'

const types = ['bold', 'italic', 'strikethrough', 'link', 'code', 'marker', 'bgcolor', 'fontSize', 'script', 'align', 'caseTransform', 'clearFormatting']
const tags = { bold: 'b', italic: 'i', strikethrough: 's', code: 'code', marker: 'mark', script: 'sup' }

for (const cross of [false, true]) {
  for (const type of types) {
    test(`native ${type} applies to ${cross ? 'both selected blocks' : 'one field'} as one history entry`, async () => {
      const initial = type === 'clearFormatting' ? '<b>Abc</b>' : 'Abc'
      const extra = type === 'clearFormatting' ? { tunes: { textAlign: 'center' } } : {}
      const editor = make(cross ? [para('a', initial, extra), para('b', initial, extra)] : [para('a', initial, extra)], {
        injectStyles: true,
        inlineTools: createDefaultInlineTools({ types: [type] }),
      })
      const before = editor.save().blocks
      const first = editableField(editor, 'a')
      if (cross) await dragAcross(editor, first, 0, editableField(editor, 'b'), 3, true)
      else {
        first.focus()
        const anchor = findNodeAtOffset(first, 3, 'end')
        const focus = findNodeAtOffset(first, 0, 'start')
        window.getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
        document.dispatchEvent(new Event('selectionchange'))
        await pause(35)
      }
      const root = editorRoot(editor)
      await clickNative(root.querySelector(`.oe-inline-tool[data-tool="${type}"]`))
      if (type === 'fontSize') {
        const input = root.querySelector('.oe-font-size-input')
        assert(document.activeElement === input, 'font size input did not receive keyboard focus')
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: '24' })
        equal(editor.save().blocks, before, 'custom font size input replaced the document selection before Apply')
        equal(editor.canUndo, false, 'custom font size input created document history')
        await dispatchKey('Enter', 'Enter', 13)
      }
      if (type === 'script') await clickNative(root.querySelectorAll('.oe-inline-toolbar__script-panel .oe-inline-tool')[1])
      if (type === 'align') await clickNative(root.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool')[2])
      if (type === 'link' || type === 'bgcolor') {
        const input = root.querySelector(type === 'link' ? '.oe-inline-toolbar__link-input' : '.oe-color-hex')
        await clickNative(input)
        await dispatchKey('a', 'KeyA', 65, 2)
        await window.__testInput('Input.insertText', { text: type === 'link' ? 'https://example.test/page' : '#ff0000' })
        equal(editor.save().blocks, before, 'auxiliary input changed document before Apply')
        equal(editor.canUndo, false, 'auxiliary input created document history')
        await dispatchKey('Enter', 'Enter', 13)
      }
      await pause(35)
      const after = editor.save().blocks
      assert(JSON.stringify(after) !== JSON.stringify(before), `${type} made no canonical change`)
      for (const block of after) {
        const field = editableField(editor, block.id)
        if (tags[type]) assert(field.querySelector(tags[type])?.textContent === 'Abc', `${type} did not format the entire selected field`)
        if (type === 'link') equal(field.querySelector('a')?.getAttribute('href'), 'https://example.test/page')
        if (type === 'bgcolor') equal(field.querySelector('span')?.style.backgroundColor, 'rgb(255, 0, 0)')
        if (type === 'fontSize') equal(field.querySelector('span')?.style.fontSize, '24px')
        if (type === 'align') {
          equal(block.tunes?.textAlign, 'center')
          assert(!Object.hasOwn(block.data, 'align'), 'alignment leaked into plugin data')
        }
        if (type === 'caseTransform') equal(block.data.text, 'ABC')
        if (type === 'clearFormatting') {
          equal(block.data.text, 'Abc')
          equal(block.tunes?.textAlign, 'center', 'clear formatting removed block alignment')
        }
      }
      const native = window.getSelection()
      const anchorField = editableField(editor, cross ? 'b' : 'a')
      const focusField = editableField(editor, 'a')
      assert(anchorField.contains(native.anchorNode) && focusField.contains(native.focusNode), `${type} moved the backward selection to another field`)
      equal(getTextOffset(anchorField, native.anchorNode, native.anchorOffset), 3, `${type} changed the backward anchor`)
      equal(getTextOffset(focusField, native.focusNode, native.focusOffset), 0, `${type} changed the backward focus`)
      editor.undo()
      equal(editor.save().blocks, before, `${type} undo was not atomic`)
      equal(editor.canUndo, false, `${type} created more than one history entry`)
      editor.redo()
      equal(editor.save().blocks, after, `${type} redo changed its canonical result`)
    })
  }
}

async function hoverNative(element) {
  const rect = element.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, 'Tooltip hover target must be visible')
  await window.__testInput('Input.hover', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  await pause(570)
}

for (const [language, locale, labels] of [
  ['ru', ru, ['Полужирный', 'Курсив', 'Зачёркнутый', 'Ссылка', 'Внутристрочный код', 'Маркер', 'Фон текста', 'Размер шрифта', 'Надстрочный', 'По левому краю', 'Сменить регистр', 'Очистить форматирование']],
  ['en', en, ['Bold', 'Italic', 'Strikethrough', 'Link', 'Inline Code', 'Highlight', 'Background', 'Font size', 'Superscript', 'Align left', 'Toggle case', 'Clear formatting']],
]) {
  test(`native localized styled tooltips show every inline tool in ${language}`, async () => {
    const editor = make([para('a', 'Abc')], {
      injectStyles: true, locale,
      inlineTools: createDefaultInlineTools({ i18n: { t: key => locale[key] ?? key } }),
    })
    const field = editableField(editor, 'a')
    await clickNative(field)
    select(field, 0, 3)
    await pause(60)
    const root = editorRoot(editor)
    for (const [index, type] of types.entries()) {
      const button = root.querySelector(`.oe-inline-tool[data-tool="${type}"]`)
      await hoverNative(button)
      const tooltip = document.getElementById(button.getAttribute('aria-describedby'))
      assert(tooltip && getComputedStyle(tooltip).display !== 'none', 'Styled tooltip did not appear')
      equal(tooltip.querySelector('.oe-tooltip__label')?.textContent, labels[index], type)
      equal(button.getAttribute('aria-label'), labels[index], 'accessible label')
      equal(button.title, '', 'native tooltip competes with the custom tooltip')
      if (type === 'strikethrough') equal(tooltip.querySelector('.oe-tooltip__shortcut')?.textContent, 'Ctrl+Shift+S')
      if (type === 'link') equal(tooltip.querySelector('.oe-tooltip__shortcut')?.textContent, 'Ctrl+K')
      equal(window.getSelection().toString(), 'Abc', 'hover changed selection')
      equal(editor.canUndo, false, 'hover created history')
      const rect = tooltip.getBoundingClientRect()
      assert(rect.left >= 0 && rect.right <= innerWidth, 'Tooltip escaped the viewport')
      equal(getComputedStyle(tooltip).pointerEvents, 'none', 'tooltip can intercept selection')
    }
    await window.__testInput('Input.hover', { x: 1, y: 1 })
    await pause(30)
    assert([...root.querySelectorAll('.oe-tooltip')].every(tooltip => getComputedStyle(tooltip).display === 'none'), 'tooltip did not hide after mouseleave')
  })

  test(`native localized styled tooltips cover drill-down and active labels in ${language}`, async () => {
    const editor = make([para('a', 'Abc')], {
      injectStyles: true, locale,
      inlineTools: createDefaultInlineTools({ i18n: { t: key => locale[key] ?? key } }),
    })
    const field = editableField(editor, 'a')
    await clickNative(field)
    select(field, 0, 3)
    await pause(60)
    const root = editorRoot(editor)
    for (const [type, selector, expected] of [
      ['link', '.oe-inline-toolbar__panel--link', language === 'ru' ? ['Назад', 'Применить', 'Удалить ссылку'] : ['Back', 'Apply', 'Unlink']],
      ['align', '.oe-inline-toolbar__align-panel', language === 'ru' ? ['Назад', 'По левому краю', 'По центру', 'По правому краю', 'По ширине'] : ['Back', 'Align left', 'Align center', 'Align right', 'Justify']],
      ['script', '.oe-inline-toolbar__script-panel', language === 'ru' ? ['Назад', 'Надстрочный', 'Подстрочный', 'Обычный'] : ['Back', 'Superscript', 'Subscript', 'Normal']],
    ]) {
      await clickNative(root.querySelector(`.oe-inline-tool[data-tool="${type}"]`))
      const buttons = [...root.querySelectorAll(`${selector} button`)]
      equal(buttons.length, expected.length, 'drill-down button count')
      for (const [index, button] of buttons.entries()) {
        equal(button.getAttribute('aria-label'), expected[index])
        if (getComputedStyle(button).display === 'none') continue
        await hoverNative(button)
        const tooltip = document.getElementById(button.getAttribute('aria-describedby'))
        assert(tooltip && getComputedStyle(tooltip).display !== 'none', 'panel tooltip missing')
        equal(tooltip.querySelector('.oe-tooltip__label')?.textContent, expected[index])
        equal(button.getAttribute('aria-label'), expected[index])
        equal(tooltip.querySelector('.oe-tooltip__shortcut'), null, 'stale shortcut from another tool')
      }
      await clickNative(buttons[0])
      assert([...root.querySelectorAll('.oe-tooltip')].every(el => getComputedStyle(el).display === 'none'), 'Back left a tooltip visible')
    }
    equal(editor.canUndo, false, 'panels or tooltips edited the document')
    editor.blocks.update('a', () => ({ data: { text: '<a href="https://example.test">Abc</a>' } }))
    const linked = editableField(editor, 'a').querySelector('a')
    select(linked, 0, 3)
    await pause(60)
    const link = root.querySelector('.oe-inline-tool[data-tool="link"]')
    await hoverNative(link)
    const tooltip = document.getElementById(link.getAttribute('aria-describedby'))
    equal(tooltip?.querySelector('.oe-tooltip__label')?.textContent, language === 'ru' ? 'Удалить ссылку' : 'Unlink', 'active label was not refreshed')
  })
}

test('native styled tooltips cancel pending display and dispose independently of another editor', async () => {
  const editor = make([para('a', 'Abc')], { injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['bold'] }) })
  const field = editableField(editor, 'a')
  await clickNative(field)
  select(field, 0, 3)
  await pause(60)
  const root = editorRoot(editor)
  const button = root.querySelector('.oe-inline-tool[data-tool="bold"]')
  await hoverNative(button)
  const tooltip = document.getElementById(button.getAttribute('aria-describedby'))
  assert(tooltip && getComputedStyle(tooltip).display !== 'none', 'baseline tooltip missing')
  const other = make([para('b', 'Other')], { injectStyles: true })
  other.destroy()
  assert(getComputedStyle(tooltip).display !== 'none', 'destroying another editor hid this tooltip')
  editor.setReadOnly(true)
  equal(getComputedStyle(tooltip).display, 'none', 'readOnly retained a visible tooltip')
  equal(button.hasAttribute('aria-describedby'), false, 'hidden tooltip retained its accessibility reference')
  editor.setReadOnly(false)
  select(editableField(editor, 'a'), 0, 3)
  await pause(60)
  await window.__testInput('Input.hover', { x: 1, y: 1 })
  const rect = button.getBoundingClientRect()
  await window.__testInput('Input.hover', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  await pause(60)
  equal(getComputedStyle(tooltip).display, 'none', 'tooltip appeared without the hover delay')
  editor.setReadOnly(true)
  await pause(570)
  equal(getComputedStyle(tooltip).display, 'none', 'pending tooltip appeared in readOnly mode')
  editor.setReadOnly(false)
  select(editableField(editor, 'a'), 0, 3)
  await pause(60)
  await window.__testInput('Input.hover', { x: 1, y: 1 })
  await window.__testInput('Input.hover', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  editor.destroy()
  await pause(570)
  equal(root.querySelector('.oe-tooltip'), null, 'destroy retained tooltip DOM')
  equal(button.hasAttribute('aria-describedby'), false, 'pending display survived destroy')
})

for (const cross of [false, true]) {
  for (const closeBy of ['Back', 'Escape']) {
    test(`native link panel cancellation with ${closeBy} preserves ${cross ? 'cross-block' : 'single-field'} selection for the next tool`, async () => {
      const editor = make(cross ? [para('a', 'Abc'), para('b', 'Def')] : [para('a', 'Abc')], {
        injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['bold', 'link'] }),
      })
      const root = editorRoot(editor)
      if (cross) await dragAcross(editor, editableField(editor, 'a'), 0, editableField(editor, 'b'), 3, true)
      else {
        await clickNative(editableField(editor, 'a'))
        select(editableField(editor, 'a'), 0, 3)
        await pause(60)
      }
      const before = editor.save().blocks
      await clickNative(root.querySelector('.oe-inline-tool[data-tool="link"]'))
      assert(document.activeElement.classList.contains('oe-inline-toolbar__link-input'), 'link input not focused')
      if (closeBy === 'Back') await clickNative(root.querySelector('.oe-inline-tool--back'))
      else await dispatchKey('Escape', 'Escape', 27)
      equal(editor.save().blocks, before, 'cancel changed document')
      equal(editor.canUndo, false, 'cancel created history')
      const native = window.getSelection()
      assert(editableField(editor, 'a').contains(native.focusNode), 'cancel did not restore editing focus')
      assert(editableField(editor, cross ? 'b' : 'a').contains(native.anchorNode), 'cancel did not restore selection anchor')
      await clickNative(root.querySelector('.oe-inline-tool[data-tool="bold"]'))
      for (const block of editor.save().blocks) {
        equal(editableField(editor, block.id).querySelector('b')?.textContent, block.id === 'a' ? 'Abc' : 'Def', 'next tool lost the saved selection')
      }
      editor.undo()
      equal(editor.save().blocks, before)
    })
  }
}

test('native action panel closure revokes retained mutation before the next selection event', async () => {
  let calls = 0
  const tool = { ...createDefaultInlineTools({ types: ['bold'] })[0], renderActions(ctx) {
    const doc = ctx.range.startContainer.ownerDocument
    const panel = doc.createElement('div')
    panel.className = 'oe-inline-toolbar__panel audit-action-panel'
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => {
      ctx.close()
      ctx.mutate(() => { calls++; ctx.range.startContainer.parentElement.textContent = 'Late callback' })
    })
    panel.append(cancel)
    return panel
  } }
  const editor = make([para('a', 'Abc')], { injectStyles: true, inlineTools: [tool] })
  const field = editableField(editor, 'a')
  await clickNative(field)
  select(field, 0, 3)
  await pause(60)
  const before = editor.save().blocks
  await clickNative(editorRoot(editor).querySelector('.oe-inline-tool[data-tool="bold"]'))
  await clickNative(editorRoot(editor).querySelector('.audit-action-panel button'))
  equal(calls, 0, 'removed action panel still executed its producer')
  equal(editor.save().blocks, before, 'late callback modified the document')
  equal(editor.canUndo, false, 'cancel created history')
})

test('native action panel context cannot align a replacement document with the same block ID', async () => {
  let retained
  const tool = { ...createDefaultInlineTools({ types: ['bold'] })[0], renderActions(ctx) {
    retained = ctx
    const panel = ctx.range.startContainer.ownerDocument.createElement('div')
    panel.className = 'oe-inline-toolbar__panel audit-action-panel'
    const input = panel.ownerDocument.createElement('input')
    panel.append(input)
    queueMicrotask(() => input.focus())
    return panel
  } }
  const editor = make([para('a', 'Abc')], { injectStyles: true, inlineTools: [tool] })
  const field = editableField(editor, 'a')
  await clickNative(field)
  select(field, 0, 3)
  await pause(60)
  await clickNative(editorRoot(editor).querySelector('.oe-inline-tool[data-tool="bold"]'))
  editor.render({ version: '2.0.0', blocks: [para('a', 'Replacement')] })
  const before = editor.save().blocks
  equal(retained.setTextAlign('center'), false, 'retained panel gained authority over reused IDs')
  equal(editor.save().blocks, before, 'retained panel changed replacement document')
  equal(retained.getTextAlign(), 'mixed', 'retained panel queried replacement ownership')
})

test('native retired action context cannot close or change the successor panel', async () => {
  const contexts = []
  const tool = { ...createDefaultInlineTools({ types: ['bold'] })[0], renderActions(ctx) {
    contexts.push(ctx)
    const panel = ctx.range.startContainer.ownerDocument.createElement('div')
    panel.className = 'oe-inline-toolbar__panel audit-action-panel'
    const cancel = panel.ownerDocument.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', () => ctx.close())
    panel.append(cancel)
    return panel
  } }
  const editor = make([para('a', 'Abc')], { injectStyles: true, inlineTools: [tool] })
  await clickNative(editableField(editor, 'a'))
  select(editableField(editor, 'a'), 0, 3)
  await pause(60)
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-inline-tool[data-tool="bold"]'))
  await clickNative(root.querySelector('.audit-action-panel button'))
  await clickNative(root.querySelector('.oe-inline-tool[data-tool="bold"]'))
  const successor = root.querySelector('.audit-action-panel')
  let lateCalls = 0
  contexts[0].close()
  contexts[0].restoreSelection()
  equal(contexts[0].setTextAlign('right'), false, 'retired panel changed alignment')
  contexts[0].mutate(() => { lateCalls++ })
  equal(lateCalls, 0)
  assert(successor.isConnected, 'retired close removed the new panel')
  equal(contexts[1].setTextAlign('center'), true, 'live panel lost authority')
  contexts[1].close()
  equal(editor.save().blocks[0].tunes?.textAlign, 'center')
  equal(window.getSelection().toString(), 'Abc', 'live close lost selection')
  editor.undo()
  equal(editor.save().blocks[0].tunes, undefined)
})

test('native selection of another text field closes the previous action panel and enables current tools', async () => {
  const editor = make([para('a', 'Alpha'), para('b', 'Bravo')], {
    injectStyles: true, inlineTools: createDefaultInlineTools({ types: ['bold', 'link'] }),
  })
  select(editableField(editor, 'a'), 0, 5)
  await pause(40)
  const root = editorRoot(editor)
  await clickNative(root.querySelector('.oe-inline-tool[data-tool="link"]'))
  const oldPanel = root.querySelector('.oe-inline-toolbar__panel--link')
  assert(oldPanel && oldPanel.contains(document.activeElement), 'Link panel did not open')
  oldPanel.querySelector('input').value = 'https://example.test/retired'
  const oldApply = oldPanel.querySelector('.oe-inline-tool--apply')
  select(editableField(editor, 'b'), 0, 5)
  await pause(40)
  assert(!oldPanel.isConnected, 'previous Link panel hides tools for the new selection')
  equal(editor.canUndo, false, 'selection change created history')
  oldApply.click()
  await clickNative(root.querySelector('.oe-inline-tool[data-tool="bold"]'))
  equal(editor.save().blocks.map(block => block.data.text), ['Alpha', '<b>Bravo</b>'])
  equal(window.getSelection().toString(), 'Bravo')
  editor.undo()
  equal(editor.save().blocks.map(block => block.data.text), ['Alpha', 'Bravo'])
  equal(editor.canUndo, false, 'selection replacement added more than one history entry')
})

test('native failed action factory cannot close the successor it opened', async () => {
  let failedContext
  const tools = createDefaultInlineTools({ types: ['bold', 'link'] })
  const failing = { ...tools[0], renderActions(ctx) {
    failedContext = ctx
    ctx.range.startContainer.ownerDocument.querySelector('.oe-inline-tool[data-tool="link"]').click()
    throw new Error('Audit action factory failed')
  } }
  const editor = make([para('a', 'Alpha')], { injectStyles: true, inlineTools: [failing, tools[1]] })
  select(editableField(editor, 'a'), 0, 5)
  await pause(40)
  const root = editorRoot(editor)
  expectError(/Audit action factory failed/)
  await clickNative(root.querySelector('.oe-inline-tool[data-tool="bold"]'))
  const successor = root.querySelector('.oe-inline-toolbar__panel--link')
  assert(successor?.isConnected, 'failed action factory removed the successor panel')
  let calls = 0
  failedContext.mutate(() => { calls++ })
  failedContext.close()
  equal(calls, 0)
  assert(successor.isConnected, 'failed context closed the successor')
  await window.__testInput('Input.insertText', { text: 'https://example.test/current' })
  await dispatchKey('Enter', 'Enter', 13)
  equal(editableField(editor, 'a').querySelector('a')?.getAttribute('href'), 'https://example.test/current')
  equal(window.getSelection().toString(), 'Alpha')
  editor.undo()
  equal(editor.save().blocks, [para('a', 'Alpha')])
  equal(editor.canUndo, false)
})

test('native old action context cannot align the recreated block after conversion and Undo', async () => {
  let context
  const tool = { ...createDefaultInlineTools({ types: ['bold'] })[0], renderActions(ctx) {
    context = ctx
    const panel = ctx.range.startContainer.ownerDocument.createElement('div')
    const input = panel.ownerDocument.createElement('input')
    panel.append(input)
    queueMicrotask(() => input.focus())
    return panel
  } }
  const editor = make([para('a', 'Alpha')], {
    injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin()], inlineTools: [tool],
  })
  select(editableField(editor, 'a'), 0, 5)
  await pause(40)
  await clickNative(editorRoot(editor).querySelector('.oe-inline-tool[data-tool="bold"]'))
  editor.blocks.convert('a', { type: 'heading' })
  editor.undo()
  equal(context.setTextAlign('center'), false, 'old action context aligned the recreated instance')
  equal(editor.save().blocks, [para('a', 'Alpha')])
  equal(editor.canUndo, false)
})

for (const [locale, labels] of [[ru, ['По центру', 'По левому краю', 'По правому краю']], [en, ['Align center', 'Align left', 'Align right']]]) {
  test('native alignment label, icon and active state follow each selected block before opening actions: ' + labels[0], async () => {
    const editor = make([para('a', 'Alpha', { tunes: { textAlign: 'center' } }), para('b', 'Bravo'), para('c', 'Charlie', { tunes: { textAlign: 'right' } })], {
      injectStyles: true, locale, inlineTools: createDefaultInlineTools({ types: ['align'], i18n: { t: key => locale[key] ?? key } }),
    })
    const root = editorRoot(editor)
    const button = root.querySelector('.oe-inline-tool[data-tool="align"]')
    const icons = []
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      select(editableField(editor, id), 0, 3)
      await pause(40)
      equal(button.getAttribute('aria-label'), labels[index], 'alignment title shows the previous selection state')
      equal(button.classList.contains('oe-inline-tool--active'), index !== 1)
      icons.push(button.innerHTML)
      await hoverNative(button)
      equal(root.querySelector('.oe-tooltip__label').textContent, labels[index], 'alignment tooltip does not describe this block')
    }
    equal(new Set(icons).size, 3, 'alignment icon did not change with the selected block')
    equal(editor.canUndo, false, 'reading alignment state created history')
    equal(editor.save().blocks.map(block => block.tunes?.textAlign), ['center', undefined, 'right'])
  })
}


test('native backward Unicode case expansion adjusts only the selected end endpoint',async()=>{
  const editor=make([para('a','Straße')],{
    injectStyles:true,inlineTools:createDefaultInlineTools({types:['caseTransform']}),
  })
  const field=editableField(editor,'a')
  field.focus()
  const end=findNodeAtOffset(field,6,'end')
  const start=findNodeAtOffset(field,0,'start')
  window.getSelection().setBaseAndExtent(end.node,end.offset,start.node,start.offset)
  document.dispatchEvent(new Event('selectionchange'))
  await pause(45)
  await clickNative(editorRoot(editor).querySelector('[data-tool="caseTransform"]'))
  await pause(45)
  equal(editor.save().blocks[0].data.text,'STRASSE')
  const native=window.getSelection()
  equal(getTextOffset(field,native.anchorNode,native.anchorOffset),7)
  equal(getTextOffset(field,native.focusNode,native.focusOffset),0)
  equal(editor.canUndo,true)
  editor.undo()
  equal(editor.save().blocks[0].data.text,'Straße')
  equal(editor.canUndo,false)
})

test('native retained Font Size and Color callbacks cannot edit after external revision',async()=>{
  for(const type of ['fontSize','bgcolor']){
    const editor=make([para('a','Alpha')],{
      injectStyles:true,inlineTools:createDefaultInlineTools({types:[type]}),
    })
    const field=editableField(editor,'a')
    select(field,0,3)
    await pause(45)
    const root=editorRoot(editor)
    await clickNative(root.querySelector(`[data-tool="${type}"]`))
    const target=root.querySelector(type==='fontSize'?'.oe-font-size-apply':'.oe-color-btn--apply')
    assert(target,'Expected active formatting control')
    editor.blocks.update('a',()=>({data:{text:'Replaced'}}))
    const after=editor.save().blocks
    // A retained callback may still receive a programmatic click after its
    // picker has been closed by the host. It must not mutate new author data.
    target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))
    await pause(30)
    equal(editor.save().blocks,after,'Retired formatting control mutated a replacement')
    equal(editor.save().blocks[0].data.text,'Replaced')
  }
})



test('case transform changes authored cross-block text without rewriting native or locked labels', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">alpha',
    '<span contenteditable="false">locked label</span>beta',
    '<button type="button">nested action</button></div></div>',
    '<button type="button">native action</button>',
    '<div class="oe-block"><div contenteditable="true">bravo</div></div>',
  ].join('')
  document.body.append(fixture)
  const fields = fixture.querySelectorAll('[contenteditable="true"]')
  const first = fields[0]
  const second = fields[1]
  const locked = fixture.querySelector('[contenteditable="false"]')
  const nestedAction = first.querySelector('button')
  const action = fixture.querySelector(':scope > button')
  const suffix = locked.nextSibling
  const range = document.createRange()
  range.setStart(first.firstChild, 0)
  range.setEnd(second.firstChild, second.firstChild.length)
  equal(
    collectTextTargets(fixture, range).map(({ node, startOffset, endOffset }) => node.data.slice(startOffset, endOffset)),
    ['alpha', 'beta', 'bravo'],
    'shared target collection included locked fields or native control labels',
  )
  const tool = createCaseTransformTool('Toggle case')
  tool.bindSelectionPort({
    get range() { return range },
    capture: () => ({}),
    restore: () => true,
  })
  try {
    tool.toggle({ range })
    equal(first.firstChild.data, 'ALPHA')
    equal(suffix.data, 'BETA')
    equal(second.textContent, 'BRAVO')
    equal(locked.textContent, 'locked label', 'case transform edited locked widget text')
    equal(nestedAction.textContent, 'nested action', 'case transform edited a nested native button')
    equal(action.textContent, 'native action', 'case transform edited native control label')
  } finally {
    tool.bindSelectionPort(null)
    fixture.remove()
  }
})


test('cross-block tag fallback formats author text without touching controls or locked labels', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">alpha',
    '<span contenteditable="false">locked label</span>beta',
    '<button type="button">nested action</button></div></div>',
    '<button type="button">native action</button>',
    '<div class="oe-block"><div contenteditable="true">bravo</div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const [first, second] = fixture.querySelectorAll('[contenteditable="true"]')
    const locked = fixture.querySelector('[contenteditable="false"]')
    const native = fixture.querySelector(':scope > button')
    const nested = first.querySelector('button')
    const range = document.createRange()
    range.setStart(first.firstChild, 0)
    range.setEnd(second.firstChild, second.firstChild.length)
    toggleTag('b', range)
    equal(Array.from(first.querySelectorAll('b'), item => item.textContent), ['alpha', 'beta'])
    equal(Array.from(second.querySelectorAll('b'), item => item.textContent), ['bravo'])
    assert(!locked.closest('b') && !locked.querySelector('b'), 'Locked label became bold')
    assert(!nested.closest('b') && !nested.querySelector('b'), 'Nested action became bold')
    assert(!native.closest('b') && !native.querySelector('b'), 'Native action became bold')
  } finally {
    fixture.remove()
  }
})


test('single-field inline tag formatting leaves embedded locked labels and native buttons untouched', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true">alpha<span contenteditable="false">locked</span><button type="button">action</button>beta</div></div>'
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const locked = field.querySelector('[contenteditable="false"]')
    const action = field.querySelector('button')
    const range = document.createRange()
    range.setStart(field.firstChild, 0)
    range.setEnd(field.lastChild, field.lastChild.length)
    toggleTag('b', range)
    equal(Array.from(field.querySelectorAll('b'), item => item.textContent), ['alpha', 'beta'])
    assert(!locked.closest('b') && !locked.querySelector('b'), 'Locked text was wrapped by surroundContents')
    assert(!action.closest('b') && !action.querySelector('b'), 'Native button was wrapped by surroundContents')
  } finally {
    fixture.remove()
  }
})


test('clearing bold preserves a locked descendant and native control inside a styled wrapper', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true"><b>alpha<span contenteditable="false"><i>LOCKED</i></span><button type="button"><i>ACTION</i></button>beta</b></div></div>'
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const locked = field.querySelector('[contenteditable="false"]')
    const button = field.querySelector('button')
    const range = document.createRange()
    range.setStart(field.querySelector('b').firstChild, 0)
    range.setEnd(field.querySelector('b').lastChild, 4)
    toggleTag('b', range)
    equal(field.textContent, 'alphaLOCKEDACTIONbeta')
    assert(locked.closest('b') !== null, 'Clear Bold removed the locked descendant’s inherited formatting')
    assert(button.closest('b') !== null, 'Clear Bold removed the native button’s inherited formatting')
    assert(locked.querySelector('i')?.textContent === 'LOCKED', 'Clear Bold mutated locked nested markup')
    assert(button.querySelector('i')?.textContent === 'ACTION', 'Clear Bold mutated button nested markup')
    assert(!field.firstChild?.matches?.('b') && !field.lastChild?.matches?.('b'), 'Clear Bold retained formatting on author text')
    equal(field.textContent, 'alphaLOCKEDACTIONbeta', 'Clearing bold changed document text')
  } finally { fixture.remove() }
})

test('clear formatting ignores styled labels inside protected controls when author text is plain', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true">alpha<span contenteditable="false"><b>LOCKED</b></span><button type="button"><i>ACTION</i></button>beta</div></div>'
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const locked = field.querySelector('[contenteditable="false"]')
  const button = field.querySelector('button')
  const range = document.createRange()
  range.setStart(field.firstChild, 0)
  range.setEnd(field.lastChild, field.lastChild.length)
  const tool = createClearFormattingTool('Clear')
  tool.bindSelectionPort({ get range() { return range }, capture: () => ({}), restore: () => true })
  try {
    const initial = field.innerHTML
    tool.toggle({ range })
    equal(field.innerHTML, initial, 'Clear Formatting modified protected markup or newly formatted plain author text')
    assert(locked.querySelector('b')?.textContent === 'LOCKED', 'Clear Formatting removed protected bold')
    assert(button.querySelector('i')?.textContent === 'ACTION', 'Clear Formatting removed native button italic')
  } finally {
    tool.bindSelectionPort(null)
    fixture.remove()
  }
})


test('font-size reset ignores styled text owned exclusively by locked controls', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">alpha',
    '<span contenteditable="false"><span style="font-size:28px">LOCKED</span></span>',
    '<button type="button"><span style="font-size:30px">ACTION</span></button>beta</div></div>',
    '<div class="oe-inline-toolbar"><button type="button" class="oe-inline-tool"></button></div>',
  ].join('')
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const range = document.createRange()
  range.setStart(field.firstChild, 0)
  range.setEnd(field.lastChild, field.lastChild.length)
  const tool = createFontSizeTool('Font size')
  tool.bindSelectionPort({ get range() { return range }, capture: () => ({}), restore: () => true })
  try {
    const initial = field.innerHTML
    tool.onMount(fixture.querySelector('.oe-inline-tool'), {
      mutate: (_bookmark, action) => action(range),
      restoreSelection: () => true,
    })
    tool.toggle({ range })
    const reset = fixture.querySelector('.oe-font-size-reset')
    assert(reset, 'Font-size reset control is unavailable')
    reset.click()
    equal(field.innerHTML, initial, 'Font-size reset changed locked formatting or plain authored text')
  } finally {
    tool.destroy()
    tool.bindSelectionPort(null)
    fixture.remove()
  }
})


test('font-size reset splits shared styled author text away from protected descendants', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">',
    '<span style="font-size:24px">alpha',
    '<span contenteditable="false"><span style="font-size:30px">LOCKED</span></span>',
    '<button type="button">ACTION</button>beta</span></div></div>',
    '<div class="oe-inline-toolbar"><button type="button" class="oe-inline-tool"></button></div>',
  ].join('')
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const outer = field.querySelector('span')
  const locked = field.querySelector('[contenteditable="false"]')
  const action = field.querySelector('button')
  const range = document.createRange()
  range.setStart(outer.firstChild, 0)
  range.setEnd(outer.lastChild, outer.lastChild.length)
  const tool = createFontSizeTool('Font size')
  tool.bindSelectionPort({ get range() { return range }, capture: () => ({}), restore: () => true })
  try {
    tool.onMount(fixture.querySelector('.oe-inline-tool'), {
      mutate: (_bookmark, change) => change(range),
      restoreSelection: () => true,
    })
    tool.toggle({ range })
    const reset = fixture.querySelector('.oe-font-size-reset')
    assert(reset, 'Font-size reset control is unavailable')
    reset.click()
    equal(field.textContent, 'alphaLOCKEDACTIONbeta')
    assert(field.firstChild.nodeType === Node.TEXT_NODE, 'Reset retained the font-size wrapper on the authored prefix')
    assert(field.lastChild.nodeType === Node.TEXT_NODE, 'Reset retained the font-size wrapper on the authored suffix')
    assert(locked.closest('[style*="font-size"]') !== null, 'Reset removed inherited styling from protected content')
    equal(locked.querySelector('span')?.style.fontSize, '30px', 'Reset removed protected explicit font size')
    assert(action.closest('[style*="font-size"]') !== null, 'Reset removed the native action’s inherited styling')
  } finally {
    tool.destroy()
    tool.bindSelectionPort(null)
    fixture.remove()
  }
})


test('partial bold removal retains unselected prefix and suffix formatting', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true"><b>beforeselectedafter</b></div></div>'
  document.body.append(fixture)
  try {
    const host = fixture.querySelector('[contenteditable="true"]')
    const node = host.querySelector('b').firstChild
    const range = document.createRange()
    range.setStart(node, 6)
    range.setEnd(node, 14)
    toggleTag('b', range)
    equal(host.innerHTML, '<b>before</b>selected<b>after</b>')
    equal(host.textContent, 'beforeselectedafter')
  } finally { fixture.remove() }
})


test('empty formatting cleanup retains native and locked control-owned nodes', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">alpha',
    '<span data-empty-author=""></span>',
    '<span contenteditable="false"><span data-empty-locked=""></span></span>',
    '<button type="button"><span data-empty-native=""></span></button>',
    '<span data-inline-plugin="stub"><span data-empty-widget=""></span></span>',
    'beta</div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    removeEmptyInlineTags(field)
    assert(!field.querySelector('[data-empty-author]'), 'Empty author markup was retained')
    assert(field.querySelector('[data-empty-locked]'), 'Cleanup removed a locked control-owned element')
    assert(field.querySelector('[data-empty-native]'), 'Cleanup removed a native button-owned element')
    assert(field.querySelector('[data-empty-widget]'), 'Cleanup removed plugin-owned widget DOM')
  } finally { fixture.remove() }
})


test('inline cleanup preserves an empty protected control inside a matching author wrapper', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">',
    '<b data-protected-shell=""><button type="button"><span data-button-owned=""></span></button>',
    '<span contenteditable="false" data-locked-owned=""></span></b>',
    '<span data-empty-author=""></span>',
    '</div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const shell = field.querySelector('[data-protected-shell]')
    const button = field.querySelector('button')
    const locked = field.querySelector('[data-locked-owned]')
    removeEmptyInlineTags(field)
    assert(shell.isConnected && field.contains(shell), 'Cleanup removed the empty shell owning a native control')
    assert(button.isConnected && shell.contains(button), 'Cleanup detached an empty native control')
    assert(locked.isConnected && shell.contains(locked), 'Cleanup detached an empty locked host')
    assert(!field.querySelector('[data-empty-author]'), 'Empty authored formatting was retained')
  } finally { fixture.remove() }
})

test('single-host inline normalization leaves protected text nodes and owners intact', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">',
    '<span contenteditable="false" data-locked=""></span>',
    '<button type="button" data-native=""></button>',
    '<span data-inline-plugin="stub" data-widget=""></span>',
    '<span data-author=""></span>',
    '</div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const protectedHosts = ['[data-locked]', '[data-native]', '[data-widget]']
      .map(selector => field.querySelector(selector))
    const originals = protectedHosts.map((element, index) => {
      const first = document.createTextNode('protected' + index)
      const second = document.createTextNode(' tail')
      element.append(first, second)
      return { element, first, second }
    })
    const authored = field.querySelector('[data-author]')
    authored.append(document.createTextNode('au'), document.createTextNode('thor'))
    normalizeAfterEdit(field, field)
    equal(authored.childNodes.length, 1, 'Author text was not normalized')
    equal(authored.textContent, 'author')
    for (const { element, first, second } of originals) {
      equal(element.childNodes.length, 2, 'Protected subtree was recursively normalized')
      assert(element.firstChild === first && element.lastChild === second, 'Protected text-node identity changed')
      assert(first.isConnected && second.isConnected, 'Protected text node was detached')
    }
  } finally { fixture.remove() }
})

test('cross-host inline normalization skips locked fields and native control descendants', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true" data-author-a=""></div></div>',
    '<div class="oe-block"><div contenteditable="false" data-locked=""></div>',
    '<div contenteditable="true" data-author-b=""></div></div>',
    '<div class="oe-block"><div contenteditable="true" data-native-owner="">',
    '<button type="button" data-native=""></button></div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const a = fixture.querySelector('[data-author-a]')
    const b = fixture.querySelector('[data-author-b]')
    const locked = fixture.querySelector('[data-locked]')
    const native = fixture.querySelector('[data-native]')
    for (const el of [a, b, locked, native]) {
      el.append(document.createTextNode('left'), document.createTextNode('right'))
    }
    const lockedSecond = locked.lastChild
    const nativeSecond = native.lastChild
    normalizeAfterEdit(null, fixture)
    equal(a.childNodes.length, 1, 'First author host failed to normalize')
    equal(b.childNodes.length, 1, 'Second author host failed to normalize')
    equal(locked.childNodes.length, 2, 'Cross-host normalization mutated a locked field')
    equal(native.childNodes.length, 2, 'Cross-host normalization entered a native button')
    assert(locked.lastChild === lockedSecond && native.lastChild === nativeSecond,
      'Cross-host normalization changed protected node identities')
  } finally { fixture.remove() }
})

test('adjacent tag merging preserves the boundary around native-controlled wrappers', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true"><b>prefix<button type="button">action</button></b>plain<b>suffix</b></div></div>'
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const protectedWrapper = field.firstElementChild
    const action = protectedWrapper.querySelector('button')
    const plain = protectedWrapper.nextSibling
    const range = document.createRange()
    range.selectNodeContents(plain)
    toggleTag('b', range)
    assert(protectedWrapper.isConnected && field.firstElementChild === protectedWrapper,
      'Tag merge replaced the wrapper containing a native control')
    assert(action.parentElement === protectedWrapper, 'Tag merge moved a native control to a different wrapper')
    assert(protectedWrapper.nextElementSibling?.tagName === 'B', 'New authored bold sibling was not retained')
    equal(protectedWrapper.nextElementSibling?.textContent, 'plainsuffix',
      'Adjacent author-only bold wrappers did not merge')
  } finally { fixture.remove() }
})


test('cross-field normalization skips nested independent editing hosts while reaching plugin fields', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true" data-outer="">',
    '<span data-author=""></span><div contenteditable="true" data-nested=""></div></div></div>',
    '<div class="oe-block"><section contenteditable="false">',
    '<div contenteditable="true" data-plugin-author=""></div>',
    '<span data-locked=""></span></section></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const author = fixture.querySelector('[data-author]')
    const nested = fixture.querySelector('[data-nested]')
    const pluginAuthor = fixture.querySelector('[data-plugin-author]')
    const locked = fixture.querySelector('[data-locked]')
    for (const field of [author, nested, pluginAuthor, locked]) {
      field.append(document.createTextNode('left'), document.createTextNode('right'))
    }
    const nestedSecond = nested.lastChild
    const lockedSecond = locked.lastChild
    normalizeAfterEdit(null, fixture)
    equal(author.childNodes.length, 1, 'Outer author text failed to normalize')
    equal(pluginAuthor.childNodes.length, 1, 'Nested field in plugin shell failed to normalize')
    equal(nested.childNodes.length, 2, 'Outer field normalization entered a nested editing host')
    equal(locked.childNodes.length, 2, 'Plugin decoration lost its private text nodes')
    assert(nested.lastChild === nestedSecond && locked.lastChild === lockedSecond,
      'Independent text-node identity was changed during cross-field normalization')
  } finally { fixture.remove() }
})


test('Unicode logical offsets survive cross-block normalization without mutating editor UI', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<span data-ui-label=""></span>',
    '<div class="oe-block" contenteditable="false"><div contenteditable="true" data-first=""></div></div>',
    '<div class="oe-block" contenteditable="false"><div contenteditable="true" data-second=""></div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const ui = fixture.querySelector('[data-ui-label]')
    const first = fixture.querySelector('[data-first]')
    const second = fixture.querySelector('[data-second]')
    const uiA = document.createTextNode('UI'), uiB = document.createTextNode(' label')
    ui.append(uiA, uiB)
    first.append(document.createTextNode('Stra'), document.createTextNode('ße'))
    second.append(document.createTextNode('A'), document.createTextNode('😀B'))
    const expected = [getTextLength(first), getTextLength(second)]
    equal(expected, [6, 4])
    normalizeAfterEdit(null, fixture)
    equal(first.childNodes.length, 1)
    equal(second.childNodes.length, 1)
    equal([first.textContent, second.textContent], ['Straße', 'A😀B'])
    equal([getTextLength(first), getTextLength(second)], expected)
    equal(ui.childNodes.length, 2, 'Cross-block normalization entered non-author UI text')
    assert(ui.firstChild === uiA && ui.lastChild === uiB, 'UI text identity changed')
    for (const [field, offset] of [[first, 6], [second, 4]]) {
      const boundary = findNodeAtOffset(field, offset, 'end')
      equal(getTextOffset(field, boundary.node, boundary.offset), offset,
        'UTF-16 endpoint cannot be recovered after normalization')
    }
    second.focus()
    const anchor = findNodeAtOffset(second, 4, 'end')
    const focus = findNodeAtOffset(second, 0, 'start')
    window.getSelection().setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
    equal([getTextOffset(second, window.getSelection().anchorNode, window.getSelection().anchorOffset),
      getTextOffset(second, window.getSelection().focusNode, window.getSelection().focusOffset)], [4, 0],
      'Backward Unicode selection was not restored from logical endpoints')
  } finally { fixture.remove() }
})


test('empty author styling inside a noneditable plugin shell still cleans up', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block" contenteditable="false">',
    '<section contenteditable="true" data-author-field="">',
    '<span data-empty-author=""></span>',
    '<button type="button"><span data-empty-control=""></span></button>',
    '<span contenteditable="false"><span data-empty-locked=""></span></span>',
    '</section></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[data-author-field]')
    const button = fixture.querySelector('button')
    const locked = fixture.querySelector('[data-empty-locked]')
    removeEmptyInlineTags(field)
    assert(!field.querySelector('[data-empty-author]'), 'A read-only block shell prevented authored empty-format cleanup')
    assert(button.isConnected && button.querySelector('[data-empty-control]'),
      'Author cleanup entered a native button')
    assert(locked.isConnected && field.contains(locked),
      'Author cleanup deleted independently owned locked markup')
  } finally { fixture.remove() }
})


test('inline normalization preserves backward Unicode selection with native Range retargeting', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true"></div>'
  document.body.append(fixture)
  try {
    const field = fixture.firstElementChild
    const first = document.createTextNode('Stra')
    const second = document.createTextNode('ße')
    field.append(first, second)
    field.focus()
    const native = window.getSelection()
    native.setBaseAndExtent(second, 2, second, 0)
    equal([getTextOffset(field, native.anchorNode, native.anchorOffset),
      getTextOffset(field, native.focusNode, native.focusOffset)], [6, 4])
    normalizeAfterEdit(field, field)
    equal(field.textContent, 'Straße')
    equal(field.childNodes.length, 1, 'Author-only nodes did not normalize')
    assert(native.anchorNode === first && native.focusNode === first,
      'Native normalization did not preserve both selection boundary points')
    equal([getTextOffset(field, native.anchorNode, native.anchorOffset),
      getTextOffset(field, native.focusNode, native.focusOffset)], [6, 4],
    'A selected Text leaf was removed without preserving backward caret offsets')
  } finally { fixture.remove() }
})

test('inline normalization leaves mixed native-owner selection boundaries intact', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true"></div>'
  document.body.append(fixture)
  try {
    const field = fixture.firstElementChild
    const first = document.createTextNode('Stra')
    const second = document.createTextNode('ße')
    const nativeControl = document.createElement('button')
    nativeControl.type = 'button'
    const labelA = document.createTextNode('UI')
    const labelB = document.createTextNode(' action')
    nativeControl.append(labelA, labelB)
    field.append(first, second, nativeControl)
    field.focus()
    const selection = window.getSelection()
    selection.setBaseAndExtent(second, 2, second, 1)
    const before = [getTextOffset(field, selection.anchorNode, selection.anchorOffset),
      getTextOffset(field, selection.focusNode, selection.focusOffset)]
    normalizeAfterEdit(field, field)
    equal(field.textContent, 'StraßeUI action')
    assert(second.isConnected && selection.anchorNode === second && selection.focusNode === second,
      'Mixed-owner normalization detached a selected Text leaf')
    equal([getTextOffset(field, selection.anchorNode, selection.anchorOffset),
      getTextOffset(field, selection.focusNode, selection.focusOffset)], before)
    assert(nativeControl.firstChild === labelA && nativeControl.lastChild === labelB,
      'A native control lost its independently owned text nodes')
  } finally { fixture.remove() }
})


test('backward Unicode case formatting across blocks restores selection and one Undo/Redo entry', async () => {
  const editor = make([para('a', 'Straße'), para('b', 'Alpha')], {
    injectStyles: true,
    inlineTools: createDefaultInlineTools({ types: ['caseTransform'] }),
  })
  const before = editor.save().blocks
  const a = editableField(editor, 'a')
  const b = editableField(editor, 'b')
  await dragAcross(editor, a, 0, b, 5, true)
  await clickNative(editorRoot(editor).querySelector('[data-tool="caseTransform"]'))
  await pause(35)
  const after = editor.save().blocks
  equal(after.map(block => block.data.text), ['STRASSE', 'ALPHA'])
  equal(editor.canUndo, true)
  const checkBackward = label => {
    const native = window.getSelection()
    assert(b.contains(native.anchorNode) && a.contains(native.focusNode),
      label + ': backward selection moved to another editing host')
    equal(getTextOffset(b, native.anchorNode, native.anchorOffset), 5,
      label + ': backward anchor changed')
    equal(getTextOffset(a, native.focusNode, native.focusOffset), 0,
      label + ': backward focus changed')
  }
  checkBackward('after formatting')
  editor.undo()
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false, 'Cross-block Unicode gesture generated multiple history entries')
  checkBackward('after Undo')
  editor.redo()
  equal(editor.save().blocks, after)
  checkBackward('after Redo')
})


test('native controls do not contribute to authored UTF-16 caret offsets', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true" data-author="">',
    'A<button type="button">native action</button>',
    '<span contenteditable="false">locked label</span>',
    '<span data-inline-plugin="stub">inline label</span>',
    '😀B</div></div>',
  ].join('')
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[data-author]')
    const tail = field.lastChild
    const buttonText = field.querySelector('button').firstChild
    equal(getTextLength(field), 5,
      'Native/locked text should have zero logical length and an inline widget should use one unit')
    equal(getTextOffset(field, tail, 0), 2)
    equal(getTextOffset(field, tail, 3), 5)
    equal(getTextOffset(field, buttonText, 6), 1,
      'Native button text was exposed as editable caret position')
    equal(getTextOffset(field, field, 3), 1,
      'Element boundary after native controls leaked their label lengths')
    const position = findNodeAtOffset(field, 3, 'end')
    assert(position.node === tail && position.offset === 1,
      'Caret landed inside an auxiliary native control instead of the authored Unicode text')
    const selection = window.getSelection()
    field.focus()
    selection.setBaseAndExtent(tail, 3, tail, 0)
    equal([getTextOffset(field, selection.anchorNode, selection.anchorOffset),
      getTextOffset(field, selection.focusNode, selection.focusOffset)], [5, 2],
      'Backward UTF-16 selection included native control labels')
  } finally { fixture.remove() }
})


test('editable text walker skips native labels but discovers separate fields in plugin shells', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div contenteditable="true" data-main="">A',
    '<button type="button">native button</button>',
    '<span contenteditable="false">locked label</span>',
    '<span data-inline-plugin="stub">widget label</span>',
    '<div contenteditable="true">nested editor</div>',
    'B</div>',
    '<section contenteditable="false" data-plugin-shell="">',
    '<button type="button">settings</button>',
    '<div contenteditable="true" data-plugin-author="">Alpha</div>',
    '<span contenteditable="false">blocked</span></section>',
    '<div contenteditable="true" data-extra="">Bravo</div>',
  ].join('')
  document.body.append(fixture)
  try {
    const read = root => {
      const walker = editableTextWalker(root)
      const values = []
      while (walker.nextNode()) values.push(walker.currentNode.textContent)
      return values
    }
    equal(read(fixture.querySelector('[data-main]')), ['A', 'B'],
      'Single-host text traversal included native UI or a nested editor')
    equal(read(fixture.querySelector('[data-plugin-shell]')), ['Alpha'],
      'Plugin block shell did not find its legitimate editor or traversed private UI labels')
    equal(read(fixture), ['A', 'B', 'nested editor', 'Alpha', 'Bravo'],
      'Cross-block traversal did not retain separate editing hosts in DOM order')
  } finally { fixture.remove() }
})


test('cross-block text walker excludes static editor chrome outside authored fields', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="editor-toolbar"><span>Rich text tools</span></div>',
    '<div contenteditable="true" data-first="">Alpha</div>',
    '<span class="editor-status">Insert block</span>',
    '<section contenteditable="false">',
    '<span class="block-label">Settings</span>',
    '<div contenteditable="true" data-second="">Bravo</div>',
    '</section>',
    '<footer>Saved successfully</footer>',
  ].join('')
  document.body.append(fixture)
  try {
    const walker = editableTextWalker(fixture)
    const texts = []
    while (walker.nextNode()) texts.push(walker.currentNode.textContent)
    equal(texts, ['Alpha', 'Bravo'],
      'Cross-block text traversal included static toolbar, block or status labels')
    equal(firstTextNode(fixture), fixture.querySelector('[data-first]').firstChild)
    equal(lastTextNode(fixture), fixture.querySelector('[data-second]').firstChild)
  } finally { fixture.remove() }
})


test('native button focus cannot capture the retained author range as a logical bookmark', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true">Alpha<button type="button">Action</button></div></div>'
  document.body.append(fixture)
  try {
    const field = fixture.querySelector('[contenteditable="true"]')
    const button = fixture.querySelector('button')
    const content = field.firstChild
    const owner = { blockId: 'a', fieldKey: 'text', element: field, mode: 'rich-text' }
    const reconcile = {
      resolveEditableTarget(target) {
        for (let node = target; node && node !== fixture; node = node.parentNode) {
          if (node === button) return null
          if (node === field) return owner
        }
        return null
      },
      resolveBlockTarget(target) { return fixture.contains(target) ? 'a' : null },
      getEditableFields(id) { return id === 'a' ? [{ key: 'text', element: field, mode: 'rich-text' }] : [] },
      getElement(id) { return id === 'a' ? fixture.firstElementChild : null },
    }
    const selection = new LogicalSelection({ root: fixture, reconciler: reconcile })
    const native = window.getSelection()
    field.focus()
    native.setBaseAndExtent(content, 1, content, 4)
    button.focus()
    assert(document.activeElement === button, 'Native button did not acquire focus')
    equal(native.toString(), 'lph',
      'The browser no longer retained the native author selection needed for this regression')
    equal(selection.capture(), null,
      'An auxiliary button captured an older author selection while it owned focus')
    field.focus()
    native.setBaseAndExtent(content, 1, content, 4)
    equal(selection.capture(), {
      anchor: { blockId: 'a', fieldKey: 'text', offset: 1 },
      focus: { blockId: 'a', fieldKey: 'text', offset: 4 },
    }, 'The author field lost its valid selection after control focus was released')
  } finally { fixture.remove() }
})


test('external native button focus never captures an editor text range retained by Chromium', () => {
  const field = document.createElement('div')
  field.contentEditable = 'true'
  field.textContent = 'Alpha'
  const external = document.createElement('button')
  external.type = 'button'
  external.textContent = 'External'
  document.body.append(field, external)
  try {
    const text = field.firstChild
    const owner = { blockId: 'a', fieldKey: 'text', element: field, mode: 'rich-text' }
    const root = {
      ownerDocument: document,
      contains(node) { return field.contains(node) },
    }
    const reconciler = {
      resolveEditableTarget(node) { return field.contains(node) ? owner : null },
      resolveBlockTarget() { return null },
      getEditableFields(id) { return id === 'a' ? [{ key: 'text', element: field, mode: 'rich-text' }] : [] },
    }
    const logical = new LogicalSelection({ root, reconciler })
    const native = window.getSelection()
    field.focus()
    native.setBaseAndExtent(text, 1, text, 4)
    external.focus()
    assert(document.activeElement === external, 'External button did not acquire focus')
    equal(native.toString(), 'lph', 'Chromium did not retain the native text range after external focus')
    equal(logical.capture(), null,
      'An external button borrowed an old author range despite owning browser focus')
  } finally {
    field.remove()
    external.remove()
  }
})


test('native widget deletion still settles with strict widget editing-field isolation', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true">A<span data-inline-plugin="mention">mention</span>B</div>'
  document.body.append(fixture)
  const field = fixture.firstElementChild
  const widget = field.querySelector('[data-inline-plugin]')
  const handled = []
  const owner = {blockId:'a',fieldKey:'text',mode:'rich-text',element:field}
  const runtime = {
    readOnly:false,generation:1,revision:2,
    syncBlockFromProjection(){handled.push('generic-persistence')},
  }
  const reconciler = {
    resolveEditableTarget(node) {
      if (widget.contains(node)) return null
      return field.contains(node) ? owner : null
    },
    getEditableField(id,key) {
      return id==='a'&&key==='text' ? {element:field,mode:'rich-text'} : null
    },
  }
  const projection = {resolveWidgetElement(node) {
    return widget.contains(node) ? widget : null
  }}
  const inlineWidgetInput = {
    captureNativeDeletion(current,event) {
      handled.push('capture:' + current.fieldKey)
      return {eventHost:field,inputType:event.inputType,
        trusted:event.isTrusted===true,originalEvent:event,
        generation:1,revision:2}
    },
    completeNativeDeletion(){handled.push('settle');return{status:'committed',inside:true}},
    markNativeInputEvent(_event,result){handled.push('route:'+result.status)},
  }
  const controller = new NativeInputController({
    root:fixture,runtime,reconciler,projection,inlineWidgetInput,
  })
  try {
    assert(widget.isContentEditable, 'Native input fixture did not inherit the authored editing host')
    widget.dispatchEvent(new InputEvent('beforeinput', {
      bubbles:true,cancelable:true,inputType:'deleteWordBackward',
    }))
    widget.dispatchEvent(new InputEvent('input', {
      bubbles:true,inputType:'deleteWordBackward',
    }))
    equal(handled, ['capture:text','settle','route:committed'],
      'Inline deletion was lost or double committed through generic persistence')
  } finally {
    controller.destroy()
    fixture.remove()
  }
})

test('native block and widget buttons cannot replay history, but toolbar Undo can', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><button data-native="" type="button">Settings</button>',
    '<span data-inline-plugin="mention"><button type="button" data-widget-button="">Action</button></span></div>',
    '<div class="oe-toolbar"><button type="button" data-toolbar-undo="">Undo</button></div>',
  ].join('')
  document.body.append(fixture)
  const history = []
  const runtime = {
    readOnly:false,modeEpoch:0,health:'ready',
    prepareExtensionValue:fn=>fn(),
    splitBlock(){},mergeAdjacent(){},
    undo(){history.push('undo');return true},
    redo(){history.push('redo');return true},
  }
  const reconciler = {
    resolveEditableTarget(){return null},
    resolveInlineWidgetElement(node){return node.closest?.('[data-inline-plugin]')??null},
    resolveBlockTarget(node){return fixture.querySelector('.oe-block').contains(node)?'a':null},
  }
  const router = new KeyboardRouter({
    root:fixture,runtime,reconciler,registry:{getBlockDefinition(){return null}},
    selection:{capture(){return null}},
    view:{focus(){return false},reconcileInteraction(){}},
  })
  const command = target => {
    target.focus()
    const event = new KeyboardEvent('keydown', {
      key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true,
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    equal(command(fixture.querySelector('[data-native]')),false,
      'Block button replayed canonical Undo')
    equal(command(fixture.querySelector('[data-widget-button]')),false,
      'Widget button replayed canonical Undo')
    equal(history,[], 'Native controls changed document history')
    equal(command(fixture.querySelector('[data-toolbar-undo]')),true,
      'Editor toolbar did not route canonical Undo')
    equal(history,['undo'],'Toolbar Undo did not route exactly once')
  } finally {
    router.destroy()
    fixture.remove()
  }
})


test('detached inline widget occurrences lose selection and DOM authority', () => {
  const field = document.createElement('div')
  field.contentEditable = 'true'
  field.textContent = 'A{{inline-1}}B'
  document.body.append(field)
  const record = {
    data: { text: 'A{{inline-1}}B' },
    inline: { 'inline-1': { type: 'mention', dataVersion: 1, data: { label: 'Widget' } } },
  }
  const definition = { schema: {
    mapRichText(data, visit) { return { ...data, text: visit(data.text, 'text') } },
  } }
  const registry = {
    getInlineDefinition(type) {
      return type === 'mention' ? {
        schema: { decode(value) { return value } },
      } : null
    },
    getInlineRuntime(type) {
      return type === 'mention' ? { create(_id, data) {
        const element = document.createElement('span')
        element.contentEditable = 'true'
        element.textContent = data.label
        return { element, setReadOnly() {}, destroy() {},
          update(next) {
            pluginUpdates.push(next.label)
            if (disconnectDuringUpdate) field.remove()
          } }
      } } : null
    },
  }
  const pluginUpdates = []
  let disconnectDuringUpdate = false
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  try {
    projection.reconcileBlock(
      'a', record, definition,
      [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext() { return {} } },
      { preserveSourceProjection: true },
    )
    const widget = field.querySelector('[data-inline-plugin="mention"]')
    assert(widget && widget.isConnected, 'The inline occurrence failed to mount')
    assert(projection.resolveWidgetElement(widget) === widget,
      'A currently connected occurrence lost its DOM ownership')
    const nativeOccurrence = projection.captureNativeField('a', 'text', field)?.occurrences[0]
    assert(nativeOccurrence?.element === widget, 'Native occurrence lease was not captured')
    const selection = {
      isCollapsed: true, anchorNode: widget.firstChild, anchorOffset: 2,
    }
    assert(projection.resolveWidgetInputTarget(selection, 'insertText')?.element === widget,
      'A connected widget cannot resolve its own input target')

    field.remove()
    assert(!field.isConnected && field.contains(widget),
      'The fixture did not retain the stale child relationship')
    equal(projection.resolveWidgetElement(widget), null,
      'A detached widget still resolved through a stale field child relationship')
    equal(projection.resolveWidgetInputTarget(selection, 'insertText'), null,
      'A detached widget could still receive an inline edit or caret target')
    let rejectedUpdate = false
    try {
      projection.finalizeNativeInlineUpdates('a', 'text',
        [{ ...nativeOccurrence, action: { kind: 'update', data: { label: 'Stale' } } }],
        record.inline)
    } catch {
      rejectedUpdate = true
    }
    assert(rejectedUpdate, 'A detached widget was updated after losing its editing host')
    equal(pluginUpdates, [], 'A disconnected widget instance received an update callback')

    // A plugin update can itself detach the block during a live operation.
    // This must invalidate settlement before replacing cached canonical data.
    document.body.append(field)
    disconnectDuringUpdate = true
    let rejectedReentrantUpdate = false
    try {
      projection.finalizeNativeInlineUpdates('a', 'text',
        [{ ...nativeOccurrence, action: { kind: 'update', data: { label: 'Later' } } }],
        { 'inline-1': { type: 'mention', dataVersion: 1, data: { label: 'Later' } } })
    } catch {
      rejectedReentrantUpdate = true
    }
    assert(rejectedReentrantUpdate, 'A plugin detached its host but still finalized a native inline update')
    equal(pluginUpdates, ['Later'], 'The live plugin callback was not exercised')
    assert(!field.isConnected, 'The callback did not detach the original editing host')
    document.body.append(field)
    const afterRejected = projection.captureNativeField('a', 'text', field)?.occurrences[0]
    equal(afterRejected?.data.label, 'Widget',
      'A failed reentrant plugin update changed the settled inline data cache')

    projection.destroyBlock('a')
    document.body.append(field)
    equal(projection.resolveWidgetElement(widget), null,
      'Reattaching a disposed occurrence resurrected its former DOM authority')
  } finally {
    projection.destroy()
    field.remove()
  }
})


test('deferred widget caret does not reclaim focus from an external native button', async () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true">A<span contenteditable="true" data-inline-plugin="mention">Ada</span>B</div>'
  const external = document.createElement('button')
  external.type = 'button'
  external.textContent = 'External action'
  document.body.append(fixture, external)
  const field = fixture.firstElementChild
  const widget = field.querySelector('[data-inline-plugin="mention"]')
  const label = widget.firstChild
  const caretWrites = []
  const committed = []
  const owner = {blockId:'a',fieldKey:'text',mode:'rich-text',element:field}
  const runtime = {
    readOnly:false,generation:1,revision:2,modeEpoch:0,
    canAccessFormattingSelection(){return true},
    prepareExtensionValue(fn){return fn()},
    interact(_name,produce){produce();this.revision++;return true},
    removeInlineWidget(){committed.push('remove')},
  }
  const projection = {
    resolveWidgetInputTarget(){return {
      blockId:'a',fieldKey:'text',inlineId:'widget-1',type:'mention',
      element:widget,data:{name:'Ada'},position:'inside',offset:2,logicalOffset:1,
    }},
    resolveWidgetElement(node){return node===widget?widget:null},
  }
  const input = new InlineWidgetInputController({
    root:fixture,runtime,projection,
    registry:{getInlineDefinition(){return {editing:{
      handle(){return {kind:'remove',caret:0}},
    }}}},
    reconciler:{getEditableField(){return {mode:'rich-text',element:field}}},
    selection:{setCaret(){caretWrites.push('caret')}},
  })
  try {
    field.focus()
    window.getSelection().setBaseAndExtent(label,2,label,2)
    const event = new InputEvent('beforeinput', {
      inputType:'deleteContentBackward',bubbles:true,cancelable:true,
    })
    field.dispatchEvent(event)
    assert(event.defaultPrevented,'Owned inline action was not accepted')
    equal(committed,['remove'],'Inline action did not commit exactly once')

    external.focus()
    assert(document.activeElement===external,'External button did not own focus')
    await Promise.resolve()
    equal(caretWrites,[],'Deferred inline caret reclaimed a later native-control focus')
    assert(document.activeElement===external,'Inline focus restoration displaced the external button')
  } finally {
    input.destroy()
    fixture.remove()
    external.remove()
  }
})


test('inline hydration never converts literal widget-reference text inside a native button', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true">A{{inline-1}}B<button type="button" data-native-label="">{{inline-1}}</button></div></div>'
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const button = fixture.querySelector('button')
  const record = {
    data: { text: 'A{{inline-1}}B' },
    inline: { 'inline-1': { type: 'mention', dataVersion: 1, data: { name: 'Ada' } } },
  }
  const definition = { schema: {
    mapRichText(data, visit) { return { ...data, text: visit(data.text, 'text') } },
  } }
  const registry = {
    getInlineDefinition(type) {
      return type === 'mention' ? { schema: { decode(value) { return value } } } : null
    },
    getInlineRuntime(type) {
      return type === 'mention' ? { create(_id, data) {
        const element = document.createElement('span')
        element.contentEditable = 'false'
        element.textContent = data.name
        return { element, setReadOnly() {}, destroy() {} }
      } } : null
    },
  }
  const projection = new InlineProjectionRuntime({ registry, ownerDocument: document })
  try {
    projection.reconcileBlock('a', record, definition,
      [{ key: 'text', mode: 'rich-text', element: field }],
      { createInlineWidgetContext() { return {} } },
      { preserveSourceProjection: true },
    )
    const widget = field.querySelector('[data-inline-plugin="mention"]')
    assert(widget && widget.isConnected, 'Inline occurrence was not hydrated in authored text')
    assert(projection.resolveWidgetElement(widget) === widget, 'Author inline occurrence lost ownership')
    assert(!button.contains(widget), 'An author widget root moved into the native button')
    equal(button.textContent, '{{inline-1}}',
      'Placeholder-shaped native control label was incorrectly hydrated')
    equal(field.querySelectorAll('[data-inline-plugin="mention"]').length, 1,
      'Native control label produced another inline widget occurrence')
  } finally {
    projection.destroy()
    fixture.remove()
  }
})


test('reconciling a widget with a placeholder-shaped label never hydrates itself', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div class="oe-block"><div contenteditable="true">A{{inline-1}}B</div></div>'
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const record = {
    data: { text: 'A{{inline-1}}B' },
    inline: { 'inline-1': { type: 'mention', dataVersion: 1, data: { name: 'Ada' } } },
  }
  const definition = { schema: {
    mapRichText(data, visit) { return { ...data, text: visit(data.text, 'text') } },
  } }
  const registry = {
    getInlineDefinition(type) {
      return type === 'mention' ? { schema: { decode(value) { return value } } } : null
    },
    getInlineRuntime(type) {
      return type === 'mention' ? { create(_id, data) {
        const element = document.createElement('span')
        element.contentEditable = 'true'
        element.textContent = data.name
        return { element, setReadOnly() {}, destroy() {} }
      } } : null
    },
  }
  const projection = new InlineProjectionRuntime({registry, ownerDocument:document})
  try {
    const fields = [{key:'text', mode:'rich-text', element:field}]
    const context = {createInlineWidgetContext(){return {}}}
    projection.reconcileBlock('a', record, definition, fields, context,
      {preserveSourceProjection:true})
    const widget = field.querySelector('[data-inline-plugin="mention"]')
    assert(widget && widget.isConnected, 'Expected a live inline widget after first hydration')
    widget.textContent = '{{inline-1}}'
    projection.reconcileBlock('a', record, definition, fields, context,
      {preserveSourceProjection:true})
    assert(projection.resolveWidgetElement(widget) === widget,
      'The widget was detached or recursively inserted into its own label')
    assert(widget.parentNode === field, 'The widget was moved away from its authored position')
    equal(widget.textContent, '{{inline-1}}', 'Placeholder-shaped label is authored by its widget')
    equal(field.querySelectorAll('[data-inline-plugin="mention"]').length, 1,
      'A duplicate inline widget was hydrated inside its existing label')
  } finally {
    projection.destroy()
    fixture.remove()
  }
})


test('serializing authored text excludes embedded native controls and locked labels', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = [
    '<div class="oe-block"><div contenteditable="true">',
    'Alpha<button type="button" data-native-action=""><b>SETTINGS</b></button>',
    '<span contenteditable="false" data-locked-label="">LOCKED</span>',
    '<b>Beta</b></div></div>',
  ].join('')
  document.body.append(fixture)
  const field = fixture.querySelector('[contenteditable="true"]')
  const expected = 'Alpha<b>Beta</b>'
  const definition = { schema: {
    mapRichText(data, visit) { return { ...data, text: visit(data.text, 'text') } },
  } }
  const projection = new InlineProjectionRuntime({
    ownerDocument:document, registry:{},
  })
  try {
    const record = {data:{text:expected}}
    const saved = projection.serializeBlock('a', record, definition,
      [{key:'text',mode:'rich-text',element:field}], {text:expected})
    equal(saved.data.text, expected,
      'Native button or locked label text was persisted as authored content')
    equal(field.querySelector('[data-native-action]').textContent, 'SETTINGS',
      'Serialization modified the live native control')
    equal(field.querySelector('[data-locked-label]').textContent, 'LOCKED',
      'Serialization modified the live locked label')
  } finally {
    projection.destroy()
    fixture.remove()
  }
})


test('preserved source projection retires a widget removed from canonical inline references', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true">A{{inline-1}}B</div>'
  document.body.append(fixture)
  const field = fixture.firstElementChild
  const definition = { schema: {
    mapRichText(data, visit) { return { ...data, text: visit(data.text, 'text') } },
  } }
  let created = 0, destroyed = 0
  const registry = {
    getInlineDefinition(type) {
      return type === 'mention' ? {
        schema: { decode(value) { return value } },
      } : null
    },
    getInlineRuntime(type) {
      return type === 'mention' ? { create(_id, data) {
        created++
        const element = document.createElement('span')
        element.textContent = data.name
        return { element, setReadOnly() {}, destroy() { destroyed++ } }
      } } : null
    },
  }
  const projection = new InlineProjectionRuntime({registry, ownerDocument:document})
  const initial = {data:{text:'A{{inline-1}}B'},inline:{
    'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}},
  }}
  const fields = [{key:'text',mode:'rich-text',element:field}]
  const context = {createInlineWidgetContext(){return {}}}
  try {
    projection.reconcileBlock('a',initial,definition,fields,context,
      {preserveSourceProjection:true})
    const oldWidget = field.querySelector('[data-inline-plugin="mention"]')
    assert(oldWidget && projection.resolveWidgetElement(oldWidget) === oldWidget,
      'Initial canonical inline occurrence was not projected')

    // A source edit can leave the old DOM occurrence in the author field even
    // after the canonical operation removes the final inline reference.
    const withoutInline = {data:{text:'AB'},inline:{}}
    projection.reconcileBlock('a',withoutInline,definition,fields,context,
      {preserveSourceProjection:true})
    equal(field.textContent,'AB',
      'Obsolete widget label survived a canonical removal')
    equal(projection.resolveWidgetElement(oldWidget),null,
      'A deleted inline occurrence retained DOM ownership')
    assert(!oldWidget.isConnected && destroyed === 1,
      'Removed widget was not disposed exactly once')

    // Replaying Undo reconstructs the same canonical ID but must create a
    // fresh occurrence; the disposed predecessor may not reclaim a new lease.
    projection.reconcileBlock('a',initial,definition,fields,context)
    const restored = field.querySelector('[data-inline-plugin="mention"]')
    assert(restored && restored !== oldWidget,
      'Undo restored an already-disposed widget element')
    assert(projection.resolveWidgetElement(restored) === restored,
      'Undo did not publish current widget ownership')
    equal(projection.resolveWidgetElement(oldWidget),null)
    equal(field.textContent,'AAdaB')
    equal(created,2)
  } finally {
    projection.destroy()
    fixture.remove()
  }
})

test('a typed literal inline ID cannot relocate an already mounted widget', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = '<div contenteditable="true">A{{inline-1}}B</div>'
  document.body.append(fixture)
  const field = fixture.firstElementChild
  const record = {data:{text:'A{{inline-1}}B'},inline:{
    'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}},
  }}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const registry={
    getInlineDefinition(type) {
      return type === 'mention' ? {schema:{decode(value){return value}}}:null
    },
    getInlineRuntime(type) {
      return type === 'mention' ? {create(_id,data){
        const element=document.createElement('span')
        element.textContent=data.name
        return {element,setReadOnly(){},destroy(){}}
      }}:null
    },
  }
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  const fields=[{key:'text',mode:'rich-text',element:field}]
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    const widget=field.querySelector('[data-inline-plugin="mention"]')
    assert(widget && widget.isConnected)
    const literal=document.createTextNode('{{inline-1}}')
    field.append(literal)
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    assert(field.contains(widget) && widget.previousSibling?.textContent === 'A',
      'Literal authored token stole the existing inline occurrence')
    assert(widget.nextSibling?.textContent === 'B',
      'The original widget was moved from its authored position')
    assert(literal.isConnected && literal.data === '{{inline-1}}',
      'Author-typed placeholder-shaped text was incorrectly converted')
    equal(field.querySelectorAll('[data-inline-plugin="mention"]').length,1)
  }finally{
    projection.destroy()
    fixture.remove()
  }
})


test('reparented inline widgets inside native controls lose authored ownership', () => {
  const fixture=document.createElement('div')
  fixture.innerHTML='<div contenteditable="true">A{{inline-1}}B</div>'
  document.body.append(fixture)
  const field=fixture.firstElementChild
  const record={data:{text:'A{{inline-1}}B'},inline:{
    'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}},
  }}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const registry={
    getInlineDefinition(type){
      return type==='mention'?{schema:{decode(value){return value}}}:null
    },
    getInlineRuntime(type){
      return type==='mention'?{create(_id,data){
        const element=document.createElement('span')
        element.contentEditable='true'
        element.textContent=data.name
        return {element,setReadOnly(){},destroy(){}}
      }}:null
    },
  }
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  try{
    projection.reconcileBlock('a',record,definition,
      [{key:'text',mode:'rich-text',element:field}],
      {createInlineWidgetContext(){return{}}},
      {preserveSourceProjection:true})
    const widget=field.querySelector('[data-inline-plugin="mention"]')
    assert(widget&&projection.resolveWidgetElement(widget)===widget)
    const captured=projection.captureNativeField('a','text',field)?.occurrences[0]
    assert(captured?.element===widget,'Initial inline native occurrence was not captured')
    const button=document.createElement('button')
    button.type='button'
    field.append(button)
    button.append(widget)
    assert(field.contains(widget)&&widget.isConnected,
      'Native-control reparenting did not preserve live field containment')
    equal(projection.resolveWidgetElement(widget),null,
      'An inline widget inside a native button retained author ownership')
    const selection={isCollapsed:true,anchorNode:widget.firstChild,anchorOffset:1}
    equal(projection.resolveWidgetInputTarget(selection,'insertText'),null,
      'A native button child retained its inline author caret route')
    equal(projection.captureNativeField('a','text',field)?.occurrences.length,0,
      'Native input capture included a widget adopted by a button')
    assert(!projection.isCurrentNativeOccurrence('a','text',captured,{allowDetached:true}),
      'A connected widget adopted by a button passed a native-deletion lifetime check')
    widget.remove()
    assert(projection.isCurrentNativeOccurrence('a','text',captured,{allowDetached:true}),
      'A genuinely detached occurrence must remain recognizable for native deletion settlement')
  }finally{
    projection.destroy()
    fixture.remove()
  }
})


test('reentrant widget update cannot borrow an external DOM parent during hydration', () => {
  const fixture=document.createElement('div')
  fixture.innerHTML='<div contenteditable="true">A{{inline-1}}B</div>'
  const external=document.createElement('section')
  document.body.append(fixture,external)
  const field=fixture.firstElementChild
  let adoptDuringUpdate=false,updates=0
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const registry={
    getInlineDefinition(type){
      return type==='mention'?{schema:{decode(value){return value}}}:null
    },
    getInlineRuntime(type){
      return type==='mention'?{create(_id,data){
        const element=document.createElement('span')
        element.textContent=data.name
        return {element,setReadOnly(){},destroy(){},
          update(next){
            updates++
            element.textContent=next.name
            if(adoptDuringUpdate)external.append(element)
          }}
      }}:null
    },
  }
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  const initial={data:{text:'A{{inline-1}}B'},inline:{
    'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}},
  }}
  const fields=[{key:'text',mode:'rich-text',element:field}]
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',initial,definition,fields,context,
      {preserveSourceProjection:true})
    const original=field.querySelector('[data-inline-plugin="mention"]')
    assert(original&&original.isConnected)
    adoptDuringUpdate=true
    const next={data:initial.data,inline:{
      'inline-1':{type:'mention',dataVersion:1,data:{name:'Changed'}},
    }}
    let rejected=false
    try{
      projection.reconcileBlock('a',next,definition,fields,context)
    }catch{rejected=true}
    assert(rejected,'Hydration silently borrowed a widget from its external DOM owner')
    equal(updates,1,'The reentrant plugin callback was not exercised')
    assert(!field.contains(original),
      'Hydration attached the externally adopted widget back into author text')
    equal(projection.resolveWidgetElement(original),null,
      'A failed projection retained the reparented widget authority')
  }finally{
    projection.destroy()
    fixture.remove()
    external.remove()
  }
})


test('canonical save and replay distinguish literal inline IDs from owned occurrences', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{inline-1}}B'
  document.body.append(field)
  const initial={data:{text:'A{{inline-1}}B'},inline:{
    'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}},
  }}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  let mounts=0
  const registry={
    getInlineDefinition(type){
      return type==='mention'?{schema:{decode(value){return value}}}:null
    },
    getInlineRuntime(type){
      return type==='mention'?{create(_id,data){
        mounts++
        const element=document.createElement('span')
        element.contentEditable='false'
        element.textContent=data.name
        return {element,setReadOnly(){},destroy(){}}
      }}:null
    },
  }
  const project=new InlineProjectionRuntime({registry,ownerDocument:document})
  const fields=[{key:'text',mode:'rich-text',element:field}]
  const context={createInlineWidgetContext(){return{}}}
  try{
    project.reconcileBlock('a',initial,definition,fields,context,
      {preserveSourceProjection:true})
    const widget=field.querySelector('[data-inline-plugin="mention"]')
    assert(widget && project.resolveWidgetElement(widget)===widget)
    const literal=document.createTextNode('{{inline-1}}')
    field.append(literal)
    const saved=project.serializeBlock('a',initial,definition,fields,initial.data)
    const html=saved.data.text
    equal(scanRichTextPlaceholders(html,saved.inline,document).occurrences.get('inline-1'),1,
      'A user-typed literal reference was mistaken for a second canonical widget')
    assert(html.includes('oe-inline-literal'),
      'Canonical HTML lacks a reversible literal-token distinction')
    equal(getRichTextLogicalLength(html,saved.inline,document),1+1+1+12,
      'A literal token incorrectly acquired atomic widget length')
    equal(normalizeRichText(html,document),html,
      'Literal-token representation is unstable under canonical sanitization')

    project.reconcileBlock('a',{data:{text:html},inline:saved.inline},
      definition,fields,context)
    const replay=field.querySelectorAll('[data-inline-plugin="mention"]')
    equal(replay.length,1,'Undo/replay created a duplicate widget from a literal token')
    assert(replay[0].isConnected && project.resolveWidgetElement(replay[0])===replay[0],
      'Replayed canonical occurrence lost its owned DOM')
    const remaining=field.querySelector('.oe-inline-literal')
    assert(remaining && remaining.textContent==='{{inline-1}}',
      'Literal reference characters were lost on canonical replay')
  }finally{
    project.destroy()
    field.remove()
  }
})


test('canonical literal inline markers remain plain text through transforms and read-only rendering', () => {
  const ref='{{inline-1}}'
  const literal='<span class="oe-inline-literal">{{inline-1}}</span>'
  const inline={'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}}
  const html='A'+ref+'B'+literal
  const scan=scanRichTextPlaceholders(html,inline,document)
  equal(scan.occurrences.get('inline-1'),1,
    'Literal marker counted as another owned canonical reference')
  assert(scan.literals.has('inline-1'),'Literal marker was not reserved as author text')
  equal(getRichTextLogicalLength(html,inline,document),15,
    'Literal marker incorrectly consumed one widget caret unit')
  equal(replaceRichTextReference(html,inline,'inline-1',''), 'AB'+literal,
    'Removing an inline widget also deleted the author literal')
  const moved=remapRichTextReferences(html,inline,new Map([['inline-1','remapped']]),document)
  equal(moved,'A{{remapped}}B'+literal,
    'Inline ID remapping modified literal author text')

  const inserted=replaceRichTextRange('A'+ref+'B',inline,{start:3,end:3},
    {kind:'text',text:ref},document)
  equal(inserted,'A'+ref+'B'+literal,
    'Inserting a literal token acquired the existing inline widget ID')
  const pasted=replaceRichTextRange('A'+ref+'B',inline,{start:3,end:3},
    {kind:'html',html:'<b>'+ref+'</b>'},document)
  equal(pasted,'A'+ref+'B<b>'+literal+'</b>',
    'Pasted literal placeholder text was interpreted as a widget reference')

  const template=document.createElement('template')
  template.innerHTML=html
  const rendered=renderInlineWidgets(template.content,inline,
    new Map([['mention',{schema:{decode(value){return value}},
      render(_id,data){
        const span=document.createElement('span')
        span.className='rendered-mention'
        span.textContent=data.name
        return span
      }}]]),document)
  equal(rendered.querySelectorAll('.rendered-mention').length,1,
    'Renderer projected a literal token as a second widget')
  equal(rendered.querySelector('.oe-inline-literal')?.textContent,ref,
    'Renderer erased the authored literal marker')
})


test('canonical serializer protects a literal token split across adjacent author Text nodes', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{inline-1}}B'
  document.body.append(field)
  const inline={'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}}
  const record={data:{text:'A{{inline-1}}B'},inline}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const registry={
    getInlineDefinition(type){return type==='mention'?{
      schema:{decode(value){return value}},
    }:null},
    getInlineRuntime(type){return type==='mention'?{create(_id,data){
      const element=document.createElement('span')
      element.textContent=data.name
      return {element,setReadOnly(){},destroy(){}}
    }}:null},
  }
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  const fields=[{key:'text',mode:'rich-text',element:field}]
  try{
    projection.reconcileBlock('a',record,definition,fields,
      {createInlineWidgetContext(){return{}}},
      {preserveSourceProjection:true})
    const owned=field.querySelector('[data-inline-plugin="mention"]')
    assert(owned&&owned.isConnected)
    const first=document.createTextNode('{{inline-')
    const second=document.createTextNode('1}}')
    field.append(first,second)
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    assert(saved.data.text.includes('oe-inline-literal'),
      'Adjacent author Text leaves were joined into a second widget reference')
    equal(scanRichTextPlaceholders(saved.data.text,saved.inline,document).occurrences.get('inline-1'),1)
    assert(first.isConnected && second.isConnected && first.nextSibling===second,
      'Serialization normalized the live editor Text nodes instead of its detached copy')
  }finally{
    projection.destroy()
    field.remove()
  }
})


test('serializing a literal inline ID split between adjacent formatting wrappers is unambiguous', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{inline-1}}B'
  document.body.append(field)
  const inline={'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}}
  const record={data:{text:'A{{inline-1}}B'},inline}
  const definition={schema:{mapRichText(data,visit){return {...data,text:visit(data.text,'text')}}}}
  const registry={
    getInlineDefinition(type){return type==='mention'?{schema:{decode(value){return value}}}:null},
    getInlineRuntime(type){return type==='mention'?{create(_id,data){
      const element=document.createElement('span')
      element.textContent=data.name
      return {element,setReadOnly(){},destroy(){}}
    }}:null},
  }
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  const fields=[{key:'text',mode:'rich-text',element:field}]
  try{
    projection.reconcileBlock('a',record,definition,fields,
      {createInlineWidgetContext(){return{}}},
      {preserveSourceProjection:true})
    const owned=field.querySelector('[data-inline-plugin="mention"]')
    assert(owned && owned.isConnected)
    // The canonicalizer merges adjacent <b> elements, including <strong>
    // after its standard tag replacement. It must not merge literal text
    // into a second reference with an already-owned inline sidecar ID.
    const first=document.createElement('strong')
    first.textContent='{{inline-'
    const second=document.createElement('b')
    second.textContent='1}}'
    field.append(first,second)
    const html=projection.serializeBlock('a',record,definition,fields,record.data).data.text
    equal(scanRichTextPlaceholders(html,inline,document).occurrences.get('inline-1'),1,
      'Canonical merge created another inline widget reference from formatted literal text')
    assert(html.includes('oe-inline-literal'),
      'Formatted literal text has no persisted ownership boundary')
    assert(first.isConnected && second.isConnected && first.nextSibling===second,
      'Serialization changed live author formatting DOM instead of its clone')
    // Sanitization can also unwrap a forbidden element and concatenate its
    // child text with the next author Text leaf into an owned-looking token.
    const unknown=document.createElement('unapproved-inline')
    unknown.textContent='{{inline-'
    const continuation=document.createTextNode('1}}')
    field.append(unknown,continuation)
    const afterSanitize=projection.serializeBlock('a',record,definition,fields,record.data).data.text
    equal(scanRichTextPlaceholders(afterSanitize,inline,document).occurrences.get('inline-1'),1,
      'Sanitizer unwrapping generated an extra inline reference')
    equal((afterSanitize.match(/class="oe-inline-literal"/g)??[]).length,2,
      'Both formatted and unwrapped literal tokens must remain independently marked')
    assert(unknown.isConnected&&unknown.nextSibling===continuation,
      'Serializer mutated the live DOM while sanitizing a clone')
    projection.reconcileBlock('a',{data:{text:html},inline},definition,fields,
      {createInlineWidgetContext(){return{}}})
    equal(field.querySelectorAll('[data-inline-plugin="mention"]').length,1,
      'Replay mounted another widget from the formatted literal')
    assert(field.querySelector('.oe-inline-literal')?.textContent==='{{inline-1}}',
      'Replay did not restore the complete formatted author literal')
  }finally{
    projection.destroy()
    field.remove()
  }
})


test('typing the end of a literal inline ID cannot create a new owned reference', () => {
  const inline={'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}}
  const source='A{{inline-1}}B{{inline-'
  const pos=getRichTextLogicalLength(source,inline,document)
  const result=replaceRichTextRange(source,inline,{start:pos,end:pos},
    {kind:'text',text:'1}}'},document)
  equal(scanRichTextPlaceholders(result,inline,document).occurrences.get('inline-1'),1,
    'Completing an author-typed literal token created a second inline occurrence')
  assert(result.includes('<span class="oe-inline-literal">{{inline-1}}</span>'),
    'The complete user-typed literal was not protected after text insertion')
  equal(getRichTextLogicalLength(result,inline,document),15,
    'A just-completed literal token was counted as an atomic inline widget')
})


test('multi-field save protects a literal ID owned by a widget in a sibling rich-text field', () => {
  const first=document.createElement('div')
  const second=document.createElement('div')
  first.contentEditable='true'
  second.contentEditable='true'
  first.textContent='Question '
  second.textContent='Answer {{inline-1}}'
  document.body.append(first,second)
  const record={
    data:{question:'Question ',answer:'Answer {{inline-1}}'},
    inline:{'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,question:visit(data.question,'question'),answer:visit(data.answer,'answer')}
  }}}
  const registry={
    getInlineDefinition(type){return type==='mention'?{schema:{decode(value){return value}}}:null},
    getInlineRuntime(type){return type==='mention'?{create(_id,data){
      const element=document.createElement('span')
      element.textContent=data.name
      return {element,setReadOnly(){},destroy(){}}
    }}:null},
  }
  const fields=[
    {key:'question',mode:'rich-text',element:first},
    {key:'answer',mode:'rich-text',element:second},
  ]
  const projection=new InlineProjectionRuntime({registry,ownerDocument:document})
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    const widget=second.querySelector('[data-inline-plugin="mention"]')
    assert(widget&&projection.resolveWidgetElement(widget)===widget)
    const literal=document.createTextNode('{{inline-1}}')
    first.append(literal)
    // A subsequent source reconciliation may run before Save. A matching
    // typed literal in Question must not steal the widget owned by Answer.
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    assert(second.contains(widget)&&projection.resolveWidgetElement(widget)===widget,
      'Source reconciliation moved the existing widget into the sibling field')
    assert(literal.isConnected&&literal.parentNode===first,
      'The sibling typed literal was consumed as a second widget')
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(saved.data.question,
      'Question <span class="oe-inline-literal">{{inline-1}}</span>',
      'A literal typed in another field collided with the shared block inline ID')
    equal(scanRichTextPlaceholders(saved.data.question,saved.inline,document).occurrences.size,0,
      'A sibling field received a false inline reference')
    equal(scanRichTextPlaceholders(saved.data.answer,saved.inline,document).occurrences.get('inline-1'),1,
      'The actual widget reference was lost from its owning field')
    const reversed=projection.serializeBlock('a',record,definition,
      [...fields].reverse(),record.data)
    equal(reversed.data.question,saved.data.question,
      'Reversing field order consumed the block-wide inline ID set too early')
    equal(reversed.data.answer,saved.data.answer,
      'Changing field order altered the canonical widget reference')
    assert(first.lastChild===literal,
      'Serialization rewrote the real author DOM instead of its detached clone')

    projection.reconcileBlock('a',{data:saved.data,inline:saved.inline},
      definition,fields,context)
    equal(first.querySelector('.oe-inline-literal')?.textContent,'{{inline-1}}')
    const replayWidget=second.querySelector('[data-inline-plugin="mention"]')
    assert(replayWidget&&projection.resolveWidgetElement(replayWidget)===replayWidget,
      'Replay of a composite block lost its only inline widget')
  }finally{
    projection.destroy()
    first.remove()
    second.remove()
  }
})


test('source reconciliation keeps an opaque inline occurrence in its canonical sibling field', () => {
  const first=document.createElement('div')
  const second=document.createElement('div')
  first.contentEditable='true'
  second.contentEditable='true'
  first.textContent='Question '
  second.textContent='Answer {{opaque-1}}'
  document.body.append(first,second)
  const record={
    data:{question:'Question ',answer:'Answer {{opaque-1}}'},
    inline:{'opaque-1':{type:'unavailable',dataVersion:7,data:{keep:true}}},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,question:visit(data.question,'question'),answer:visit(data.answer,'answer')}
  }}}
  const fields=[
    {key:'question',mode:'rich-text',element:first},
    {key:'answer',mode:'rich-text',element:second},
  ]
  const projection=new InlineProjectionRuntime({
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
    ownerDocument:document,
  })
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    const atom=second.querySelector('[data-oe-opaque-inline]')
    assert(atom&&atom.textContent==='{{opaque-1}}')
    const literal=document.createTextNode('{{opaque-1}}')
    first.append(literal)
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    assert(atom.isConnected&&atom.parentNode===second,
      'Unknown inline reference was moved out of its canonical field')
    assert(literal.isConnected&&literal.parentNode===first,
      'Typed literal acquired an unknown extension ID')
    equal(getTextLength(second),8, 'Opaque reference lost its atomic text length')
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(saved.data.question,
      'Question <span class="oe-inline-literal">{{opaque-1}}</span>')
    equal(saved.data.answer,'Answer {{opaque-1}}')
    equal(saved.inline,record.inline)
  }finally{
    projection.destroy()
    first.remove()
    second.remove()
  }
})

test('unloaded inline extension remains an opaque reference when saving an active rich-text field', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='Before {{opaque-1}} after'
  document.body.append(field)
  const payload={type:'unloaded-extension',dataVersion:1,data:{original:{id:17}}}
  const record={
    data:{text:'Before {{opaque-1}} after'},
    inline:{'opaque-1':payload},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const projection=new InlineProjectionRuntime({
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
    ownerDocument:document,
  })
  const fields=[{key:'text',mode:'rich-text',element:field}]
  try{
    projection.reconcileBlock('b',record,definition,fields,
      {createInlineWidgetContext(){return{}}},
      {preserveSourceProjection:true})
    equal(field.textContent,'Before {{opaque-1}} after',
      'An unloaded inline widget was replaced or hidden at projection time')
    const saved=projection.serializeBlock('b',record,definition,fields,record.data)
    equal(saved.data.text,'Before {{opaque-1}} after',
      'Opaque inline reference was misclassified as a new authored literal')
    equal(saved.inline,record.inline,
      'Opaque unloaded extension sidecar payload was not preserved')
    equal(scanRichTextPlaceholders(saved.data.text,saved.inline,document).occurrences.get('opaque-1'),1,
      'Serialized unknown inline type lost its one canonical reference')
  }finally{
    projection.destroy()
    field.remove()
  }
})


test('unloaded inline references occupy one inert caret unit and survive replay', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{opaque-1}}B'
  document.body.append(field)
  const record={data:{text:'A{{opaque-1}}B'},inline:{
    'opaque-1':{type:'not-installed',dataVersion:7,data:{secret:{value:'kept'}}},
  }}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const projection=new InlineProjectionRuntime({
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
    ownerDocument:document,
  })
  const fields=[{key:'text',mode:'rich-text',element:field}]
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',record,definition,fields,context,
      {preserveSourceProjection:true})
    equal(field.textContent,'A{{opaque-1}}B',
      'Opaque placeholder changed its visible text')
    equal(getTextLength(field),3,
      'Opaque canonical inline reference does not occupy one logical caret unit')
    const placeholder=field.querySelector('[data-oe-opaque-inline]')
    assert(placeholder&&placeholder.textContent==='{{opaque-1}}',
      'The unknown inline reference lacks an inert owned DOM boundary')
    assert(!placeholder.isContentEditable,'An opaque inline reference was made editable')
    equal(projection.resolveWidgetElement(placeholder),null,
      'Unknown inline type received live plugin runtime ownership')
    equal(projection.resolveWidgetInputTarget({
      isCollapsed:true,anchorNode:placeholder.firstChild,anchorOffset:2,
    },'insertText'),null,'Unknown type received plugin editing authority')
    equal(projection.captureNativeField('a','text',field)?.occurrences.length,0,
      'Unknown type was offered to the native plugin edit bridge')
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(saved.data.text,record.data.text)
    equal(saved.inline,record.inline)

    // A second author-typed token must not impersonate that canonical ref.
    const literal=document.createTextNode('{{opaque-1}}')
    field.append(literal)
    const collision=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(collision.data.text,
      'A{{opaque-1}}B<span class="oe-inline-literal">{{opaque-1}}</span>')
    equal(scanRichTextPlaceholders(collision.data.text,collision.inline,document)
      .occurrences.get('opaque-1'),1)

    // The canonical widget was removed, not the separately typed author
    // literal. Source preservation must retire only the owned atom.
    projection.reconcileBlock('a',{data:{
      text:'AB<span class="oe-inline-literal">{{opaque-1}}</span>',
    },inline:{}},definition,fields,context,{preserveSourceProjection:true})
    assert(!placeholder.isConnected,'A canonically removed opaque inline retained its DOM')
    equal(field.textContent,'AB{{opaque-1}}')

    projection.reconcileBlock('a',record,definition,fields,context)
    const recovered=field.querySelector('[data-oe-opaque-inline]')
    assert(recovered&&recovered!==placeholder,'Undo reused a retired opaque reference')
    equal(getTextLength(field),3)
    equal(projection.serializeBlock('a',record,definition,fields,record.data).data.text,
      record.data.text)

    // A placeholder-shaped author string without a sidecar remains ordinary
    // UTF-16 text, not an inert or registered widget.
    const unowned={data:{text:'A{{ghost}}B'},inline:{}}
    projection.reconcileBlock('a',unowned,definition,fields,context)
    equal(field.textContent,'A{{ghost}}B')
    equal(getTextLength(field),11)
    assert(!field.querySelector('[data-oe-opaque-inline]'),
      'Unowned placeholder-shaped text was given inline ownership')
  }finally{
    projection.destroy()
    field.remove()
  }
})


test('source projection gives only one opaque atom to duplicate raw inline-looking tokens', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{opaque-1}}B{{opaque-1}}'
  document.body.append(field)
  const canonical={
    data:{text:'A{{opaque-1}}B'},
    inline:{'opaque-1':{type:'not-installed',dataVersion:7,data:{keep:'yes'}}},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const projection=new InlineProjectionRuntime({
    ownerDocument:document,
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
  })
  const fields=[{key:'text',mode:'rich-text',element:field}]
  const context={createInlineWidgetContext(){return{}}}
  try{
    projection.reconcileBlock('a',canonical,definition,fields,context,
      {preserveSourceProjection:true})
    equal(field.querySelectorAll('[data-oe-opaque-inline]').length,1,
      'Duplicate raw token received multiple opaque inline instances')
    equal(field.textContent,'A{{opaque-1}}B{{opaque-1}}')
    equal(getTextLength(field),15,
      'Duplicate opaque marker consumed a second atomic caret unit')
    const saved=projection.serializeBlock('a',canonical,definition,fields,canonical.data)
    equal(saved.data.text,
      'A{{opaque-1}}B<span class="oe-inline-literal">{{opaque-1}}</span>',
      'Saving a duplicate literal dropped text or forged a canonical inline reference')
    equal(saved.inline,canonical.inline)
    equal(scanRichTextPlaceholders(saved.data.text,saved.inline,document)
      .occurrences.get('opaque-1'),1)
  }finally{
    projection.destroy()
    field.remove()
  }
})


test('source hydration never mounts duplicate installed widgets from an authored literal', () => {
  const field=document.createElement('div')
  field.contentEditable='true'
  field.textContent='A{{inline-1}}B{{inline-1}}'
  document.body.append(field)
  let mounts=0
  const record={
    data:{text:'A{{inline-1}}B'},
    inline:{'inline-1':{type:'mention',dataVersion:1,data:{name:'Ada'}}},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const registry={
    getInlineDefinition(type){
      return type==='mention'?{schema:{decode(value){return value}}}:null
    },
    getInlineRuntime(type){
      return type==='mention'?{create(_id,data){
        mounts++
        const element=document.createElement('span')
        element.textContent=data.name
        return {element,setReadOnly(){},destroy(){}}
      }}:null
    },
  }
  const projection=new InlineProjectionRuntime({ownerDocument:document,registry})
  const fields=[{key:'text',mode:'rich-text',element:field}]
  try{
    projection.reconcileBlock('a',record,definition,fields,
      {createInlineWidgetContext(){return{}}},{preserveSourceProjection:true})
    const widgets=field.querySelectorAll('[data-inline-plugin="mention"]')
    equal(widgets.length,1,
      'One canonical inline reference created multiple mounted widget instances')
    equal(mounts,1,'Duplicate raw source token mounted a second plugin instance')
    assert(projection.resolveWidgetElement(widgets[0])===widgets[0])
    equal(field.textContent,'AAdaB{{inline-1}}')
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(saved.data.text,
      'A{{inline-1}}B<span class="oe-inline-literal">{{inline-1}}</span>')
    equal(scanRichTextPlaceholders(saved.data.text,saved.inline,document)
      .occurrences.get('inline-1'),1)
    equal(saved.inline,record.inline)
  }finally{
    projection.destroy()
    field.remove()
  }
})

test('visible authored literal cannot borrow inline ID from an unmounted hidden rich field', () => {
  const visible=document.createElement('div')
  visible.contentEditable='true'
  visible.textContent='Visible '
  document.body.append(visible)
  const record={
    data:{visible:'Visible ',hidden:'Hidden {{hidden-1}}'},
    inline:{'hidden-1':{type:'not-installed',dataVersion:7,data:{original:'kept'}}},
  }
  const definition={schema:{mapRichText(data,visit){
    return {...data,visible:visit(data.visible,'visible'),
      hidden:visit(data.hidden,'hidden')}
  }}}
  const fields=[{key:'visible',mode:'rich-text',element:visible}]
  const projection=new InlineProjectionRuntime({
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
    ownerDocument:document,
  })
  try{
    projection.reconcileBlock('a',record,definition,fields,
      {createInlineWidgetContext(){return{}}},
      {preserveSourceProjection:true})
    assert(!visible.querySelector('[data-oe-opaque-inline]'),
      'An unmounted canonical inline was incorrectly projected into another field')
    const literal=document.createTextNode('{{hidden-1}}')
    visible.append(literal)
    const saved=projection.serializeBlock('a',record,definition,fields,record.data)
    equal(saved.data.visible,
      'Visible <span class="oe-inline-literal">{{hidden-1}}</span>',
      'An unmounted sibling inline ID was copied as a second canonical reference')
    equal(saved.data.hidden,record.data.hidden,
      'The hidden canonical rich-text source was overwritten by visible DOM')
    equal(saved.inline,record.inline,
      'An unknown inline payload from the hidden field was discarded')
    const visibleScan=scanRichTextPlaceholders(saved.data.visible,saved.inline,document)
    const hiddenScan=scanRichTextPlaceholders(saved.data.hidden,saved.inline,document)
    equal(visibleScan.occurrences.get('hidden-1'),undefined,
      'Visible literal was incorrectly counted as a hidden inline occurrence')
    equal(hiddenScan.occurrences.get('hidden-1'),1)
    assert(literal.isConnected&&visible.lastChild===literal,
      'Serialization rewrote the live author text rather than a detached clone')
  }finally{
    projection.destroy()
    visible.remove()
  }
})


test('opaque inline candidate discard, rollback and replacement revoke only their own DOM leases', () => {
  const original=document.createElement('div')
  original.contentEditable='true'
  original.textContent='A{{opaque-1}}B'
  document.body.append(original)
  const record={data:{text:'A{{opaque-1}}B'},inline:{
    'opaque-1':{type:'not-installed',dataVersion:7,data:{secret:'retained'}},
  }}
  const nextRecord={...record,data:{text:'C{{opaque-1}}D'}}
  const definition={schema:{mapRichText(data,visit){
    return {...data,text:visit(data.text,'text')}
  }}}
  const projection=new InlineProjectionRuntime({
    ownerDocument:document,
    registry:{getInlineDefinition(){return null},getInlineRuntime(){return null}},
  })
  const field=element=>[{key:'text',mode:'rich-text',element}]
  const context={createInlineWidgetContext(){return{}}}
  const candidates=[]
  try{
    projection.reconcileBlock('a',record,definition,field(original),context,
      {preserveSourceProjection:true})
    const old=original.querySelector('[data-oe-opaque-inline]')
    assert(old&&old.isConnected&&getTextLength(original)===3)

    const discarded=document.createElement('div')
    discarded.contentEditable='true'
    candidates.push(discarded)
    const abandoned=projection.prepareBlock('a',nextRecord,definition,
      field(discarded),context,1)
    const abandonedAtom=discarded.querySelector('[data-oe-opaque-inline]')
    assert(abandonedAtom&&!abandonedAtom.isConnected)
    abandoned.discard()
    assert(!discarded.contains(abandonedAtom),
      'Discard retained the staged opaque reference DOM')
    assert(old.isConnected&&getTextLength(original)===3,
      'Discard retired the unchanged committed opaque occurrence')

    const rolledBack=document.createElement('div')
    rolledBack.contentEditable='true'
    candidates.push(rolledBack)
    const rollback=projection.prepareBlock('a',nextRecord,definition,
      field(rolledBack),context,2)
    const rolledBackAtom=rolledBack.querySelector('[data-oe-opaque-inline]')
    rollback.apply()
    rollback.recover()
    assert(!rolledBack.contains(rolledBackAtom),
      'Rollback kept an unpublished opaque candidate')
    assert(old.isConnected&&getTextLength(original)===3,
      'Rollback retired the previous committed opaque occurrence')
    equal(projection.serializeBlock('a',record,definition,
      field(original),record.data).data.text,record.data.text)

    const replacement=document.createElement('div')
    replacement.contentEditable='true'
    candidates.push(replacement)
    const prepared=projection.prepareBlock('a',nextRecord,definition,
      field(replacement),context,3)
    const current=replacement.querySelector('[data-oe-opaque-inline]')
    assert(current&&current!==old)
    prepared.apply()
    document.body.append(replacement)
    prepared.finalize()
    assert(!old.isConnected,
      'Finalizing a successor left its predecessor opaque DOM active')
    assert(current.isConnected&&getTextLength(replacement)===3,
      'The committed successor lacks its atomic opaque inline reference')
    equal(projection.serializeBlock('a',nextRecord,definition,
      field(replacement),nextRecord.data).data.text,nextRecord.data.text)

    projection.destroyBlock('a')
    assert(!current.isConnected,
      'Retiring the block did not release its opaque reference')
  }finally{
    projection.destroy()
    for(const candidate of candidates)candidate.remove()
    original.remove()
  }
})

await run()
