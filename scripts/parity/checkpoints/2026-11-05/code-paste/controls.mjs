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
 ['synthetic-copy',d=>{item(d,'pre/empty/false').nativeEvents[0].trusted=false}],
 ['synthetic-paste',d=>change(d,'code/populated/true','paste','received',v=>{v.trusted=false})],
 ['source-interpreted-as-html',d=>change(d,'pre/empty/false','paste','canonical',v=>{v[1].data.code='x &\n{{not-a-widget}}\nnext\n'})],
 ['nested-prefix-lost',d=>change(d,'nested/populated/false','paste','canonical',v=>{v[2].data.code='<div>&\ninside'})],
 ['trailing-newlines-not-collapsed',d=>change(d,'pre/empty/true','paste','canonical',v=>{v[1].data.code+='\n\n'})],
 ['internal-newline-lost',d=>change(d,'multiple/empty/false','paste','canonical',v=>{v[1].data.code='First\nSecond\n'})],
 ['html-language-inferred',d=>change(d,'code/empty/false','paste','canonical',v=>{v[1].data.language='python'})],
 ['fences-stripped',d=>change(d,'fence-js/empty/false','paste','canonical',v=>{v[1].data.code='const angle = "<b>";'})],
 ['unknown-language-reset',d=>change(d,'code-fence-literal/false','paste','canonical',v=>{v[1].data.language='auto'})],
 ['prose-claimed-as-code',d=>change(d,'prose/empty/false','paste','canonical',v=>{v[1].type='code'})],
 ['author-selection-deleted',d=>change(d,'pre/populated/true','paste','canonical',v=>{v[1].data.text='abc {{swatchA}}ghi'})],
 ['plain-code-overridden-by-html',d=>change(d,'code-html-literal/true','paste','canonical',v=>{v[1].data.code='old prefix\nHTML MUST NOT REPLACE PLAIN TEXT\nsuffix'})],
 ['paint-executes-markup',d=>change(d,'pre/empty/false','paste','inertPaint',v=>{v[0].activeTags=1})],
 ['caret-wrong',d=>change(d,'multiple/populated/true','paste','nativeSelection',v=>{v.start=0;v.end=0})],
 ['undo-direction-lost',d=>change(d,'code-html-literal/true','undo','nativeSelection',v=>{v.direction='forward'})],
 ['redo-id-drift',d=>change(d,'multiple/populated/false','redo','canonical',v=>{v[2].id='different'})],
 ['native-input-untrusted',d=>{item(d,'code-html-literal/false').textareaEvents[0].trusted=false}],
 ['extra-history-entry',d=>{item(d,'code-fence-literal/true').transactions.push({action:'commit',origin:'user',name:'extra'})}],
 ['caller-mutated',d=>change(d,'nested/populated/true','redo','caller',v=>{v.blocks[1].data.text='changed'})]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
