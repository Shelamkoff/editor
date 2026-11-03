export const documentLifecycleCases = []
for (const operation of ['render-change','render-equal','render-empty','clear','clear-empty']) for (const shape of operation === 'clear-empty' ? ['known'] : ['known','opaque']) for (const mode of ['editable','read-only']) {
  documentLifecycleCases.push({ id: [operation,shape,mode].join('/'), operation, shape, mode })
}
for (const invalid of ['no-version','legacy-version','wrong-blocks','future-registered']) for (const shape of ['known','opaque']) for(const validationChannel of ['callback','no-callback']) documentLifecycleCases.push({ id: ['invalid',invalid,shape,validationChannel].join('/'), operation:'invalid', invalid, shape, validationChannel, mode:'editable' })
const pause = () => new Promise(resolve => setTimeout(resolve,25))
const copy = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
function records(spec,legacy,changed=false) {
  const para=(id,text)=>({id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text}})
  if(spec.operation==='clear-empty')return [para('a','')]
  const a=para('a',changed?'<i>Replaced</i> {{swatch}}':'<b>Alpha</b> {{swatch}}')
  a.inline={swatch:{type:'color',...(!legacy?{dataVersion:1}:{}),data:{value:'#aBcDef'}}}
  const c=para('c',changed?'<b>Replaced C</b>':'<i>Charlie</i>')
  let b
  if(spec.shape==='opaque'){
    a.data.text+=' {{future}}';a.inline.future={type:'future-inline',...(!legacy?{dataVersion:3}:{}),data:JSON.parse('{"nested":{"value":7},"__proto__":{"literal":true}}')}
    b={id:'b',type:'future-block',...(!legacy?{dataVersion:7}:{}),data:{text:'Opaque',rows:[{value:7}]},tunes:{layout:{gap:2}}}
  }
  return changed?[...(b?[b]:[]),c,a]:[a,...(b?[b]:[]),c]
}
export async function runDocumentLifecycleCase({sourceBase='../../',legacy=false,spec}) {
  const base=new URL(sourceBase,import.meta.url)
  const [core,paragraph,color]=await Promise.all(['core/index.js','plugins/paragraph/index.js','inline-plugins/color.js'].map(path=>import(new URL(path,base))))
  const observations=[],diagnostics=[],validationIssues=[],transactions=[],unsupported=[],completedPhases=[],owners={block:[],inline:[]}
  const check=(phase,property,actual,expected)=>{const a=copy(actual),e=copy(expected);observations.push({phase,property,actual:a,expected:e,status:same(a,e)?'PASS':'FAIL'})}
  const observe=(definition,kind)=>({...definition,setup(...args){
    const runtime=definition.setup.apply(definition,args)
    return {...runtime,create(...values){
      const instance=runtime.create.apply(runtime,values),context=values.at(-1),owner={element:instance.element,context,destroyed:0};owners[kind].push(owner)
      return {...instance,destroy(){owner.destroyed++;return instance.destroy.call(instance)}}
    }}
  }})
  const holder=document.createElement('section');document.body.append(holder)
  const initial=records(spec,legacy),version=legacy?'1.0.5':'2.0.0'
  const planned=['load',spec.operation==='invalid'?'reject':'apply',...(spec.operation==='invalid'?[]:['undo','redo']),'dispose']
  const defaults=id=>[{id,type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:''}}]
  let editor,phase='load',allocatedId=null,legacyOutcome=null
  if(legacy)unsupported.push({property:'currentInstanceTaskAndEventObservations',reason:'Legacy plugin instance task/disposal/event observation ports are not emulated. Actual public render/clear, wire data, root replacement and history execute.'})
  try{
    editor=core.createEditor({holder,injectStyles:false,inlineTools:[],plugins:[legacy?new paragraph.Paragraph():observe(paragraph.createParagraphPlugin({injectStyles:false}),'block')],
      inlinePlugins:[legacy?color.createColorSwatchPlugin():observe(color.createColorSwatchPlugin(),'inline')],onDiagnostic:value=>diagnostics.push(value),...(spec.validationChannel==='callback'?{onValidationError:issue=>validationIssues.push({issue:copy(issue),frozen:Object.isFrozen(issue)})}:{}),data:{version,blocks:initial}})
    if(!legacy)editor.on('transaction:committed',event=>transactions.push({action:event.action,origin:event.origin,name:event.name}))
    await pause()
    const oldOwners={block:owners.block.slice(),inline:owners.inline.slice()}
    const oldTasks=legacy?[]:[...oldOwners.block,...oldOwners.inline].map(owner=>owner.context.beginTask())
    if(spec.mode==='read-only')editor.setReadOnly(true)
    const oldNodes=[...holder.querySelectorAll('.oe-paragraph,[data-inline-plugin="color"]')]
    check(phase,'knownRootCount',oldNodes.length,spec.operation==='clear-empty'?1:3)
    check(phase,'version',editor.save().version,version);check(phase,'canonical',editor.save().blocks,initial)
    check(phase,'history',[editor.canUndo,editor.canRedo],[false,false])
    if(!legacy)check(phase,'initialTaskAbort',oldTasks.map(task=>task.signal.aborted),oldTasks.map(()=>spec.mode==='read-only'))
    completedPhases.push(phase)
    const stale=(tasks=oldTasks)=>{
      let producers=0,options=0
      const results=tasks.map(task=>task.commit(()=>{producers++;return {}},{get mergeWithPreviousField(){options++;return 'text'}}))
      return {results,producers,options,aborted:tasks.map(task=>task.signal.aborted)}
    }
    const freshNoop=kind=>{
      const owner=owners[kind].filter(owner=>owner.element.isConnected).at(-1)
      if(!owner)return null
      let producers=0;const task=owner.context.beginTask(),before=transactions.length
      const result=task.commit(current=>{producers++;return current})
      return {result,producers,newEvents:transactions.length-before}
    }
    if(spec.operation==='invalid'){
      phase='reject';const input={version,blocks:records(spec,legacy,true)}
      if(spec.invalid==='no-version')delete input.version
      else if(spec.invalid==='legacy-version')input.version='1.0.5'
      else if(spec.invalid==='wrong-blocks')input.blocks={not:'an array'}
      else input.blocks.find(block=>block.type==='paragraph').dataVersion=999
      const beforeInput=copy(input)
      let rejected=false,errorName=null
      try{editor.render(input)}catch(error){rejected=true;errorName=error?.name??typeof error}
      await pause()
      if(legacy){
        const saved=editor.save();legacyOutcome={rejected,errorName,document:copy(saved),canUndo:editor.canUndo,canRedo:editor.canRedo}
        unsupported.push({property:'currentVersionValidationContract',reason:'v1 has its own accepted legacy envelope and lacks the current v2 version/schema rejection contract. Its actual render result and history are recorded without imposing v2 validation semantics.'})
        check(phase,'legacyEditorUsable',{version:saved.version,blocks:Array.isArray(saved.blocks)&&saved.blocks.length>0,root:!!holder.querySelector('.oe-editor')},{version,blocks:true,root:true})
      }else{
        check(phase,'callerInputUnchanged',input,beforeInput)
        check(phase,'rejected',rejected,true);check(phase,'canonical',editor.save().blocks,initial)
        const expectedError=['no-version','wrong-blocks'].includes(spec.invalid)?'TypeError':'RangeError'
        const issue=spec.invalid==='legacy-version'?{reason:'unsupported-document-version'}:spec.invalid==='future-registered'?{reason:'unsupported-data-version',blockId:'c',type:'paragraph'}:{reason:'invalid-input'}
        check(phase,'errorName',errorName,expectedError)
        check(phase,'validationIssues',validationIssues,spec.validationChannel==='callback'?[{issue,frozen:true}]:[])
        check(phase,'expectedDiagnostic',diagnostics.map(({code,operation,errorName})=>({code,operation,errorName})),[{code:'command.failed',operation:'document.render',errorName:expectedError}])
        check(phase,'diagnosticTimestamp',diagnostics.every(item=>Number.isFinite(item.timestamp)&&item.timestamp>0),true)
        check(phase,'history',[editor.canUndo,editor.canRedo],[false,false]);check(phase,'oldRootsPreserved',oldNodes.every(node=>node.isConnected&&holder.contains(node)),true)
        check(phase,'tasksStillLive',oldTasks.map(task=>task.signal.aborted),oldTasks.map(()=>false));check(phase,'liveBlockNoop',freshNoop('block'),{result:true,producers:1,newEvents:0});check(phase,'liveInlineNoop',freshNoop('inline'),{result:true,producers:1,newEvents:0})
        check(phase,'afterNoopCanonical',editor.save().blocks,initial)
      }
      completedPhases.push(phase)
    }else{
      phase='apply'
      let supplied=null,target
      if(spec.operation.startsWith('render')){
        supplied={version,blocks:spec.operation==='render-empty'?[]:spec.operation==='render-equal'?copy(initial):records(spec,legacy,true)}
        target=spec.operation==='render-empty'?null:copy(supplied.blocks)
        const beforeInput=copy(supplied)
        editor.render(supplied)
        check(phase,'callerInputUnchanged',supplied,beforeInput)
        for(const block of supplied.blocks)block.data.text='caller mutation'
      }else{editor.clear();target=null}
      if(!target){allocatedId=editor.save().blocks[0]?.id;check(phase,'freshDefaultIdentity',typeof allocatedId==='string'&&allocatedId.length>0&&!initial.some(block=>block.id===allocatedId),true);target=defaults(allocatedId)}
      check(phase,'canonical',editor.save().blocks,target);check(phase,'oldRootsRetired',oldNodes.every(node=>!node.isConnected),true)
      check(phase,'mode',editor.readOnly,spec.mode==='read-only')
      if(!legacy){check(phase,'oldTasksDenied',stale(),{results:oldTasks.map(()=>false),producers:0,options:0,aborted:oldTasks.map(()=>true)});check(phase,'oldOwnersDisposed',[...oldOwners.block,...oldOwners.inline].map(owner=>owner.destroyed),[...oldOwners.block,...oldOwners.inline].map(()=>1))}
      if(spec.mode==='read-only')editor.setReadOnly(false)
      if(!legacy){check(phase,'liveBlockNoop',freshNoop('block'),{result:true,producers:1,newEvents:0});if(owners.inline.some(owner=>owner.element.isConnected))check(phase,'liveInlineNoop',freshNoop('inline'),{result:true,producers:1,newEvents:0})}
      check(phase,'afterNoopCanonical',editor.save().blocks,target);check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);completedPhases.push(phase)
      for(const redo of [false,true]){
        phase=redo?'redo':'undo'
        const previousOwners=legacy?[]:[...owners.block,...owners.inline].filter(owner=>owner.element.isConnected)
        const previousTasks=previousOwners.map(owner=>owner.context.beginTask())
        if(!legacy)check(phase,'previousTasksInitiallyLive',previousTasks.map(task=>task.signal.aborted),previousTasks.map(()=>false))
        check(phase,'available',redo?editor.redo():editor.undo(),true)
        check(phase,'canonical',editor.save().blocks,redo?target:initial)
        if(!legacy){check(phase,'oldTasksDenied',stale(),{results:oldTasks.map(()=>false),producers:0,options:0,aborted:oldTasks.map(()=>true)});check(phase,'previousTasksDenied',stale(previousTasks),{results:previousTasks.map(()=>false),producers:0,options:0,aborted:previousTasks.map(()=>true)});check(phase,'previousOwnersDisposed',previousOwners.map(owner=>owner.destroyed),previousOwners.map(()=>1));check(phase,'liveBlockNoop',freshNoop('block'),{result:true,producers:1,newEvents:0})}
        check(phase,'history',[editor.canUndo,editor.canRedo],redo?[true,false]:[false,true]);completedPhases.push(phase)
      }
    }
    phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
    return {id:spec.id,spec,allocatedId,legacyOutcome,observations,diagnostics,validationIssues,transactions,unsupported,planned,completedPhases,error:null}
  }catch(error){return {id:spec.id,spec,allocatedId,legacyOutcome,observations,diagnostics,validationIssues,transactions,unsupported,planned,completedPhases,phase,error:String(error?.stack??error)}}
  finally{editor?.destroy();holder.remove()}
}
