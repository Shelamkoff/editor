
import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import { Paragraph, Heading } from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, assert, equal, run, pause } from '../../tests/browser/regressions/harness.js'
import { clickNative, pointAt, waitForStyles, dispatchKey, printable } from '../../tests/browser/native-input-helpers.js'
const observations=[]
for(const control of ['backgroundCancel','end'])for(const backwards of [false,true])test('v1 editing continuation / '+control+' / '+(backwards?'backward':'forward'),async()=>{
 const holder=document.createElement('section');document.body.append(holder)
 const editor=createEditor({holder,plugins:[new Paragraph(),new Heading()],data:{version:'1.0.0',blocks:[{id:'a',type:'paragraph',data:{text:'Alpha'}},{id:'b',type:'paragraph',data:{text:'Bravo'}}]}})
 try {
  await waitForStyles(document);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  const first=holder.querySelector('[data-block-id="a"] [contenteditable=true]'),last=holder.querySelector('[data-block-id="b"] [contenteditable=true]')
  const from=pointAt(backwards?last:first,backwards?3:2),to=pointAt(backwards?first:last,backwards?2:3)
  await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
  await pause(50);assert(holder.querySelector('.oe-editor--cross-selecting'),'v1 native drag failed')
  await clickNative(holder.querySelector('.oe-inline-toolbar__type-select'))
  await clickNative(holder.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="heading"]'))
  await pause(300)
  equal(editor.save().blocks.map(block=>[block.type,block.data.text]),[['paragraph','Al'],['heading','pha'],['heading','Bra'],['paragraph','vo']])
  if(control==='backgroundCancel') {
   await clickNative(holder.querySelector('[data-tool="bgcolor"]'))
   await clickNative(holder.querySelector('.oe-color-hex'))
   await dispatchKey('Escape','Escape',27)
  }else await dispatchKey('End','End',35)
  const focusBeforeTyping=document.activeElement?.tagName
  await printable('X')
  observations.push({control,backwards,focusBeforeTyping,blocks:editor.save().blocks.map(block=>[block.type,block.data.text])})
 }finally{editor.destroy();holder.remove()}
})
await run()
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults.map((result,index)=>({...result,observation:observations[index]})))
