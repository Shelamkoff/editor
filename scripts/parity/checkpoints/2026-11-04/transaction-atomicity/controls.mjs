import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>row(d).cases.pop()],
 ['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],
 ['page-error',d=>row(d).pageErrors.push('failure')],
 ['legacy-module-invented',d=>{d.sources[0].transactionEnginePresent=true}],
 ['legacy-body-claimed',d=>{d.results[0].cases[0].inputKind='module-contract'}],
 ['partial-document-accepted',d=>change(d,'false','reject','state',v=>{v.blocks[0].data.text='partial'})],
 ['removed-block-not-restored',d=>change(d,'null','reject','state',v=>{v.blocks.pop()})],
 ['rejected-revision-moved',d=>change(d,'undefined','reject','state',v=>{v.revision++})],
 ['redo-cursor-consumed',d=>change(d,'zero','reject','state',v=>{v.redo=0})],
 ['nested-false-swallowed',d=>change(d,'false','reject','rejected',v=>{v.thrown=false;v.sameValue=false})],
 ['nan-identity-lost',d=>change(d,'nan','reject','rejected',v=>{v.sameValue=false})],
 ['async-result-accepted',d=>change(d,'async-result','reject','rejected',v=>{v.typeError=false})],
 ['prepare-unexpected-apply',d=>change(d,'prepare','reject','projectionAtRejection',v=>{v.push('apply')})],
 ['apply-draft-not-discarded',d=>{item(d,'apply').projection.splice(3,1)}],
 ['rejected-operation-published',d=>change(d,'empty','reject','published',v=>{v.push({action:'commit',origin:'user',name:'rejected'})})],
 ['terminal-write-accepted',d=>change(d,'recovery','continue','terminal',v=>{v.writeBlocked=false})],
 ['terminal-failed-state-cleared',d=>change(d,'recovery','continue','state',v=>{v.phase='idle'})],
 ['later-history-wrong-document',d=>change(d,'apply','replay','redoState',v=>{v.blocks[0].data.text='partial'})],
 ['caller-data-mutated',d=>change(d,'null','replay','caller',v=>{v.blocks[0].data.text='partial'})],
 ['extra-publication',d=>item(d,'prepare').transactions.push({action:'commit',origin:'user',name:'rejected'})]
]
assert.equal(variants.length,22);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
