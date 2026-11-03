const variants=['insert-head','insert-middle','insert-tail','insert-default','insert-rich','update-data','update-table','update-tunes','reset-tunes','update-noop','update-noop-keyorder','move-forward','move-backward','move-noop','remove-first','remove-middle','remove-last','remove-final','remove-final-opaque','unknown-update','unknown-insert','missing-remove','move-invalid','insert-index-invalid','update-invalid-patch','nested-other','nested-same','nested-insert-remove','caught-nested-failure']
export const publicStructureCases=variants.flatMap(variant=>['editable','read-only'].map(mode=>({id:[variant,mode].join('/'),variant,mode})))
const copy=value=>JSON.parse(JSON.stringify(value))
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b))
const pause=()=>new Promise(resolve=>setTimeout(resolve,25))
const para=(id,text,legacy)=>({id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text}})
function tableData(legacy,changed=false){return legacy?{withHeadings:false,content:[['Left','Right']]}:{withHeadings:false,rows:[{id:'r0',cells:[{id:'c0',text:changed?'<b>Changed</b>':'Left'},{id:'c1',text:'Right'}]},...(changed?[{id:'r1',cells:[{id:'c0',text:'Below'},{id:'c1',text:'Last'}]}]:[])]}}
function initial(spec,legacy){
 const a=para('a','<b>Alpha</b>',legacy),u={id:'u',type:'future-block',...(!legacy?{dataVersion:7}:{}),data:JSON.parse('{"text":"Opaque","rows":[{"value":7}],"__proto__":{"literal":true}}'),tunes:{layout:{gap:2}}}
 if(spec.variant==='remove-final')return[a]
 if(spec.variant==='remove-final-opaque')return[u]
 if(['reset-tunes','update-noop-keyorder'].includes(spec.variant))a.tunes={layout:{gap:2,width:3},textAlign:'right'}
 return[a,{id:'t',type:'table',...(!legacy?{dataVersion:2}:{}),data:tableData(legacy)},u,para('c','Charlie',legacy)]
}
function inserted(spec,legacy,id){
 const rich=spec.variant==='insert-rich',record=para(id,spec.variant==='insert-default'?'':rich?'<b>Inserted</b> {{future}}':'Inserted',legacy)
 if(rich){record.tunes={textAlign:'center',layout:{gap:5}};record.inline={future:{type:'future-inline',...(!legacy?{dataVersion:3}:{}),data:JSON.parse('{"nested":{"value":9},"__proto__":{"literal":true}}')}}}
 return record
}
const producerVariant=variant=>variant.startsWith('update')||variant.startsWith('nested')||['reset-tunes','unknown-update','caught-nested-failure'].includes(variant)
const denied=variant=>['unknown-update','unknown-insert','missing-remove','move-invalid','insert-index-invalid','update-invalid-patch','caught-nested-failure'].includes(variant)
const noChange=variant=>['update-noop','update-noop-keyorder','move-noop'].includes(variant)||denied(variant)
function target(spec,legacy,allocated){
 const rows=initial(spec,legacy),v=spec.variant
 if((legacy&&producerVariant(v))||noChange(v))return rows
 if(v.startsWith('insert')){const at=v==='insert-head'?0:v==='insert-middle'?2:rows.length;rows.splice(at,0,inserted(spec,legacy,allocated))}
 else if(v==='move-forward')rows.push(rows.shift())
 else if(v==='move-backward')rows.unshift(rows.pop())
 else if(v.startsWith('remove-final'))return legacy?[]:[para(allocated,'',false)]
 else if(v.startsWith('remove'))rows.splice(v==='remove-first'?0:v==='remove-middle'?2:3,1)
 else if(v==='update-data')rows[0].data.text='<i>Updated</i>'
 else if(v==='update-table'){rows[1].data=tableData(false,true);rows[1].tunes={layout:{gap:5}}}
 else if(v==='update-tunes')rows[0].tunes={textAlign:'center',layout:{gap:5}}
 else if(v==='reset-tunes')delete rows[0].tunes
 else if(v==='nested-other'){rows[0].data.text='<i>Updated</i>';rows[3].data.text='Nested C'}
 else if(v==='nested-same'){rows[0].data.text='Nested A';rows[0].tunes={textAlign:'center'}}
 else if(v==='nested-insert-remove'){rows[0].data.text='<i>Updated</i>';return[rows[3],rows[0],para(allocated,'Nested inserted',false),rows[1]]}
 return rows
}
export async function runPublicStructureCase({sourceBase='../../',legacy=false,spec}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,table]=await Promise.all(['core/index.js','plugins/paragraph/index.js','plugins/table/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');document.body.append(holder)
 const observations=[],diagnostics=[],transactions=[],unsupported=[],completedPhases=[],planned=['load','apply','replay','dispose']
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
 let editor,phase='load',allocatedId=null,producerCalls=0,innerCaught=false,retained=null
 try{
  const version=legacy?'1.0.5':'2.0.0',v=spec.variant,starting=initial(spec,legacy)
  editor=core.createEditor({holder,injectStyles:false,inlineTools:[],blockRemoveAnimationMs:0,blockInsertAnimationMs:0,blockMoveAnimationMs:0,plugins:legacy?[new paragraph.Paragraph(),new table.Table()]:[paragraph.createParagraphPlugin({injectStyles:false}),table.createTablePlugin({injectStyles:false})],onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:copy(starting)}})
  if(!legacy)editor.on('transaction:committed',event=>transactions.push({action:event.action,origin:event.origin,name:event.name}))
  else unsupported.push({property:'currentTransactionPort',reason:'The old public block methods and real diagnostics execute; the absent current transaction event port is not fabricated.'})
  await pause();const seeded=copy(starting);seeded[0].data.text='Seed';editor.render({version,blocks:seeded});editor.undo();await pause();transactions.length=0;diagnostics.length=0
  if(spec.mode==='read-only')editor.setReadOnly(true)
  check(phase,'canonical',editor.save().blocks,starting);check(phase,'version',editor.save().version,version);check(phase,'history',[editor.canUndo,editor.canRedo],spec.mode==='read-only'?[false,false]:[false,true]);completedPhases.push(phase);phase='apply'
  const api=editor.blocks,update=(id,producer)=>api.update(id,current=>{producerCalls++;retained=current;return producer(current)})
  const remove=id=>legacy?api.remove(api.getBlockIndex(id)):api.remove(id)
  const move=(id,to)=>{if(legacy){const from=api.getBlockIndex(id);api.move(from,from<to?to+1:to)}else api.move(id,to)}
  let errorName=null,caller=null,callerBefore=null,changed=!noChange(v),skipped=false
  if(legacy&&producerVariant(v)){skipped=true;changed=false;unsupported.push({property:'currentProducerApi',reason:'v1 has no public blocks.update producer command. No private mutation or render replacement emulates the absent action; actual seeded replay controls still execute.'})}
  else if(legacy&&v==='missing-remove'){skipped=true;changed=false;unsupported.push({property:'currentRemoveIdRejection',reason:'v1 removal accepts an index, not an ID. No bad-index action is substituted for current missing-ID validation; actual replay controls still execute.'})}
  else try{
   if(v.startsWith('insert')||v==='unknown-insert'){
    const r=inserted(spec,legacy,'unused');caller={type:v==='unknown-insert'?'missing-type':'paragraph',...(v==='insert-default'?{}:{data:r.data}),...(r.tunes?{tunes:r.tunes}:{}),...(r.inline?{inline:r.inline}:{})};callerBefore=copy(caller)
    const index=v==='insert-head'?0:v==='insert-middle'?2:v==='insert-tail'?starting.length:v==='insert-index-invalid'?-1:undefined
    allocatedId=legacy?api.insert(caller.type,caller.data,index,undefined,caller.inline)?.id:api.insert(caller,index)
    allocatedId??=null
   }else if(v==='update-data')update('a',()=>({data:{text:'<i>Updated</i>'}}))
   else if(v==='update-table')update('t',current=>{current.data.rows[0].cells[0].text='<b>Changed</b>';current.data.rows.push({id:'r1',cells:[{id:'c0',text:'Below'},{id:'c1',text:'Last'}]});return{data:current.data,tunes:{layout:{gap:5}}}})
   else if(v==='update-tunes')update('a',()=>({tunes:{textAlign:'center',layout:{gap:5}}}))
   else if(v==='reset-tunes')update('a',()=>({tunes:null}))
   else if(v==='update-noop')update('a',current=>({data:current.data}))
   else if(v==='update-noop-keyorder')update('a',()=>({tunes:{textAlign:'right',layout:{width:3,gap:2}}}))
   else if(v==='move-forward')move('a',3)
   else if(v==='move-backward')move('c',0)
   else if(v==='move-noop')move('u',2)
   else if(v==='move-invalid')move('a',99)
   else if(v==='remove-first')remove('a')
   else if(v==='remove-middle')remove('u')
   else if(v==='remove-last')remove('c')
   else if(v.startsWith('remove-final')){remove(starting[0].id);if(!legacy)allocatedId=editor.save().blocks[0]?.id??null;else unsupported.push({property:'currentDefaultMaterialization',reason:'Legacy final removal is recorded as an actual empty document. A separate insertion is not fabricated to emulate the current atomic default replacement.'})}
   else if(v==='missing-remove')remove('missing')
   else if(v==='unknown-update')update('u',()=>({data:{text:'Forbidden'}}))
   else if(v==='update-invalid-patch')update('a',()=>({inline:{}}))
   else if(v==='nested-other')update('a',()=>{update('c',()=>({data:{text:'Nested C'}}));return{data:{text:'<i>Updated</i>'}}})
   else if(v==='nested-same')update('a',()=>{update('a',()=>({data:{text:'Nested A'}}));return{tunes:{textAlign:'center'}}})
   else if(v==='nested-insert-remove')update('a',()=>{allocatedId=api.insert({type:'paragraph',data:{text:'Nested inserted'}},1);api.remove('u');api.move('c',0);return{data:{text:'<i>Updated</i>'}}})
   else if(v==='caught-nested-failure')update('a',()=>{update('c',()=>({data:{text:'Discard'}}));try{api.remove('missing')}catch{innerCaught=true}return{data:{text:'Discard'}}})
  }catch(error){errorName=error?.name??typeof error}
  await pause()
  const expectedError=skipped?null:denied(v)?v==='update-invalid-patch'?'TypeError':['move-invalid','insert-index-invalid'].includes(v)?'RangeError':'Error':null
  check(phase,'errorName',errorName,expectedError)
  if(caller){check(phase,'callerUnchanged',caller,callerBefore);if(caller.data)caller.data.text='Caller mutation';if(caller.tunes)caller.tunes.layout.gap=100;if(caller.inline)caller.inline.future.data.nested.value=100}
  if(!skipped&&!noChange(v)&&(v.startsWith('insert')||v.startsWith('remove-final')||v==='nested-insert-remove')&&!(legacy&&v.startsWith('remove-final')))check(phase,'freshIdentity',typeof allocatedId==='string'&&allocatedId.length>0&&!starting.some(r=>r.id===allocatedId),true)
  const wanted=target(spec,legacy,allocatedId)
  check(phase,'canonical',editor.save().blocks,wanted);check(phase,'version',editor.save().version,version);check(phase,'readOnly',editor.readOnly,spec.mode==='read-only')
  if(retained){if(retained.data.text!==undefined)retained.data.text='Retained caller mutation';if(retained.data.rows?.[0]?.cells)retained.data.rows[0].cells[0].text='Retained caller mutation';if(retained.tunes?.layout)retained.tunes.layout.gap=100}
  check(phase,'afterCallerMutation',editor.save().blocks,wanted)
  check(phase,'producerCalls',producerCalls,legacy?0:v==='unknown-update'?0:producerVariant(v)?v.startsWith('nested')&&v!=='nested-insert-remove'||v==='caught-nested-failure'?2:1:0)
  if(!legacy&&v==='caught-nested-failure')check(phase,'innerCaught',innerCaught,true)
  check(phase,'history',[editor.canUndo,editor.canRedo],spec.mode==='read-only'?[false,false]:changed?[true,false]:[false,true])
  if(!legacy){const name=v.startsWith('insert')||v==='unknown-insert'?'block.insert':v.startsWith('move')?'block.move':v.startsWith('remove')||v==='missing-remove'?'block.remove':'block.update';check(phase,'events',transactions,changed?[{action:'commit',origin:'external',name}]:[]);check(phase,'diagnostics',diagnostics.map(({code,operation,errorName})=>({code,operation,errorName})),expectedError?[{code:'command.failed',operation:name,errorName:expectedError}]:[])}
  completedPhases.push(phase);phase='replay';if(spec.mode==='read-only')editor.setReadOnly(false)
  check(phase,'revealedHistory',[editor.canUndo,editor.canRedo],changed?[true,false]:[false,true])
  if(changed){check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoCanonical',editor.save().blocks,starting);check(phase,'undoHistory',[editor.canUndo,editor.canRedo],[false,true]);check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoCanonical',editor.save().blocks,wanted);check(phase,'redoHistory',[editor.canUndo,editor.canRedo],[true,false])}
  else{check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoCanonical',editor.save().blocks,seeded);check(phase,'redoHistory',[editor.canUndo,editor.canRedo],[true,false]);check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoCanonical',editor.save().blocks,starting);check(phase,'undoHistory',[editor.canUndo,editor.canRedo],[false,true])}
  completedPhases.push(phase);phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
  return{id:spec.id,spec,allocatedId,observations,diagnostics,transactions,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,allocatedId,observations,diagnostics,transactions,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{editor?.destroy();holder.remove()}
}
