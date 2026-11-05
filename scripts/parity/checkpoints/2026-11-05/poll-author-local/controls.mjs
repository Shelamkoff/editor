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
 ['question-mark-lost',d=>change(d,'author/question','action','canonical',v=>{v[1].data.question='ChXoose why?'})],
 ['option-identity-lost',d=>change(d,'author/option-b','action','canonical',v=>{v[1].data.options[0].id='other'})],
 ['sort-counts-reassigned',d=>change(d,'author/sort','action','canonical',v=>{v[1].data.initialResults.options[0].votes=3})],
 ['minimum-removal-active',d=>change(d,'author/remove-button','action','minimumRemoveControls',()=>1)],
 ['new-identity-reused',d=>{item(d,'author/add-enter').newId='b'}],
 ['synthetic-add',d=>{item(d,'author/add-enter').nativeEvents[0].trusted=false}],
 ['results-mode-wrong',d=>change(d,'author/mode-always','action','canonical',v=>{v[1].data.resultsMode='always'})],
 ['type-ballot-wrong',d=>change(d,'author/type-multiple','action','canonical',v=>{v[1].data.initialResults.currentUserVote=['b','a']})],
 ['reset-ids-wrong',d=>change(d,'author/reset','action','canonical',v=>{v[1].data.options[0].id='other'})],
 ['single-percent-wrong',d=>change(d,'local/single/always/false','vote','paint',v=>{v[0].pct='60%'})],
 ['multiple-denominator-wrong',d=>change(d,'local/multiple/always/false','vote','canonical',v=>{v[1].data.initialResults.total=9})],
 ['revote-double-counted',d=>change(d,'local/multiple/always/true','vote','canonical',v=>{v[1].data.initialResults.options[0].votes++})],
 ['duplicate-vote-history',d=>change(d,'local/single/always/true','repeat','transactions',()=>2)],
 ['after-vote-results-hidden',d=>change(d,'local/single/afterVote/false','vote','paint',()=>[])],
 ['native-click-missed',d=>{item(d,'author/sort').nativeEvents[0].hit=false}],
 ['undo-data-wrong',d=>change(d,'author/remove-empty','undo','canonical',v=>{v[1].data.options.pop()})],
 ['redo-raw-changed',d=>change(d,'author/add-button','redo','canonical',v=>{v[1].data.options[0].text='Changed'})],
 ['caller-mutated',d=>change(d,'local/multiple/hidden/false','redo','caller',v=>{v.blocks[1].data.type='single'})],
 ['wrong-action-origin',d=>{item(d,'local/single/always/false').transactions[0].origin='external'}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
