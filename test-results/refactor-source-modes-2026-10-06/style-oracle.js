import { createEditor } from '../refactor-equivalence-2026-10-05/v1-oracle/core/index.js'
import * as plugins from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, equal, run } from '../../tests/browser/regressions/harness.js'
import { waitForStyles } from '../../tests/browser/native-input-helpers.js'
const custom=new URL('../../tests/browser/plugin-style-ownership.css',import.meta.url).href
const observations=[]
for(const mode of ['disabled','replace','append'])test('v1 style ownership of all 21 plugins / '+mode,async()=>{
 const holder=document.createElement('section');document.body.append(holder)
 const selected=new Map()
 for(const Plugin of Object.values(plugins)){
  const instance=new Plugin({injectStyles:mode==='append',...(mode==='disabled'?{}:{css:custom})})
  if(!selected.has(instance.type))selected.set(instance.type,{instance,styles:Plugin.styles??[]})
 }
 equal(selected.size,21)
 const editor=createEditor({holder,plugins:[...selected.values()].map(item=>item.instance),data:{version:'1.0.0',blocks:[{id:'a',type:'paragraph',data:{text:'Alpha'}}]}})
 const links=url=>[...document.querySelectorAll('link[data-oe-style]')].filter(link=>link.href===url)
 try{
  await waitForStyles(document)
  equal(links(custom).length,mode==='disabled'?0:1)
  for(const {styles} of selected.values())for(const url of styles)equal(links(url).length,mode==='append'?1:0,'Historical built-in ownership differs '+url)
  if(mode!=='disabled')equal(getComputedStyle(holder.querySelector('.oe-editor')).getPropertyValue('--rector-style-owner').trim(),'verified')
  observations.push({mode,plugins:[...selected.keys()],customStyleLinks:links(custom).length})
 }finally{editor.destroy();holder.remove()}
 equal(links(custom).length,0,'Historical custom CSS leaked')
})
await run()
window.__auditResults=window.__auditResults.map((result,index)=>({...result,observation:observations[index]}))
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults)
