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
 ['synthetic-enter',d=>{item(d,'ordered/cross/false').nativeEvents[0].trusted=false}],
 ['style-lost',d=>change(d,'ordered/split/middle','action','canonical',v=>{v[1].data.style='unordered'})],
 ['split-prefix-id-lost',d=>change(d,'unordered/split/start','action','canonical',v=>{v[1].data.items[1].id='new'})],
 ['split-suffix-wrong',d=>change(d,'ordered/split/after-widget','action','canonical',v=>{v[1].data.items[2].text='tail'})],
 ['selected-widget-retained',d=>change(d,'unordered/replace/widget/true','action','canonical',v=>{v[1].data.items[1].text+='{{swatchA}}'})],
 ['sidecar-lost',d=>change(d,'ordered/replace/text/false','action','canonical',v=>{delete v[1].inline})],
 ['wrong-merge-target',d=>change(d,'unordered/merge/2','action','canonical',v=>{v[1].data.items[0].text+='Last'})],
 ['merge-join-caret-lost',d=>change(d,'ordered/merge/1','action','nativeSelection',v=>{v.anchor[1]=0;v.focus[1]=0})],
 ['sole-exit-changes-id',d=>change(d,'unordered/empty/sole/br','action','canonical',v=>{v[1].id='new'})],
 ['last-exit-drops-list',d=>change(d,'ordered/empty/last/markup','action','canonical',v=>v.filter(b=>b.type!=='list'))],
 ['cross-prefix-erased',d=>change(d,'ordered/cross/false','action','canonical',v=>{v[1].data.items[0].text=''})],
 ['cross-suffix-id-replaced',d=>change(d,'unordered/cross/true','action','canonical',v=>{v[1].data.items[1].id='new'})],
 ['invented-paragraph',d=>change(d,'ordered/cross/true','action','canonical',v=>{v.splice(2,0,{id:'invented',type:'paragraph',dataVersion:2,data:{text:''}})})],
 ['wrong-list-tag',d=>change(d,'unordered/split/end','action','listTag',()=> 'ol')],
 ['undo-direction-lost',d=>change(d,'ordered/cross/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-item-id-drift',d=>change(d,'unordered/split/middle','redo','canonical',v=>{v[1].data.items[2].id='new'})],
 ['created-id-forged',d=>{item(d,'ordered/split/end').createdItemId='a'}],
 ['extra-split-commit',d=>item(d,'unordered/cross/false').transactions.push({action:'commit',origin:'user',name:'selection.split'})],
 ['parent-failure-hidden',d=>{const c=d.results.find(r=>r.source==='parent').cases.find(c=>c.id==='ordered/cross/false');c.observations.find(o=>o.phase==='action'&&o.property==='canonical').status='PASS'}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
