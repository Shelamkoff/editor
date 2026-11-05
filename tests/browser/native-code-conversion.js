import {codeConversionCases,runCodeConversionCase} from './code-conversion-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Code conversion Trusted Types policy rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
const nativeInput=(method,params)=>method==='Input.dispatchMouseEvent'?window.__testInput('Input.hover',{x:params.x,y:params.y}):window.__testInput(method,params)
for(const spec of codeConversionCases)test('Code conversion/'+spec.id,async()=>{const r=await runCodeConversionCase({spec,nativeInput});(window.__codeConversionResults??=[]).push(r);assert(!r.error,r.error);equal(r.planned,r.completedPhases);equal(r.diagnostics,spec.kind==='selected-widget'?(spec.menu==='inline'?[{code:'command.failed',operation:'selection.convert'}]:[{code:'command.failed',operation:'block.convert'},{code:'command.failed',operation:'block-toolbar'}]):[]);equal(r.unsupported,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
