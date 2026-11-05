import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['page-error',d=>row(d).pageErrors.push('failure')],
 ['synthetic-delete',d=>{item(d,'merge/false/false/Delete').nativeEvents[0].trusted=false}],
 ['synthetic-export',d=>{item(d,'export/tune/true').nativeEvents[1].trusted=false}],
 ['target-check-overwritten',d=>change(d,'merge/false/false/Backspace','action','canonical',v=>{v[1].data.items[0].checked=true})],
 ['source-check-lost',d=>change(d,'merge/true/false/Delete','action','canonical',v=>{v[1].data.items[3].checked=false})],
 ['collision-id-not-rebased',d=>change(d,'merge/false/true/Backspace','action','canonical',v=>{v[1].data.items[2].id='shared'})],
 ['target-tail-id-changed',d=>change(d,'merge/true/true/Delete','action','canonical',v=>{v[1].data.items[1].id='fresh'})],
 ['source-marks-lost',d=>change(d,'merge/false/false/Delete','action','canonical',v=>{v[1].data.items[2].text='Next {{swatchB}}'})],
 ['source-sidecar-lost',d=>change(d,'merge/true/true/Backspace','action','canonical',v=>{delete v[1].inline.swatchB})],
 ['wrong-widget-label',d=>change(d,'merge/false/true/Delete','action','widgets',v=>{v[1].label='#aBcDef'})],
 ['wrong-widget-dot',d=>change(d,'merge/true/false/Backspace','action','widgets',v=>{v[0].dot='rgb(0, 0, 0)'})],
 ['editable-widget',d=>change(d,'export/inline/true','action','widgets',v=>{v[0].editable='true'})],
 ['export-label-lost',d=>change(d,'export/inline/false','action','canonical',v=>{v[1].data.text='<b>First</b> {{swatchA}}'})],
 ['export-id-drift',d=>change(d,'export/tune/false','action','canonical',v=>{v[1].id='new'})],
 ['export-retains-ghost-check',d=>change(d,'export/inline/true','action','checkedProjection',()=>['false'])],
 ['merge-caret-wrong',d=>change(d,'merge/false/false/Backspace','action','nativeSelection',v=>{v.anchor[2]=0;v.focus[2]=0})],
 ['undo-direction-lost',d=>change(d,'export/inline/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-check-lost',d=>change(d,'merge/true/true/Backspace','redo','canonical',v=>{v[1].data.items[0].checked=false})],
 ['extra-history-entry',d=>{item(d,'merge/true/false/Delete').transactions.push({action:'commit',origin:'user',name:'extra'})}],
 ['legacy-body-omitted',d=>{d.results[0].cases.at(-1).completedPhases.pop()}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
