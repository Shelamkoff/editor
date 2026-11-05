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
 ['live-order-lost',d=>change(d,'editor/load-after-live','exercise','paint',v=>{v[0].pct='40%'})],
 ['revision-not-forwarded',d=>change(d,'editor/flow-single','exercise','voteCalls',v=>{v[0].revision='9'})],
 ['multiple-ballot-incomplete',d=>change(d,'renderer/flow-multiple','exercise','voteCalls',v=>{v[0].optionIds=['c']})],
 ['voter-total-capped',d=>change(d,'editor/flow-single','exercise','voterTitle',()=> 'Voters: 2')],
 ['literal-name-parsed',d=>change(d,'renderer/flow-single','exercise','voterNames',v=>{v[0]='Ada'})],
 ['duplicate-request',d=>change(d,'editor/duplicate-vote','exercise','voteCallsWhilePending',()=>2)],
 ['rejected-load-hidden',d=>change(d,'renderer/reject-load','exercise','errorVisible',()=>false)],
 ['retry-blocked',d=>change(d,'editor/reject-vote','exercise','retryEnabled',()=>false)],
 ['pending-vote-not-cancelled',d=>change(d,'renderer/dispose-vote','dispose','voteSignals',()=>[false])],
 ['subscription-leak',d=>change(d,'editor/replace-poll','dispose','subscriptionRelease',v=>{v[0].releases=0})],
 ['stale-output-written',d=>change(d,'renderer/dispose-load','exercise','latePaintUnchanged',()=>false)],
 ['remote-history-added',d=>{item(d,'editor/flow-single').transactions.push({action:'commit',origin:'plugin',name:'block.update'})}],
 ['caller-mutated',d=>change(d,'renderer/local/multiple/always','exercise','caller',v=>{v.blocks[0].data.question='Changed'})],
 ['synthetic-vote',d=>{item(d,'editor/flow-single').nativeEvents[0].trusted=false}],
 ['author-caret-lost',d=>change(d,'editor/author-edit','exercise','caret',()=>[false,0])],
 ['undo-runtime-saved',d=>change(d,'editor/author-edit','exercise','undoCanonical',v=>{v[0].data.initialResults.total=10})],
 ['fallback-hidden-results-shown',d=>change(d,'renderer/local/single/hidden','exercise','paint',()=>[{label:'Alpha',pct:'0%',width:'0%'}])],
 ['missing-id-silently-local',d=>change(d,'editor/missing-id','exercise','providerCalls',()=>[0,1,0])],
 ['replacement-identity-wrong',d=>change(d,'renderer/replace-poll','exercise','newIdentity',()=>['remote-1','remote-1'])]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
