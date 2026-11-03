import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,redPath,browser,node,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),red=JSON.parse(readFileSync(redPath)),root='scripts/parity/checkpoints/2026-11-04/link-preview-navigation'
mkdirSync(output,{recursive:true})
const review=(path,redFile,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--red',redFile,'--browser',browser,'--node',node,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
const healthy=review(rawPath,redPath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const item=(d,id='horizontal/editable/click',source='candidate')=>{const c=d.results.find(c=>c.source===source&&c.spec.id===id);assert.ok(c);return c},observation=(c,phase,key)=>{const o=c.observations.find(o=>o.phase===phase&&o.property===key);assert.ok(o);return o},replace=(c,phase,key,value)=>{const o=observation(c,phase,key);o.actual=o.expected=structuredClone(value);o.status='PASS'},change=(c,phase,key,fn)=>{const o=observation(c,phase,key);fn(o.actual);o.expected=structuredClone(o.actual);o.status='PASS'}
const activation=(c,allow)=>{const events=structuredClone(c.raw.after.activations);events[0].prevented=!allow;const pages=[{url:c.spec.trustedPolicy?'/trusted':'/',openerIsNull:true},...(allow?[{url:'/destination?case=subject',openerIsNull:true}]:[])],requests=allow?[{url:'/destination?case=subject',referer:''}]:[];replace(c,'activate','events',events);replace(c,'activate','pages',pages);replace(c,'activate','requests',requests);Object.assign(c.raw,{pages,navigationRequests:requests});c.raw.after.activations=events}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['editable-navigation-allowed',d=>activation(item(d),true)],
 ['reader-navigation-blocked',d=>activation(item(d,'horizontal/reader/click'),false)],
 ['mode-return-navigation-allowed',d=>activation(item(d,'horizontal/back-to-editable/click'),true)],
 ['opener-restored',d=>{const c=item(d,'horizontal/reader/click');change(c,'activate','pages',p=>{p[1].openerIsNull=false});c.raw.pages[1].openerIsNull=false}],
 ['referer-leaked',d=>{const c=item(d,'horizontal/reader/click');change(c,'activate','requests',r=>{r[0].referer='http://owner.example/'});c.raw.navigationRequests[0].referer='http://owner.example/'}],
 ['canonical-mutated',d=>{const c=item(d);change(c,'activate','canonical',r=>{r[0].data.title='Changed by click'});c.raw.after.canonical[0].data.title='Changed by click'}],
 ['history-authored',d=>{const c=item(d);replace(c,'activate','history',[true,false]);c.raw.after.history=[true,false]}],
 ['synthetic-activation',d=>{const c=item(d);change(c,'activate','events',r=>{r[0].trusted=false});c.raw.after.activations[0].trusted=false}],
 ['missing-template',d=>{d.results=d.results.filter(c=>c.source!=='candidate'||c.spec.template!=='twitter')}],
 ['unenforced-policy',d=>{const c=item(d,'minimal/reader/trusted-policy');replace(c,'load','policyEnforced',false);c.raw.policyEnforced=false}],
 ['hidden-legacy-middle-click',d=>activation(item(d,'minimal/editable/middle-click','v1'),false)],
 ['hidden-baseline-navigation',d=>activation(item(d,'horizontal/editable/click','spec-baseline'),false)],
 ['altered-module',d=>{const loaded=d.sources[2].loaded;loaded[Object.keys(loaded)[0]]='0'.repeat(64)}],
 ['ignored-product-network',d=>{const c=item(d);c.externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}];replace(c,'dispose','externalRequests',c.externalRequests)}],
 ['unapproved-environment-script',d=>{item(d).environmentRequests=[{url:'http://foreign.example/script.js?attr=x',type:'script',blocked:true}]}],
 ['hidden-red-failure',(_,r)=>{const c=item(r);replace(c,'activate','events',c.raw.after.activations)}],
 ['missing-native-control',d=>{const c=item(d);for(const key of ['pages','requests','activations']){replace(c,'control',key,[]);c.raw.control[key]=[]}}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate]of variants){const d=structuredClone(raw),r=structuredClone(red);mutate(d,r);const path=join(output,name+'.json'),redFile=join(output,name+'-red.json');writeFileSync(path,JSON.stringify(d));writeFileSync(redFile,JSON.stringify(r));const result=review(path,redFile,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:hash(readFileSync(path)),redSha256:hash(readFileSync(redFile)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
