import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,redPath,literalPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),literal=JSON.parse(readFileSync(literalPath)),root='scripts/parity/checkpoints/2026-11-04/i18n-counts';mkdirSync(output,{recursive:true})
const review=(path,lp,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--red',redPath,'--literal',lp,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}})
const healthy=review(rawPath,literalPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,trusted=false)=>d.results.find(r=>r.source==='candidate'&&r.trustedPolicy===trusted),item=(d,id='ru/5')=>{const c=row(d).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,p,k,v)=>{const o=c.observations.find(o=>o.phase===p&&o.property===k);assert.ok(o);o.actual=o.expected=structuredClone(v);o.status='PASS'},change=(d,id,k,fn)=>{const c=item(d,id),o=c.observations.find(o=>o.phase==='load'&&o.property===k),v=structuredClone(o.actual);fn(v);replace(c,'load',k,v)}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],
 ['wrong-editor-plural',d=>replace(item(d),'load','label','5 вложения')],
 ['reader-kept-old-form',d=>replace(item(d,'ru/21'),'reader','label','21 вложения')],
 ['renderer-lost-locale',d=>replace(item(d),'output','label','5 files')],
 ['wrong-public-russian-form',d=>change(d,'runtime/ru/21','block',v=>{v.form='other:21'})],
 ['lost-negative-english-one',d=>change(d,'runtime/en/-1','inline',v=>{v.form='other:-1'})],
 ['fraction-used-integer-form',d=>change(d,'runtime/ru/1.5','block',v=>{v.form='many:1.5'})],
 ['interpolation-rescanned',d=>change(d,'runtime/ru/21','block',v=>{v.plain='Value 21: A {name} 21'})],
 ['getter-read-twice',d=>replace(item(d,'runtime/ru/21'),'load','blockReads',4)],
 ['inherited-count-read',d=>change(d,'runtime/ru/21','block',v=>{v.prototypeReads=1})],
 ['missing-key-read-parameters',d=>change(d,'runtime/ru/21','inline',v=>{v.missingReads=1})],
 ['string-count-selected-plural',d=>change(d,'runtime/ru/21','block',v=>{v.stringCount='one:21'})],
 ['caller-dictionary-frozen',d=>replace(item(d,'runtime/ru/21'),'load','callerFormsFrozen',true)],
 ['lost-current-file-id',d=>{const c=item(d),o=c.observations.find(o=>o.phase==='reader'&&o.property==='canonical'),v=structuredClone(o.actual);delete v[0].data.files[0].id;replace(c,'reader','canonical',v)}],
 ['translation-authored-history',d=>replace(item(d),'load','history',[true,false])],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['unenforced-policy',d=>{row(d,true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
 ['hidden-v1-interpolation',d=>{const c=d.results.find(r=>r.source==='v1').cases.find(c=>c.id==='runtime/en/1'),o=c.observations.find(o=>o.property==='block');o.actual=structuredClone(o.expected);o.status='PASS'}],
 ['literal-key-regressed',(d,l)=>replace(item(l,'literal-key/public-runtime-contexts'),'create','plugin.paragraph/echo','Fallback')],
 ['synthetic-native-key',(d,l)=>{item(l,'menus/literal').nativeEvents.find(e=>e.role==='slash-choose').trusted=false}],
 ['native-pointer-missed',(d,l)=>{item(l,'menus/literal').pointTrace[0].hit=false}],
 ['missing-literal-case',(d,l)=>{row(l).cases.pop()}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw),l=structuredClone(literal);mutate(d,l);const path=join(output,name+'.json'),lp=join(output,name+'-literal.json');writeFileSync(path,JSON.stringify(d));writeFileSync(lp,JSON.stringify(l));const r=review(path,lp,name);assert.equal(r.status,1,name+' was accepted');results.push({name,exitCode:r.status,rawSha256:hash(readFileSync(path)),literalSha256:hash(readFileSync(lp)),stderr:r.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
