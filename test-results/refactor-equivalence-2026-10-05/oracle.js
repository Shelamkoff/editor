import { createEditor } from './v1-oracle/core/index.js'
import { Paragraph, Heading, List, Checklist, Quote, Code, Raw } from './v1-oracle/plugins/index.js'
import { test, assert, equal, run, pause } from '../../tests/browser/regressions/harness.js'
import { clickNative, pointAt, waitForStyles } from '../../tests/browser/native-input-helpers.js'
import { getTextOffset } from '../../shared/textOffset.js'
const observations=[]
for (const target of ['heading','list','code','raw']) {
 for (const backward of [false,true]) {
  test('v1 native cross conversion / '+target+' / '+(backward?'backward':'forward'),async()=>{
   const holder=document.createElement('section');document.body.append(holder)
   const editor=createEditor({holder,plugins:[new Paragraph(),new Heading(),new List(),new Checklist(),new Quote(),new Code(),new Raw()],data:{version:'1.0.0',blocks:[{id:'a',type:'paragraph',data:{text:'Alpha'}},{id:'b',type:'list',data:{style:'ordered',items:['Bravo','Charlie','Delta']}},{id:'tail',type:'paragraph',data:{text:'Tail'}}]}})
   try {
    await waitForStyles(document);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    const first=holder.querySelector('[data-block-id="a"] [contenteditable=true]')
    const last=holder.querySelectorAll('[data-block-id="b"] li')[1]
    const from=pointAt(backward?last:first,backward?7:2),to=pointAt(backward?first:last,backward?2:7)
    await window.__testInput('Input.drag',{from:{x:from.clientX,y:from.clientY},to:{x:to.clientX,y:to.clientY}})
    await pause(50);assert(holder.querySelector('.oe-editor--cross-selecting'),'v1 did not select across blocks')
    await clickNative(holder.querySelector('.oe-inline-toolbar__type-select'))
    await clickNative(holder.querySelector('.oe-inline-toolbar__type-dropdown [data-plugin-type="'+target+'"]'))
    await pause(300)
    const native=window.getSelection(),owner=native.anchorNode?.parentElement?.closest('[data-block-id]')
    const field=native.anchorNode?.parentElement?.closest('[contenteditable=true]')
    const snapshot={target,backward,blocks:editor.save().blocks,cross:holder.querySelector('.oe-editor').classList.contains('oe-editor--cross-selecting'),collapsed:native.isCollapsed,caretBlock:owner?.dataset.blockId,caretOffset:field?getTextOffset(field,native.anchorNode,native.anchorOffset):null,toolbar:holder.querySelector('.oe-inline-toolbar').style.display,highlight:[...CSS.highlights.keys()]}
    observations.push(snapshot)
    equal(snapshot.highlight.includes('oe-cross-select'),['heading','list'].includes(target))
    equal(snapshot.blocks.length,['heading','list'].includes(target)?5:4)
   } finally {editor.destroy();holder.remove()}
  })
 }
}
await run()
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults.map((result,index)=>({...result,observation:observations[index]})))
