import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import { Paragraph, Code, Raw } from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, equal, assert, run } from '../../tests/browser/regressions/harness.js'
import { clickNative, dispatchKey, waitForStyles } from '../../tests/browser/native-input-helpers.js'
const observations=[]
for(const [name,Plugin,key,width] of [['Code',Code,'code',4],['Raw',Raw,'html',2]])for(const backwards of [false,true]) {
 test('v1 Tab at the next line start / '+name+' / '+(backwards?'backward':'forward'),async()=>{
  const holder=document.createElement('section')
  document.body.append(holder)
  const source='Alpha\nBravo\nCharlie'
  const editor=createEditor({holder,plugins:[new Paragraph(),new Plugin()],data:{version:'1.0.0',blocks:[{id:'a',type:name==='Code'?'code':'raw',data:{[key]:source,...(name==='Code'?{language:'plaintext'}:{})}}]}})
  try {
   await waitForStyles(document)
   if(name==='Code')await clickNative(holder.querySelector('.oe-code-btn--edit'))
   const field=holder.querySelector('textarea')
   await clickNative(field)
   await dispatchKey('Home','Home',36,2)
   equal(field.selectionStart,0,'Historical source did not receive focus')
   if(backwards)for(let i=0;i<12;i++)await dispatchKey('ArrowRight','ArrowRight',39)
   for(let i=0;i<12;i++)await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
   equal([field.selectionStart,field.selectionEnd],[0,12],'Historical selection missed the next line start')
   const directionBefore=field.selectionDirection
   await dispatchKey('Tab','Tab',9)
   const text=editor.save().blocks[0].data[key]
   equal(text,name==='Code'?'    Alpha\n    Bravo\n    Charlie':'  Alpha\n  Bravo\n  Charlie','Historical trailing-line indentation differs')
   observations.push({name,backwards,width,source,text,directionBefore,rangeAfter:[field.selectionStart,field.selectionEnd],directionAfter:field.selectionDirection})
  } finally {editor.destroy();holder.remove()}
 })
}
await run()
window.__auditResults=window.__auditResults.map((result,index)=>({...result,observation:observations[index]}))
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults)
