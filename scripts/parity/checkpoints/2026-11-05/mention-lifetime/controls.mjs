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
 ['synthetic-query',d=>{item(d,'query').nativeEvents[0].trusted=false}],
 ['synthetic-commit',d=>{item(d,'destroy').nativeEvents.find(e=>e.role==='commit').trusted=false}],
 ['old-popup-survives',d=>change(d,'query','retire','oldPopupDisconnected',()=>false)],
 ['pending-request-not-aborted',d=>change(d,'render','retire','oldSignalAborted',()=>false)],
 ['stale-data-mutated',d=>change(d,'query','late','canonicalLive',v=>{v[1].data.text='Stale'})],
 ['successor-popup-closed',d=>change(d,'mode-cycle','late','currentPopupRetained',()=>false)],
 ['successor-loader-cleared',d=>change(d,'pagination','late','loading',()=>false)],
 ['stale-callback',d=>change(d,'remove','late','callbacks',()=>[{owner:'a',data:{id:'stale',name:'Stale'}}])],
 ['stale-transaction',d=>change(d,'query','late','transactionsUnchanged',v=>v+1)],
 ['duplicate-pagination',d=>change(d,'pagination','late','successorPageRequests',()=>2)],
 ['stale-pagination-row',d=>change(d,'pagination','late','rows',()=>['Stale'])],
 ['retained-delivery-misreported',d=>change(d,'retained-row','late','retainedDelivery',v=>{v[1].trusted=true})],
 ['retained-row-committed',d=>change(d,'retained-row','commit','canonicalLive',v=>{v[2].inline.inserted.data.id='alpha'})],
 ['wrong-destroy-owner',d=>{item(d,'destroy').transactions.find(e=>e.name==='inline.insert').owner='a'}],
 ['callback-id-changed',d=>change(d,'destroy','commit','callbacks',v=>{v[0].data.id='other'})],
 ['undo-data-wrong',d=>change(d,'caret','undo','canonicalLive',v=>{v[2].data.text='Stale'})],
 ['redo-raw-changed',d=>change(d,'query','redo','canonicalLive',v=>{v[1].data.text+='x'})],
 ['caller-mutated',d=>change(d,'render','redo','caller',v=>{v.blocks[1].data.text='Changed'})],
 ['legacy-availability-omitted',d=>{d.results[0].cases.find(c=>c.id==='caret').unsupported.pop()}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
