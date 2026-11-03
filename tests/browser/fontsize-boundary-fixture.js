export const fontSizeBoundaryCases=['p','span'].flatMap(tag=>['plain-field','styled-field','styled-ancestor'].map(kind=>({id:[tag,kind].join('/'),tag,styled:kind==='styled-field',ancestor:kind==='styled-ancestor'})))
const copy=value=>JSON.parse(JSON.stringify(value))
const pause=(ms=35)=>new Promise(resolve=>setTimeout(resolve,ms))
export async function runFontSizeBoundaryCase({sourceBase='../../',legacy=false,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,kit,defaults]=await Promise.all(['core/index.js','plugins/paragraph/index.js',...(!legacy?['plugin-kit/index.js','inline-tools/defaults.js']:[])].map(path=>import(new URL(path,base))))
 const holder=document.createElement('span');holder.style.cssText='display:block;width:800px;margin:100px auto';if(spec.ancestor)holder.style.fontSize='36px';document.body.append(holder)
 const observations=[],completedPhases=[],diagnostics=[],transactions=[],unsupported=[],planned=['load','apply','undo','redo','dispose']
 const check=(phase,property,actual,expected)=>observations.push({phase,property,actual:copy(actual),expected:copy(expected),status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL'})
 let editor,phase='load'
 try{
  const original=legacy?null:paragraph.createParagraphPlugin({injectStyles:false})
  const definition=legacy?new class extends paragraph.Paragraph{type='span-text';render(...args){const original=super.render(...args),element=original.ownerDocument.createElement(spec.tag);for(const attr of original.attributes)element.setAttribute(attr.name,attr.value);element.append(...original.childNodes);element.className='audit-font-field';element.style.display='block';if(spec.styled)element.style.fontSize='36px';return element}}():{...original,type:'span-text',setup(){return{create(data,context){const element=context.ownerDocument.createElement(spec.tag);element.className='audit-font-field';element.contentEditable=context.isReadOnly()?'false':'true';element.style.display='block';if(spec.styled)element.style.fontSize='36px';kit.setSanitizedHtml(element,data.text);return{element,read:()=>({text:element.innerHTML}),update(next){kit.setSanitizedHtml(element,next.text)},editableFields:()=>[{key:'text',element,mode:'rich-text'}],setReadOnly(value){element.contentEditable=value?'false':'true'},focus(){element.focus()},destroy(){}}},destroy(){}}}}
  const version=legacy?'1.0.5':'2.0.0',before=[{id:'a',type:'span-text',...(!legacy?{dataVersion:2}:{}),data:{text:'Alpha'}}],afterText='<span style="font-size: 24px;">Alpha</span>'
  editor=core.createEditor({holder,injectStyles:true,plugins:[definition],inlineTools:legacy?['fontSize']:defaults.createDefaultInlineTools({types:['fontSize']}),onDiagnostic:value=>diagnostics.push(value),data:{version,blocks:before}})
  if(!legacy)editor.on('transaction:committed',event=>transactions.push({action:event.action,origin:event.origin,name:event.name}));else unsupported.push({property:'currentTransactionPort',reason:'Actual public legacy subclass, toolbar, trusted input and replay execute; the absent v2 transaction event port is not fabricated.'});await pause()
  const field=holder.querySelector('.audit-font-field');field.focus();window.getSelection().setBaseAndExtent(field.firstChild,0,field.firstChild,5);document.dispatchEvent(new Event('selectionchange'));await pause(60)
  check(phase,'canonical',editor.save().blocks,before);check(phase,'fieldStyle',field.style.fontSize,spec.styled?'36px':'');check(phase,'ancestorStyle',holder.style.fontSize,spec.ancestor?'36px':'');check(phase,'fieldEditable',field.getAttribute('contenteditable'),'true');check(phase,'toolActive',holder.querySelector('[data-tool="fontSize"]').classList.contains('oe-inline-tool--active'),spec.styled&&spec.tag==='span');completedPhases.push(phase);phase='apply'
  const click=async element=>{if(!element)throw Error('Missing native control');element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();let trusted=false;element.addEventListener('click',e=>{trusted=e.isTrusted},{once:true});await nativeInput('Input.click',{x:rect.left+rect.width/2,y:rect.top+rect.height/2});await pause();return trusted}
  check(phase,'trustedPicker',await click(holder.querySelector('[data-tool="fontSize"]')),true)
  const input=holder.querySelector('.oe-font-size-input');check(phase,'prefill',input.value.replace(/^#/,'').toLowerCase(),spec.styled&&spec.tag==='span'?'36':'16');check(phase,'trustedInput',await click(input),true);check(phase,'auxiliaryFocus',document.activeElement===input,true)
  for(const type of ['rawKeyDown','keyUp'])await nativeInput('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2})
  await nativeInput('Input.insertText',{text:'24'});await pause()
  check(phase,'beforeApplyCanonical',editor.save().blocks,before);check(phase,'beforeApplyHistory',[editor.canUndo,editor.canRedo],[false,false])
  check(phase,'trustedApply',await click(holder.querySelector('.oe-font-size-apply')),true)
  check(phase,'canonical',editor.save().blocks,[{...before[0],data:{text:afterText}}])
  check(phase,'fieldStyle',field.style.fontSize,spec.styled?'36px':'');check(phase,'ancestorStyle',holder.style.fontSize,spec.ancestor?'36px':'');check(phase,'history',[editor.canUndo,editor.canRedo],[true,false]);completedPhases.push(phase)
  for(const redo of [false,true]){phase=redo?'redo':'undo';check(phase,'available',redo?editor.redo():editor.undo(),true);check(phase,'text',editor.save().blocks[0].data.text,redo?afterText:'Alpha');completedPhases.push(phase)}
  phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
  return{id:spec.id,spec,observations,completedPhases,diagnostics,transactions,unsupported,planned,error:null}
 }catch(error){return{id:spec.id,spec,observations,completedPhases,diagnostics,transactions,unsupported,planned,phase,error:String(error?.stack??error)}}
 finally{editor?.destroy();holder.remove()}
}
