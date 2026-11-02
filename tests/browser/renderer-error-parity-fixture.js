export async function runRendererErrorParity({EditorRenderer,legacy=false}) {
 const results=[],pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 const doc=blocks=>({version:legacy?'1.0.5':'2.0.0',blocks});
 const make=(id,text,revisioned=false)=>({id,type:'paragraph',...(!legacy?{dataVersion:1}:{}),...(revisioned?{revision:id}:{}),data:{text}});
 const modes=['none','record','throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty','reject','reject-false','then-getter','then-call','reentrant','async-reentrant'];
 for(const method of ['renderBlock','render','renderTo']) for(const revisioned of [false,true]) {
  for(const kind of ['unknown','version','data']) for(const mode of kind==='unknown'?['placeholder','strict']:modes) {
   const entry={id:method+'/'+(revisioned?'revision':'data')+'/'+kind+'/'+mode,observations:[],errors:[],complete:false};
   const check=(property,actual,expected)=>entry.observations.push({property,actual:structuredClone(actual),expected:structuredClone(expected),status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL'});
   const holder=document.createElement('section');document.body.append(holder);
   const schemaFailure=new TypeError('Independent schema rejection'),issues=[],released=[],created=[],unhandled=[],nested=[];
   let renderer,bad,issueCount=0,allowReentry=false;
   const originalWarn=console.warn,unhandledListener=event=>{unhandled.push(String(event.reason));event.preventDefault()};
   const caught=callback=>{try{return{value:callback(),error:null}}catch(error){return{error}}};
   const reenter=()=>{const attempt=caught(()=>renderer.renderBlock(bad));nested.push(attempt.error?.name??'none')};
   const observer=mode==='none'?undefined:issue=>{
    issueCount++;issues.push({keys:Object.keys(issue).sort(),frozen:Object.isFrozen(issue),...issue});
    if(mode.startsWith('throw-'))throw {'throw-error':new Error('Observer failure'),'throw-undefined':undefined,'throw-null':null,'throw-false':false,'throw-zero':0,'throw-empty':''}[mode];
    if(mode==='reject')return Promise.reject(new Error('Observer rejection'));
    if(mode==='reject-false')return Promise.reject(false);
    if(mode==='then-getter')return Object.defineProperty({},'then',{get(){throw new Error('Then getter failure')}});
    if(mode==='then-call')return{then(){throw new Error('Then call failure')}};
    if((mode==='reentrant'||mode==='async-reentrant')&&allowReentry){allowReentry=false;if(mode==='reentrant')reenter();else return Promise.resolve().then(reenter);}
   };
   try {
    renderer=new EditorRenderer({blockTypes:['paragraph'],injectStyles:false,throwOnUnknown:mode==='strict',...(legacy?{validationMode:'strict'}:{}),onValidationError:observer});
    renderer.registerRenderer({type:'paragraph',schema:{currentVersion:1,createDefault:()=>({text:''}),decode(input){if(typeof input.data.text!=='string')throw schemaFailure;return{dataVersion:1,data:structuredClone(input.data)}},encode:data=>({dataVersion:1,data})},
     render(block){const element=document.createElement('article');element.textContent=block.data.text;created.push(block.id);return element},destroy(element){released.push(element.textContent)}});
    const prior=make('prior','Prior',revisioned);renderer.renderTo(doc([prior]),holder);
    const priorWrapper=holder.firstElementChild,priorNode=priorWrapper.firstElementChild;
    bad=make('bad','Invalid',revisioned);
    if(kind==='unknown')bad.type='missing-renderer';
    if(kind==='version')bad.dataVersion=99;
    if(kind==='data')bad.data.text={invalid:true};
    const input=method==='renderBlock'?bad:doc([make('staged','Staged',revisioned),bad]);
    const before=JSON.stringify(input),outputs=[];
    addEventListener('unhandledrejection',unhandledListener);
    console.warn=()=>{throw new Error('Logger failure')};
    for(let repeat=0;repeat<2;repeat++) {
     allowReentry=true;
     const attempt=caught(()=>method==='renderBlock'?renderer.renderBlock(input):method==='render'?renderer.render(input):renderer.renderTo(input,holder));
     if(attempt.value instanceof HTMLElement)outputs.push(attempt.value);
     const expectedError=kind==='unknown'?(mode==='strict'?'UnknownBlockTypeError':null):'InvalidBlockDataError';
     check('error/'+repeat,attempt.error?.name??null,expectedError);
     if(expectedError) {
      check('errorType/'+repeat,attempt.error?.blockType??null,bad.type);
      check('errorId/'+repeat,attempt.error?.blockId??null,'bad');
      if(kind==='data')check('authoritativeCause/'+repeat,attempt.error?.cause===schemaFailure,true);
      if(kind==='version')check('versionCause/'+repeat,attempt.error?.cause?.name??null,'RangeError');
      check('priorWrapper/'+repeat,holder.firstElementChild===priorWrapper,true);
      check('priorNode/'+repeat,priorWrapper.firstElementChild===priorNode&&priorNode.isConnected&&priorNode.textContent==='Prior',true);
     } else if(kind==='unknown') {
      const root=method==='renderBlock'?attempt.value:method==='render'?attempt.value:holder;
      const placeholder=root?.matches?.('.editor-unknown')?root:root?.querySelector?.('.editor-unknown');
      check('placeholder/'+repeat,placeholder?{type:placeholder.dataset.blockType,text:placeholder.textContent}:null,{type:'missing-renderer',text:''});
     }
     check('input/'+repeat,JSON.stringify(input),before);
     await pause();await pause();
     check('observerCount/'+repeat,issueCount,kind==='unknown'||mode==='none'?0:repeat+1);
     check('unhandled/'+repeat,unhandled,[]);
    }
    if(kind!=='unknown'&&mode!=='none') {
     check('issues',issues,Array.from({length:2},()=>({keys:['blockId','reason','type'],frozen:true,blockId:'bad',type:'paragraph',reason:kind==='version'?'unsupported-data-version':'invalid-data'})));
     if(mode==='reentrant'||mode==='async-reentrant')check('nested',nested,['InvalidBlockDataError','InvalidBlockDataError']);
    }
    if(kind!=='unknown'||mode==='strict') {
     check('created',created,kind==='version'||method==='renderBlock'?['prior']:['prior','staged','staged']);
     check('stagedCleanup',released,kind==='version'||method==='renderBlock'?[]:['Staged','Staged']);
     renderer.destroy();
     check('finalCleanup',released,kind==='version'||method==='renderBlock'?['Prior']:['Staged','Staged','Prior']);
    } else renderer.destroy();
    entry.complete=true;
   }catch(error){entry.errors.push(error.stack??String(error))}
   finally{console.warn=originalWarn;removeEventListener('unhandledrejection',unhandledListener);try{renderer?.destroy()}catch(error){entry.errors.push(String(error))}holder.remove()}
   results.push(entry);
  }
 }

 for(const method of ['renderBlock','render','renderTo']) for(const revisioned of [false,true]) for(const kind of ['version','data']) for(const mode of modes) {
  const entry={id:'builtin/'+method+'/'+(revisioned?'revision':'data')+'/'+kind+'/'+mode,observations:[],errors:[],complete:false};
  const check=(property,actual,expected)=>entry.observations.push({property,actual:structuredClone(actual),expected:structuredClone(expected),status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL'});
  const holder=document.createElement('section');document.body.append(holder);
  let renderer,bad,count=0,allowReentry=false;const issues=[],unhandled=[],nested=[],originalWarn=console.warn;
  const caught=callback=>{try{return{value:callback(),error:null}}catch(error){return{error}}};
  const reenter=()=>nested.push(caught(()=>renderer.renderBlock(bad)).error?.name??'none');
  const observer=mode==='none'?undefined:issue=>{
   count++;issues.push({keys:Object.keys(issue).sort(),frozen:Object.isFrozen(issue),...issue});
   if(mode.startsWith('throw-'))throw {'throw-error':new Error('Observer failure'),'throw-undefined':undefined,'throw-null':null,'throw-false':false,'throw-zero':0,'throw-empty':''}[mode];
   if(mode==='reject')return Promise.reject(new Error('Observer rejection'));
   if(mode==='reject-false')return Promise.reject(false);
   if(mode==='then-getter')return Object.defineProperty({},'then',{get(){throw new Error('Then getter failure')}});
   if(mode==='then-call')return{then(){throw new Error('Then call failure')}};
   if((mode==='reentrant'||mode==='async-reentrant')&&allowReentry){allowReentry=false;if(mode==='reentrant')reenter();else return Promise.resolve().then(reenter);}
  };
  const onUnhandled=event=>{unhandled.push(String(event.reason));event.preventDefault()};
  const builtin=(id,text)=>({...make(id,text,revisioned),...(!legacy?{dataVersion:2}:{})});
  try {
   renderer=new EditorRenderer({blockTypes:['paragraph'],injectStyles:false,...(legacy?{validationMode:'strict'}:{}),onValidationError:observer});
   renderer.renderTo(doc([builtin('prior','Prior')]),holder);const wrapper=holder.firstElementChild,node=wrapper.firstElementChild;
   bad=builtin('bad',kind==='data'?{invalid:true}:'Invalid');if(kind==='version')bad.dataVersion=99;
   const input=method==='renderBlock'?bad:doc([builtin('staged','Staged'),bad]);const before=JSON.stringify(input);
   addEventListener('unhandledrejection',onUnhandled);console.warn=()=>{throw new Error('Logger failure')};
   for(let repeat=0;repeat<2;repeat++){
    allowReentry=true;
    const attempt=caught(()=>method==='renderBlock'?renderer.renderBlock(input):method==='render'?renderer.render(input):renderer.renderTo(input,holder));
    check('error/'+repeat,attempt.error?.name??null,'InvalidBlockDataError');
    check('errorType/'+repeat,attempt.error?.blockType??null,'paragraph');check('errorId/'+repeat,attempt.error?.blockId??null,'bad');
    check('cause/'+repeat,attempt.error?.cause?.name??null,kind==='version'?'RangeError':'TypeError');
    check('priorIdentity/'+repeat,holder.firstElementChild===wrapper&&wrapper.firstElementChild===node&&node.isConnected&&node.textContent==='Prior',true);
    check('input/'+repeat,JSON.stringify(input),before);await pause();await pause();
    check('observerCount/'+repeat,count,mode==='none'?0:repeat+1);check('unhandled/'+repeat,unhandled,[]);
   }
   if(mode!=='none')check('issues',issues,Array.from({length:2},()=>({keys:['blockId','reason','type'],frozen:true,blockId:'bad',type:'paragraph',reason:kind==='version'?'unsupported-data-version':'invalid-data'})));
   if(mode==='reentrant'||mode==='async-reentrant')check('nested',nested,['InvalidBlockDataError','InvalidBlockDataError']);
   renderer.renderTo(doc([builtin('recovered','Recovered')]),holder);check('validRecovery',holder.textContent,'Recovered');
   entry.complete=true;
  }catch(error){entry.errors.push(error.stack??String(error))}
  finally{console.warn=originalWarn;removeEventListener('unhandledrejection',onUnhandled);try{renderer?.destroy()}catch(error){entry.errors.push(String(error))}holder.remove()}
  results.push(entry);
 }
 return results;
}
