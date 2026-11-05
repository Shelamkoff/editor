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
 ['synthetic-inline',d=>{item(d,'rich/inline/false').nativeEvents[0].trusted=false}],
 ['synthetic-tune',d=>{item(d,'list/tune/true').nativeEvents[1].trusted=false}],
 ['cross-newlines-lost',d=>change(d,'rich/inline/false','convert','canonical',v=>{v[2].data.code='pha <x>lastBra'})],
 ['entities-not-decoded',d=>change(d,'list/tune/false','convert','canonical',v=>{v[2].data.code='pha\nBravo &amp; Co\nCharlie'})],
 ['literal-code-interpreted',d=>change(d,'literal/inline/true','convert','canonical',v=>{v[2].data.code='pha\nA&\nB\nBra'})],
 ['partial-prefix-lost',d=>change(d,'rich/tune/true','convert','canonical',v=>{v[1].data.text='A'})],
 ['partial-suffix-lost',d=>change(d,'rich/inline/true','convert','canonical',v=>{v[3].data.text=' tail'})],
 ['list-tail-id-drift',d=>change(d,'list/inline/false','convert','canonical',v=>{v[3].data.items[0].id='fresh'})],
 ['list-style-reset',d=>change(d,'list/tune/true','convert','canonical',v=>{v[3].data.style='unordered'})],
 ['outside-widget-lost',d=>change(d,'outside-widget/inline/false','convert','canonical',v=>{delete v[1].inline})],
 ['widget-rejection-partial-edit',d=>change(d,'selected-widget/inline/false','convert','canonical',v=>{v[1].data.text='ABC'})],
 ['widget-rejection-history',d=>change(d,'selected-widget/tune/true','convert','history',()=>[true,false])],
 ['widget-rejection-transaction',d=>{item(d,'selected-widget/inline/true').transactions.push({action:'commit',origin:'user',name:'selection.convert'})}],
 ['caret-not-at-zero',d=>change(d,'literal/tune/false','convert','nativeCaret',v=>{v.start=1;v.end=1})],
 ['undo-range-reversed',d=>change(d,'rich/tune/true','undo','nativeRange',v=>{v.anchorId='a';v.focusId='b';v.anchor=2;v.focus=3})],
 ['redo-id-drift',d=>change(d,'list/inline/true','redo','canonical',v=>{v[2].id='different'})],
 ['whole-id-not-reused',d=>{item(d,'whole-rich/tune/false').createdId='fresh'}],
 ['language-inferred',d=>change(d,'whole-rich/inline/true','convert','canonical',v=>{v[1].data.language='html'})],
 ['caller-mutated',d=>change(d,'outside-widget/tune/false','redo','caller',v=>{v.blocks[1].data.text='changed'})]
];assert.equal(variants.length,24);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}const report={group:raw.group,healthyExitCode:healthy.status,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
