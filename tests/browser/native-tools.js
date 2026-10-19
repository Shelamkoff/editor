import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import ru from '../../locale/ru.js'
import en from '../../locale/en.js'
import { createDefaultInlineTools } from '../../preset/index.js'
import { createCaseTransformTool } from '../../inline-tools/caseTransform.js'
import { createClearFormattingTool } from '../../inline-tools/clearFormatting.js'
import { createFontSizeTool } from '../../inline-tools/fontSize.js'
import { collectTextTargets, toggleTag } from '../../inline-tools/utils.js'
import { findNodeAtOffset, getTextOffset } from '../../shared/textOffset.js'
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

await run()
