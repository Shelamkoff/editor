import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['missing-case',d=>row(d).cases.pop()],
 ['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],
 ['page-error',d=>row(d).pageErrors.push('failure')],
 ['synthetic-composition-start',d=>{item(d,'confirm').nativeEvents[0].trusted=false}],
 ['synthetic-preedit-update',d=>{item(d,'cancel').nativeEvents[1].trusted=false}],
 ['physical-ime-end-invented',d=>{item(d,'confirm').nativeEvents[4].trusted=true}],
 ['preedit-persisted',d=>change(d,'confirm','preedit','canonical',v=>{v[0].data.text='AにB'})],
 ['preedit-created-history',d=>change(d,'cancel','preedit','history',()=>[true,false])],
 ['backward-range-lost',d=>change(d,'replace-backward','preedit','initialSelection',v=>{v.anchor=1;v.focus=3})],
 ['confirm-duplicated',d=>change(d,'confirm','settle','canonical',v=>{v[0].data.text='A日本日本B'})],
 ['cancel-lost-author-text',d=>change(d,'cancel','settle','canonical',v=>{v[0].data.text='A'})],
 ['dom-model-disagreement',d=>change(d,'confirm','settle','domText',()=> 'AB')],
 ['two-confirmations-coalesced',d=>change(d,'successive','replay','undo',v=>{v[0].data.text='AB'})],
 ['render-shortcut-still-blocked',d=>change(d,'render','replay','undo',v=>{v[0]={id:'new',type:'paragraph',dataVersion:2,data:{text:'Replacement'}}})],
 ['read-only-preedit-committed',d=>change(d,'read-only','settle','revokedData',v=>{v[0].data.text='A日本B'})],
 ['destroyed-ime-authored-successor',d=>change(d,'destroy','settle','successorBeforeInput',v=>{v[0].data.text='New日本'})],
 ['undo-direction-lost',d=>change(d,'replace-backward','replay','undoSelection',v=>{v.anchor=1;v.focus=3})],
 ['redo-caret-before-text',d=>change(d,'confirm','replay','redoSelection',v=>{v.anchor=v.focus=1})],
 ['extra-commit',d=>item(d,'cancel').transactions.push({action:'commit',origin:'native-input',name:'native-input'})],
 ['caller-mutated',d=>change(d,'confirm','replay','caller',v=>{v.blocks[0].data.text='A日本B'})]
]
assert.equal(variants.length,22);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
