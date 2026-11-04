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
 ['synthetic-copy',d=>{item(d,'h2/private/false').nativeEvents[0].trusted=false}],
 ['synthetic-paste',d=>change(d,'h3/inline/true','paste','receivedTrusted',()=>false)],
 ['private-format-missing',d=>change(d,'h4/private/false','copy','producer',v=>{v.private=false})],
 ['private-payload-missing',d=>change(d,'h5/private/true','paste','receivedPayload',()=>false)],
 ['target-level-reset',d=>change(d,'h6/inline/false','paste','canonical',v=>{v[1].data.level=2})],
 ['inserted-level-reset',d=>change(d,'h5/root/true','paste','canonical',v=>{v[2].data.level=2})],
 ['empty-level-lost',d=>change(d,'empty/h4','paste','canonical',v=>{v[1].data.level=6})],
 ['inherited-italic-lost',d=>change(d,'h2/inline/false','paste','canonical',v=>{v[1].data.text='<i>A</i><b>XY</b> {{swatchA}}<br>tail'})],
 ['source-bold-lost',d=>change(d,'h3/private/true','paste','canonical',v=>{v[1].data.text='<i>AXY{{incoming}}</i> {{swatchA}}<br>tail'})],
 ['existing-sidecar-lost',d=>change(d,'h4/inline/true','paste','canonical',v=>{delete v[1].inline.swatchA})],
 ['incoming-sidecar-lost',d=>change(d,'h5/private/false','paste','canonical',v=>{delete v[1].inline.incoming})],
 ['author-selection-deleted',d=>change(d,'h6/root/false','paste','canonical',v=>{v[1].data.text='<i>A</i> {{swatchA}}<br>tail'})],
 ['mixed-root-reordered',d=>change(d,'mixed/roots','paste','canonical',v=>{[v[2],v[3]]=[v[3],v[2]]})],
 ['wrong-heading-tag',d=>change(d,'empty/h6','paste','tags',v=>{v[1]='h2'})],
 ['widget-projection-wrong',d=>change(d,'h2/private/false','paste','widgetProjection',v=>{v[0].dot='rgb(0, 0, 0)'})],
 ['undo-direction-lost',d=>change(d,'h3/inline/true','undo','nativeSelection',v=>{[v.anchor,v.focus]=[v.focus,v.anchor]})],
 ['redo-id-drift',d=>change(d,'h4/root/false','redo','canonical',v=>{v[2].id='different'})],
 ['inserted-identity-forged',d=>{item(d,'h5/root/true').insertedIds=['seed']}],
 ['legacy-availability-omitted',d=>{d.results[0].cases.find(c=>c.spec.kind==='private').observations=d.results[0].cases.find(c=>c.spec.kind==='private').observations.filter(o=>o.phase!=='availability')}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
