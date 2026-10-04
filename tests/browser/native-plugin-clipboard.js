import { test, make, para, editableField, editorRoot, pause, equal, assert, select, run } from './regressions/harness.js'
import { dispatchKey, dragAcross } from './native-input-helpers.js'
import { pluginParityFixtures, writePath } from './plugin-parity-fixtures.js'
import { CLIPBOARD_FRAGMENT_MIME } from '../../core/ClipboardFragment.js'
import { createParagraphPlugin } from '../../plugins/index.js'

const structuredNames=['List','Checklist','Quote','Warning','Table','Columns','Toggle','Spoiler']
function withoutIds(value){
  if(Array.isArray(value))return value.map(withoutIds)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='id').map(([key,item])=>[key,withoutIds(item)]))
  return value
}

for (const fixture of pluginParityFixtures.filter(entry => ['Gallery','Person','Carousel','Quote','Warning','Toggle','Spoiler','Table','Columns','Checklist','List','Poll'].includes(entry.name))) {
  for (const backwards of [false,true]) for (const cutting of [false,true]) {
  test(`${fixture.name}: native ${cutting?'cut':'copy'}/paste ${backwards?'backward':'forward'} across its fields carries only selected text and keeps assets`, async () => {
    const definition = fixture.factory()
    const source = make([{ id:'a', type:definition.type, dataVersion:definition.schema.currentVersion, data:{...definition.schema.createDefault(),...fixture.data} }, para('b','Delta')], {injectStyles:true,plugins:[createParagraphPlugin(),definition]})
    const target = make([para('target','')],{plugins:[createParagraphPlugin(),definition]})
    await pause(150)
    const before = source.save().blocks
    const fields = fixture.fields.filter(field => !field.key.endsWith('url'))
    source.blocks.focus('a',{fieldKey:fields[0].key,offset:'start'})
    await dragAcross(source,document.activeElement,2,editableField(source,'b'),3,backwards)
    let copied = null
    editorRoot(source).addEventListener(cutting?'cut':'copy',event => {
      assert(event.isTrusted,'Clipboard event was not native')
      copied=event.clipboardData.getData(CLIPBOARD_FRAGMENT_MIME)
    },{once:true})
    await dispatchKey(cutting?'x':'c',cutting?'KeyX':'KeyC',cutting?88:67,2)
    assert(copied,'Compound range did not populate the private clipboard fragment')
    let remaining=before[0].data
    for (const [index,field] of fields.entries()) remaining=writePath(remaining,field.path,index===0?field.value.slice(0,2):'')
    if(['List','Checklist'].includes(fixture.name))remaining={...remaining,items:remaining.items.filter(item=>item.text)}
    if(cutting)equal(source.save().blocks.map(block=>block.data),[remaining,{text:'ta'}])
    else{equal(source.save().blocks,before);equal(source.canUndo,false)}
    select(editableField(target,'target'),0)
    await dispatchKey('v','KeyV',86,2)
    const pasted=target.save().blocks
    const structured=structuredNames.includes(fixture.name)
    equal(pasted.map(block=>block.type),[structured?definition.type:'paragraph','paragraph'])
    if(structured){
      let selected=before[0].data
      for(const [index,field] of fields.entries())selected=writePath(selected,field.path,index===0?field.value.slice(2):field.value)
      equal(withoutIds(pasted[0].data),withoutIds(selected),'Paste lost selected author fields or block settings')
      assert(pasted[0].id!=='a','Paste reused its source block ID')
    }else equal(pasted[0].data.text,fields.map((field,index)=>index===0?field.value.slice(2):field.value).join('<br>'))
    equal(pasted[1].data.text,'Del')
    target.undo()
    equal(target.save().blocks,[para('target','')])
    equal(target.canUndo,false)
    if(cutting){
      source.undo()
      equal(source.save().blocks,before)
      equal(source.canUndo,false)
      source.redo()
      equal(source.save().blocks.map(block=>block.data),[remaining,{text:'ta'}])
    }
  })
  }
}
await run()
