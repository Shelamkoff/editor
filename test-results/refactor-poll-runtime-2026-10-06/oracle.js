import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import { Paragraph, Poll } from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, equal, assert, pause, run } from '../../tests/browser/regressions/harness.js'
import { clickNative, dispatchKey, printable, waitForStyles } from '../../tests/browser/native-input-helpers.js'
for(const kind of ['missing-id','load-error','live-range'])test('v1 Poll '+kind+' preserves its author-data contract',async()=>{
 const errors=[];let subscriber,loads=0,votes=0
 const holder=document.createElement('section');document.body.append(holder)
 const source={
  async load(){loads++;if(kind==='load-error')throw new Error('Unavailable');return {total:0,options:[{id:'yes',votes:0},{id:'no',votes:0}]}},
  async vote(){votes++;throw new Error('Unexpected vote')},
  subscribe(context){subscriber=context},
 }
 const data={question:'Choose one',type:'single',options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}],resultsMode:'always',...(kind==='missing-id'?{}:{pollId:'remote'})}
 const editor=createEditor({holder,plugins:[new Paragraph(),new Poll({dataSource:source,onError:error=>errors.push(error)})],data:{version:'1.0.0',blocks:[{id:'a',type:'poll',data}]}})
 try{
  await waitForStyles(document);await pause(60)
  const before=editor.save().blocks
  if(kind==='missing-id'){
   await clickNative(holder.querySelector('.oe-poll__option-marker[data-option-id="yes"]'))
   await clickNative(holder.querySelector('.oe-poll__submit'))
   equal(editor.save().blocks,before)
   equal([loads,votes],[0,0]);equal(errors.length,1)
   assert(holder.querySelector('.oe-poll__status--error[role="alert"]'))
  }else if(kind==='load-error'){
   equal(errors.length,1)
   equal(holder.querySelector('.oe-poll__status--error[role="alert"]')?.textContent,'Could not load poll results')
   equal(editor.save().blocks,before)
  }else{
   const field=holder.querySelector('.oe-poll__question')
   await clickNative(field);await dispatchKey('Home','Home',36)
   for(let i=0;i<2;i++)await dispatchKey('ArrowRight','ArrowRight',39)
   for(let i=0;i<2;i++)await dispatchKey('ArrowRight','ArrowRight',39,8)
   equal(window.getSelection().toString(),'oo')
   subscriber.onUpdate({total:2,options:[{id:'yes',votes:1},{id:'no',votes:1}]})
   equal(document.activeElement,field);equal(window.getSelection().toString(),'oo')
   equal(editor.save().blocks,before)
   await printable('X')
   equal(editor.save().blocks[0].data.question,'ChXse one')
  }
 }finally{editor.destroy();holder.remove()}
})
await run()
