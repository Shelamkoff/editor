import * as plugins from '../refactor-equivalence-2026-10-05/v1-oracle/plugins/index.js'
import { test, equal, run } from '../../tests/browser/regressions/harness.js'
const catalog = new Map()
for (const Plugin of Object.values(plugins)) {
 const instance = new Plugin()
 if (!catalog.has(instance.type)) catalog.set(instance.type, Plugin)
}
const observations = []
for (const [type, Plugin] of catalog) test('v1 config captures own getter values once / '+type, async()=>{
 const reads = {injectStyles:0,css:0,placeholder:0,actions:0,socialResolvers:0}
 const config = Object.fromEntries([])
 for (const key of Object.keys(reads)) Object.defineProperty(config,key,{enumerable:true,get(){
  if(++reads[key]>1)throw new Error(key+' reread by v1')
  return key==='injectStyles'?false:key==='css'?'https://example.test/host.css':key==='placeholder'?'Captured':[]
 }})
 const instance = new Plugin(config)
 const captured = instance.getPluginConfig()
 equal(captured.css,'https://example.test/host.css')
 equal(captured.injectStyles,false)
 equal(Object.values(reads),[1,1,1,1,1])
 observations.push({type,reads,callerFrozen:Object.isFrozen(config)})
})
for(const [type,key] of [['image','actions'],['gallery','actions'],['carousel','actions'],['attaches','actions'],['embed','actions'],['person','socialResolvers']]) test('v1 caller record alias / '+type,async()=>{
 const original = key==='actions'?{label:'Before',handler:async()=>null}:{test:()=>true,type:'before'}
 const instance = new (catalog.get(type))({[key]:[original]})
 const captured = instance.getPluginConfig()[key][0]
 if(key==='actions')original.label='After'
 else original.type='after'
 equal(captured,original)
 equal(key==='actions'?captured.label:captured.type,key==='actions'?'After':'after')
 observations.push({type,key,aliased:captured===original,changedValue:key==='actions'?captured.label:captured.type})
})
await run()
window.__auditResults=window.__auditResults.map((result,index)=>({...result,observation:observations[index]}))
document.querySelector('#result').textContent=JSON.stringify(window.__auditResults)
