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
 ['title-missing',d=>change(d,'editor/en/explicit','resolve','voterTitle',()=>null)],
 ['count-capped',d=>change(d,'editor/en/explicit','resolve','voterTitle',()=> 'Voters: 2')],
 ['zero-fell-back',d=>change(d,'editor/en/zero','resolve','voterTitle',()=> 'Voters: 2')],
 ['fallback-over-cap',d=>change(d,'editor/ru/absent','resolve','voterTitle',()=> 'Проголосовали: 3')],
 ['locale-lost',d=>change(d,'editor/ru/explicit','resolve','voterTitle',()=> 'Voters: 9')],
 ['title-hidden',d=>change(d,'renderer/en/explicit','resolve','titleVisible',()=>false)],
 ['voter-cap-lost',d=>change(d,'renderer/ru/explicit','resolve','retainedNames',v=>{v.push('Third')})],
 ['active-voter-markup',d=>change(d,'editor/en/absent','resolve','activeMarkup',()=>1)],
 ['provider-data-mutated',d=>change(d,'renderer/en/zero','resolve','sourceResult',v=>{v.votersTotal=2})],
 ['author-data-mutated',d=>change(d,'editor/ru/zero','resolve','canonical',v=>{v[0].data.question='Changed'})],
 ['author-history-added',d=>change(d,'editor/en/explicit','resolve','history',()=>[true,false])],
 ['caller-mutated',d=>change(d,'renderer/ru/absent','dispose','caller',v=>{v.blocks[0].data.options.pop()})],
 ['request-signal-wrong',d=>change(d,'editor/en/explicit','load','loadCalls',v=>{v[0].signal=false})],
 ['subscription-not-released',d=>change(d,'renderer/en/explicit','dispose','subscriptions',v=>{v[0].releases=0})],
 ['parent-title-fabricated',d=>{const c=d.results.find(r=>r.source==='parent').cases[0],o=c.observations.find(o=>o.property==='voterTitle');o.actual=o.expected;o.status='PASS'}]
];assert.equal(variants.length,20);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
