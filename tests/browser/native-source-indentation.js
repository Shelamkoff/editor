import { createCodePlugin, createRawPlugin, createParagraphPlugin } from '../../plugins/index.js'
import { test, make, para, blockElement, assert, equal, run } from './regressions/harness.js'
import { dispatchKey, printable } from './native-input-helpers.js'

const variants = [
  { name:'Code',factory:createCodePlugin,key:'code',fieldKey:'code',width:4 },
  { name:'Raw',factory:createRawPlugin,key:'html',fieldKey:'html',width:2 },
]
const ranges = [
  {name:'two lines ending at the next line start',value:'Alpha\nBravo\nCharlie',start:0,end:12,code:'    Alpha\n    Bravo\nCharlie',html:'  Alpha\n  Bravo\nCharlie',codeEnd:20,htmlEnd:16},
  {name:'partial first line ending at the next line start',value:'Alpha\nBravo\nCharlie',start:2,end:12,code:'    Alpha\n    Bravo\nCharlie',html:'  Alpha\n  Bravo\nCharlie',codeEnd:20,htmlEnd:16},
  {name:'one line including its newline',value:'Alpha\nBravo\nCharlie',start:0,end:6,code:'    Alpha\nBravo\nCharlie',html:'  Alpha\nBravo\nCharlie',codeEnd:10,htmlEnd:8},
  {name:'one empty line',value:'\nAlpha',start:0,end:1,code:'    \nAlpha',html:'  \nAlpha',codeEnd:5,htmlEnd:3},
  {name:'two empty lines',value:'\n\nAlpha',start:0,end:2,code:'    \n    \nAlpha',html:'  \n  \nAlpha',codeEnd:10,htmlEnd:6},
  {name:'a final newline with an unselected empty line',value:'Alpha\nBravo\n',start:0,end:12,code:'    Alpha\n    Bravo\n',html:'  Alpha\n  Bravo\n',codeEnd:20,htmlEnd:16},
  {name:'a multiline range ending inside the next line',value:'Alpha\nBravo\nCharlie',start:2,end:9,code:'    Alpha\n    Bravo\nCharlie',html:'  Alpha\n  Bravo\nCharlie',codeEnd:17,htmlEnd:13},
  {name:'single-line replacement',value:'Alpha\nBravo',start:1,end:4,code:'A    a\nBravo',html:'A  a\nBravo',codeStart:5,htmlStart:3,codeEnd:5,htmlEnd:3},
]
function mount(variant,value) {
  const definition=variant.factory()
  return make([para('left','Unselected before'),{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),[variant.key]:value,...(variant.key==='code'?{language:'plaintext'}:{})}},para('right','Unselected after')],{plugins:[createParagraphPlugin(),definition],injectStyles:true})
}
function currentField(editor) {
  const field=blockElement(editor,'a').querySelector('textarea')
  assert(field instanceof HTMLTextAreaElement,'Document source field is missing')
  equal(document.activeElement,field,'Source input lost focus')
  return field
}
function selection(editor,start,end,backwards) {
  const field=currentField(editor)
  equal([field.selectionStart,field.selectionEnd],[start,end],'Source selection moved')
  if(start!==end)equal(field.selectionDirection,backwards?'backward':'forward','Source selection direction changed')
}
async function selectNative(editor,variant,range,backwards) {
  editor.blocks.focus('a',{fieldKey:variant.fieldKey,offset:backwards?range.end:range.start})
  currentField(editor)
  for(let i=range.start;i<range.end;i++) await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
  selection(editor,range.start,range.end,backwards)
}
function replaceSource(blocks,variant,value) {
  return blocks.map(block=>block.id==='a'?{...block,data:{...block.data,[variant.key]:value}}:block)
}
function expectedSelection(variant,range) {
  return [range[variant.key+'Start']??0,range[variant.key+'End']]
}
for(const variant of variants)for(const [index,range] of ranges.entries())for(const backwards of [false,true]) {
  const first=index===0&&variant.name==='Code'&&!backwards
  test(first?'Code Tab excludes the unselected line when a native range ends at its start':variant.name+' Tab / '+range.name+' / '+(backwards?'backward':'forward'),async()=>{
    const editor=mount(variant,range.value),before=editor.save().blocks
    await selectNative(editor,variant,range,backwards)
    await dispatchKey('Tab','Tab',9)
    const after=replaceSource(before,variant,range[variant.key])
    equal(editor.save().blocks,after,'Tab changed source outside the requested lines')
    selection(editor,...expectedSelection(variant,range),backwards)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    selection(editor,range.start,range.end,backwards)
    equal(editor.canUndo,false,'Indentation created extra history')
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,after)
    selection(editor,...expectedSelection(variant,range),backwards)
  })
}
for(const variant of variants)for(const range of ranges.slice(0,2))for(const backwards of [false,true]) {
  test(variant.name+' Tab then typing replaces only the visible range / '+range.name+' / '+(backwards?'backward':'forward'),async()=>{
    const editor=mount(variant,range.value),before=editor.save().blocks
    await selectNative(editor,variant,range,backwards)
    await dispatchKey('Tab','Tab',9)
    const indented=replaceSource(before,variant,range[variant.key])
    equal(editor.save().blocks,indented)
    await printable('X')
    const after=replaceSource(before,variant,'XCharlie')
    equal(editor.save().blocks,after,'Follow-up input changed the unselected tail')
    selection(editor,1,1,false)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,indented)
    selection(editor,...expectedSelection(variant,range),backwards)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    selection(editor,range.start,range.end,backwards)
    equal(editor.canUndo,false)
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,indented)
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,after)
    selection(editor,1,1,false)
  })
  test(variant.name+' Tab then Shift+Tab leaves the following line untouched / '+range.name+' / '+(backwards?'backward':'forward'),async()=>{
    const editor=mount(variant,range.value),before=editor.save().blocks
    await selectNative(editor,variant,range,backwards)
    await dispatchKey('Tab','Tab',9)
    const indented=replaceSource(before,variant,range[variant.key])
    await dispatchKey('Tab','Tab',9,8)
    equal(editor.save().blocks,before,'Paired indentation altered the unselected line')
    selection(editor,0,range.end,backwards)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,indented)
    selection(editor,...expectedSelection(variant,range),backwards)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    selection(editor,range.start,range.end,backwards)
    equal(editor.canUndo,false)
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,indented)
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,before)
    selection(editor,0,range.end,backwards)
  })
}
for(const variant of variants) {
  test(variant.name+' collapsed Tab keeps its native caret and one history step',async()=>{
    const editor=mount(variant,'Alpha\nBravo'),before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:variant.fieldKey,offset:2})
    await dispatchKey('Tab','Tab',9)
    const after=replaceSource(before,variant,variant.name==='Code'?'Al    pha\nBravo':'Al  pha\nBravo')
    equal(editor.save().blocks,after)
    selection(editor,2+variant.width,2+variant.width,false)
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    selection(editor,2,2,false)
    equal(editor.canUndo,false)
    await dispatchKey('z','KeyZ',90,10)
    equal(editor.save().blocks,after)
    selection(editor,2+variant.width,2+variant.width,false)
  })
}
await run()
