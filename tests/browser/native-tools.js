import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import ru from '../../locale/ru.js'
import en from '../../locale/en.js'
import { createDefaultInlineTools } from '../../preset/index.js'
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

await run()
