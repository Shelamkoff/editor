import {inlineOutputCases,runInlineOutputCase} from './inline-output-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Inline output rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
for(const spec of inlineOutputCases)test('Inline output/'+spec.id,async()=>{const r=await runInlineOutputCase({spec});(window.__inlineOutputResults??=[]).push(r);assert(!r.error,r.error);equal(r.completedPhases,r.planned);equal(r.diagnostics,[]);equal(r.unsupported,[]);equal(r.nativeEvents,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
