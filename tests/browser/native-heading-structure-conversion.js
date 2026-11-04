import {headingStructureCases,runHeadingStructureCase} from './heading-structure-fixture.js'
import {headingConversionCases,runHeadingConversionCase} from './heading-conversion-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Heading Trusted Types policy rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
const nativeInput=(method,params)=>method==='Input.dispatchMouseEvent'?window.__testInput('Input.hover',{x:params.x,y:params.y}):window.__testInput(method,params)
for(const[group,cases,execute]of[['structure',headingStructureCases,runHeadingStructureCase],['conversion',headingConversionCases,runHeadingConversionCase]])for(const spec of cases)test('Heading '+group+'/'+spec.id,async()=>{const r=await execute({spec,nativeInput});(window.__headingResults??=[]).push({group,...r});assert(!r.error,r.error);equal(r.planned,r.completedPhases);equal(r.diagnostics,[]);equal(r.unsupported,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
