import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../core/ClipboardFragment.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, pointAt } from './native-input-helpers.js'

async function convert(editor,type,menuKind){
 const root=editorRoot(editor)
 if(menuKind==='inline'){
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="'+type+'"]'))
 }else{
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const menu=root.querySelector('.oe-settings-menu')
  const command=[...menu.querySelectorAll('[role=menuitem]')].find(item=>item.querySelector('[class$="__label"]')?.textContent==='Преобразовать в')
  assert(command,'Conversion menu is missing')
  await clickNative(command)
  await clickNative(menu.querySelector('[data-plugin-type="'+type+'"]'))
 }
 await pause(260)
}
function source(){
 return make([para('a','A<b>lpha</b>'),para('b','Bravo &amp; Co')],{
  injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()],inlineTools:createDefaultInlineTools(),
 })
}
for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
test('native cut uses the retained converted interval despite the collapsed end caret'+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source()
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 await convert(editor,'heading',menuKind)
 const converted=editor.save().blocks, root=editorRoot(editor)
 equal(converted.map(block=>[block.type,block.data.text]),[['paragraph','A<b>l</b>'],['heading','<b>pha</b>'],['heading','Bra'],['paragraph','vo &amp; Co']])
 let copied=null
 root.addEventListener('cut',event=>{
  assert(event.isTrusted,'Cut was synthesized')
  copied=JSON.parse(event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME))
 },{once:true})
 await dispatchKey('x','KeyX',88,2)
 assert(copied,'Collapsed conversion caret suppressed the native clipboard event')
 equal(copied.parts.map(part=>part.block?.data?.text??part.html),['<b>pha</b>','Bra'],'Cut copied only the last field')
 const cut=editor.save().blocks
 equal(cut.map(block=>block.type),['paragraph','heading','paragraph'])
 equal(cut[0].data.text,'A<b>l</b>');equal(cut[2].data.text,'vo &amp; Co')
 equal(editableField(editor,cut[1].id).textContent,'','Cut did not remove the entire converted range')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,converted)
 assert(root.classList.contains('oe-editor--cross-selecting'),'Undo lost the logical interval')
 const last=editableField(editor,converted[2].id),native=window.getSelection()
 assert(native.isCollapsed&&document.activeElement===last,'Undo lost the conversion end caret')
 equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3)
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,cut)
})

}

for(const activation of ['Enter',' '])for(const backwards of [false,true]){
test('native keyboard menu opening after a cancelled Add gesture uses the current local selection'+' / '+activation+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),root=editorRoot(editor)
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 const add=root.querySelector('.oe-toolbar__btn:not(.oe-toolbar__drag)'),rect=add.getBoundingClientRect()
 let pressed=false
 add.addEventListener('mousedown',event=>{assert(event.isTrusted);pressed=true},{once:true})
 await window.__testInput('Input.drag',{from:{x:rect.left+rect.width/2,y:rect.top+rect.height/2},to:{x:rect.left-80,y:rect.top+rect.height/2}})
 assert(pressed,'Cancelled gesture missed Add')
 assert(!root.querySelector('.oe-toolbox').checkVisibility(),'Cancelled gesture activated Add')
 await pause(30)
 // Start outside the previous native range, so Chrome selects text rather than dragging it.
 const field=editableField(editor,'b'),from=pointAt(field,4),to=pointAt(field,5)
 assert(field.contains(document.elementFromPoint(from.clientX,from.clientY)),'Local gesture hit '+document.elementFromPoint(from.clientX,from.clientY)?.outerHTML?.slice(0,240))
 await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
 await pause(30)
 equal(window.getSelection().toString(),'o')
 const tune=root.querySelector('.oe-toolbar__drag')
 tune.focus()
 await dispatchKey(activation,activation==='Enter'?'Enter':'Space',activation==='Enter'?13:32)
 const menu=root.querySelector('.oe-settings-menu')
 assert(menu.checkVisibility(),'Keyboard did not open Tune')
 const command=[...menu.querySelectorAll('[role=menuitem]')].find(item=>item.querySelector('[class$="__label"]')?.textContent==='Преобразовать в')
 await clickNative(command)
 await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
 await pause(260)
 equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','A<b>lpha</b>'],['paragraph','Brav'],['heading','o'],['paragraph',' &amp; Co']],'Menu reused the old cross-block range after the gesture was cancelled')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks.map(block=>block.data.text),['A<b>lpha</b>','Bravo &amp; Co'])
 equal(editor.canUndo,false)
})

}

for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
test('native copy transfers the entire retained converted range to an independent editor'+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),destination=make([para('target','')],{injectStyles:true})
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 await convert(editor,'heading',menuKind)
 const converted=editor.save().blocks
 let copied=null,received=null
 editorRoot(editor).addEventListener('copy',event=>{
  assert(event.isTrusted)
  copied=event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
 },{once:true})
 await dispatchKey('c','KeyC',67,2)
 assert(copied,'Retained interval did not reach the system clipboard')
 equal(editor.save().blocks,converted)
 assert(editorRoot(editor).classList.contains('oe-editor--cross-selecting'),'Copy revoked the source interval')
 await clickNative(editableField(destination,'target'))
 editorRoot(destination).addEventListener('paste',event=>{
  assert(event.isTrusted)
  received=event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
 },{once:true})
 await dispatchKey('v','KeyV',86,2)
 equal(received,copied,'Private fragment did not survive the native clipboard')
 equal(destination.save().blocks.map(block=>block.data.text),['<b>pha</b>','Bra'],'Paste used only the collapsed end caret')
 const pasted=destination.save().blocks
 await dispatchKey('z','KeyZ',90,2)
 equal(destination.save().blocks.map(block=>block.data.text),[''])
 equal(destination.canUndo,false,'Paste wrote more than one history entry')
 await dispatchKey('z','KeyZ',90,10)
 equal(destination.save().blocks,pasted)
})

}

for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
test('native paste replaces the retained converted interval and Undo restores it'+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const donor=make([para('donor','New')],{injectStyles:true}),editor=source()
 const donorField=editableField(donor,'donor')
 await clickNative(donorField)
 await dispatchKey('a','KeyA',65,2)
 equal(window.getSelection().toString(),'New')
 await dispatchKey('c','KeyC',67,2)
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 await convert(editor,'heading',menuKind)
 const converted=editor.save().blocks
 let trusted=false
 editorRoot(editor).addEventListener('paste',event=>{trusted=event.isTrusted},{once:true})
 await dispatchKey('v','KeyV',86,2)
 assert(trusted,'Paste was not trusted')
 const replaced=editor.save().blocks
 equal(replaced.map(block=>block.type),['paragraph','heading','paragraph'])
 equal(replaced[0].data.text,'A<b>l</b>');equal(replaced[2].data.text,'vo &amp; Co')
 equal(editableField(editor,replaced[1].id).textContent,'New','Paste inserted into the last caret instead of replacing the selected interval')
 const pasted=editor.save().blocks
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,converted)
 assert(editorRoot(editor).classList.contains('oe-editor--cross-selecting'),'Undo did not restore the replaced interval')
 await dispatchKey('z','KeyZ',90,10)
 equal(editor.save().blocks,pasted)
})

}

for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
test('native Heading level change retains the converted interval for the next formatting command'+' / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),root=editorRoot(editor)
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 await convert(editor,'heading',menuKind)
 const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id)
 await clickNative(root.querySelector('.oe-inline-toolbar__level-select'))
 await clickNative(root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]'))
 assert(editor.save().blocks.some(block=>block.type==='heading'&&block.data.level===3),'Heading level did not change')
 equal(editor.blocks.selectedIds(),ids,'Heading level control discarded the converted range')
 assert(root.classList.contains('oe-editor--cross-selecting'),'Heading level control discarded the logical highlight')
 const last=editableField(editor,ids.at(-1)),native=window.getSelection()
 assert(native.isCollapsed&&document.activeElement===last,'Level change lost the converted end caret')
 equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3)
 const changed=editor.save().blocks
 await dispatchKey('i','KeyI',73,2)
 equal(ids.map(id=>editableField(editor,id).querySelector('i,em')?.textContent),['pha','Bra'],'Formatting after a level change used only the final caret')
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,changed)
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,converted)
 assert(root.classList.contains('oe-editor--cross-selecting'),'Undo lost the converted interval')
})

}
for(const backwards of [false,true]){
 test('native Heading level Escape restores the converted interval / '+(backwards?'backward':'forward'),async()=>{
  const editor=source(),root=editorRoot(editor)
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  await convert(editor,'heading','inline')
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id)
  await clickNative(root.querySelector('.oe-inline-toolbar__level-select'))
  const item=root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]')
  item.focus()
  await dispatchKey('Escape','Escape',27)
  equal(editor.save().blocks,converted,'Escape changed Heading data')
  equal(editor.blocks.selectedIds(),ids,'Escape lost the converted interval')
  equal(root.querySelector('.oe-inline-toolbar__level-select').getAttribute('aria-expanded'),'false')
  await clickNative(root.querySelector('[data-tool="italic"]'))
  equal(ids.map(id=>editableField(editor,id).querySelector('i,em')?.textContent),['pha','Bra'])
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,converted)
 })
 test('native Heading keyboard level control retains the original cross-field direction / '+(backwards?'backward':'forward'),async()=>{
  const plugin=createHeadingPlugin(),editor=make([
   {id:'a',type:'heading',dataVersion:plugin.schema.currentVersion,data:{text:'Alpha',level:2}},
   {id:'b',type:'heading',dataVersion:plugin.schema.currentVersion,data:{text:'Bravo',level:4}},
  ],{injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),plugin],inlineTools:createDefaultInlineTools()})
  const root=editorRoot(editor),before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  root.querySelector('.oe-inline-toolbar__level-select').focus()
  await dispatchKey('ArrowDown','ArrowDown',40)
  await clickNative(root.querySelector('.oe-inline-toolbar__level-dropdown [data-level="3"]'))
  const changed=editor.save().blocks,native=window.getSelection()
  equal(changed.map(block=>block.data.level),backwards?[2,3]:[3,4])
  equal(editor.blocks.selectedIds(),['a','b'])
  equal(getTextOffset(editableField(editor,backwards?'b':'a'),native.anchorNode,native.anchorOffset),backwards?3:2)
  equal(getTextOffset(editableField(editor,backwards?'a':'b'),native.focusNode,native.focusOffset),backwards?2:3)
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before);equal(editor.canUndo,false)
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,changed)
  equal(editor.blocks.selectedIds(),['a','b'])
 })
}

await run()
