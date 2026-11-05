import {checklistEditCases,runChecklistEditCase} from './checklist-edit-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Checklist edit Trusted Types policy rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
const nativeInput=(method,params)=>method==='Input.dispatchMouseEvent'?window.__testInput('Input.hover',{x:params.x,y:params.y}):window.__testInput(method,params)
for(const spec of checklistEditCases)test('Checklist edit/'+spec.id,async()=>{const r=await runChecklistEditCase({spec,nativeInput});(window.__checklistEditResults??=[]).push(r);assert(!r.error,r.error);equal(r.planned,r.completedPhases);equal(r.diagnostics,[]);equal(r.unsupported,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
