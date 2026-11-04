import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
const [rawPath,packagePath,tarball,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(rawPath)),packageReport=JSON.parse(readFileSync(packagePath)),root='scripts/parity/checkpoints/2026-11-04/async-presets'
mkdirSync(output,{recursive:true})
const review=(path,pkg,name)=>spawnSync(process.env.EDITOR_PYTHON_PATH,[root+'/review.py','--raw',path,'--package-report',pkg,'--tarball',tarball,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})
const healthy=review(rawPath,packagePath,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=(d,source='candidate',trusted=false)=>{const r=d.results.find(r=>r.source===source&&r.trustedPolicy===trusted);assert.ok(r);return r},item=(d,id,source='candidate')=>{const c=row(d,source).cases.find(c=>c.id===id);assert.ok(c);return c},replace=(c,phase,key,value)=>{const o=c.observations.find(o=>o.phase===phase&&o.property===key);assert.ok(o);o.actual=o.expected=structuredClone(value);o.status='PASS'}
const variants=[
 ['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],
 ['altered-module',d=>{const m=d.sources[3].loaded;m[Object.keys(m)[0]]='0'.repeat(64)}],
 ['missing-case',d=>{row(d).cases.pop()}],
 ['wrong-order',d=>replace(item(d,'plugin-create/list'),'settle','types',['paragraph','heading','delimiter'])],
 ['duplicate-not-deduplicated',d=>replace(item(d,'plugin-create/list'),'settle','types',['heading','paragraph','heading','delimiter','paragraph'])],
 ['unknown-list-accepted',d=>{const c=item(d,'invalid/plugin-create/missing');c.callError=null;replace(c,'settle','rejected',false);replace(c,'settle','errorName',null)}],
 ['unknown-document-rejected',d=>replace(item(d,'plugin-create/document-unknown'),'settle','types',[])],
 ['late-config-snapshot',d=>replace(item(d,'snapshot/plugin'),'settle','placeholder','Replacement')],
 ['orphaned-rejection-escaped',d=>{const c=item(d,'orphan/plugin-create/invalid-shape');c.unhandled=[{name:'Error',message:'Earlier nested config failure'}];replace(c,'settle','unhandled',c.unhandled);replace(c,'recover','unhandled',c.unhandled)}],
 ['changed-error-identity',d=>{const c=item(d,'orphan/plugin-create/throwing-getter');c.callError.sameLater=false;replace(c,'settle','rejected',c.callError)}],
 ['hidden-parent-orphan',d=>{const c=item(d,'orphan/plugin-create/invalid-shape','parent');c.unhandled=[];replace(c,'settle','unhandled',[]);replace(c,'recover','unhandled',[]);row(d,'parent').pageErrors=[]}],
 ['unenforced-policy',d=>{row(d,'candidate',true).policyEnforced=false}],
 ['ignored-product-network',d=>{row(d).externalRequests=[{url:'https://foreign.example/fetch',type:'fetch',blocked:true}]}],
 ['module-bytes-disagree-with-tarball',null,p=>{p.results[0].sha256='0'.repeat(64)}],
 ['missing-public-module',null,p=>{p.results.splice(20,1);p.modules--}],
 ['css-bytes-disagree-with-tarball',null,p=>{p.results.find(r=>r.kind==='style').sha256='0'.repeat(64)}],
 ['outside-package-asset',null,p=>{p.results.find(r=>r.kind==='style').file='../outside.css'}],
 ['removed-runtime-alias-accepted',null,p=>{p.results.find(r=>r.kind==='rejected-runtime-entry').code='PASS'}],
 ['wrong-typed-bindings',null,p=>{p.typescriptSha256='0'.repeat(64)}],
 ['wrong-tarball',null,p=>{p.tarballSha256='0'.repeat(64)}],
]
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[]
for(const[name,mutate,changePackage]of variants){const d=structuredClone(raw),p=structuredClone(packageReport);mutate?.(d);changePackage?.(p);const path=join(output,name+'.json'),pkg=join(output,name+'-package.json');writeFileSync(path,JSON.stringify(d));writeFileSync(pkg,JSON.stringify(p));const result=review(path,pkg,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,rawSha256:hash(readFileSync(path)),packageSha256:hash(readFileSync(pkg)),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
