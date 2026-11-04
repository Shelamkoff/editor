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
 ['synthetic-choice',d=>{item(d,'ordered/local/false').nativeEvents[1].trusted=false}],
 ['style-lost',d=>change(d,'ordered/outer/true','convert','meaning',v=>{v[1].data.style='unordered'})],
 ['selected-item-retained',d=>change(d,'unordered/item/false','convert','meaning',v=>{v[1].data.items.splice(1,0,{id:'b',text:[]})})],
 ['unselected-empty-ids-erased',d=>change(d,'ordered/empty/false','convert','meaning',v=>{v[1].data.items=[{id:'new',text:[]}]})],
 ['unselected-prefix-lost',d=>change(d,'unordered/adjacent/true','convert','meaning',v=>{v[1].data.items[0].text=[]})],
 ['unselected-suffix-id-changed',d=>change(d,'ordered/outer/false','convert','meaning',v=>{v[1].data.items[1].id='new'})],
 ['selected-bold-lost',d=>change(d,'unordered/local/false','convert','meaning',v=>{v[2].data.text[0].marks=[]})],
 ['cross-break-lost',d=>change(d,'ordered/adjacent/false','convert','meaning',v=>{v[2].data.text=v[2].data.text.filter(x=>!x.br)})],
 ['source-sidecar-lost',d=>change(d,'unordered/local/true','convert','meaning',v=>{delete v[1].inline.swatchB})],
 ['selected-sidecar-lost',d=>change(d,'ordered/widget/false','convert','meaning',v=>{delete v[2].inline})],
 ['selected-widget-still-in-source',d=>change(d,'unordered/widget/true','convert','meaning',v=>{v[1].inline.swatchA=v[2].inline.swatchA})],
 ['widget-dot-changed',d=>change(d,'ordered/outer/true','convert','widgets',v=>{v.at(-1).dot='rgb(0, 0, 0)'})],
 ['target-id-reused',d=>{item(d,'unordered/item/false').targetId='seed'}],
 ['target-caret-wrong',d=>change(d,'ordered/empty/true','convert','nativeSelection',v=>{v.anchor[4]=1;v.focus[4]=1})],
 ['undo-direction-lost',d=>change(d,'unordered/outer/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['raw-redo-id-drift',d=>change(d,'ordered/item/true','redo','canonical',v=>{v[2].id='new'})],
 ['raw-redo-bold-lost',d=>change(d,'unordered/local/true','redo','canonical',v=>{v[2].data.text='ph'})],
 ['parent-failure-hidden',d=>{d.results.find(r=>r.source==='parent').cases.find(c=>c.id==='ordered/item/false').observations.find(o=>o.phase==='convert'&&o.property==='meaning').status='PASS'}],
 ['legacy-availability-omitted',d=>{const c=d.results[0].cases.find(c=>c.chooserAvailable===false);assert(c);c.observations=c.observations.filter(o=>o.phase!=='availability')}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
