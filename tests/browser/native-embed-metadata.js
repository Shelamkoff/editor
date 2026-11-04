import {embedMetadataCases,runEmbedMetadataCase} from './embed-metadata-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Embed policy rejects untrusted HTML',()=>{
 let blocked=false
 try{document.createElement('div').innerHTML='<b>untrusted control</b>'}catch(error){blocked=error instanceof TypeError}
 assert(blocked,'The Embed fixture did not enforce Trusted Types')
})
for(const spec of embedMetadataCases.filter(s=>s.kind!=='local'&&s.source!=='upload'))test('Embed metadata '+spec.id,async()=>{
 const result=await runEmbedMetadataCase({sourceBase:'../../',legacy:false,spec,nativeInput:(method,params)=>window.__testInput(method,params)})
 ;(window.__embedMetadataResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'Embed phases did not complete')
 equal(result.unsupported,[],'The current contract must be supported');equal(result.observations.filter(o=>o.status!=='PASS'),[],'Embed metadata contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
