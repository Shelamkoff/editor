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
 ['word-control-wrong',d=>change(d,'word/forward','control','nativeControlText',()=> '@ Lovelace')],
 ['synthetic-edit',d=>{item(d,'char/delete').nativeEvents.find(e=>e.type==='beforeinput').trusted=false}],
 ['identity-changed',d=>change(d,'char/backspace','action','canonical',v=>{v[1].inline.person.data.id='new'})],
 ['trigger-identity-retained',d=>change(d,'char/remove-trigger-forward','action','identity',()=> 'person')],
 ['unicode-mark-lost',d=>change(d,'char/unicode-back','action','canonical',v=>{v[1].inline.person.data.name='Ae'})],
 ['word-trailing-space-lost',d=>change(d,'word/back','action','canonical',v=>{v[1].inline.person.data.name='Ada'})],
 ['line-command-misreported',d=>{item(d,'line/begin-all').nativeEvents.find(e=>e.type==='beforeinput').inputType='deleteContentBackward'}],
 ['directed-range-lost',d=>change(d,'replace/false/true','select','labelSelection',v=>{v.anchor=1;v.focus=4})],
 ['cut-payload-stale',d=>change(d,'cut/false/false','action','canonical',v=>{v[1].inline.person.data.name='Ada Lovelace'})],
 ['paste-became-widget',d=>change(d,'paste/true/true','action','identity',()=> 'person')],
 ['widget-not-left',d=>change(d,'char/backspace','leave','editingClass',()=>true)],
 ['extra-history-action',d=>change(d,'paste/false/false','undo','history',()=>[true,true])],
 ['undo-data-wrong',d=>change(d,'line/end-name','undo','canonical',v=>{v[1].inline.person.data.name=''})],
 ['redo-raw-changed',d=>change(d,'cut/false/true','redo','canonical',v=>{v[1].data.text+='x'})],
 ['caller-mutated',d=>change(d,'word/back','redo','caller',v=>{v.blocks[1].inline.person.data.name='Changed'})],
 ['callback-fired',d=>change(d,'replace/false/false','action','callbacks',()=>[{id:'person-7',name:'Changed'}])],
 ['wrong-origin',d=>{item(d,'line/begin-middle').transactions[0].origin='external'}],
 ['caret-jumped',d=>change(d,'paste/false/true','action','editSelection',v=>{v.anchor=0;v.focus=0})],
 ['query-stale',d=>{item(d,'word/forward').queries=['Ada Lovelace']}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
