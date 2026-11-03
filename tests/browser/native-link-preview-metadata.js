import { linkPreviewMetadataCases,runLinkPreviewMetadataCase } from './link-preview-metadata-fixture.js'
import { test,assert,equal,run } from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('LinkPreview Trusted Types policy rejects untrusted HTML',()=>{
 assert(window.trustedTypes,'Trusted Types API is unavailable')
 let blocked=false
 try{document.createElement('div').innerHTML='<b>untrusted control</b>'}catch(error){blocked=error instanceof TypeError}
 assert(blocked,'The link-preview fixture did not enforce its Trusted Types policy')
})
for(const spec of linkPreviewMetadataCases)test(`LinkPreview metadata ${spec.id}`,async()=>{
 const result=await runLinkPreviewMetadataCase({spec,nativeInput:(method,params)=>window.__testInput(method,params)})
 ;(window.__linkPreviewMetadataResults??=[]).push(result)
 assert(!result.error,result.error);equal(result.completedPhases,result.planned,'LinkPreview phases did not complete')
 equal(result.unhandled,[],'Metadata rejection escaped');equal(result.pageErrors,[],'Metadata change escaped its projection lifetime')
 equal(result.diagnostics,[],'Unexpected link-preview diagnostic');equal(result.unsupported,[],'Current link-preview contract must be supported')
 equal(result.observations.filter(o=>o.status!=='PASS'),[],'LinkPreview contract failed')
 for(const o of result.observations)equal(o.actual,o.expected,`${o.phase}/${o.property}`)
})
await run()
