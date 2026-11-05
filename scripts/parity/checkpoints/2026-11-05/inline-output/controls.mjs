import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path));mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c);return c},change=(d,id,p,k,fn)=>{const o=item(d,id).observations.find(o=>o.phase===p&&o.property===k);assert(o);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'}
const a='mention/__proto__/columns/true',b='color/constructor/paragraph/false'
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['page-error',d=>row(d).pageErrors.push('failure')],
 ['lost-own-key',d=>change(d,a,'load','canonical',v=>{delete v.blocks[1].inline.__proto__})],
 ['payload-changed',d=>change(d,a,'rerender','canonical',v=>{v.blocks[1].inline.__proto__.data.name='Other'})],
 ['unregistered-payload-lost',d=>change(d,b,'load','canonical',v=>{v.blocks[1].inline={}})],
 ['unregistered-widget-hydrated',d=>change(d,b,'rerender','widgets',()=>1)],
 ['literal-lost',d=>change(d,a,'load','authoredLiteral',()=>'' )],
 ['history-created-on-load',d=>change(d,a,'load','history',()=>[true,false])],
 ['detached-connected',d=>change(d,a,'detached','detachedOwnership',v=>{v.connected=true})],
 ['foreign-realm-wrong',d=>change(d,a,'foreign','ownerDocument',()=>false)],
 ['wrong-mention-text',d=>change(d,a,'mounted','text',()=> 'A Other')],
 ['active-markup-created',d=>change(d,a,'foreign','widgets',v=>{v[0].activeTags=1})],
 ['readonly-focusable',d=>change(d,a,'detached','widgets',v=>{v[0].tabIndex=0})],
 ['unregistered-hydrated-in-output',d=>change(d,b,'foreign','widgets',()=>[{text:'#123456'}])],
 ['columns-collapsed',d=>change(d,a,'mounted','fieldTexts',v=>[v.join('')])],
 ['widget-in-wrong-field',d=>change(d,a,'foreign','fieldWidgetCounts',()=>[0,1])],
 ['literal-in-wrong-field',d=>change(d,a,'detached','literalField',()=>0)],
 ['provider-called',d=>change(d,a,'foreign','providerCalls',()=>1)],
 ['caller-mutated',d=>change(d,b,'dispose','caller',v=>{v.blocks[1].data.text='changed'})],
 ['wrong-render-origin',d=>{item(d,a).transactions[0].origin='plugin'}],
 ['legacy-availability-omitted',d=>{d.results[0].cases[0].unsupported=[]}]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
