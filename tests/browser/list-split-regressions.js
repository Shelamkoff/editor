import {createParagraphPlugin} from '../../plugins/paragraph/index.js'
import {createListPlugin} from '../../plugins/list/index.js'
import {createChecklistPlugin} from '../../plugins/checklist/index.js'
import {createColorSwatchPlugin} from '../../inline-plugins/color.js'
import {findNodeAtOffset,getTextOffset} from '../../shared/textOffset.js'
import {test,make,para,editableField,editorRoot,assert,equal,pause} from './regressions/harness.js'
import {dispatchKey} from './native-input-helpers.js'

function range(editor,backward){
 const a=editableField(editor,'seed','.oe-checklist__text,.oe-list__item'),b=[...editorRoot(editor).querySelectorAll('.oe-checklist__text,.oe-list__item')][1],start=findNodeAtOffset(a,2,'start'),end=findNodeAtOffset(b,3,'end')
 a.focus();getSelection().setBaseAndExtent(backward?end.node:start.node,backward?end.offset:start.offset,backward?start.node:end.node,backward?start.offset:end.offset)
 return{a,b,start,end}
}
for(const backward of[false,true])test('Checklist cross-item Enter preserves checks, widget and endpoint IDs / '+backward,async()=>{
 const editor=make([{id:'seed',type:'checklist',dataVersion:2,data:{items:[{id:'a',text:'<b>Alpha</b>',checked:true},{id:'b',text:'<i>Bravo</i>{{color}}',checked:false},{id:'c',text:'Keep',checked:true}]},inline:{color:{type:'color',dataVersion:1,data:{value:'#123456'}}}},para('after','After')],{plugins:[createParagraphPlugin(),createChecklistPlugin()],inlinePlugins:[createColorSwatchPlugin()]})
 const initial=editor.save().blocks;range(editor,backward);await pause(60);await dispatchKey('Enter','Enter',13);const after=editor.save().blocks
 equal(after.length,2);equal(after[0].data.items,[{id:'a',text:'<b>Al</b>',checked:true},{id:'b',text:'<i>vo</i>{{color}}',checked:false},{id:'c',text:'Keep',checked:true}]);equal(after[0].inline,initial[0].inline);equal(after[1],initial[1]);const field=[...editorRoot(editor).querySelectorAll('.oe-checklist__text')][1];equal(document.activeElement,field);equal(getTextOffset(field,getSelection().anchorNode,getSelection().anchorOffset),0)
 await dispatchKey('z','KeyZ',90,2);equal(editor.save().blocks,initial);equal(editor.canUndo,false);const restored=rangePoints(editor);equal(restored,backward?{anchor:3,focus:2}:{anchor:2,focus:3});await dispatchKey('z','KeyZ',90,10);equal(editor.save().blocks,after);equal(editor.canRedo,false)
})
function rangePoints(editor){const all=[...editorRoot(editor).querySelectorAll('.oe-checklist__text')],s=getSelection(),at=(n,o)=>all.map(f=>f.contains(n)?getTextOffset(f,n,o):null).find(v=>v!==null);return{anchor:at(s.anchorNode,s.anchorOffset),focus:at(s.focusNode,s.focusOffset)}}

for(const kind of['throw','promise','focus','schema'])test('declared cross-item split rejects '+kind+' before native fallback',async()=>{
 const original=createListPlugin(),definition={...original,capabilities:{...original.capabilities,selectionSlice:{...original.capabilities.selectionSlice,split(data){
  if(kind==='throw')throw new Error('Intentional split failure')
  if(kind==='promise')return Promise.resolve(null)
  if(kind==='schema')return{data:{...data,items:[{id:'same',text:'A'},{id:'same',text:'B'}]},focus:{fieldKey:'item:same',offset:0}}
  return{data,focus:{fieldKey:'item:missing',offset:0}}
 }}}},diagnostics=[],editor=make([{id:'seed',type:'list',dataVersion:2,data:{style:'ordered',items:[{id:'a',text:'Alpha'},{id:'b',text:'Bravo'}]}},para('after','After')],{plugins:[createParagraphPlugin(),definition],onDiagnostic:v=>diagnostics.push(v)})
 const initial=editor.save().blocks;range(editor,false);await pause(60);const html=editorRoot(editor).querySelector('.oe-list').innerHTML;await dispatchKey('Enter','Enter',13);await pause(60)
 equal(editor.save().blocks,initial);equal(editorRoot(editor).querySelector('.oe-list').innerHTML,html);equal([editor.canUndo,editor.canRedo],[false,false]);equal(diagnostics.map(d=>[d.code,d.operation]),[['command.failed','selection.split'],['command.failed','keyboard.shortcut']]);assert(!editorRoot(editor).querySelector('.oe-block[data-block-id="seed"] .oe-paragraph'))
})
