import './checklist-conversion-regressions.js'
import {listConversionCases,runListConversionCase} from './list-conversion-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('List conversion Trusted Types policy rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
const nativeInput=(method,params)=>method==='Input.dispatchMouseEvent'?window.__testInput('Input.hover',{x:params.x,y:params.y}):window.__testInput(method,params)
for(const spec of listConversionCases)test('List conversion/'+spec.id,async()=>{const r=await runListConversionCase({spec,nativeInput});(window.__listConversionResults??=[]).push(r);assert(!r.error,r.error);equal(r.planned,r.completedPhases);equal(r.diagnostics,[]);equal(r.unsupported,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
