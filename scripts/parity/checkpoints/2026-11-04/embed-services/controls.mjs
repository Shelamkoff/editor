import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),root='scripts/parity/checkpoints/2026-11-04/embed-services'
mkdirSync(output,{recursive:true})
const review=(path,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
const healthy=review(rawPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,source='candidate',trusted=false)=>{const r=d.results.find(r=>r.source===source&&r.trustedPolicy===trusted);assert.ok(r);return r},item=(d,id='youtube-watch/enter',source='candidate')=>{const c=row(d,source).cases.find(c=>c.id===id);assert.ok(c);return c},o=(c,phase,key)=>{const value=c.observations.find(o=>o.phase===phase&&o.property===key);assert.ok(value);return value},replace=(c,phase,key,value)=>{const t=o(c,phase,key);t.actual=t.expected=structuredClone(value);t.status='PASS'},change=(c,phase,key,fn)=>{const t=o(c,phase,key);fn(t.actual);t.expected=structuredClone(t.actual);t.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['unknown-service-accepted',d=>{const c=item(d,'schema/unknown');replace(c,'create','rejected',false);replace(c,'create','holderEmpty',false);c.creationError=null}],
 ['invalid-id-accepted',d=>{const c=item(d,'schema/youtube-short');replace(c,'create','rejected',false);replace(c,'create','holderEmpty',false);c.creationError=null}],
 ['arbitrary-iframe-provider',d=>{const c=item(d);change(c,'play','iframe',f=>{f.src='https://foreign.example/embed/dQw4w9WgXcQ'});row(d).mediaRequests[0].url='https://foreign.example/embed/dQw4w9WgXcQ'}],
 ['lost-caption',d=>change(item(d),'submit','canonical',r=>{r[0].data.caption=''})],
 ['lost-exact-undo',d=>replace(item(d),'replay','undoStates',[])],
 ['rejected-url-authored-history',d=>replace(item(d,'unknown-host'),'submit','history',[true,false])],
 ['replay-restarted-player',d=>replace(item(d),'replay','iframeAfterReplay','https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0')],
 ['synthetic-native-input',d=>{item(d).nativeEvents[0].trusted=false}],
 ['synthetic-insert-click',d=>{item(d,'youtube-watch/button').nativeEvents[1].trusted=false}],
 ['missing-native-play',d=>{item(d).nativeEvents.pop()}],
 ['unsafe-frame-sandbox',d=>change(item(d),'play','iframe',f=>{f.sandbox+=' allow-top-navigation'})],
 ['unenforced-policy',d=>{row(d,'candidate',true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
 ['hidden-legacy-id-acceptance',d=>{const c=item(d,'schema/youtube-short','v1');replace(c,'create','rejected',true);replace(c,'create','holderEmpty',true);c.creationError={name:'TypeError',message:'YouTube video id is invalid'}}],
 ['invented-legacy-insert',d=>{row(d,'v1').cases.push(structuredClone(item(d,'youtube-watch/button')));row(d,'v1').unavailable.shift()}],
 ['altered-module',d=>{const loaded=d.sources[2].loaded;loaded[Object.keys(loaded)[0]]='0'.repeat(64)}],
 ['unapproved-environment-script',d=>{row(d).environmentRequests=[{url:'http://foreign.example/script.js?attr=x',type:'script',blocked:true}]}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const path=join(output,name+'.json');writeFileSync(path,JSON.stringify(d));const result=review(path,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:hash(readFileSync(path)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
