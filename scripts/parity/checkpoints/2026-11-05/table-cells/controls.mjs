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
 ['mark-lost',d=>change(d,'body/cell-0','edit','canonical',v=>{v[0].data.rows[0].cells[0].text='AlXpha {{person}} {{tone}}<br>tail'})],
 ['row-identity-lost',d=>change(d,'headed/cell-1','sibling','canonical',v=>{v[0].data.rows[0].id='other'})],
 ['cell-identity-lost',d=>change(d,'body/cell-2','edit','canonical',v=>{v[0].data.rows[1].cells[0].id='other'})],
 ['row-local-cells-flattened',d=>change(d,'body/cell-0','load','canonical',v=>{v[0].data.rows[1].cells[0].id='renamed'})],
 ['neighbor-text-lost',d=>change(d,'body/cell-0','sibling','fields',v=>{v[0]='Alpha'})],
 ['sidecar-lost',d=>change(d,'headed/cell-3','edit','canonical',v=>{delete v[0].inline.person})],
 ['header-tag-lost',d=>change(d,'headed/cell-0','load','cellTags',v=>{v[0]='TD'})],
 ['host-replaced',d=>change(d,'body/cell-0','sibling','fieldHosts',v=>{v[0]=false})],
 ['widget-replaced',d=>change(d,'body/cell-3','sibling','widgetOwners',v=>{v[0]=false})],
 ['projection-caret-lost',d=>change(d,'headed/cell-2','projection','caret',v=>{v.offset=0})],
 ['projection-owner-lost',d=>change(d,'body/cell-1','projection','projectionWidgetOwners',v=>{v[2]=false})],
 ['undo-grouped',d=>change(d,'body/cell-0','undo-sibling','history',()=>[false,true])],
 ['redo-raw-changed',d=>change(d,'headed/cell-3','redo-sibling','rawRedo',v=>{v[0].data.rows[0].cells[0].text='Changed'})],
 ['caller-mutated',d=>change(d,'body/cell-0','rerender','caller',v=>{v.blocks[0].data.withHeadings=true})],
 ['retained-snapshot-mutated',d=>change(d,'body/cell-2','sibling','retainedSnapshot',v=>{v[0].data.rows[0].cells[0].text='Changed'})],
 ['output-widget-lost',d=>change(d,'headed/cell-1','edit','rendererWidgets',v=>{v.pop()})],
 ['synthetic-input',d=>{item(d,'body/cell-1').nativeEvents[0].trusted=false}],
 ['extra-history',d=>{item(d,'body/cell-2').transactions.push({action:'commit',origin:'plugin',name:'block.update'})}],
 ['render-time-forged',d=>change(d,'body/cell-0','rerender','renderCaller',v=>{v.time=0})]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
