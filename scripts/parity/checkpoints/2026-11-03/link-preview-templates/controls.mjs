import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const[rawPath,redPath,normal,trusted,candidate,output]=process.argv.slice(2),root=fileURLToPath(new URL('./',import.meta.url)),raw=JSON.parse(readFileSync(rawPath)),red=JSON.parse(readFileSync(redPath));mkdirSync(output,{recursive:true})
const review=(path,redFile,trustedFile,name)=>{const r=spawnSync(process.env.EDITOR_PYTHON_PATH,[join(root,'review.py'),'--raw',path,'--red',redFile,'--normal',normal,'--trusted',trustedFile,'--candidate',candidate,'--output',join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.error,undefined);return r}
const healthy=review(rawPath,redPath,trusted,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const cases=d=>d.results[2].cases,observation=(d,phase,property,predicate=()=>true)=>{const o=cases(d).find(predicate).observations.find(o=>o.phase===phase&&o.property===property);assert.ok(o);return o},scalar=(o,value)=>{o.actual=o.expected=value},both=(o,change)=>{change(o.actual);o.expected=structuredClone(o.actual)}
const variants=[
 ['wrong-source',d=>{d.sources[2].sha=d.sources[1].sha}],
 ['aliased-template-layout',d=>both(observation(d,'choose','editorView',c=>c.spec.template==='compact'&&!c.spec.readOnly),v=>{v.template='horizontal';v.layout.imageWidth='200px'})],
 ['lost-half-width',d=>both(observation(d,'choose','outputView',c=>c.spec.template==='split'),v=>{v.layout.imageWidth='full'})],
 ['metadata-interpreted-as-html',d=>both(observation(d,'choose','editorView'),v=>{v.literalMarkup=false;v.title='Card title'})],
 ['lost-image-alt',d=>both(observation(d,'choose','editorView',c=>c.spec.template==='horizontal'),v=>{v.imageAlt=''})],
 ['missing-native-choice',d=>scalar(observation(d,'choose','nativeEvents',c=>!c.spec.readOnly),[{kind:'settings',trusted:true,onControl:true}])],
 ['menu-survived-mode-change',d=>scalar(observation(d,'choose','modeClosedPanel',c=>!c.spec.readOnly),false)],
 ['reader-exposes-author-actions',d=>scalar(observation(d,'choose','actionsHidden',c=>c.spec.readOnly),false)],
 ['lost-redo',d=>scalar(observation(d,'replay','redoAvailable',c=>c.spec.template==='horizontal'&&!c.spec.readOnly),false)],
 ['extra-history-action',d=>scalar(observation(d,'undo','history',c=>c.spec.template==='horizontal'&&!c.spec.readOnly),[true,true])],
 ['remount-lost-template',d=>both(observation(d,'remount','canonical',c=>c.spec.template==='split'),v=>{v[0].data.template='notion'})],
 ['hidden-baseline-alt',d=>{const o=d.results[1].cases.find(c=>c.spec.template==='horizontal'&&c.spec.readOnly).observations.find(o=>o.phase==='choose'&&o.property==='editorView');o.actual=structuredClone(o.expected);o.status='PASS'}],
 ['hidden-red-defect',(_,r)=>{r.candidatePass=true;for(const c of r.results[2].cases)for(const o of c.observations){o.actual=structuredClone(o.expected);o.status='PASS'}}],
 ['altered-module',d=>{const loaded=d.sources[2].loaded;loaded[Object.keys(loaded)[0]]='0'.repeat(64)}],
 ['missing-template-case',d=>{d.results[2].cases=cases(d).filter(c=>c.spec.template!=='minimal')}],
 ['missing-enforced-policy',()=>{},text=>text.split('\n').map(line=>{if(!line.startsWith('{"native-link-preview-templates-trusted.html":'))return line;const d=JSON.parse(line);d['native-link-preview-templates-trusted.html'].shift();return JSON.stringify(d)}).join('\n')],
]
const results=[]
for(const[name,mutate,mutateTrusted]of variants){const d=structuredClone(raw),r=structuredClone(red);mutate(d,r);const path=join(output,name+'.json'),redFile=join(output,name+'-red.json'),trustedFile=join(output,name+'-trusted.log');writeFileSync(path,JSON.stringify(d));writeFileSync(redFile,JSON.stringify(r));writeFileSync(trustedFile,mutateTrusted?mutateTrusted(readFileSync(trusted,'utf8')):readFileSync(trusted));const result=review(path,redFile,trustedFile,name);assert.equal(result.status,1,name+' was accepted');results.push({name,exitCode:result.status,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),redSha256:createHash('sha256').update(readFileSync(redFile)).digest('hex'),trustedSha256:createHash('sha256').update(readFileSync(trustedFile)).digest('hex'),stderr:result.stderr.slice(-1400)})}
writeFileSync(join(output,'results.json'),JSON.stringify({healthyExitCode:healthy.status,results},null,2));console.log(JSON.stringify({healthyExitCode:healthy.status,rejected:results.map(r=>r.name)}))
