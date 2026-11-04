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
 ['synthetic-menu-click',d=>{item(d,'menu/source/b').nativeEvents[0].trusted=false}],
 ['legacy-layout-body-claimed',d=>{d.results[0].cases.find(c=>c.id==='menu/source/b').planned=['load','layout','undo','redo','dispose']}],
 ['empty-target-leading-break',d=>change(d,'direct/target/b','layout','canonical',v=>{v[0].data.columns[1].content='<br>'+v[0].data.columns[1].content})],
 ['empty-source-trailing-break',d=>change(d,'menu/source/i','layout','canonical',v=>{v[0].data.columns[1].content+='<br>'})],
 ['surviving-id-replaced',d=>change(d,'direct/source/b','layout','canonical',v=>{v[0].data.columns[1].id='c'})],
 ['source-sidecar-lost',d=>change(d,'menu/target/b','layout','sidecars',v=>{delete v.swatchC})],
 ['wrong-settings-document',d=>change(d,'menu/target/i','layout','settingsContext',v=>{v.owningDocument=false})],
 ['editor-invented-break',d=>change(d,'direct/target/i','layout','editorBreaks',()=>[0,1])],
 ['renderer-invented-break',d=>change(d,'menu/source/b','layout','rendererBreaks',()=>[0,1])],
 ['first-host-remounted',d=>change(d,'direct/source/i','layout','firstRetained',()=>false)],
 ['extra-completed-action',d=>item(d,'menu/source/b').transactions.push({action:'commit',origin:'user',name:'block.settings'})],
 ['undo-lost-third-field',d=>change(d,'direct/target/b','undo','canonical',v=>{v[0].data.columns.pop()})],
 ['redo-replaced-id',d=>change(d,'menu/target/i','redo','canonical',v=>{v[0].data.columns[1].id='new'})],
 ['caller-data-mutated',d=>change(d,'direct/source/b','redo','caller',v=>{v.blocks[0].data.layout='1-1'})],
 ['legacy-layout-availability-forged',d=>{const c=d.results[0].cases.find(c=>c.id==='menu/target/i'),o=c.observations.find(o=>o.property==='layoutActionsAvailable');o.actual=o.expected=true}]
]
assert.equal(variants.length,20);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
