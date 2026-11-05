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
 ['synthetic-toggle',d=>{item(d,'checked/toggle/0').nativeEvents[0].trusted=false}],
 ['synthetic-type',d=>{item(d,'unchecked/type/text/true').nativeEvents[0].trusted=false}],
 ['wrong-toggled-item',d=>change(d,'checked/toggle/1','action','canonical',v=>{v[1].data.items[1].checked=true})],
 ['unrelated-check-changed',d=>change(d,'unchecked/toggle/0','action','canonical',v=>{v[1].data.items[2].checked=true})],
 ['checked-projection-stale',d=>change(d,'checked/toggle/1','action','checkedProjection',v=>{v[1]='true'})],
 ['new-item-inherits-check',d=>change(d,'checked/split/middle','action','canonical',v=>{v[1].data.items[2].checked=true})],
 ['source-check-lost',d=>change(d,'checked/split/end','action','canonical',v=>{v[1].data.items[1].checked=false})],
 ['typed-bold-lost',d=>change(d,'checked/type/text/false','action','canonical',v=>{v[1].data.items[1].text='AlXYa {{swatchA}}<br>tail'})],
 ['native-space-changed',d=>change(d,'unchecked/type/widget/true','action','canonical',v=>{v[1].data.items[1].text='<b>Alpha</b> XY<br>tail'})],
 ['widget-sidecar-lost',d=>change(d,'checked/merge/1','action','canonical',v=>{delete v[1].inline})],
 ['merge-check-overwritten',d=>change(d,'checked/merge/1','action','canonical',v=>{v[1].data.items[0].checked=true})],
 ['cross-suffix-id-drift',d=>change(d,'unchecked/cross/true','action','canonical',v=>{v[1].data.items[1].id='fresh'})],
 ['cross-invented-paragraph',d=>change(d,'checked/cross/false','action','canonical',v=>{v.splice(2,0,{id:'extra',type:'paragraph',dataVersion:2,data:{text:''}})})],
 ['empty-sole-not-exited',d=>change(d,'checked/empty/sole/markup','action','canonical',v=>{v[1].type='checklist'})],
 ['caret-wrong',d=>change(d,'unchecked/split/after-widget','action','nativeSelection',v=>{v.anchor[3]=1;v.focus[3]=1})],
 ['undo-direction-lost',d=>change(d,'checked/replace/text/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-id-drift',d=>change(d,'unchecked/split/start','redo','canonical',v=>{v[1].data.items[2].id='different'})],
 ['extra-history-entry',d=>{item(d,'checked/toggle/0').transactions.push({action:'commit',origin:'plugin',name:'block.update'})}],
 ['caller-mutated',d=>change(d,'unchecked/cross/true','redo','caller',v=>{v.blocks[1].data.items[0].checked=false})]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
