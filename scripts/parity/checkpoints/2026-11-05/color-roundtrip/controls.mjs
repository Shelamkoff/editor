import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const a='copy/columns/columns/true',b='copy/paragraph/paragraph/false'
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['page-error',d=>row(d).pageErrors.push('failure')],
 ['untrusted-enter',d=>{item(d,'split/6').nativeEvents[0].trusted=false}],
 ['untrusted-copy',d=>{item(d,a).nativeEvents.find(e=>e.type==='copy').trusted=false}],
 ['untrusted-paste',d=>{item(d,b).nativeEvents.find(e=>e.type==='paste').trusted=false}],
 ['literal-hydrated',d=>change(d,'split/2','action','canonical',v=>{v[2].data.text='{{red}}Z'})],
 ['selected-sidecar-lost',d=>change(d,'split/1','action','canonical',v=>{delete v[2].inline})],
 ['unselected-sidecar-copied',d=>change(d,a,'copy','clipboard',v=>{v.values.push('#789abc')})],
 ['structured-layout-lost',d=>change(d,a,'paste','canonical',v=>{v[2].data.layout='1-2'})],
 ['target-sibling-changed',d=>change(d,a,'paste','canonical',v=>{v[1].data.columns[0].content='Changed'})],
 ['private-transfer-changed',d=>change(d,b,'paste','clipboard',v=>{v.same=false})],
 ['merge-collision-overwritten',d=>change(d,'merge/Delete/true','action','canonical',v=>{v[1].inline.blue.data.value='#123456'})],
 ['literal-split-text-lost',d=>change(d,'split/6','action','canonical',v=>{v[2].data.text='<span class="oe-inline-literal">wrong</span>Z'})],
 ['created-identity-reused',d=>{item(d,a).newId='seed'}],
 ['caller-mutated',d=>change(d,'merge/Backspace/false','redo','caller',v=>{v.blocks[1].data.text='Changed'})],
 ['source-caller-mutated',d=>change(d,a,'redo','sourceCaller',v=>{v.blocks[0].data.columns[1].content='Changed'})],
 ['copy-created-history',d=>change(d,a,'copy','sourceHistory',()=>[true,false])],
 ['undo-data-wrong',d=>change(d,b,'undo','canonical',v=>{v[1].data.text=''})],
 ['redo-raw-changed',d=>change(d,'split/1','redo','canonical',v=>{v[2].data.text+='x'})],
 ['wrong-action-owner',d=>{item(d,b).transactions[0].origin='external'}],
 ['legacy-availability-omitted',d=>{d.results[0].cases.find(c=>c.spec.kind==='copy').unsupported.pop()}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
