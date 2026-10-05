import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
import { getTextOffset } from '../../shared/textOffset.js'
import ru from '../../locale/ru.js'
import { test, make, para, editableField, editorRoot, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, dragAcross, printable, pointAt } from './native-input-helpers.js'

function source() {
 return make([para('a','Alpha'),para('b','Bravo')], {
  injectStyles:true, locale:ru, plugins:[createParagraphPlugin(),createHeadingPlugin()],
  inlineTools:createDefaultInlineTools(),
 })
}
async function convert(editor, menuKind) {
 const root=editorRoot(editor)
 if(menuKind==='inline') {
  await clickNative(root.querySelector('.oe-inline-toolbar__type-select'))
  await clickNative(root.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
 } else {
  await clickNative(root.querySelector('.oe-toolbar__drag'))
  const menu=root.querySelector('.oe-settings-menu')
  const command=[...menu.querySelectorAll('[role=menuitem]')].find(item=>item.querySelector('[class$="__label"]')?.textContent==='Преобразовать в')
  assert(command,'Conversion menu is missing')
  await clickNative(command)
  await clickNative(menu.querySelector('[data-plugin-type="heading"]'))
 }
 await pause(260)
 const converted=editor.save().blocks
 equal(converted.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','pha'],['heading','Bra'],['paragraph','vo']])
 return converted
}
function retained(editor,converted) {
 const ids=converted.filter(block=>block.type==='heading').map(block=>block.id)
 equal(editor.blocks.selectedIds(),ids,'Lost the converted interval')
 const native=window.getSelection(),last=editableField(editor,ids.at(-1))
 assert(native.isCollapsed && document.activeElement===last,'Lost the converted end caret: '+JSON.stringify({collapsed:native.isCollapsed,active:document.activeElement?.outerHTML?.slice(0,150)}))
 equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3)
 return ids
}
async function composition(editor, unchanged, final) {
 const events=[]
 for(const type of ['compositionstart','compositionupdate','compositionend'])editorRoot(editor).addEventListener(type,event=>{
  // CDP uses Chrome's IME engine; completion is engine-generated but marked untrusted.
  if(type!=='compositionend')assert(event.isTrusted,type+' was synthesized')
  events.push({type,data:event.data})
 })
 const couldUndo=editor.canUndo
 for(const text of ['に','日本']) {
  await window.__testInput('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Process',windowsVirtualKeyCode:229})
  await window.__testInput('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length})
  await window.__testInput('Input.dispatchKeyEvent',{type:'keyUp',key:'Process',windowsVirtualKeyCode:229})
  await pause(20)
  equal(editor.save().blocks,unchanged,'IME preedit changed authored data')
  equal(editor.canUndo,couldUndo,'IME preedit changed history')
  assert(editorRoot(editor).textContent.includes(text),'IME preedit was not displayed')
 }
 if(final)await window.__testInput('Input.insertText',{text:final})
 else await window.__testInput('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0})
 await pause(30)
 equal(events.filter(event=>event.type==='compositionstart').length,1)
 equal(events.filter(event=>event.type==='compositionend').map(event=>event.data),[final])
}
for(const menuKind of ['inline','tune'])for(const backwards of [false,true]) {
test('native IME cancellation after conversion keeps the interval, end caret and subsequent input / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),before=editor.save().blocks
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 const converted=await convert(editor,menuKind)
 retained(editor,converted)
 await composition(editor,converted,'')
 equal(editor.save().blocks,converted)
 equal(converted.map(block=>editableField(editor,block.id).textContent),['Al','pha','Bra','vo'],'Canceled preedit remained visible')
 retained(editor,converted)
 await printable('X')
 equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','X'],['paragraph','vo']],'Typing did not replace the full retained interval')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,converted)
 retained(editor,converted)
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false,'Cancellation created a history entry')
})

}
for(const menuKind of ['inline','tune'])for(const backwards of [false,true]) {
test('native Background Escape returns editing focus after conversion and typing replaces the retained interval / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),before=editor.save().blocks,root=editorRoot(editor)
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 const converted=await convert(editor,menuKind)
 await clickNative(root.querySelector('[data-tool="bgcolor"]'))
 const input=root.querySelector('.oe-color-hex')
 await clickNative(input)
 await dispatchKey('a','KeyA',65,2)
 await window.__testInput('Input.insertText',{text:'#ff0000'})
 equal(editor.save().blocks,converted,'Draft color changed authored data')
 await dispatchKey('Escape','Escape',27)
 assert(getComputedStyle(root.querySelector('.oe-color-dropdown')).display==='none','Escape did not close color picker')
 equal(editor.save().blocks,converted,'Cancel applied draft color')
 equal(editor.blocks.selectedIds(),converted.filter(block=>block.type==='heading').map(block=>block.id))
 retained(editor,converted)
 await clickNative(root.querySelector('[data-tool="bgcolor"]'))
 assert(getComputedStyle(root.querySelector('.oe-color-dropdown')).display!=='none','One click did not reopen the canceled picker')
 await clickNative(root.querySelector('.oe-color-hex'))
 await dispatchKey('Escape','Escape',27)
 retained(editor,converted)
 await printable('X')
 equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','X'],['paragraph','vo']],'Typing after Escape did not replace the retained range')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,converted)
 retained(editor,converted)
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false,'Cancel created a history entry')
})


}
for(const menuKind of ['inline','tune'])for(const backwards of [false,true])for(const [key,vk,modifiers,offset,text] of [['End',35,0,3,'BraX'],['Home',36,0,0,'XBra'],['ArrowLeft',37,0,2,'BrXa'],['ArrowRight',39,0,3,'BraX'],['End',35,2,3,'BraX'],['ArrowRight',39,2,3,'BraX']]) {
test('native '+key+' modifiers '+modifiers+' after conversion dismisses the retained interval / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),before=editor.save().blocks
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
 const converted=await convert(editor,menuKind),ids=retained(editor,converted)
 await dispatchKey(key,key,vk,modifiers)
 equal(editor.save().blocks,converted,'Moving the caret edited data')
 await printable('X')
 equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','pha'],['heading',text],['paragraph','vo']],'Explicit caret movement still replaced the old converted interval')
 equal(editor.blocks.selectedIds(),[])
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,converted)
 const native=window.getSelection(),field=editableField(editor,ids.at(-1))
 assert(native.isCollapsed && document.activeElement===field)
 equal(getTextOffset(field,native.anchorNode,native.anchorOffset),offset)
 equal(editor.blocks.selectedIds(),[],'Undo reactivated the explicitly dismissed interval')
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before)
 equal(editor.canUndo,false,'Caret movement added history')
})

}

for(const menuKind of ['inline','tune'])for(const backwards of [false,true]) {
 const suffix=menuKind+' / '+(backwards?'backward':'forward')
 test('native IME confirmation after conversion replaces the complete interval once / '+suffix,async()=>{
  const editor=source(),before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  const converted=await convert(editor,menuKind)
  await composition(editor,converted,'日本')
  equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','日本'],['paragraph','vo']])
  const after=editor.save().blocks
  const field=editableField(editor,1),native=window.getSelection()
  assert(native.isCollapsed && document.activeElement===field)
  equal(getTextOffset(field,native.anchorNode,native.anchorOffset),2)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,converted)
  retained(editor,converted)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before)
  equal(editor.canUndo,false,'IME created extra history')
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,converted)
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
 })
 for(const [operation,key,code,vk,modifiers,texts] of [
  ['typing','X','KeyX',88,0,['Al','X','vo']],
  ['Backspace','Backspace','Backspace',8,0,['Al','','vo']],
  ['Delete','Delete','Delete',46,0,['Al','','vo']],
  ['word delete','Delete','Delete',46,2,['Al','','vo']],
  ['Enter','Enter','Enter',13,0,['Al','','','vo']],
  ['Shift Enter','Enter','Enter',13,8,['Al','<br>','vo']],
 ])test('native '+operation+' after conversion edits only the retained interval / '+suffix,async()=>{
  const editor=source(),before=editor.save().blocks
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards)
  const converted=await convert(editor,menuKind)
  if(operation==='typing')await printable('X')
  else await dispatchKey(key,code,vk,modifiers)
  equal(editor.save().blocks.map(block=>block.data.text),texts,'Gesture left selected text or damaged unselected edges')
  equal(editor.blocks.selectedIds(),[])
  const after=editor.save().blocks
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,converted)
  retained(editor,converted)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before);equal(editor.canUndo,false)
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,converted)
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after)
 })
}


for(const backwards of [false,true])for(const cross of [false,true])test('native Background Escape preserves '+(cross?'cross-field':'local partial')+' direction and the next Undo / '+(backwards?'backward':'forward'),async()=>{
 const editor=source(),root=editorRoot(editor),before=editor.save().blocks
 const first=editableField(editor,'a'),last=cross?editableField(editor,'b'):first
 if(cross)await dragAcross(editor,first,2,last,3,backwards)
 else {
  await clickNative(first)
  const from=pointAt(first,backwards?4:1),to=pointAt(first,backwards?1:4)
  await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
  await pause(30);equal(window.getSelection().toString(),'lph')
 }
 await clickNative(root.querySelector('[data-tool="bgcolor"]'))
 await clickNative(root.querySelector('.oe-color-hex'))
 await dispatchKey('Escape','Escape',27)
 equal(editor.save().blocks,before)
 equal(document.activeElement,backwards&&cross?last:first,'Cancel did not restore editing focus')
 const native=window.getSelection(),anchor=backwards?last:first,focus=backwards?first:last
 equal(getTextOffset(anchor,native.anchorNode,native.anchorOffset),backwards?(cross?3:4):(cross?2:1))
 equal(getTextOffset(focus,native.focusNode,native.focusOffset),backwards?(cross?2:1):(cross?3:4))
 await printable('X')
 equal(editor.save().blocks.map(block=>block.data.text),cross?['AlXvo']:['AXa','Bravo'])
 await dispatchKey('z','KeyZ',90,2)
 equal(editor.save().blocks,before);equal(editor.canUndo,false)
 const restored=window.getSelection(),restoredFirst=editableField(editor,'a'),restoredLast=cross?editableField(editor,'b'):restoredFirst
 const restoredAnchor=backwards?restoredLast:restoredFirst,restoredFocus=backwards?restoredFirst:restoredLast
 equal(getTextOffset(restoredAnchor,restored.anchorNode,restored.anchorOffset),backwards?(cross?3:4):(cross?2:1))
 equal(getTextOffset(restoredFocus,restored.focusNode,restored.focusOffset),backwards?(cross?2:1):(cross?3:4))
})
test('mounted inline restoration cannot revive a removed document or act after read-only and destroy',async()=>{
 let controls=null
 const tool={type:'restoreProbe',title:'Restore selection',icon:'T',isActive(){return false},toggle(){},onMount(_button,context){controls=context}}
 const editor=make([para('a','Alpha')],{injectStyles:true,inlineTools:[tool]})
 const field=editableField(editor,'a')
 await clickNative(field)
 const from=pointAt(field,1),to=pointAt(field,4)
 await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
 await pause(30)
 assert(controls?.restoreSelection,'Mounted inline control did not receive selection restoration')
 assert(controls.restoreSelection(),'Current selected text cannot be restored')
 equal(window.getSelection().toString(),'lph')
 equal(editor.canUndo,false,'Selection restoration added history')
 editor.setReadOnly(true)
 equal(controls.restoreSelection(),false,'Read-only restoration took focus')
 editor.setReadOnly(false)
 editor.render({version:'2.0.0',blocks:[para('a','Successor with the same ID')]})
 equal(controls.restoreSelection(),false,'Old range acquired a same-ID successor document')
 editor.render({version:'2.0.0',blocks:[para('new','Replacement')]})
 const current=editor.save().blocks,active=document.activeElement
 equal(controls.restoreSelection(),false,'Old range revived in a replacement document')
 equal(document.activeElement,active);equal(editor.save().blocks,current)
 editor.destroy()
 equal(controls.restoreSelection(),false,'Destroyed inline control restored stale selection')
})

await run()
