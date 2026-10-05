import { createColorSwatchPlugin } from '../../inline-plugins/color.js'
import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createParagraphPlugin, createListPlugin, createChecklistPlugin, createHeadingPlugin, createQuotePlugin, createCodePlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, printable, pointAt } from './native-input-helpers.js'
async function convert(editor,type,menuKind){
 const root=editorRoot(editor)
 if(menuKind==='inline'){
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="'+type+'"]'))
 }else{
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const menu=root.querySelector('.oe-settings-menu')
  const convert=[...menu.querySelectorAll('[role=menuitem]')].find(item=>item.querySelector('[class$="__label"]')?.textContent==='Преобразовать в')
  assert(convert,'Missing conversion command')
  await clickNative(convert)
  await clickNative(menu.querySelector('[data-plugin-type="'+type+'"]'))
 }
 await pause(260)
}
async function history(editor,before,after){
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before);equal(editor.canUndo,false)
 await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
}
const cases=[
 {factory:createListPlugin,data:{style:'ordered',items:[{id:'first',text:'Bravo'},{id:'second',text:'Charlie'}]}},
 {factory:createChecklistPlugin,data:{items:[{id:'first',text:'Bravo',checked:true},{id:'second',text:'Charlie',checked:false}]}},
 {factory:createHeadingPlugin,data:{text:'Bravo',level:5}},
 {factory:createQuotePlugin,data:{text:'Bravo',caption:'Author'}},
]
for(const fixture of cases)for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native matching middle owner retains its data / '+fixture.factory().type+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const plugin=fixture.factory()
  const editor=make([para('a','Alpha'),{id:'middle',type:plugin.type,dataVersion:plugin.schema.currentVersion,data:fixture.data,tunes:{textAlign:'right'}},para('b','Delta')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),plugin]})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,plugin.type,menuKind)
  const after=editor.save().blocks
  equal(after.find(block=>block.id==='middle'),before[1],'Reconversion of the same type discarded author data, field identities or settings')
  equal(after[0].data.text,'Al');equal(after.at(-1).data.text,'ta')
  await history(editor,before,after)
 })
}
for(const factory of [createListPlugin,createChecklistPlugin])for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native matching endpoint retains selected list items / '+factory().type+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const plugin=factory(),checklist=plugin.type==='checklist'
  const items=[{id:'first',text:'Bravo',...(checklist?{checked:true}:{})},{id:'second',text:'Charlie',...(checklist?{checked:false}:{})},{id:'third',text:'Delta',...(checklist?{checked:true}:{})}]
  const data={items,...(checklist?{}:{style:'ordered'})}
  const editor=make([para('a','Alpha'),{id:'b',type:plugin.type,dataVersion:plugin.schema.currentVersion,data}],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),plugin]})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b','[data-item-id="second"]'),7,backwards)
  await convert(editor,plugin.type,menuKind)
  const after=editor.save().blocks,selected=after.filter(block=>block.type===plugin.type).at(-2)
  equal(selected.data,{items:items.slice(0,2),...(checklist?{}:{style:'ordered'})},'Same-type endpoint was flattened, reset or lost item identities')
  equal(after.at(-1).data,{items:items.slice(2),...(checklist?{}:{style:'ordered'})})
  await history(editor,before,after)
 })
}

for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native text conversion retains the converted range and end caret like v1 / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','Alpha'),para('middle','Middle'),para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()],inlineTools:createDefaultInlineTools()})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,'heading',menuKind)
  const after=editor.save().blocks,converted=after.filter(block=>block.type==='heading'),root=editorRoot(editor),last=editableField(editor,converted.at(-1).id)
  assert(root.classList.contains('oe-editor--cross-selecting'),'Text conversion discarded the transformed logical range')
  equal(editor.blocks.selectedIds(),converted.map(block=>block.id))
  assert(window.getSelection().isCollapsed&&document.activeElement===last,'Conversion did not retain the v1 end caret')
  equal(getTextOffset(last,window.getSelection().anchorNode,window.getSelection().anchorOffset),3)
  assert(root.querySelector('.oe-inline-toolbar').checkVisibility(),'Converted range lost its toolbar')
  await dispatchKey('b','KeyB',66,2)
  const bold=editor.save().blocks
  equal(bold.filter(block=>block.type==='heading').map(block=>block.data.text),['<b>pha</b>','<b>Middle</b>','<b>Bra</b>'],'Formatting did not cover all converted fragments')
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,after)
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before)
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
  assert(root.classList.contains('oe-editor--cross-selecting'),'Redo did not restore the converted logical range')
 })
 test('native cross conversion joins selected text into one Code / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','A<b>lpha</b>'),{id:'b',type:'list',dataVersion:2,data:{style:'ordered',items:[{id:'first',text:'Bravo &amp; Co'},{id:'second',text:'Charlie'},{id:'third',text:'Delta'}]}}],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createListPlugin(),createCodePlugin()]})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b','[data-item-id="second"]'),7,backwards)
  await convert(editor,'code',menuKind)
  const after=editor.save().blocks
  equal(after.map(block=>block.type),['paragraph','code','list'],'Code conversion created several blocks')
  equal(after[1].data.code,'pha\nBravo & Co\nCharlie','Code did not preserve selected text, decoded entities and line breaks')
  equal(after[0].data.text,'A<b>l</b>');equal(after[2].data.items,[{id:'third',text:'Delta'}])
  assert(!editorRoot(editor).classList.contains('oe-editor--cross-selecting'))
  await history(editor,before,after)
 })
}


for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native typing replaces the retained converted range / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','Alpha'),para('middle','Middle'),para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()]})
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,'heading',menuKind)
  const converted=editor.save().blocks
  await printable('X')
  equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','X'],['paragraph','vo']],'Typing changed only the last field instead of replacing the logical range')
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,converted)
  assert(editorRoot(editor).classList.contains('oe-editor--cross-selecting'),'Undo lost the retained range')
 })
 test('native joined Code rejects selected inline-widget loss atomically / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','A{{chosen}}BC',{inline:{chosen:{type:'color',dataVersion:1,data:{value:'#ff0000'}}}}),para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createCodePlugin()],inlinePlugins:[createColorSwatchPlugin()]})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),0,editableField(editor,'b'),3,backwards)
  await convert(editor,'code',menuKind)
  equal(editor.save().blocks,before,'Failed Code conversion changed part of the selected document')
  equal(editor.canUndo,false,'Rejected conversion wrote a history entry')
 })
}
test('native joined Code retains literal source code without interpreting its markup',async()=>{
 const editor=make([para('a','Alpha'),{id:'middle',type:'code',dataVersion:1,data:{code:'<b>A</b>&amp;\nB',language:'javascript'}},para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createCodePlugin()]})
 const before=editor.save().blocks
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3)
 await convert(editor,'code','tune')
 const after=editor.save().blocks
 equal(after.map(block=>block.type),['paragraph','code','paragraph'])
 equal(after[1].data.code,'pha\n<b>A</b>&amp;\nB\nBra','Literal Code text was parsed as author markup')
 await history(editor,before,after)
})


for(const fixture of cases){
 test('native local same-type conversion is a no-op / '+fixture.factory().type,async()=>{
  const plugin=fixture.factory()
  const editor=make([{id:'a',type:plugin.type,dataVersion:plugin.schema.currentVersion,data:fixture.data},para('b','Tail')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),plugin]})
  const before=editor.save().blocks,field=editableField(editor,'a')
  await clickNative(field)
  const from=pointAt(field,1),to=pointAt(field,3)
  await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
  await pause(30)
  const selected=window.getSelection().toString()
  await convert(editor,plugin.type,'inline')
  equal(editor.save().blocks,before,'Choosing the current type split or reset its data')
  equal(editor.canUndo,false)
  equal(window.getSelection().toString(),selected,'No-op conversion lost the local selection')
 })
}


for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native repeated conversion uses the retained interval and restores its end caret on Undo / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','Alpha'),para('middle','Middle'),para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin(),createListPlugin()]})
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,'heading',menuKind)
  const first=editor.save().blocks
  await convert(editor,'list',menuKind)
  const second=editor.save().blocks
  equal(second.map(block=>[block.type,block.data.text??block.data.items.map(item=>item.text).join('<br>')]),[['paragraph','Al'],['list','pha'],['list','Middle'],['list','Bra'],['paragraph','vo']],'Second conversion ignored the retained logical range')
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,first)
  const last=editableField(editor,first.at(-2).id)
  assert(editorRoot(editor).classList.contains('oe-editor--cross-selecting'),'Undo lost the first converted range')
  assert(window.getSelection().isCollapsed&&document.activeElement===last,'Undo lost the first conversion end caret')
  equal(getTextOffset(last,window.getSelection().anchorNode,window.getSelection().anchorOffset),3)
 })
}


for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native conversion after Undo clears the retained range for a plain-text target / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','Alpha'),para('b','Bravo')],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin(),createCodePlugin()]})
  const before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,'heading',menuKind)
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before)
  // Measure the trusted click after the real Undo removal/move animations settle.
  await Promise.all(editorRoot(editor).getAnimations({subtree:true})
   .filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime))
   .map(animation=>animation.finished.catch(()=>{})))
  await convert(editor,'code',menuKind)
  const after=editor.save().blocks,root=editorRoot(editor),code=editableField(editor,after[1].id,'textarea')
  equal(after.map(block=>block.type),['paragraph','code','paragraph'])
  equal(after[1].data.code,'pha\nBra')
  assert(!root.classList.contains('oe-editor--cross-selecting'),'Plain-text conversion left the old logical highlight active')
  equal(editor.blocks.selectedIds(),[])
  assert(!root.querySelector('.oe-inline-toolbar').checkVisibility(),'Plain-text conversion left the old rich-text toolbar visible')
  assert(document.activeElement===code&&code.selectionStart===0&&code.selectionEnd===0,'Code lost its start caret')
  await history(editor,before,after)
 })
}

await run()
