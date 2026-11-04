import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),root='scripts/parity/checkpoints/2026-11-04/link-tool'
mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted),item=(d,id='apply/single/Text/backward')=>{const c=row(d).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,p,k,v)=>{const o=c.observations.find(o=>o.phase===p&&o.property===k);assert.ok(o);o.actual=o.expected=structuredClone(v);o.status='PASS'},change=(d,id,p,k,mutate)=>{const c=item(d,id),o=c.observations.find(o=>o.phase===p&&o.property===k);assert.ok(o);const value=structuredClone(o.actual);mutate(value);replace(c,p,k,value)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['altered-module',d=>{const l=d.sources[2].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['lost-anchor-target',d=>change(d,undefined,'action','meaning',v=>{const u=v[0].find(u=>u.marks.some(m=>m.includes('chosen.example')));u.marks=u.marks.map(m=>m.replace('_blank','_self'))})],
 ['lost-author-style',d=>change(d,undefined,'action','visible',v=>{v[0].find(u=>u.size==='24px').size=null})],
 ['lost-line-break',d=>change(d,undefined,'action','meaning',v=>{v[0].splice(v[0].findIndex(u=>u.kind==='break'),1)})],
 ['lost-sidecar',d=>replace(item(d),'action','sidecars',[null])],
 ['widget-became-linked',d=>replace(item(d),'action','widgetLinks',[['https://chosen.example/']])],
 ['unselected-anchor-removed',d=>change(d,'atomic/linked/forward','action','meaning',v=>{const u=v[0].find(u=>u.text==='Alpha');u.marks=u.marks.filter(m=>!m.startsWith('a:'))})],
 ['widget-identity-replaced',d=>replace(item(d),'action','widgetIdentity',false)],
 ['backward-direction-lost',d=>replace(item(d),'action','selection',{anchor:{field:0,offset:4},focus:{field:0,offset:22},collapsed:false})],
 ['cancel-destroyed-redo',d=>replace(item(d,'cancel/back/forward'),'action','history',[false,false])],
 ['empty-url-committed',d=>replace(item(d,'empty/apply/forward'),'action','producerCalls',1)],
 ['lost-exact-undo',d=>change(d,undefined,'undo-action','canonical',v=>{v[0].data.text+='lost'})],
 ['extra-transaction',d=>{item(d).transactions.push({action:'commit',origin:'user',name:'inline.link'})}],
 ['retired-producer-entered',d=>replace(item(d,'lifetime/mode'),'inactive','retiredProducer',1)],
 ['retired-closed-successor',d=>replace(item(d,'lifetime/destroy'),'inactive','successorPanel',false)],
 ['fresh-action-blocked',d=>replace(item(d,'lifetime/render'),'live','liveProducer',0)],
 ['synthetic-native-click',d=>{item(d).nativeEvents.find(e=>e.type==='click').trusted=false}],
 ['pointer-missed-control',d=>{item(d).pointTrace[0].hit=false}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['unsupported-current-action',d=>{item(d).unsupported.push({property:'made-up',reason:'skipped'})}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
 ['hidden-historical-failure',d=>{d.results[0].cases.find(c=>c.error).error=null}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const result=review(path,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:hash(readFileSync(path)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
