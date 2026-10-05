import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, pointAt, waitForStyles } from './native-input-helpers.js'
import { pluginParityFixtures, writePath } from './plugin-parity-fixtures.js'
import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'

const richNames = ['Paragraph','Heading','List','Quote','Image','Table','Checklist','Warning','Embed','Gallery','Carousel','Toggle','Columns','Spoiler','Poll','Person']
const localOnly = location.pathname.endsWith('/native-plugin-local-ranges.html')
for (const fixture of pluginParityFixtures.filter(entry => !localOnly && richNames.includes(entry.name))) {
  const fields = fixture.fields.filter(field => !field.key.endsWith('url'))
  for (const [index, spec] of fields.entries()) {
    for (const backwards of [false,true]) {
      test(`${fixture.name} ${spec.key}: ${backwards ? 'backward' : 'forward'} cross-block conversion keeps every unselected field`, async () => {
        const definition = fixture.factory()
        const sourceData={...definition.schema.createDefault(),...fixture.data}
        if(fixture.name==='Image')sourceData.styles={width:'300px',height:'180px'}
        const editor = make([{ id:'a', type:definition.type, dataVersion:definition.schema.currentVersion, data:sourceData }, para('b','Delta')], {
          injectStyles:true,
          plugins:[createParagraphPlugin(), createHeadingPlugin(), ...(['Paragraph','Heading'].includes(fixture.name)?[]:[definition])],
        })
        await pause(150)
        const before = editor.save().blocks
        editor.blocks.focus('a',{fieldKey:spec.key,offset:'start'})
        const field = document.activeElement
        const tail = editableField(editor,'b')
        await dragAcross(editor,field,2,tail,3,backwards)
        await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-select'))
        await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
        await pause(35)
        const after = editor.save().blocks
        equal(after.map(block=>block.type),[definition.type,'heading','heading','paragraph'])
        let residual = before[0].data
        for (const [fieldIndex, item] of fields.entries()) {
          if(fieldIndex>=index) residual=writePath(residual,item.path,fieldIndex===index?item.value.slice(0,2):'')
        }
        if(['List','Checklist'].includes(fixture.name))residual={...residual,items:residual.items.filter(item=>item.text)}
        equal(after[0].data,residual,'Conversion lost or changed unselected source fields')
        equal(after.slice(1,3).map(block=>block.data.text),[fields.slice(index).map((item,offset)=>offset===0?item.value.slice(2):item.value).join('<br>'),'Del'])
        equal(after[3].data.text,'ta')
        equal(after[0].id,'a')
        await dispatchKey('z','KeyZ',90,2)
        equal(editor.save().blocks,before)
        equal(editor.canUndo,false)
        const selection=window.getSelection()
        assert(selection.anchorNode&&selection.focusNode,'Undo lost the directed range')
        sourceDirection(editor, 'a', spec.key, 2, 'b', 'text', 3, backwards)
        await dispatchKey('z','KeyZ',90,2|8)
        equal(editor.save().blocks,after)
      })
    }
  }
}

function sourceDirection(editor, firstId, firstKey, firstOffset, lastId, lastKey, lastOffset, backwards) {
  const selection=window.getSelection()
  const anchorHost=selection.anchorNode?.nodeType===1?selection.anchorNode:selection.anchorNode?.parentElement
  const focusHost=selection.focusNode?.nodeType===1?selection.focusNode:selection.focusNode?.parentElement
  const anchor=anchorHost?.closest('[contenteditable="true"]')
  const focus=focusHost?.closest('[contenteditable="true"]')
  equal(anchor?.closest('[data-block-id]')?.dataset.blockId,backwards?lastId:firstId,'Undo reversed the range anchor block')
  equal(focus?.closest('[data-block-id]')?.dataset.blockId,backwards?firstId:lastId,'Undo reversed the range focus block')
  equal(getTextOffset(anchor,selection.anchorNode,selection.anchorOffset),backwards?lastOffset:firstOffset,'Undo moved the range anchor')
  equal(getTextOffset(focus,selection.focusNode,selection.focusOffset),backwards?firstOffset:lastOffset,'Undo moved the range focus')
}

for (const fixture of pluginParityFixtures.filter(entry => !localOnly && richNames.includes(entry.name))) {
  const fields=fixture.fields.filter(field=>!field.key.endsWith('url'))
  for (const [index,spec] of fields.entries()) {
    for (const backwards of [false,true]) {
      test(`${fixture.name} ${spec.key}: ${backwards?'backward':'forward'} conversion ending in a compound field keeps its suffix`,async()=>{
        const definition=fixture.factory()
        const sourceData={...definition.schema.createDefault(),...fixture.data}
        if(fixture.name==='Image')sourceData.styles={width:'300px',height:'180px'}
        const editor=make([para('a','Delta'),{id:'b',type:definition.type,dataVersion:definition.schema.currentVersion,data:sourceData}],{injectStyles:true,plugins:[createParagraphPlugin(),createHeadingPlugin(),...(['Paragraph','Heading'].includes(fixture.name)?[]:[definition])]})
        await pause(150)
        const before=editor.save().blocks
        editor.blocks.focus('b',{fieldKey:spec.key,offset:'start'})
        await dragAcross(editor,editableField(editor,'a'),2,document.activeElement,3,backwards)
        await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-select'))
        await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
        await pause(35)
        const after=editor.save().blocks
        equal(after.map(block=>block.type),['paragraph','heading','heading',definition.type])
        equal(after[0].data.text,'De')
        equal(after.slice(1,3).map(block=>block.data.text),['lta',fields.slice(0,index+1).map((item,offset)=>offset===index?item.value.slice(0,3):item.value).join('<br>')])
        let residual=before[1].data
        for(const [fieldIndex,item] of fields.entries()) if(fieldIndex<=index)residual=writePath(residual,item.path,fieldIndex===index?item.value.slice(3):'')
        if(['List','Checklist'].includes(fixture.name))residual={...residual,items:residual.items.filter(item=>item.text)}
        equal(after[3].data,residual,'Conversion lost the compound endpoint suffix or its assets')
        equal(after[3].id,'b')
        await dispatchKey('z','KeyZ',90,2)
        equal(editor.save().blocks,before)
        equal(editor.canUndo,false)
        sourceDirection(editor,'a','text',2,'b',spec.key,3,backwards)
        await dispatchKey('z','KeyZ',90,2|8)
        equal(editor.save().blocks,after)
      })
    }
  }
}
for (const name of localOnly ? ['List', 'Checklist', 'Quote', 'Image', 'Embed', 'Gallery', 'Carousel', 'Table', 'Columns', 'Toggle', 'Spoiler', 'Warning', 'Poll', 'Person'] : []) {
  const fixture = pluginParityFixtures.find(entry => entry.name === name)
  for (const spec of fixture.fields.filter(field => !field.key.endsWith('url'))) {
  for (const backwards of [false, true]) {
    test(`${name} ${spec.key}: local partial conversion keeps one source owner and its identities ${backwards ? 'backward' : 'forward'}`, async () => {
      const definition = fixture.factory()
      const sourceData = { ...definition.schema.createDefault(), ...fixture.data }
      if (name === 'Image') sourceData.styles = { width: '300px', height: '180px' }
      const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: sourceData }], {
        injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin(), definition],
      })
      await pause(150)
      const before = editor.save().blocks
      editor.blocks.focus('a', { fieldKey: spec.key, offset: 2 })
      const field = document.activeElement
      await waitForStyles(field.ownerDocument)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const from = pointAt(field, backwards ? 4 : 2)
      const to = pointAt(field, backwards ? 2 : 4)
      await window.__testInput('Input.drag', { from: { x: from.clientX, y: from.clientY }, to: { x: to.clientX, y: to.clientY } })
      await pause(30)
      sourceDirection(editor, 'a', spec.key, 2, 'a', spec.key, 4, backwards)
      await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-select'))
      await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
      const after = editor.save().blocks
      equal(after.map(block => block.type), [definition.type, 'heading'], 'Conversion duplicated the compound source owner')
      equal(after[0], { ...before[0], data: writePath(before[0].data, spec.path, spec.value.slice(0, 2) + spec.value.slice(4)) }, 'Conversion changed unselected fields or stable identities')
      equal(after[1].data.text, spec.value.slice(2, 4))
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      sourceDirection(editor, 'a', spec.key, 2, 'a', spec.key, 4, backwards)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after)
    })
  }
  }
}
for (const fixture of pluginParityFixtures.filter(entry => localOnly && richNames.includes(entry.name))) {
  const fields = fixture.fields.filter(field => !field.key.endsWith('url'))
  if (fields.length < 2) continue
  for (const backwards of [false, true]) {
    test(`${fixture.name}: partial conversion across its own fields keeps one residual owner ${backwards ? 'backward' : 'forward'}`, async () => {
      const definition = fixture.factory()
      const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: { ...definition.schema.createDefault(), ...fixture.data } }], { injectStyles: true, plugins: [createParagraphPlugin(), createHeadingPlugin(), definition] })
      await pause(150)
      const before = editor.save().blocks
      editor.blocks.focus('a', { fieldKey: fields[0].key, offset: 2 })
      const first = document.activeElement
      editor.blocks.focus('a', { fieldKey: fields.at(-1).key, offset: 3 })
      const last = document.activeElement
      await dragAcross(editor, first, 2, last, 3, backwards)
      await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-select'))
      await clickNative(editorRoot(editor).querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
      const after = editor.save().blocks
      equal(after.map(block => block.type), [definition.type, 'heading'])
      let residual = before[0].data
      fields.forEach((field, index) => { residual = writePath(residual, field.path, index === 0 ? field.value.slice(0, 2) : index === fields.length - 1 ? field.value.slice(3) : '') })
      equal(after[0], { ...before[0], data: residual }, 'Partial multi-field conversion duplicated or changed unselected source data')
      equal(after[1].data.text, fields.map((field, index) => index === 0 ? field.value.slice(2) : index === fields.length - 1 ? field.value.slice(0, 3) : field.value).join('<br>'))
      await dispatchKey('z', 'KeyZ', 90, 2)
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
      sourceDirection(editor, 'a', fields[0].key, 2, 'a', fields.at(-1).key, 3, backwards)
      await dispatchKey('z', 'KeyZ', 90, 2 | 8)
      equal(editor.save().blocks, after)
    })
  }
}
await run()
