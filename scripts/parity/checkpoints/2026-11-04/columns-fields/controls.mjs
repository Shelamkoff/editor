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
const rich=[
 ['synthetic-edit',d=>{item(d,'edit/0').nativeEvents[0].trusted=false}],
 ['synthetic-format',d=>{item(d,'local/0/apply/false').nativeEvents[0].trusted=false}],
 ['wrong-field-written',d=>change(d,'edit/0','action','meaning',v=>{v[1].data.columns[1].content=v[1].data.columns[0].content})],
 ['lost-selected-bold',d=>change(d,'local/0/apply/false','action','meaning',v=>{v[1].data.columns[0].content[1].marks=['i']})],
 ['unselected-mark-removed',d=>change(d,'local/2/remove/true','action','meaning',v=>{v[1].data.columns[2].content[0].marks=[]})],
 ['middle-column-not-formatted',d=>change(d,'cross/0-2/apply/false','action','meaning',v=>{v[1].data.columns[1].content[0].marks=['i']})],
 ['sidecar-lost',d=>change(d,'cross/0-1/remove/false','action','meaning',v=>{delete v[1].inline.swatchC})],
 ['column-id-replaced',d=>change(d,'edit/1','action','meaning',v=>{v[1].data.columns[1].id='new'})],
 ['widget-dot-changed',d=>change(d,'edit/2','action','widgets',v=>{v[2][0].dot='rgb(0, 0, 0)'})],
 ['visible-mark-lost',d=>change(d,'local/1/apply/true','action','visible',v=>{v[1][1].marks=[]})],
 ['backward-range-lost',d=>change(d,'cross/0-2/remove/true','select','selection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['raw-redo-format-lost',d=>change(d,'local/0/apply/false','redo','canonical',v=>{v[1].data.columns[0].content=v[1].data.columns[0].content.replace(/<\/?b>/g,'')})],
 ['undo-neighbor-modified',d=>change(d,'edit/0','undo','canonical',v=>{v[0].data.text='Changed'})],
 ['extra-format-commit',d=>item(d,'local/0/remove/false').transactions.push({action:'commit',origin:'user',name:'inline.bold'})],
 ['caller-owned-ids-mutated',d=>change(d,'edit/2','redo','caller',v=>{v.blocks[1].data.columns[2].id='new'})]
]
const conversion=[
 ['synthetic-type-choice',d=>{item(d,'a/text/forward').nativeEvents[1].trusted=false}],
 ['empty-layout-erased',d=>change(d,'a/empty/forward','convert','canonical',v=>v.filter(b=>b.type!=='columns'))],
 ['wrong-residual-layout',d=>change(d,'b/widget/backward','convert','canonical',v=>{v[1].data.layout='1-1'})],
 ['unselected-column-lost',d=>change(d,'c/text/forward','convert','canonical',v=>{v[1].data.columns.pop()})],
 ['source-sidecar-lost',d=>change(d,'a/widget/forward','convert','canonical',v=>{delete v[1].inline})],
 ['selected-mark-lost',d=>change(d,'b/text/forward','convert','canonical',v=>{v[2].data.text='Alpha'})],
 ['survivor-remounted',d=>change(d,'c/widget/backward','convert','survivorFieldRetained',()=>false)],
 ['survivor-color-changed',d=>change(d,'a/text/backward','convert','survivorWidget',v=>{v.value='#000000';v.dot='rgb(0, 0, 0)'})],
 ['redo-created-new-id',d=>change(d,'c/empty/forward','redo','canonical',v=>{v[2].id='different-target'})],
 ['identity-observation-forged',d=>{item(d,'b/empty/backward').createdId='different-target'}],
 ['unselected-empty-mark-erased',d=>change(d,'a/empty/backward','convert','canonical',v=>{v[1].data.columns[2].content=''})],
 ['source-id-reused',d=>change(d,'b/widget/forward','convert','targetIdentity',v=>{v.sourceReused=true})],
 ['undo-fields-reordered',d=>change(d,'a/text/forward','undo','canonical',v=>{v[1].data.columns.reverse()})],
 ['extra-conversion-commit',d=>item(d,'a/text/forward').transactions.push({action:'commit',origin:'user',name:'selection.convert'})],
 ['caller-layout-mutated',d=>change(d,'c/empty/backward','redo','caller',v=>{v.blocks[1].data.layout='1-1'})]
]
const variants=[...common,...(raw.group==='columns-rich-fields'?rich:conversion)];assert.equal(variants.length,20);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
