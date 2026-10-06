
import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import { Paragraph } from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/paragraph/index.js'
import { createMentionPlugin } from '../refactor-equivalence-2026-10-05/v1-oracle/inline-plugins/mention/index.js'
import { test, equal, assert, pause, run } from '../../tests/browser/regressions/harness.js'
import { clickNative, dispatchKey, printable, waitForStyles } from '../../tests/browser/native-input-helpers.js'
for(const trigger of ['#','🦊','@'])test('v1 Mention captures '+trigger+' once and commits its visible trigger with original numeric identity',async()=>{
 let reads=0,selected,searches=0
 const options={get trigger(){if(++reads>1)throw new Error('Trigger reread');return trigger},debounceDelay:0,searchFunction:async query=>{searches++;return [{id:42,name:'Ada'}]},onMentionSelect:data=>{selected=data}}
 const plugin=createMentionPlugin(options)
 Object.defineProperty(options,'trigger',{value:'!'})
 const holder=document.createElement('section');document.body.appendChild(holder)
 const editor=createEditor({holder,plugins:[new Paragraph()],inlinePlugins:[plugin],data:{version:'1.0.0',blocks:[{id:'a',type:'paragraph',data:{text:''}}]}})
 try{
  await waitForStyles(document)
  await clickNative(holder.querySelector('.oe-paragraph'))
  await printable(trigger);await printable('A');await pause(90)
  assert(holder.querySelector('.oe-mention-item'))
  await dispatchKey('Enter','Enter',13)
  equal(reads,1);assert(searches>=1)
  equal(selected,{id:42,name:'Ada'})
  equal(holder.querySelector('[data-inline-plugin="mention"]').textContent,trigger+'Ada')
 }finally{editor.destroy();holder.remove()}
})
await run()
