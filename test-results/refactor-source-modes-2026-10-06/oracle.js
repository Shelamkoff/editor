import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import { Paragraph, Code, Raw } from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, equal, run } from '../../tests/browser/regressions/harness.js'
import { clickNative, dispatchKey, waitForStyles } from '../../tests/browser/native-input-helpers.js'
const observations=[]
for(const [name,Plugin,key] of [['Code',Code,'code'],['Raw',Raw,'html']])for(const backwards of [false,true])for(const activation of ['mouse','keyboard']) {
 test('v1 source mode roundtrip / '+name+' / '+(backwards?'backward':'forward')+' / '+activation,async()=>{
  const holder=document.createElement('section');document.body.append(holder)
  const source='Alpha\nBravo'
  const editor=createEditor({holder,plugins:[new Paragraph(),new Plugin()],data:{version:'1.0.0',blocks:[{id:'a',type:name==='Code'?'code':'raw',data:{[key]:source,...(name==='Code'?{language:'plaintext'}:{})}}]}})
  try {
   await waitForStyles(document)
   if(name==='Code')await clickNative(holder.querySelector('.oe-code-btn--edit'))
   const field=holder.querySelector('textarea')
   await clickNative(field)
   await dispatchKey('Home','Home',36,2)
   for(let i=0;i<(backwards?4:1);i++)await dispatchKey('ArrowRight','ArrowRight',39)
   for(let i=0;i<3;i++)await dispatchKey(backwards?'ArrowLeft':'ArrowRight',backwards?'ArrowLeft':'ArrowRight',backwards?37:39,8)
   equal([field.selectionStart,field.selectionEnd],[1,4])
   const rangeBefore=[field.selectionStart,field.selectionEnd,field.selectionDirection]
   const toggle=holder.querySelector(name==='Code'?'.oe-code-btn--edit':'.oe-raw__toggle')
   for(let i=0;i<2;i++){
    if(activation==='mouse')await clickNative(toggle)
    else {toggle.focus();await dispatchKey(' ','Space',32,0,' ')}
   }
   equal(editor.save().blocks[0].data[key],source)
   const observation={name,backwards,activation,source,focused:document.activeElement===field,rangeBefore,rangeAfter:[field.selectionStart,field.selectionEnd,field.selectionDirection],activeTag:document.activeElement.tagName}
   equal(observation.focused,name==='Code','Historical source focus differs from the inspected implementation')
   observations.push(observation)
  }finally{editor.destroy();holder.remove()}
 })
}
await run()
window.__auditResults=window.__auditResults.map((result,index)=>({...result,observation:observations[index]}))
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults)
