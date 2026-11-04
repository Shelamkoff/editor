import assert from 'node:assert/strict'
import{createHash}from'node:crypto'
import{spawnSync}from'node:child_process'
import{mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{join}from'node:path'
const[reviewer,path,candidate,output]=process.argv.slice(2),raw=JSON.parse(readFileSync(path)),history=raw.group==='history-gestures',cut=raw.group==='compound-cut-merge';mkdirSync(output,{recursive:true})
const review=(file,name)=>spawnSync(process.execPath,[reviewer,file,candidate,join(output,name+'-review.json')],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),healthy=review(path,'healthy');assert.equal(healthy.status,0,healthy.stderr)
const row=d=>d.results.find(r=>r.source==='candidate'&&!r.trustedPolicy),item=(d,id)=>{const c=row(d).cases.find(c=>c.id===id);assert(c,id);return c},change=(d,id,p,k,fn,n=0)=>{const o=item(d,id).observations.filter(o=>o.phase===p&&o.property===k)[n];assert(o,p+'/'+k);const v=structuredClone(o.actual),result=fn(v);o.actual=o.expected=result===undefined?v:result;o.status='PASS'},id=history?'count/typing':cut?'toggle/forward':'toggle/source/rich/Backspace'
const variants=[['wrong-source',d=>{d.sources[3].sha=d.sources[2].sha}],['altered-module',d=>{const l=d.sources[3].loaded;l[Object.keys(l)[0]]='0'.repeat(64)}],['missing-case',d=>row(d).cases.pop()],['unenforced-policy',d=>{d.results.at(-1).policyEnforced=false}],['synthetic-input',d=>{item(d,id).nativeEvents[0].trusted=false}],['extra-command',d=>item(d,id).transactions.push({...item(d,id).transactions[0]})],['unexpected-page-error',d=>row(d).pageErrors.push('failure')]]
if(history)variants.push(
 ['lost-second-character',d=>change(d,id,'author','canonical',v=>{v[0].data.text='AlphaX'})],
 ['wrong-coalesce-caret',d=>change(d,id,'undo','nativeSelection',v=>{v.anchor=v.focus=[6]})],
 ['cross-field-coalesced',d=>change(d,'count/typing-boundary','undo','history',()=>[false,true])],
 ['tiny-kept-older-action',d=>change(d,'tiny/insert','undo','history',()=>[true,true])],
 ['boundary-undo-lost-first-edit',d=>change(d,'count/typing-boundary','undo','canonical',v=>{v[0].data.text='Alpha'})],
 ['noop-destroyed-redo',d=>change(d,'count/branch','author','history',()=>[true,false],2)],
 ['split-undo-wrong-caret',d=>change(d,'count/structural','undo','nativeSelection',v=>{v.anchor=v.focus=[0]})],
 ['split-redo-fresh-identity',d=>change(d,'wide/structural','redo','canonical',v=>{v[1].id='fresh'})],
 ['duplicated-generated-id',d=>{const c=item(d,'count/structural');c.identities[1][0]='seed'}],
 ['lost-typing-commit',d=>item(d,id).transactions.shift()],
 ['undefined-bytes-restricts-count',d=>change(d,'undefined-bytes/insert','undo','canonical',v=>{v.push({id:'B',type:'paragraph',dataVersion:2,data:{text:'B'}})},1)],
 ['caller-mutated',d=>change(d,id,'redo','caller',v=>{v.blocks[0].data.text='Changed'})],
 ['replay-event-flags-lie',d=>{item(d,id).transactions.at(-1).history.canRedo=true}],
)
else if(cut)variants.push(
 ['empty-title-line',d=>change(d,'toggle/forward','cut','canonical',v=>{v[1].data.title+='<br><b></b>'})],
 ['empty-caption-line',d=>change(d,'quote/backward','cut','canonical',v=>{v[1].data.caption='<i></i><br>'+v[1].data.caption})],
 ['lost-second-sidecar',d=>change(d,id,'cut','canonical',v=>{delete v[1].inline.swatchB})],
 ['wrong-source-identity',d=>change(d,id,'cut','canonical',v=>{v[1].id='source'})],
 ['lost-widget-dot',d=>change(d,id,'cut','widgets',v=>{v[1].dot=null})],
 ['neighbors-remounted',d=>change(d,id,'cut','neighborsRetained',()=>false)],
 ['published-unselected-text',d=>{item(d,id).clipboard[0].values['text/plain']+='Keep'}],
 ['private-payload-lost-part',d=>{const c=item(d,id).clipboard[0],v=JSON.parse(c.values['application/x-rector-fragment']);v.parts.pop();c.values['application/x-rector-fragment']=JSON.stringify(v)}],
 ['private-payload-leaks-field',d=>{const c=item(d,id).clipboard[0],v=JSON.parse(c.values['application/x-rector-fragment']);v.parts[0].block.data.title='Keep';c.values['application/x-rector-fragment']=JSON.stringify(v)}],
 ['cut-not-prevented',d=>{item(d,id).clipboard[0].prevented=false}],
 ['undo-lost-source',d=>change(d,id,'undo','canonical',v=>{v.splice(2,1)})],
 ['redo-lost-author-state',d=>change(d,id,'redo','canonical',v=>{v[1].data.open=false})],
 ['caller-mutated',d=>change(d,id,'redo','caller',v=>{v.blocks[1].data.title='Changed'})],
)
else variants.push(
 ['source-empty-mark-adds-line',d=>change(d,'toggle/source/first-mark/Backspace','merge','canonical',v=>{v[1].data.title+='<br><b></b>'})],
 ['target-empty-caption-adds-line',d=>change(d,'quote/target/last-mark/Delete','merge','canonical',v=>{v[1].data.caption='<i></i><br>'+v[1].data.caption})],
 ['spoiler-empty-body-adds-line',d=>change(d,'spoiler/source/last-mark/Backspace','merge','canonical',v=>{v[1].data.content+='<br><i></i>'})],
 ['wrong-widget-count',d=>change(d,id,'merge','widgetCount',()=>1)],
 ['lost-source-sidecar',d=>change(d,id,'merge','canonical',v=>{delete v[1].inline.swatchB})],
 ['wrong-widget-value',d=>change(d,id,'merge','canonical',v=>{v[1].inline.swatchB.data.value='#000000'})],
 ['wrong-target-identity',d=>change(d,id,'merge','canonical',v=>{v[1].id='fresh'})],
 ['empty-source-retained',d=>change(d,'spoiler/source/both-mark/Delete','merge','canonical',v=>{v.splice(2,0,{id:'source',type:'spoiler',dataVersion:1,data:{label:'<b></b>',content:'<i></i>'}})})],
 ['undo-lost-neighbor',d=>change(d,id,'undo','canonical',v=>{v.pop()})],
 ['undo-kept-extra-action',d=>change(d,id,'undo','history',()=>[true,true])],
 ['lost-toggle-open-state',d=>change(d,id,'merge','canonical',v=>{v[1].data.open=false})],
 ['quote-text-gained-separator',d=>change(d,'quote/source/rich/Delete','merge','canonical',v=>{v[1].data.text='<b>First</b><br><b>Next</b>'})],
 ['empty-source-wrong-command',d=>{item(d,'warning/source/both-mark/Backspace').transactions[0].name='block.merge'}],
)
assert.equal(variants.length,20);const results=[];for(const[name,mutate]of variants){const d=structuredClone(raw);mutate(d);const file=join(output,name+'.json'),bytes=Buffer.from(JSON.stringify(d));writeFileSync(file,bytes);const r=review(file,name);assert.equal(r.status,1,name+' was not rejected: '+r.stderr);writeFileSync(join(output,name+'.stderr'),r.stderr);results.push({name,exitCode:r.status,rawSha256:createHash('sha256').update(bytes).digest('hex')})}
const report={healthyExitCode:healthy.status,group:raw.group,results};writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
