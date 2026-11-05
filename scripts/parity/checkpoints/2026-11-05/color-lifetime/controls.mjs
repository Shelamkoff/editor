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
 ['synthetic-open',d=>{item(d,'mode-cycle').nativeEvents[0].trusted=false}],
 ['untrusted-foreign-apply',d=>{item(d,'destroy').nativeEvents.find(e=>e.role==='foreign-apply').trusted=false}],
 ['retained-event-misreported',d=>change(d,'other-widget','stale','retainedDelivery',v=>{v[3].trusted=true})],
 ['old-popup-connected',d=>change(d,'render-change','retire','oldPopupDisconnected',()=>false)],
 ['successor-data-mutated',d=>change(d,'mode-cycle','stale','canonicalA',v=>{v[1].inline.swatchA.data.value='#0000ff'})],
 ['successor-preview-mutated',d=>change(d,'mode-cycle','stale','sourceProjection',v=>{v[0].label='#0000ff'})],
 ['foreign-data-mutated',d=>change(d,'destroy','foreign-open','canonicalB',v=>{v[1].inline.swatchA.data.value='#0000ff'})],
 ['foreign-popup-closed',d=>change(d,'remove-block','foreign-open','foreignPopupRetained',()=>false)],
 ['retained-callback-transaction',d=>change(d,'render-remove','stale','transactionsUnchanged',()=>2)],
 ['foreign-apply-not-live',d=>change(d,'destroy','foreign-apply','canonicalB',v=>{v[1].inline.swatchA.data.value='#abcdef'})],
 ['foreign-paint-wrong',d=>change(d,'render-change','foreign-apply','foreignProjection',v=>{v[0].dot='rgb(0, 0, 0)'})],
 ['foreign-history-polluted',d=>change(d,'mode-cycle','foreign-open','historyB',()=>[true,false])],
 ['wrong-retirement-owner',d=>{item(d,'remove-block').transactions[0].owner='b'}],
 ['wrong-foreign-origin',d=>{item(d,'other-widget').transactions[0].origin='external'}],
 ['undo-history-wrong',d=>change(d,'destroy','undo','historyB',()=>[true,false])],
 ['caller-a-mutated',d=>change(d,'render-remove','redo','callerA',v=>{v.blocks[1].data.text='changed'})],
 ['caller-b-mutated',d=>change(d,'other-widget','redo','callerB',v=>{v.blocks[1].inline.swatchA.data.value='#000000'})],
 ['retained-disposed-popup',d=>change(d,'render-change','dispose','popupsRemoved',()=>false)],
 ['legacy-sharing-omitted',d=>{d.results[0].cases[0].unsupported.pop()}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
