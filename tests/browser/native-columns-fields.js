import {columnsRichFieldsCases,runColumnsRichFieldsCase} from './columns-rich-fields-fixture.js'
import {columnsFieldConversionCases,runColumnsFieldConversionCase} from './columns-field-conversion-fixture.js'
import {test,assert,equal,run} from './regressions/harness.js'
if(document.querySelector('meta[http-equiv="Content-Security-Policy"]'))test('Columns fields Trusted Types policy rejects untrusted HTML',()=>{let denied=false;try{document.createElement('div').innerHTML='<b>untrusted</b>'}catch(e){denied=e instanceof TypeError}assert(denied)})
const nativeInput=(method,params)=>method==='Input.dispatchMouseEvent'?window.__testInput('Input.hover',{x:params.x,y:params.y}):window.__testInput(method,params)
for(const[group,cases,execute]of[['rich',columnsRichFieldsCases,runColumnsRichFieldsCase],['conversion',columnsFieldConversionCases,runColumnsFieldConversionCase]])for(const spec of cases)test('Columns fields '+group+'/'+spec.id,async()=>{const r=await execute({spec,nativeInput});(window.__columnsFieldsResults??=[]).push({group,...r});assert(!r.error,r.error);equal(r.planned,r.completedPhases);equal(r.diagnostics,[]);equal(r.unsupported,[]);for(const o of r.observations)equal(o.actual,o.expected,o.phase+'/'+o.property)})
await run()
