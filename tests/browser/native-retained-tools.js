import { createDefaultInlineTools } from '../../inline-tools/defaults.js'
import { createParagraphPlugin, createHeadingPlugin } from '../../plugins/index.js'
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
test('native inline extension receives retained converted text instead of the collapsed caret / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
 let observed=null,activeText=null;
 const tool={type:'selectionProbe',title:'Selected text',icon:'T',
  isActive(selection){activeText=selection.text;return false},
  toggle(selection){observed={text:selection.text,rangeText:selection.range.toString(),blockIds:selection.blockIds}},
 };
 const editor=make([para('a','Alpha'),para('b','Bravo')],{
  injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()],inlineTools:[tool],
 });
 await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
 await convert(editor,'heading',menuKind);
 const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
 assert(window.getSelection().isCollapsed,'Conversion did not place the native end caret');
 await clickNative(editorRoot(editor).querySelector('[data-tool="selectionProbe"]'));
 equal(observed?.rangeText,'phaBra','Fixture lost the logical selected text');
 equal(observed?.text,'phaBra','Inline extension received empty text for a nonempty logical range');
 equal(activeText,'phaBra','Active-state context disagrees with the tool range');
 equal(observed?.blockIds,ids);
 equal(editor.save().blocks,converted,'Reading selection changed authored data');
 await dispatchKey('z','KeyZ',90,2);
 equal(editor.save().blocks.map(block=>block.data.text),['Alpha','Bravo']);
 equal(editor.canUndo,false,'Reading selection created a history entry');
});
}


for(const backwards of [false,true])for(const menuKind of ['inline','tune']){
 test('native Link panel after conversion applies only to the retained text and Undo restores it / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=source(),root=editorRoot(editor);
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
  await convert(editor,'heading',menuKind);
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
  await clickNative(root.querySelector('[data-tool="link"]'));
  const input=root.querySelector('.oe-inline-toolbar__link-input');
  assert(document.activeElement===input,'Link panel did not focus its URL input');
  await window.__testInput('Input.insertText',{text:'https://example.test/retained'});
  equal(editor.save().blocks,converted,'Link input replaced authored text before Apply');
  await dispatchKey('Enter','Enter',13);
  equal(ids.map(id=>editableField(editor,id).querySelector('a')?.textContent),['pha','Bra']);
  equal(ids.map(id=>editableField(editor,id).querySelector('a')?.getAttribute('href')),['https://example.test/retained','https://example.test/retained']);
  equal(editor.save().blocks.filter(block=>block.type==='paragraph').map(block=>block.data.text),['A<b>l</b>','vo &amp; Co'],'Link changed unselected edges');
  equal(editor.blocks.selectedIds(),ids,'Link lost the retained selection');
  const linked=editor.save().blocks;
  await dispatchKey('z','KeyZ',90,2);
  equal(editor.save().blocks,converted);
  equal(editor.blocks.selectedIds(),ids,'Undo lost the converted range');
  const native=window.getSelection(),last=editableField(editor,ids.at(-1));
  assert(native.isCollapsed&&document.activeElement===last,'Undo did not restore the converted end caret');
  equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3);
  await dispatchKey('z','KeyZ',90,10);
  equal(editor.save().blocks,linked);
 });
}


for(const backwards of [false,true])for(const menuKind of ['inline','tune']){
 test('native Font size after conversion preserves the range through its auxiliary input and history / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=source(),root=editorRoot(editor);
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
  await convert(editor,'heading',menuKind);
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
  await clickNative(root.querySelector('[data-tool="fontSize"]'));
  const input=root.querySelector('.oe-font-size-input');
  await clickNative(input);
  equal(editor.blocks.selectedIds(),ids,'Font size input cleared the logical range');
  assert(document.activeElement===input,'Font size did not focus its custom input');
  await dispatchKey('a','KeyA',65,2);
  await window.__testInput('Input.insertText',{text:'24'});
  equal(editor.save().blocks,converted,'Font size input changed document before Apply');
  await dispatchKey('Enter','Enter',13);
  equal(ids.map(id=>editableField(editor,id).querySelector('span[style*="font-size"]')?.textContent),['pha','Bra']);
  equal(ids.map(id=>editableField(editor,id).querySelector('span[style*="font-size"]')?.style.fontSize),['24px','24px']);
  equal(editor.save().blocks.filter(block=>block.type==='paragraph'),converted.filter(block=>block.type==='paragraph'));
  equal(editor.blocks.selectedIds(),ids);
  const sized=editor.save().blocks;
  await dispatchKey('z','KeyZ',90,2);
  equal(editor.save().blocks,converted);
  equal(editor.blocks.selectedIds(),ids);
  const native=window.getSelection(),last=editableField(editor,ids.at(-1));
  assert(native.isCollapsed&&document.activeElement===last,'Undo did not restore the converted end caret');
  equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3);
  await dispatchKey('z','KeyZ',90,10);
  equal(editor.save().blocks,sized);
 });
}

for(const backwards of [false,true])for(const menuKind of ['inline','tune']){
 test('native Background after conversion preserves the range through its auxiliary input and history / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const editor=source(),root=editorRoot(editor);
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
  await convert(editor,'heading',menuKind);
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
  await clickNative(root.querySelector('[data-tool="bgcolor"]'));
  assert(window.getSelection().isCollapsed,'Opening ColorPicker expanded the converted end caret');
  const input=root.querySelector('.oe-color-hex');
  await clickNative(input);
  assert(window.getSelection().isCollapsed,'Focusing ColorPicker expanded the converted end caret');
  equal(editor.blocks.selectedIds(),ids,'Clicking the auxiliary ColorPicker field cleared the logical range');
  assert(document.activeElement===input,'Background did not focus its custom input');
  await dispatchKey('a','KeyA',65,2);
  await window.__testInput('Input.insertText',{text:'#ff0000'});
  equal(editor.save().blocks,converted,'Background input changed document before Apply');
  await dispatchKey('Enter','Enter',13);
  equal(ids.map(id=>editableField(editor,id).querySelector('span[style*="background-color"]')?.textContent),['pha','Bra']);
  equal(ids.map(id=>editableField(editor,id).querySelector('span[style*="background-color"]')?.style.backgroundColor),['rgb(255, 0, 0)','rgb(255, 0, 0)']);
  equal(editor.save().blocks.filter(block=>block.type==='paragraph'),converted.filter(block=>block.type==='paragraph'));
  equal(editor.blocks.selectedIds(),ids);
  const sized=editor.save().blocks;
  await dispatchKey('z','KeyZ',90,2);
  equal(editor.save().blocks,converted);
  equal(editor.blocks.selectedIds(),ids);
  const native=window.getSelection(),last=editableField(editor,ids.at(-1));
  assert(native.isCollapsed&&document.activeElement===last,'Undo did not restore the converted end caret');
  equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3);
  await dispatchKey('z','KeyZ',90,10);
  equal(editor.save().blocks,sized);
 });
}



const directTools=['bold','italic','strikethrough','code','marker','script','align','caseTransform','clearFormatting'];
const tags={bold:'b',italic:'i',strikethrough:'s',code:'code',marker:'mark',script:'sup'};
for(const type of directTools)for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native '+type+' after conversion formats the retained interval with atomic history / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const clean=type==='clearFormatting',extra=clean?{tunes:{textAlign:'right'}}:{};
  const editor=make([para('a',clean?'<b><i>Alpha</i></b>':'Alpha',extra),para('b',clean?'<b><i>Bravo</i></b>':'Bravo',extra)],{
   injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()],inlineTools:createDefaultInlineTools(),
  });
  const root=editorRoot(editor),before=editor.save().blocks;
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
  await convert(editor,'heading',menuKind);
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
  await clickNative(root.querySelector('[data-tool="'+type+'"]'));
  if(type==='script')await clickNative(root.querySelectorAll('.oe-inline-toolbar__script-panel .oe-inline-tool')[1]);
  if(type==='align')await clickNative(root.querySelectorAll('.oe-inline-toolbar__align-panel .oe-inline-tool')[2]);
  const formatted=editor.save().blocks;
  assert(JSON.stringify(formatted)!==JSON.stringify(converted),type+' did not change canonical data');
  if(tags[type])equal(ids.map(id=>editableField(editor,id).querySelector(tags[type])?.textContent),['pha','Bra']);
  if(type==='caseTransform')equal(ids.map(id=>editableField(editor,id).textContent),['PHA','BRA']);
  if(type==='align')equal(formatted.filter(block=>ids.includes(block.id)).map(block=>block.tunes.textAlign),['center','center']);
  if(clean){
   equal(formatted.filter(block=>ids.includes(block.id)).map(block=>block.data.text),['pha','Bra']);
   equal(formatted.filter(block=>ids.includes(block.id)).map(block=>block.tunes.textAlign),['right','right']);
  }
  equal(formatted.filter(block=>block.type==='paragraph'),converted.filter(block=>block.type==='paragraph'),'Tool changed unselected edges');
  equal(editor.blocks.selectedIds(),ids,'Tool lost selected owners');
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,converted);
  equal(editor.blocks.selectedIds(),ids,'Undo lost the retained interval');
  const native=window.getSelection(),last=editableField(editor,ids.at(-1));
  assert(native.isCollapsed&&document.activeElement===last,'Undo lost the converted end caret');
  equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3);
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before);equal(editor.canUndo,false,'Tool created extra history');
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,converted);
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,formatted);
 });
}


for(const type of ['fontSize','bgcolor'])for(const menuKind of ['inline','tune'])for(const backwards of [false,true]){
 test('native '+type+' reset after conversion preserves other marks, unselected edges and history / '+menuKind+' / '+(backwards?'backward':'forward'),async()=>{
  const style=type==='fontSize'?'font-size:24px':'background-color:rgb(255, 0, 0)';
  const editor=make([para('a','<span style="'+style+'"><i>Alpha</i></span>'),para('b','<span style="'+style+'"><i>Bravo</i></span>')],{
   injectStyles:true,locale:ru,plugins:[createParagraphPlugin(),createHeadingPlugin()],inlineTools:createDefaultInlineTools(),
  });
  const root=editorRoot(editor);
  await dragAcross(editor,editableField(editor,'a'),2,editableField(editor,'b'),3,backwards);
  await convert(editor,'heading',menuKind);
  const converted=editor.save().blocks,ids=converted.filter(block=>block.type==='heading').map(block=>block.id);
  await clickNative(root.querySelector('[data-tool="'+type+'"]'));
  await clickNative(root.querySelector(type==='fontSize'?'.oe-font-size-reset':'.oe-color-btn--remove'));
  const reset=editor.save().blocks;
  equal(ids.map(id=>editableField(editor,id).querySelector('i')?.textContent),['pha','Bra'],'Reset removed unrelated marks');
  const property=type==='fontSize'?'fontSize':'backgroundColor';
  assert(ids.every(id=>[...editableField(editor,id).querySelectorAll('span')].every(span=>!span.style[property])),'Reset retained the selected style');
  equal(reset.filter(block=>block.type==='paragraph'),converted.filter(block=>block.type==='paragraph'),'Reset changed unselected edges');
  equal(editor.blocks.selectedIds(),ids);
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,converted);
  const native=window.getSelection(),last=editableField(editor,ids.at(-1));
  assert(native.isCollapsed&&document.activeElement===last,'Reset Undo lost the converted end caret');
  equal(getTextOffset(last,native.anchorNode,native.anchorOffset),3);
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,reset);
 });
}


for(const type of ['fontSize','bgcolor'])for(const backwards of [false,true]){
 test('native '+type+' auxiliary input preserves a local partial selection and its history / '+(backwards?'backward':'forward'),async()=>{
  const editor=make([para('a','Alpha')],{injectStyles:true,inlineTools:createDefaultInlineTools()});
  const root=editorRoot(editor),field=editableField(editor,'a'),before=editor.save().blocks;
  await clickNative(field);
  const from=pointAt(field,backwards?4:1),to=pointAt(field,backwards?1:4);
  let trusted=false;
  field.addEventListener('mousedown',event=>{trusted=event.isTrusted},{once:true});
  await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}});
  await pause(30);assert(trusted);equal(window.getSelection().toString(),'lph');
  await clickNative(root.querySelector('[data-tool="'+type+'"]'));
  await clickNative(root.querySelector(type==='fontSize'?'.oe-font-size-input':'.oe-color-hex'));
  await dispatchKey('a','KeyA',65,2);
  await window.__testInput('Input.insertText',{text:type==='fontSize'?'24':'#ff0000'});
  equal(editor.save().blocks,before,'Auxiliary input changed authored text before Apply');
  equal(editor.canUndo,false);
  await dispatchKey('Enter','Enter',13);
  const formatted=editor.save().blocks,property=type==='fontSize'?'fontSize':'backgroundColor';
  const styled=[...editableField(editor,'a').querySelectorAll('span')].find(span=>span.style[property]);
  equal(styled?.textContent,'lph','Tool changed text outside the local interval');
  equal(editableField(editor,'a').textContent,'Alpha');
  const direction=()=>{
   const current=editableField(editor,'a'),native=window.getSelection();
   assert(document.activeElement===current,'Tool did not restore editing focus');
   equal(getTextOffset(current,native.anchorNode,native.anchorOffset),backwards?4:1);
   equal(getTextOffset(current,native.focusNode,native.focusOffset),backwards?1:4);
  };
  direction();
  await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,before);equal(editor.canUndo,false);direction();
  await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,formatted);direction();
 });
}

await run()
