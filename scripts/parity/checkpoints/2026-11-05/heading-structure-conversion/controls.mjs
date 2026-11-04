import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const common=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['page-error',d=>row(d).pageErrors.push('failure')]
]
const structure=[
 ['synthetic-enter',d=>{item(d,'h2/split/middle').nativeEvents[0].trusted=false}],
 ['source-level-lost',d=>change(d,'h5/split/middle','action','canonical',v=>{v[1].data.level=2})],
 ['suffix-wrong-type',d=>change(d,'h3/split/start','action','canonical',v=>{v[2].type='heading';v[2].data.level=3})],
 ['widget-sidecar-lost',d=>change(d,'h4/split/after-widget','action','canonical',v=>{delete v[1].inline})],
 ['authored-break-lost',d=>change(d,'h6/split/after-widget','action','canonical',v=>{v[2].data.text='tail'})],
 ['source-id-replaced',d=>change(d,'h2/split/end','action','canonical',v=>{v[1].id='different'})],
 ['fresh-id-forged',d=>{item(d,'h2/split/middle').createdId='seed'}],
 ['backward-range-reversed',d=>change(d,'h4/replace/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['selected-widget-retained',d=>change(d,'h6/widget/true','action','canonical',v=>{v[1].data.text+='{{swatchA}}'})],
 ['exit-heading-retained',d=>change(d,'h2/exit/Enter/markup','action','canonical',v=>{v[0].type='heading';v[0].data.level=2})],
 ['exit-replaces-id',d=>change(d,'h6/exit/Backspace/plain','action','canonical',v=>{v[0].id='new'})],
 ['raw-redo-id-drift',d=>change(d,'h3/split/middle','redo','canonical',v=>{v[2].id='new'})],
 ['wrong-caret',d=>change(d,'h5/split/end','action','nativeSelection',v=>{v.anchor[2]=1;v.focus[2]=1})],
 ['extra-commit',d=>item(d,'h2/split/start').transactions.push({action:'commit',origin:'user',name:'block.split'})],
 ['caller-level-mutated',d=>change(d,'h6/split/start','redo','caller',v=>{v.blocks[1].data.level=2})]
]
const conversion=[
 ['synthetic-type-choice',d=>{item(d,'h2/whole/false').nativeEvents[1].trusted=false}],
 ['source-level-reset',d=>change(d,'h5/middle/false','convert','canonical',v=>{v[1].data.level=2})],
 ['residual-level-reset',d=>change(d,'h6/widget/true','convert','canonical',v=>{v[3].data.level=2})],
 ['selected-sidecar-lost',d=>change(d,'h3/widget/false','convert','canonical',v=>{delete v[2].inline})],
 ['residual-sidecar-lost',d=>change(d,'h4/middle/true','convert','canonical',v=>{delete v[3].inline})],
 ['wrong-split-boundary',d=>change(d,'h2/middle/false','convert','canonical',v=>{v[2].data.text='<b>pha</b>'})],
 ['whole-id-changed',d=>{item(d,'h5/whole/true').targetId='new'}],
 ['partial-id-reused',d=>{item(d,'h4/middle/false').targetId='seed'}],
 ['residual-id-aliased',d=>{const c=item(d,'h6/widget/false');c.residualId=c.targetId}],
 ['wrong-target-caret',d=>change(d,'h3/middle/false','convert','nativeSelection',v=>{v.anchor=2;v.focus=2})],
 ['undo-direction-lost',d=>change(d,'h2/widget/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-id-drift',d=>change(d,'h6/middle/true','redo','canonical',v=>{v[2].id='new'})],
 ['extra-commit',d=>item(d,'h3/whole/false').transactions.push({action:'commit',origin:'user',name:'selection.convert'})],
 ['caller-level-mutated',d=>change(d,'h4/widget/true','redo','caller',v=>{v.blocks[1].data.level=2})],
 ['legacy-availability-omitted',d=>{d.results[0].cases.find(c=>c.spec.kind==='widget').observations=d.results[0].cases.find(c=>c.spec.kind==='widget').observations.filter(o=>o.phase!=='availability')}]
]
const variants=[...common,...(raw.group==='heading-structure'?structure:conversion)];assert.equal(variants.length,20);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
