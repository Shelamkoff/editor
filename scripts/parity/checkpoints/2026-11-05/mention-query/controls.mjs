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
 ['synthetic-query',d=>{item(d,'default-keyboard').nativeEvents[0].trusted=false}],
 ['pointer-missed',d=>{item(d,'default-pointer').nativeEvents.find(e=>e.type==='click').hit=false}],
 ['callback-id-coerced',d=>change(d,'snapshot','choose','callbacks',v=>{v[0].data.id='42'})],
 ['canonical-id-not-string',d=>change(d,'unicode/hash','choose','canonical',v=>{v[1].inline.inserted.data.id=42})],
 ['unicode-trigger-lost',d=>change(d,'unicode/emoji','choose','widgetText',()=> '@Ada')],
 ['wrong-page-cursor',d=>change(d,'pagination-pointer','choose','pageCursors',()=>['wrong'])],
 ['debounce-query-escaped',d=>change(d,'debounce','query','debouncedQueriesBefore',()=>1)],
 ['options-not-snapshotted',d=>change(d,'snapshot','choose','alternativeCalls',()=>1)],
 ['loading-renderer-lost',d=>change(d,'loading-custom','query','customLoading',v=>{v.tag='div'})],
 ['empty-renderer-lost',d=>change(d,'empty-custom','results','empty',v=>{v.custom=false})],
 ['active-markup-in-row',d=>change(d,'default-keyboard','results','rows',v=>{v[1].activeMarkup=1})],
 ['avatar-lost',d=>change(d,'default-pointer','results','rows',v=>{v[0].avatar=null})],
 ['custom-style-lost',d=>change(d,'custom-keyboard','results','rows',v=>{v[0].style='rgba(0, 0, 0, 0)'})],
 ['custom-row-connected',d=>{item(d,'custom-pointer').renderLog[0].connected=true}],
 ['aria-selection-lost',d=>change(d,'default-keyboard','results','activeDescendant',()=>false)],
 ['wrong-editor-owner',d=>{item(d,'multi-editor').transactions.find(e=>e.name==='inline.insert').owner='a'}],
 ['undo-data-wrong',d=>change(d,'pagination-keyboard','undo','canonical',v=>{v[1].data.text=''})],
 ['caller-mutated',d=>change(d,'default-keyboard','dispose','caller',v=>{v.blocks[1].data.text='Changed'})],
 ['invalid-trigger-accepted',d=>change(d,'option-validation','validate','reject/ab',()=>false)]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
