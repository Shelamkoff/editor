export const publicSelectionCases=[]
for(const variant of ['select-many','select-empty','clear','set-current','missing-select','missing-current','removed-select','removed-current','replaced-select','replaced-current','replaced-same-id'])for(const mode of ['editable','read-only'])for(const focus of ['local','foreign'])publicSelectionCases.push({id:[variant,mode,focus].join('/'),variant,mode,focus})
const copy=value=>JSON.parse(JSON.stringify(value))
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const pause=()=>new Promise(resolve=>setTimeout(resolve,25))
function records(spec,legacy,seed=false){
 const para=(id,text)=>({id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text}})
 const a=para('a',seed?'Seed':spec.variant.startsWith('replaced')?'New Alpha':'Alpha')
 const b={id:'b',type:'future-block',...(!legacy?{dataVersion:7}:{}),data:{text:'Opaque',rows:[{value:7}]}}
 return[a,...((spec.variant.startsWith('removed')||['replaced-select','replaced-current'].includes(spec.variant))?[]:[b]),para('c','Charlie')]
}
export async function runPublicSelectionCase({sourceBase='../../',legacy=false,spec}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph]=await Promise.all(['core/index.js','plugins/paragraph/index.js'].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section'),foreign=document.createElement('div');foreign.contentEditable='true';foreign.textContent='Outside';document.body.append(holder,foreign)
 const observations=[],diagnostics=[],events=[],unsupported=[],completedPhases=[],planned=['load','control','replay','dispose']
 const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:equal(a,e)?'PASS':'FAIL'})}
 let editor,other,phase='load'
 try{
  const version=legacy?'1.0.5':'2.0.0',original={variant:'select-many'}
  editor=core.createEditor({holder,injectStyles:false,inlineTools:[],plugins:[legacy?new paragraph.Paragraph():paragraph.createParagraphPlugin({injectStyles:false})],blockRemoveAnimationMs:0,blockInsertAnimationMs:0,blockMoveAnimationMs:0,onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:records(original,legacy)}})
  if(!legacy)for(const type of ['currentBlock:changed','selection:changed','document:changed','transaction:committed','history:changed'])editor.on(type,event=>events.push(type==='selection:changed'?{type,selectedIds:copy(event.selectedIds)}:type==='currentBlock:changed'?{type,currentId:event.currentId}:{type,action:event.action??null,name:event.name??null}))
  else unsupported.push({property:'currentControlEventAndSnapshotPorts',reason:'Legacy current/selection methods execute through their public index/selectBlocks/getSelectedBlocks APIs; current v2 fact events and frozen selected-ID snapshots are not emulated.'})
  await pause()
  const root=holder.querySelector('.oe-editor'),oldRoot=root.querySelector(`[data-block-id="${spec.variant.startsWith('removed')?'b':'a'}"]`)
  if(spec.variant.startsWith('removed'))legacy?editor.blocks.remove(1):editor.blocks.remove('b')
  else if(spec.variant.startsWith('replaced'))editor.render({version,blocks:records(spec,legacy)})
  editor.render({version,blocks:records(spec,legacy,true)});editor.undo();await pause()
  if(spec.mode==='read-only')editor.setReadOnly(true)
  const api=editor.blocks
  const selected=()=>legacy?api.getSelectedBlocks().map(block=>block.id):[...api.selectedIds()]
  const current=()=>legacy?api.getCurrentBlock()?.id??null:api.currentId
  const setCurrent=id=>legacy?api.setCurrentIndex(api.getBlockIndex(id)):api.setCurrent(id)
  const select=ids=>legacy?api.selectBlocks(ids):api.select(ids)
  const field=root.querySelector('.oe-paragraph');field.tabIndex=0
  let target=field
  const otherBlocks=[{id:'a',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:'Outside'}}]
  if(spec.focus==='foreign'){
   foreign.contentEditable='false';foreign.textContent=''
   other=core.createEditor({holder:foreign,injectStyles:false,inlineTools:[],plugins:[legacy?new paragraph.Paragraph():paragraph.createParagraphPlugin({injectStyles:false})],data:{version,blocks:copy(otherBlocks)}})
   await pause();target=foreign.querySelector('.oe-paragraph');target.tabIndex=0
  }
  target.focus()
  const node=target.firstChild,selection=window.getSelection();selection.removeAllRanges();const range=document.createRange();range.setStart(node,1);range.setEnd(node,3);selection.addRange(range)
  await pause();setCurrent('a');select(['a']);await pause();events.length=0
  const structural=spec.variant.startsWith('removed')||spec.variant.startsWith('replaced')
  const available=spec.mode==='read-only'?[false,false]:[structural,true]
  check(phase,'canonical',editor.save().blocks,records(spec,legacy));check(phase,'version',editor.save().version,version)
  check(phase,'history',[editor.canUndo,editor.canRedo],available);check(phase,'current',current(),'a');check(phase,'selected',selected(),['a']);check(phase,'readOnly',editor.readOnly,spec.mode==='read-only')
  check(phase,'focused',document.activeElement===target,true);check(phase,'rangeText',selection.toString(),spec.focus==='local'?(spec.variant.startsWith('replaced')?'ew':'lp'):'ut')
  if(structural)check(phase,'oldRootRetired',oldRoot!==null&&!oldRoot.isConnected,true)
  completedPhases.push(phase);phase='control'
  let errorName=null,skipped=false
  const invalidCurrent=['missing-current','removed-current','replaced-current'].includes(spec.variant)
  if(legacy&&invalidCurrent){
   skipped=true;unsupported.push({property:'currentIdRejection',reason:'v1 exposes only setCurrentIndex; no same-contract setter accepts a stale ID. A bad-index call is not fabricated as an ID-rejection action. Existing state and real replay controls still execute.'})
  }else try{
   switch(spec.variant){
    case'select-many':select(['c','b','c','a']);break
    case'select-empty':select([]);break
    case'clear':api.clearSelection();break
    case'set-current':setCurrent('c');break
    case'missing-select':select(['a','missing']);break
    case'missing-current':setCurrent('missing');break
    case'removed-select':case'replaced-select':select(['a','b']);break
    case'removed-current':case'replaced-current':setCurrent('b');break
    case'replaced-same-id':select(['c','b']);setCurrent('c');break
   }
  }catch(error){errorName=error?.name??typeof error}
  const denied=spec.variant.includes('missing')||spec.variant.startsWith('removed')||['replaced-select','replaced-current'].includes(spec.variant)
  const wantedSelected=spec.variant==='select-many'?['a','b','c']:['clear','select-empty'].includes(spec.variant)?[]:spec.variant==='replaced-same-id'?['b','c']:['a']
  const wantedCurrent=['set-current','replaced-same-id'].includes(spec.variant)?'c':'a'
  check(phase,'errorName',errorName,denied&&!skipped?'Error':null)
  check(phase,'selected',selected(),wantedSelected);check(phase,'current',current(),wantedCurrent)
  check(phase,'focusPreserved',document.activeElement===target,true)
  check(phase,'nativeRange',{anchor:selection.anchorNode===node,focus:selection.focusNode===node,anchorOffset:selection.anchorOffset,focusOffset:selection.focusOffset,text:selection.toString()},{anchor:true,focus:true,anchorOffset:1,focusOffset:3,text:spec.focus==='local'?(spec.variant.startsWith('replaced')?'ew':'lp'):'ut'})
  check(phase,'canonical',editor.save().blocks,records(spec,legacy));check(phase,'history',[editor.canUndo,editor.canRedo],available);check(phase,'readOnly',editor.readOnly,spec.mode==='read-only')
  if(other)check(phase,'otherEditor',{canonical:other.save().blocks,history:[other.canUndo,other.canRedo],readOnly:other.readOnly,selected:legacy?other.blocks.getSelectedBlocks().map(block=>block.id):other.blocks.selectedIds(),current:legacy?other.blocks.getCurrentBlock()?.id??null:other.blocks.currentId},{canonical:otherBlocks,history:[false,false],readOnly:false,selected:[],current:'a'})
  if(!legacy)check(phase,'selectedSnapshotFrozen',Object.isFrozen(api.selectedIds()),true)
  if(!legacy){const expected=[];if(!equal(wantedSelected,['a']))expected.push({type:'selection:changed',selectedIds:wantedSelected});if(wantedCurrent!=='a')expected.push({type:'currentBlock:changed',currentId:wantedCurrent});check(phase,'events',events,expected)}
  completedPhases.push(phase);phase='replay'
  if(spec.mode==='read-only')editor.setReadOnly(false)
  check(phase,'redoAvailable',editor.redo(),true);check(phase,'redoCanonical',editor.save().blocks,records(spec,legacy,true));check(phase,'redoHistory',[editor.canUndo,editor.canRedo],[true,false])
  check(phase,'undoAvailable',editor.undo(),true);check(phase,'undoCanonical',editor.save().blocks,records(spec,legacy));check(phase,'undoHistory',[editor.canUndo,editor.canRedo],[structural,true])
  completedPhases.push(phase);phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
  return {id:spec.id,spec,observations,diagnostics,events,unsupported,planned,completedPhases,error:null}
 }catch(error){return{id:spec.id,spec,observations,diagnostics,events,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
 finally{editor?.destroy();other?.destroy();holder.remove();foreign.remove()}
}
