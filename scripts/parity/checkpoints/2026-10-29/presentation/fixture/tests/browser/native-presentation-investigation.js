import { createEditor } from '../../core/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { documentValidationIssue } from '../../shared/documentValidationIssue.js'

const pause = (ms=30) => new Promise(resolve => setTimeout(resolve,ms))
const copy = value => structuredClone(value)
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
const captures=[]
globalThis.__capturePresentationProbe = value => captures.push(value)

function fixture(options={}){
  const panels=new Map(), widgets=new Map(), errors=[], diagnostics=[], validation=[], transactions=[]
  const attempts=[], retired=[], blockCreates=[], thrown=[]
  const flags={decode:new Map(),create:new Map(),block:new Map(),loseRecoveryBoundary:false,adoptProjectionRoot:false}
  let stoppedByHarness=false, editor
  const failure=(kind,key)=>{
    attempts.push({kind,key})
    const remaining=flags[kind].get(key)??0
    if(!remaining)return
    if(remaining==='persistent'){
      const count=attempts.filter(item=>item.kind===kind&&item.key===key&&item.armed).length
      if(count>=5){stoppedByHarness=true;flags[kind].set(key,0)}
    }else flags[kind].set(key,remaining-1)
    attempts.at(-1).armed=true
    const error=new Error(`probe ${kind} failure ${key}`)
    error.name=kind==='decode'?'ProbeDecodeError':kind==='block'?'ProbeBlockCreateError':'ProbeWidgetCreateError'
    thrown.push(error)
    if(kind==='create'&&key==='a-back'&&flags.loseRecoveryBoundary){
      const foreign=document.createElement('div');foreign.dataset.probeForeign='';foreign.append(panels.get('a').field())
    }
    if(kind==='create'&&key==='a-back'&&flags.adoptProjectionRoot){
      const foreign=document.createElement('aside');document.body.append(foreign);foreign.append(panels.get('a').root.parentNode)
    }
    throw error
  }
  const block={
    type:'presentation-probe',icon:'',label:{key:'title',fallback:'Probe'},
    schema:{currentVersion:1,createDefault:()=>({name:'default',fields:[]}),
      decode:input=>({dataVersion:1,data:copy(input.data)}),encode:data=>({dataVersion:1,data:copy(data)}),
      mapRichText:(data,visit)=>({...data,fields:data.fields.map(field=>({...field,html:visit(field.html,field.key)}))}),
    },
    setup(){return {create(initial,context){
      failure('block',initial.name)
      blockCreates.push({name:initial.name,restoring:context.restoring})
      let data=copy(initial),active='front',mounted,readOnly=context.isReadOnly()
      const doc=context.ownerDocument,root=doc.createElement('div'),controls=doc.createElement('nav'),note=doc.createElement('div')
      const paint=()=>{
        const next=doc.createElement('div');next.dataset.probeField=active;next.contentEditable=String(!readOnly)
        next.innerHTML=data.fields.find(field=>field.key===active)?.html??''
        if(mounted?.parentNode===root)mounted.replaceWith(next);else root.prepend(next)
        mounted=next
      }
      const switchTab=side=>{active=side??(active==='front'?'back':'front');paint()}
      for(const side of ['front','back']){
        const button=doc.createElement('button');button.type='button';button.textContent=side;button.dataset.side=side
        button.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
        button.addEventListener('click',()=>switchTab(side),{signal:context.signal});controls.append(button)
      }
      root.append(controls);paint()
      note.dataset.probeField='note';note.contentEditable=String(!readOnly)
      note.innerHTML=data.fields.find(field=>field.key==='note')?.html??'';root.append(note)
      panels.set(data.name,{context,root,note,field:()=>mounted,active:()=>active,button:side=>controls.querySelector(`[data-side="${side}"]`),switchTab})
      return {element:root,
        read:()=>({...data,fields:data.fields.map(field=>({...field,html:field.key===active?mounted.innerHTML:field.key==='note'?note.innerHTML:field.html}))}),
        update(next){data=copy(next);if(!options.canonicalAction){paint();note.innerHTML=data.fields.find(field=>field.key==='note')?.html??''}},
        editableFields:()=>[{key:active,mode:'rich-text',element:mounted},{key:'note',mode:'rich-text',element:note}],
        setReadOnly(value){readOnly=value;mounted.contentEditable=note.contentEditable=String(!value)},
        focus(target){if(target?.fieldKey&&target.fieldKey!==active&&target.fieldKey!=='note')switchTab(target.fieldKey);(target?.fieldKey==='note'?note:mounted).focus()},
        destroy(){},
      }
    },destroy(){}}},
  }
  const inline={
    type:'presentation-widget',icon:'',label:{key:'title',fallback:'Probe widget'},
    schema:{currentVersion:1,createDefault:()=>({label:''}),
      decode(input){failure('decode',input.data.label);return {dataVersion:1,data:{label:input.data.label}}},
      encode:data=>({dataVersion:1,data:{label:data.label}}),
    },
    setup({ownerDocument}){return {create(id,data,context){
      failure('create',data.label)
      const element=ownerDocument.createElement('span');element.textContent=data.label;element.contentEditable='false'
      const instance={id,label:data.label,context,element,ordinal:widgets.get(data.label)?.length??0}
      if(!widgets.has(data.label))widgets.set(data.label,[])
      widgets.get(data.label).push(instance)
      return {element,update(next){element.textContent=next.label},setReadOnly(){},destroy(){retired.push({id,ordinal:instance.ordinal})}}
    },destroy(){}}},
  }
  const records=['a','b'].map(name=>({id:name,type:block.type,dataVersion:1,data:{name,fields:[
    {key:'front',html:'Front {{'+name+'-front}}'},
    {key:'back',html:'Back {{'+name+'-back}} {{'+name+'-opaque}}'},
    {key:'note',html:'Note {{'+name+'-note}} tail'},
  ]},inline:{...Object.fromEntries(['front','back','note'].map(side=>[name+'-'+side,{type:inline.type,dataVersion:1,data:{label:name+'-'+side}}])),[name+'-opaque']:{type:'unloaded-probe',dataVersion:9,data:{label:'opaque-kept'}}}}))
  if(options.partialFailure){
    records[0].data.fields.find(field=>field.key==='back').html='Back {{a-back}} {{a-late}} {{a-opaque}}'
    records[0].inline['a-late']={type:inline.type,dataVersion:1,data:{label:'a-late'}}
  }
  const holder=document.createElement('section');document.body.append(holder)
  const capture=event=>{const error=event.type==='unhandledrejection'?event.reason:event.error??event.message;errors.push(error);event.preventDefault()}
  window.addEventListener('error',capture);window.addEventListener('unhandledrejection',capture)
  const start=captures.length
  editor=createEditor({holder,injectStyles:true,plugins:[block],inlinePlugins:[inline],defaultBlock:block.type,data:{version:'2.0.0',blocks:records},onDiagnostic:item=>diagnostics.push(item),onValidationError:item=>validation.push(item)})
  const binding=captures[start]
  editor.on('transaction:committed',event=>transactions.push({origin:event.origin,action:event.action,generation:event.generation,revision:event.revision}))
  const foreignHolder=document.createElement('section');document.body.append(foreignHolder)
  const foreign=createEditor({holder:foreignHolder,injectStyles:true,plugins:[createParagraphPlugin()],data:{version:'2.0.0',blocks:[{id:'foreign',type:'paragraph',dataVersion:2,data:{text:'Foreign selection'}}]}})
  const foreignField=foreignHolder.querySelector('.oe-paragraph')
  const errorInfo=error=>({name:error?.name??typeof error,message:error?.message??String(error),original:thrown.includes(error),issue:documentValidationIssue(error)??null,causes:error instanceof AggregateError?[...error.errors].map(errorInfo):undefined})
  return {editor,foreign,foreignField,binding,panels,widgets,flags,attempts,retired,blockCreates,errors,diagnostics,validation,transactions,errorInfo,
    latest:label=>widgets.get(label)?.at(-1),
    get stoppedByHarness(){return stoppedByHarness},
    destroy(){editor.destroy();foreign.destroy();holder.remove();foreignHolder.remove();window.removeEventListener('error',capture);window.removeEventListener('unhandledrejection',capture)},
  }
}

function fieldState(h,name){
  const p=h.panels.get(name),field=p.field()
  return {active:p.active(),html:field.innerHTML,noteHTML:p.note.innerHTML,registeredWidgets:[...field.querySelectorAll('[data-inline-plugin="presentation-widget"]')].map(node=>node.dataset.id),opaque:[...field.querySelectorAll('[data-oe-opaque-inline]')].map(node=>node.dataset.oeOpaqueInline),fieldConnected:field.isConnected,noteConnected:p.note.isConnected,editable:field.contentEditable}
}
function foreignSelection(h){
  h.foreignField.focus();const text=h.foreignField.firstChild;window.getSelection().setBaseAndExtent(text,5,text,2)
  return {anchorNode:text,anchorOffset:5,focusNode:text,focusOffset:2,active:h.foreignField}
}
function selectionUnchanged(value){const current=window.getSelection();return current.anchorNode===value.anchorNode&&current.anchorOffset===value.anchorOffset&&current.focusNode===value.focusNode&&current.focusOffset===value.focusOffset&&document.activeElement===value.active}
async function startIme(field){
  field.focus();window.getSelection().setBaseAndExtent(field.firstChild,1,field.firstChild,1)
  const events=[];for(const type of ['compositionstart','compositionupdate','compositionend'])field.addEventListener(type,event=>events.push({type,trusted:event.isTrusted,data:event.data}))
  await window.__testInput('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Process',windowsVirtualKeyCode:229})
  await window.__testInput('Input.imeSetComposition',{text:'に',selectionStart:1,selectionEnd:1})
  await window.__testInput('Input.dispatchKeyEvent',{type:'keyUp',key:'Process',windowsVirtualKeyCode:229})
  await pause()
  const selection=window.getSelection()
  return {events,html:field.innerHTML,hasPreedit:field.textContent.includes('に'),selection:{anchorNode:selection.anchorNode,anchorOffset:selection.anchorOffset,focusNode:selection.focusNode,focusOffset:selection.focusOffset,active:document.activeElement}}
}

const comparisons=[
  {name:'comparison: existing affected-block acquisition loses unrelated same-block native state',kind:'create',failures:1,ime:'a',blockRecovery:true},
  {name:'comparison: affected-block acquisition failure preserves contained predecessor',kind:'create',failures:1,ime:'a',blockRecovery:true,blockRecoveryFails:true},
]
const scenarios=document.body.dataset.probeMode==='comparison'?comparisons:[
  {name:'no-fault asynchronous tab and opaque control'},
  {name:'settled healthy field adopted by new editable owner loses authority and scope',kind:'create',failures:1,postAdopt:'editable'},
  {name:'settled healthy field adopted by widget owner loses authority and scope',kind:'create',failures:1,postAdopt:'widget'},
  {name:'settled healthy field adopted by other block loses authority and scope',kind:'create',failures:1,postAdopt:'block'},
  {name:'projection root adoption during fault retires A and explicit canonical acquisition restores order',kind:'create',failures:1,adoptProjectionRoot:true,sync:true,batch:true},
  {name:'mode round trip cannot reenable or implicitly retry settled failed host',kind:'create',failures:'persistent',modeRoundTrip:true},
  {name:'canonical edit of failed field bypasses no failure checks and rolls back on fault',kind:'create',failures:'persistent',canonicalAction:'failure'},
  {name:'canonical rich-text payload edit of failed field reacquires on exact same host',kind:'create',failures:1,canonicalAction:'success'},
  {name:'trusted pending native text input survives no-fault sibling tab',nativeText:true},
  {name:'trusted pending native text input survives sibling creation failure',nativeText:true,kind:'create',failures:1},
  {name:'same-block backward native range survives sibling tab',sameBlockRange:true},
  {name:'same-block backward native range survives sibling failure',sameBlockRange:true,kind:'create',failures:1},
  {name:'partially acquired failed field retires only its candidates then retries',partialFailure:true,kind:'create',faultKey:'a-late',failures:1,retry:1},
  {name:'arbitrary author text without native owner is canonicalized',corruption:'text'},
  {name:'unsafe live author attribute without native owner is canonicalized',corruption:'attribute'},
  {name:'forged widget DOM without native owner is canonicalized',corruption:'widget'},
  {name:'synthetic composition does not admit arbitrary author text',corruption:'text',syntheticIme:true},
  {name:'stale genuine composition does not admit arbitrary author text',ime:'a',staleIme:true},
  {name:'unsafe live author attribute during genuine composition is rejected',ime:'a',corruption:'attribute',rejectIme:true},
  {name:'known decoder failure synchronous query',kind:'decode',failures:1,sync:true},
  {name:'known decoder failure asynchronous delivery',kind:'decode',failures:1},
  {name:'one creation failure with independent B notification',kind:'create',failures:1,batch:true},
  {name:'two creation failures with independent B notification',kind:'create',failures:2,batch:true},
  {name:'one creation failure synchronous query',kind:'create',failures:1,sync:true},
  {name:'persistent creation failure controlled by harness',kind:'create',failures:'persistent',batch:true},
  {name:'one creation failure then explicit tab retry',kind:'create',failures:1,sync:true,retry:1},
  {name:'two creation failures then two explicit tab retries',kind:'create',failures:2,sync:true,retry:2},
  {name:'persistent creation failure explicit retry remains bounded then disarms',kind:'create',failures:'persistent',batch:true,retry:3,disarmRetry:true,taskProbe:true},
  {name:'failure of field recovery containment has explicit aggregate outcome',kind:'create',failures:1,sync:true,loseRecoveryBoundary:true,retry:1},
  {name:'persistent decoder failure controlled by harness',kind:'decode',failures:'persistent',batch:true},
  {name:'unrelated foreign editor selection during creation failure',kind:'create',failures:1,foreign:true},
  {name:'same-block native IME preedit during no-fault tab switch',ime:'a',completeIme:true},
  {name:'same-block native IME preedit during creation failure',kind:'create',failures:1,ime:'a',completeIme:true},
  {name:'independent-block native IME preedit during creation failure',kind:'create',failures:1,ime:'b'},
]
const results=[]
for(const scenario of scenarios){
  const h=fixture(scenario);let ime,retained,taskA,taskB,noteRange,nativeText,blockRecovery
  try{
    await pause()
    let before=h.editor.save().blocks,version={generation:h.binding.runtime.generation,revision:h.binding.runtime.revision}
    taskA=h.latest('a-note').context.beginTask();taskB=h.latest('b-note').context.beginTask()
    const noteA=h.panels.get('a').note,noteB=h.panels.get('b').note,widgetA=h.latest('a-note').element,widgetB=h.latest('b-note').element
    if(scenario.ime){ime=await startIme(h.panels.get(scenario.ime).note);if(!ime.hasPreedit||!same(h.editor.save().blocks,before))throw new Error('Fixture did not establish native uncommitted preedit')}
    if(scenario.syntheticIme)h.panels.get('a').note.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))
    if(scenario.staleIme){
      h.editor.blocks.update('b',current=>({data:{...current.data,fields:current.data.fields.map(field=>field.key==='front'?{...field,html:'Changed '+field.html}:field)}}))
      before=h.editor.save().blocks;version={generation:h.binding.runtime.generation,revision:h.binding.runtime.revision}
    }
    if(scenario.corruption){
      const note=h.panels.get('a').note
      if(scenario.corruption==='text')note.firstChild.data+=' INJECTED '
      if(scenario.corruption==='attribute'){
        const mark=document.createElement('b');mark.setAttribute('onclick','window.__probeUnsafeExecuted=true');note.firstChild.replaceWith(mark);mark.append('INJECTED ')
      }
      if(scenario.corruption==='widget'){
        const fake=document.createElement('span');fake.dataset.inlinePlugin='presentation-widget';fake.dataset.id='a-note';fake.textContent='INJECTED ';note.append(fake)
      }
    }
    if(scenario.sameBlockRange){
      noteA.focus();const text=noteA.firstChild;window.getSelection().setBaseAndExtent(text,4,text,1)
      noteRange={anchorNode:text,anchorOffset:4,focusNode:text,focusOffset:1,active:noteA}
    }
    if(scenario.foreign)retained=foreignSelection(h)
    if(scenario.kind)h.flags[scenario.kind].set(scenario.faultKey??'a-back',scenario.failures)
    let expectedHistory=h.editor.canUndo,expectedTransactionCount=h.transactions.length
    if(scenario.loseRecoveryBoundary)h.flags.loseRecoveryBoundary=true
    if(scenario.adoptProjectionRoot)h.flags.adoptProjectionRoot=true
    const attemptsAtStart=h.attempts.length
    if(scenario.nativeText){
      noteA.focus();window.getSelection().setBaseAndExtent(noteA.firstChild,1,noteA.firstChild,1)
      const nativeBefore=copy(before),nativeVersion={...version},nativeTx=h.transactions.length
      noteA.addEventListener('input',event=>{
        const nativeSelection=window.getSelection(),range={anchorNode:nativeSelection.anchorNode,anchorOffset:nativeSelection.anchorOffset,focusNode:nativeSelection.focusNode,focusOffset:nativeSelection.focusOffset,active:noteA}
        h.panels.get('a').button('back').click()
        let query
        try{query={keys:h.binding.reconciler.getEditableFields('a').map(field=>field.key)}}catch(error){query={error:h.errorInfo(error)}}
        nativeText={trusted:event.isTrusted,inputType:event.inputType,query,preedit:noteA.textContent.includes('X'),rangePreserved:selectionUnchanged(range),canonicalUnchanged:same(h.editor.save().blocks,nativeBefore),versionUnchanged:h.binding.runtime.revision===nativeVersion.revision,taskAlive:!taskA.signal.aborted}
      },{once:true})
      await window.__testInput('Input.insertText',{text:'X'});await pause(40)
      const expected=copy(nativeBefore);expected[0].data.fields.find(field=>field.key==='note').html='NXote {{a-note}} tail'
      nativeText.complete={exactData:same(h.editor.save().blocks,expected),revisionDelta:h.binding.runtime.revision-nativeVersion.revision,transactions:h.transactions.length-nativeTx}
      before=h.editor.save().blocks;version={generation:h.binding.runtime.generation,revision:h.binding.runtime.revision};expectedHistory=h.editor.canUndo;expectedTransactionCount=h.transactions.length
    }else h.panels.get('a').button('back').click()
    if(scenario.batch)h.panels.get('b').button('back').click()
    let synchronous={called:false}
    if(scenario.sync){
      synchronous={called:true}
      try{synchronous.keys=h.binding.reconciler.getEditableFields('a').map(field=>field.key);synchronous.returned=true}
      catch(error){synchronous.returned=false;synchronous.error=h.errorInfo(error)}
      synchronous.a=fieldState(h,'a')
    }
    await pause(80)
    if(scenario.blockRecovery){
      if(scenario.blockRecoveryFails)h.flags.block.set('a',1)
      try{h.binding.reconciler.probeRecoverBlock('a');blockRecovery={returned:true}}catch(error){blockRecovery={returned:false,error:h.errorInfo(error)}}
      await pause(40)
    }
    const afterFirst={a:fieldState(h,'a'),b:fieldState(h,'b'),attempts:h.attempts.slice(attemptsAtStart),errors:h.errors.map(h.errorInfo),diagnostics:copy(h.diagnostics),validation:copy(h.validation)}
    const failedHost=h.panels.get('a').field()
    let healthyQuery
    try{healthyQuery={same:h.binding.reconciler.getEditableField('a','note')?.element===noteA}}catch(error){healthyQuery={error:h.errorInfo(error)}}
    let retry=null
    if(scenario.retry&&!h.stoppedByHarness){
      retry={repeatedQuery:{},explicit:[]}
      const queryAttempts=h.attempts.length
      try{retry.repeatedQuery.keys=h.binding.reconciler.getEditableFields('a').map(field=>field.key);retry.repeatedQuery.returned=true}catch(error){retry.repeatedQuery.returned=false;retry.repeatedQuery.error=h.errorInfo(error)}
      retry.repeatedQuery.newAttempts=h.attempts.length-queryAttempts
      for(let index=0;index<scenario.retry;index++){
        h.panels.get('a').button('back').click();await pause(40)
        const outcome={a:fieldState(h,'a')}
        try{outcome.keys=h.binding.reconciler.getEditableFields('a').map(field=>field.key);outcome.returned=true}catch(error){outcome.returned=false;outcome.error=h.errorInfo(error)}
        retry.explicit.push(outcome)
      }
      if(scenario.disarmRetry){
        h.flags[scenario.kind].set('a-back',0)
        h.panels.get('a').button('back').click();await pause(40)
        retry.disarmed={a:fieldState(h,'a'),keys:h.binding.reconciler.getEditableFields('a').map(field=>field.key)}
      }
    }
    const observation={synchronous,afterFirst,retry,healthyQuery,nativeText,blockRecovery,sameBlockRangeUnchanged:noteRange?selectionUnchanged(noteRange):null,canonicalUnchanged:same(h.editor.save().blocks,before),generationRevisionUnchanged:same(version,{generation:h.binding.runtime.generation,revision:h.binding.runtime.revision}),runtimeHealth:h.binding.runtime.health,canUndo:h.editor.canUndo,transactions:copy(h.transactions),aNoteIdentityPreserved:h.panels.get('a').note===noteA,bNoteIdentityPreserved:h.panels.get('b').note===noteB,aNoteWidgetIdentityPreserved:h.latest('a-note')?.element===widgetA&&widgetA.isConnected,bNoteWidgetIdentityPreserved:h.latest('b-note')?.element===widgetB&&widgetB.isConnected,aNoteTaskAborted:taskA.signal.aborted,bNoteTaskAborted:taskB.signal.aborted,foreignSelectionUnchanged:retained?selectionUnchanged(retained):null,nativePreedit:ime?{events:ime.events,html:ime.html,hasPreedit:ime.hasPreedit,survives:h.panels.get(scenario.ime).note.textContent.includes('に'),rangePreserved:selectionUnchanged(ime.selection)}:null,stoppedByHarness:h.stoppedByHarness,blockCreates:copy(h.blockCreates),retired:copy(h.retired)}
    const violations=[]
    if(observation.stoppedByHarness)violations.push('persistent failure triggered implicit retries stopped by the harness')
    if(!observation.canonicalUnchanged||!observation.generationRevisionUnchanged||observation.canUndo!==expectedHistory||observation.transactions.length!==expectedTransactionCount)violations.push('presentation changed accepted model/history')
    if(!scenario.adoptProjectionRoot&&(observation.aNoteTaskAborted||!observation.aNoteWidgetIdentityPreserved))violations.push('unrelated same-block widget/task was retired')
    if(observation.bNoteTaskAborted||!observation.bNoteWidgetIdentityPreserved)violations.push('unrelated independent-block widget/task was retired')
    if(scenario.batch&&!afterFirst.b.registeredWidgets.includes('b-back'))violations.push('independent B notification was abandoned')
    if(scenario.foreign&&!observation.foreignSelectionUnchanged)violations.push('foreign editor selection changed')
    if(ime&&!scenario.staleIme&&!scenario.rejectIme&&(!observation.nativePreedit.survives||!observation.nativePreedit.rangePreserved))violations.push('unrelated native preedit was discarded')
    if(scenario.corruption&&(afterFirst.a.noteHTML.includes('INJECTED')||afterFirst.a.noteHTML.includes('onclick')))violations.push('unowned or unsafe DOM was retained')
    if((scenario.staleIme||scenario.rejectIme)&&observation.nativePreedit.survives)violations.push('stale or unsafe pending projection was retained')
    if(scenario.kind==='decode'&&afterFirst.a.registeredWidgets.length===0&&afterFirst.diagnostics.length===0&&afterFirst.errors.length===0)violations.push('known decode failure silently published literal projection')
    if(noteRange&&!observation.sameBlockRangeUnchanged)violations.push('same-block backward native range changed')
    if(nativeText&&(!nativeText.trusted||!nativeText.preedit||!nativeText.rangePreserved||!nativeText.canonicalUnchanged||!nativeText.versionUnchanged||!nativeText.taskAlive||!nativeText.complete.exactData||nativeText.complete.revisionDelta!==1||nativeText.complete.transactions!==1))violations.push('trusted pending native input was not preserved and settled exactly once')
    if(scenario.partialFailure){
      const old=h.widgets.get('a-back')?.[0]
      observation.partialRetirement={oldAborted:old?.context.signal.aborted,oldDestroyCount:h.retired.filter(item=>item.id==='a-back'&&item.ordinal===0).length,fresh:h.latest('a-back')?.element!==old?.element}
      if(!observation.partialRetirement.oldAborted||observation.partialRetirement.oldDestroyCount!==1||!observation.partialRetirement.fresh)violations.push('partial candidate retirement or fresh retry scope was incorrect')
    }
    if(scenario.kind){
      if(!scenario.adoptProjectionRoot&&!healthyQuery.same)violations.push('healthy sibling field query was poisoned by failed sibling')
      if(!scenario.loseRecoveryBoundary&&!scenario.adoptProjectionRoot&&(afterFirst.a.editable!=='false'||afterFirst.a.html!==''))violations.push('failed field remains an authoring or partial projection')
      if(scenario.loseRecoveryBoundary){
        observation.failedForeignOwner=h.binding.reconciler.resolveEditableTarget(failedHost)
        if(synchronous.error?.name!=='AggregateError'||synchronous.error?.causes?.length!==2||!synchronous.error.causes[0].original)violations.push('containment failure lost original cause')
        if(afterFirst.a.fieldConnected||observation.failedForeignOwner)violations.push('foreign failed host retained editor authority')
      }
      if(afterFirst.errors.length)violations.push('presentation failure escaped as window error')
      if(afterFirst.diagnostics.filter(item=>item.operation==='projection.presentation').length!==1)violations.push('initial attempt did not report exactly once')
    }
    if(retry){
      if(!retry.repeatedQuery.returned||!same(retry.repeatedQuery.keys,['note']))violations.push('settled failed owner did not expose only healthy fields')
      if(retry.repeatedQuery.newAttempts!==0)violations.push('identical failed query retried without explicit owner change')
      const final=retry.disarmed?.a??retry.explicit.at(-1)?.a
      if(!final?.registeredWidgets.includes('a-back')||!final?.opaque.includes('a-opaque'))violations.push('legitimate explicit retry did not recover known and opaque projection')
    }
    if(scenario.taskProbe){
      let invoked=0
      try{observation.taskCommit={returned:taskA.commit(data=>{invoked++;return data}),invoked}}
      catch(error){observation.taskCommit={error:h.errorInfo(error),invoked}}
      if(observation.taskCommit.returned!==true||invoked!==1)violations.push('retained same-block task lost admission')
    }
    if(scenario.completeIme){
      const beforeCommit=h.editor.save().blocks,revision=h.binding.runtime.revision,txCount=h.transactions.length
      await window.__testInput('Input.insertText',{text:'日本'});await pause(60)
      const data=h.editor.save().blocks,expected=copy(beforeCommit)
      expected.find(block=>block.id===scenario.ime).data.fields.find(field=>field.key==='note').html='N日本ote {{'+scenario.ime+'-note}} tail'
      observation.completedIme={data,expected,exactData:same(data,expected),revisionDelta:h.binding.runtime.revision-revision,transactions:h.transactions.slice(txCount),errors:h.errors.map(h.errorInfo),canUndo:h.editor.canUndo,noteHTML:h.panels.get(scenario.ime).note.innerHTML}
      if(scenario.kind){
        observation.completedIme.failedHost=fieldState(h,'a')
        try{observation.completedIme.failedHostAuthorized=Boolean(h.binding.reconciler.resolveEditableTarget(h.panels.get('a').field()))}catch{observation.completedIme.failedHostAuthorized=false}
        if(observation.completedIme.failedHostAuthorized)violations.push('unrelated native commit republished failed field authority')
      }
      if(!observation.completedIme.exactData||observation.completedIme.revisionDelta!==1||observation.completedIme.transactions.length!==1||observation.completedIme.errors.length)violations.push('retained native composition could not settle exactly once')
    }
    if(scenario.canonicalAction){
      const canonicalBefore=h.editor.save().blocks,canonicalRevision=h.binding.runtime.revision,canonicalGeneration=h.binding.runtime.generation,canonicalTransactions=h.transactions.length,canonicalUndo=h.editor.canUndo,host=h.panels.get('a').field()
      let error=null
      try{
        h.editor.blocks.update('a',current=>scenario.canonicalAction==='failure'
          ?{data:{...current.data,fields:current.data.fields.map(field=>field.key==='back'?{...field,html:field.html+' changed'}:field)}}
          :{data:{...current.data,fields:current.data.fields.map(field=>field.key==='back'?{...field,html:field.html+' repaired'}:field)}})
      }catch(caught){error=h.errorInfo(caught)}
      await pause(60)
      const canonicalAfter=h.editor.save().blocks,canonicalExpected=copy(canonicalBefore)
      if(scenario.canonicalAction==='success')canonicalExpected[0].data.fields.find(field=>field.key==='back').html+=' repaired'
      observation.canonicalAction={error,exactData:same(canonicalAfter,canonicalExpected),sameHost:h.panels.get('a').field()===host,field:fieldState(h,'a'),revisionDelta:h.binding.runtime.revision-canonicalRevision,generationDelta:h.binding.runtime.generation-canonicalGeneration,transactions:h.transactions.length-canonicalTransactions,canUndo:h.editor.canUndo,attempts:h.attempts.slice(attemptsAtStart)}
      if(scenario.canonicalAction==='failure'){
        if(!error?.original||!observation.canonicalAction.exactData||observation.canonicalAction.revisionDelta!==0||observation.canonicalAction.generationDelta!==0||observation.canonicalAction.transactions!==0||h.editor.canUndo!==canonicalUndo)violations.push('canonical failed-field update bypassed transaction failure/rollback')
      }else if(error||!observation.canonicalAction.exactData||!observation.canonicalAction.sameHost||observation.canonicalAction.revisionDelta!==1||observation.canonicalAction.transactions!==1||observation.canonicalAction.field.editable!=='true'||!observation.canonicalAction.field.registeredWidgets.includes('a-back'))violations.push('canonical failed-field payload update did not publish coherent recovered host')
    }
    if(scenario.postAdopt){
      const note=h.panels.get('a').note,oldWidget=h.latest('a-note'),originalData=h.editor.save().blocks,revision=h.binding.runtime.revision
      let parent
      if(scenario.postAdopt==='block')parent=h.panels.get('b').root
      else{parent=document.createElement('div');if(scenario.postAdopt==='editable')parent.contentEditable='true';else parent.dataset.inlinePlugin='foreign-widget';h.panels.get('a').root.append(parent)}
      parent.append(note)
      const diagnosticsBefore=h.diagnostics.length
      let queried,error
      try{queried=h.binding.reconciler.getEditableFields('a').map(field=>field.key)}catch(caught){error=h.errorInfo(caught)}
      await pause(30)
      let field
      try{field=h.binding.reconciler.getEditableField('a','note')}catch{}
      observation.postAdopt={queried,error,returnedHealthy:Boolean(field),scopeAborted:oldWidget.context.signal.aborted,taskAborted:taskA.signal.aborted,bTaskAlive:!taskB.signal.aborted,modelUnchanged:same(h.editor.save().blocks,originalData),revisionUnchanged:h.binding.runtime.revision===revision,diagnostics:h.diagnostics.slice(diagnosticsBefore)}
      if(queried?.includes('note')||field||!observation.postAdopt.scopeAborted||!observation.postAdopt.taskAborted||!observation.postAdopt.bTaskAlive||!observation.postAdopt.modelUnchanged||!observation.postAdopt.revisionUnchanged)violations.push('settled memo retained transplanted field authority or scope')
    }
    if(scenario.adoptProjectionRoot){
      const lost=h.panels.get('a'),blockScopeAborted=lost.context.signal.aborted,inlineScopeAborted=h.latest('a-note').context.signal.aborted,oldIds=h.binding.reconciler.ids
      observation.rootRetirement={blockScopeAborted,inlineScopeAborted,aTaskAborted:taskA.signal.aborted,bTaskAlive:!taskB.signal.aborted,oldIds,canonicalBeforeRecovery:same(h.editor.save().blocks,before),health:h.binding.runtime.health}
      if(!blockScopeAborted||!inlineScopeAborted||!taskA.signal.aborted||taskB.signal.aborted||oldIds.includes('a'))violations.push('adopted projection root retained old block or inline scope')
      const beforeRecover=h.editor.save().blocks,oldRevision=h.binding.runtime.revision,oldB=h.latest('b-note').element
      let error
      try{h.editor.blocks.update('a',current=>({data:{...current.data,fields:current.data.fields.map(field=>field.key==='note'?{...field,html:field.html+' recovered'}:field)}}))}catch(caught){error=h.errorInfo(caught)}
      await pause(40)
      const expected=copy(beforeRecover);expected[0].data.fields.find(field=>field.key==='note').html+=' recovered'
      observation.rootReacquisition={error,exactData:same(h.editor.save().blocks,expected),revisionDelta:h.binding.runtime.revision-oldRevision,order:[...h.binding.root.querySelectorAll('.oe-block')].map(node=>node.dataset.blockId),restoring:h.blockCreates.filter(item=>item.name==='a').at(-1)?.restoring,bIdentity:h.latest('b-note').element===oldB,bTaskAlive:!taskB.signal.aborted}
      if(error||!observation.rootReacquisition.exactData||observation.rootReacquisition.revisionDelta!==1||!same(observation.rootReacquisition.order,['a','b'])||!observation.rootReacquisition.restoring||!observation.rootReacquisition.bIdentity||!observation.rootReacquisition.bTaskAlive)violations.push('explicit canonical acquisition after terminal owner loss was incoherent')
    }
    if(scenario.modeRoundTrip){
      const original=h.editor.save().blocks,revision=h.binding.runtime.revision,attempts=h.attempts.length
      let error
      try{h.editor.setReadOnly(true);h.editor.setReadOnly(false)}catch(caught){error=h.errorInfo(caught)}
      await pause(30)
      let fields
      try{fields=h.binding.reconciler.getEditableFields('a').map(field=>field.key)}catch{}
      observation.modeRoundTrip={error,fields,editable:h.panels.get('a').field().contentEditable,newFailedAttempts:h.attempts.slice(attempts).filter(item=>item.key==='a-back').length,modelUnchanged:same(h.editor.save().blocks,original),revisionUnchanged:h.binding.runtime.revision===revision,readOnly:h.editor.readOnly}
      if(error||observation.modeRoundTrip.editable!=='false'||fields?.includes('back')||observation.modeRoundTrip.newFailedAttempts!==0||!observation.modeRoundTrip.modelUnchanged||!observation.modeRoundTrip.revisionUnchanged||h.editor.readOnly)violations.push('mode transition retried or reenabled failed authoring host')
    }
    results.push({name:scenario.name,status:violations.length?'FAIL':'PASS',error:violations.join('; '),observation})
  }catch(error){results.push({name:scenario.name,status:'FAIL',error:'PROBE EXECUTION FAILURE: '+(error.stack??error),observation:{errors:h.errors.map(h.errorInfo),stoppedByHarness:h.stoppedByHarness}})}
  finally{h.destroy();if(ime)await window.__testInput('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});await pause()}
}
document.querySelector('#result').textContent=JSON.stringify(results,null,2)
document.body.dataset.status=results.some(result=>result.status==='FAIL')?'fail':'pass'
