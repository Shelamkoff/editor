const TYPES=['paragraph','heading','list','quote','code','image','delimiter','table','checklist','warning','embed','raw','gallery','carousel','attaches','linkPreview','toggle','columns','spoiler','poll','person']
const pause=()=>new Promise(resolve=>setTimeout(resolve,0)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const bulk=['plugin-preload','plugin-create','renderer-preload','renderer-map']
export const asyncPresetCases=[
 ...['plugin-load','renderer-load','renderer-create'].flatMap(operation=>TYPES.map(type=>({id:operation+'/'+type,operation,type}))),
 ...bulk.flatMap(operation=>['default','list','empty','document','document-unknown'].map(input=>({id:operation+'/'+input,operation,input}))),
 ...['plugin-preload','plugin-create'].flatMap(operation=>['invalid-shape','throwing-getter'].map(later=>({id:'orphan/'+operation+'/'+later,operation,kind:'orphan',later}))),
 ...['plugin','renderer'].map(target=>({id:'catalog/'+target,kind:'catalog',target})),
 {id:'snapshot/plugin',kind:'snapshot',target:'plugin'},
 {id:'snapshot/renderer',kind:'snapshot',target:'renderer'},
]
function documentInput(legacy,unknown=false){return{version:legacy?'1.0.5':'2.0.0',blocks:[{id:'p',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:'Alpha'}},...(unknown?[{id:'opaque',type:'not-installed',...(!legacy?{dataVersion:9}:{}),data:{value:'Opaque'}}]:[]),{id:'d',type:'delimiter',...(!legacy?{dataVersion:1}:{}),data:{}},{id:'p2',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:'Bravo'}}]}}
export async function runAsyncPresetCase({sourceBase,legacy,spec}){
 const [plugins,renderers]=await Promise.all([import(sourceBase+'plugins/async.js'),import(sourceBase+'renderer/renderers/async.js')]),observations=[],completedPhases=[],planned=['invoke','settle','recover'],unhandled=[]
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:structuredClone(actual),expected:structuredClone(expected),status:same(actual,expected)?'PASS':'FAIL'})
 const operation=async(source,config={})=>{
  if(spec.operation==='plugin-load'){if(legacy){const Ctor=await plugins.loadBlockPlugin(spec.type);return new Ctor(config)}return plugins.loadBlockPluginDefinition(spec.type,config)}
  if(spec.operation==='plugin-preload')return legacy?plugins.preloadBlockPlugins(source):plugins.preloadBlockPluginDefinitions(source,config)
  if(spec.operation==='plugin-create')return plugins.createBlockPluginsAsync(source,config)
  if(spec.operation==='renderer-load')return renderers.loadRendererFactory(spec.type)
  if(spec.operation==='renderer-create')return renderers.createRendererAsync(spec.type,'async-proof',{},config)
  if(spec.operation==='renderer-preload')return renderers.preloadRendererFactories(source)
  if(spec.operation==='renderer-map')return renderers.createDefaultRenderersAsync('async-proof',{},source,config)
 }
 const reject=e=>unhandled.push({name:e.reason?.name??null,message:e.reason?.message??String(e.reason)})
 window.addEventListener('unhandledrejection',reject)
 let error=null,callError=null,source,holder,editor
 try{
  if(spec.kind==='orphan'){
   const earlier=new Error('Earlier nested config failure'),later=new Error('Later config failure');let reads=0
   const config={paragraph:{actions:[Object.defineProperty({},'label',{enumerable:true,get(){reads++;throw earlier}})]}}
   if(spec.later==='invalid-shape')config.heading=null;else Object.defineProperty(config,'heading',{get(){throw later}})
   const pending=operation(['paragraph','heading'],config);check('invoke','started',true,true);completedPhases.push('invoke')
   try{await pending}catch(e){callError={name:e.name,message:e.message,sameLater:e===later}}
   await pause();await pause();check('settle','rejected',callError,spec.later==='invalid-shape'?{name:'TypeError',message:'configs.heading must be an object',sameLater:false}:{name:'Error',message:'Later config failure',sameLater:true});check('settle','reads',reads,1);check('settle','unhandled',unhandled,[]);completedPhases.push('settle')
  }else if(spec.kind==='catalog'){
   const get=spec.target==='plugin'?plugins.getAsyncBlockPluginTypes:renderers.getAsyncRendererTypes,a=get();check('invoke','types',a,TYPES);a.splice(0,2,'foreign');check('invoke','freshTypes',get(),TYPES);completedPhases.push('invoke');check('settle','unhandled',unhandled,[]);completedPhases.push('settle')
  }else if(spec.kind==='snapshot'&&spec.target==='plugin'){
   const config={placeholder:'Before import'},configs={paragraph:config},pending=plugins.createBlockPluginsAsync(['paragraph'],configs);config.placeholder='Mutated after import';configs.paragraph={placeholder:'Replacement'};check('invoke','callerConfig',configs.paragraph,{placeholder:'Replacement'});completedPhases.push('invoke')
   const definitions=await pending,{createEditor}=await import(sourceBase+'core/index.js');holder=document.createElement('section');document.body.append(holder);editor=createEditor({holder,plugins:definitions,injectStyles:false,inlineTools:[],data:{version:legacy?'1.0.5':'2.0.0',blocks:[{id:'p',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:''}}]}})
   check('settle','placeholder',holder.querySelector('.oe-paragraph').dataset.placeholder,'Before import');check('settle','history',[editor.canUndo,editor.canRedo],[false,false]);editor.destroy();check('settle','rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push('settle')
  }else if(spec.kind==='snapshot'){
   const reads={config:0,locale:0},configs={get paragraph(){reads.config++;return{marker:'Before import'}}},locale={get probe(){reads.locale++;return'Before import'}}
   const pending=renderers.createDefaultRenderersAsync('async-proof',locale,['paragraph'],configs);check('invoke','reads',reads,{config:1,locale:1});completedPhases.push('invoke');const map=await pending;check('settle','types',[...map.keys()],['paragraph']);check('settle','reads',reads,{config:1,locale:1});completedPhases.push('settle')
  }else{
   source=spec.input==='list'?['heading','paragraph','heading','delimiter','paragraph']:spec.input==='empty'?[]:spec.input?.startsWith('document')?documentInput(legacy,spec.input==='document-unknown'):undefined
   const caller=source===undefined?null:structuredClone(source),wanted=spec.type?[spec.type]:spec.input==='list'?['heading','paragraph','delimiter']:spec.input==='empty'?[]:spec.input?.startsWith('document')?['paragraph','delimiter']:TYPES
   const pending=operation(source);check('invoke','caller',source??null,caller);completedPhases.push('invoke');let result
   try{result=await pending}catch(e){callError={name:e.name,message:e.message}}
   check('settle','error',callError,null)
   let types=[],shape=null
   if(result instanceof Map){types=[...result.keys()];shape=[...result.values()].map(v=>typeof v)}
   else if(Array.isArray(result)){types=result.map(v=>v.type);shape=result.map(v=>typeof v)}
   else if(typeof result==='function'){shape=['function'];types=[result('async-proof',{}).type]}
   else if(result){shape=[typeof result];types=[result.type]}
   check('settle','types',types,wanted);check('settle','shape',shape,wanted.map(()=>spec.operation==='renderer-load'||spec.operation==='renderer-preload'||legacy&&spec.operation==='plugin-preload'?'function':'object'));check('settle','caller',source??null,caller);check('settle','unhandled',unhandled,[]);completedPhases.push('settle')
  }
  const recovered=await plugins.createBlockPluginsAsync(['paragraph']);check('recover','types',recovered.map(p=>p.type),['paragraph']);check('recover','unhandled',unhandled,[]);completedPhases.push('recover')
 }catch(e){error=String(e.stack??e)}finally{editor?.destroy();holder?.remove();window.removeEventListener('unhandledrejection',reject)}
 return{id:spec.id,spec,observations,planned,completedPhases,error,callError,unhandled,unsupported:[]}
}
