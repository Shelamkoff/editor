const pause=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms)),copy=value=>JSON.parse(JSON.stringify(value))
const aliases = { strong: 'b', em: 'i', strike: 's', del: 's' }
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(parseInt(entity.slice(entity[1]?.toLowerCase() === 'x' ? 2 : 1), entity[1]?.toLowerCase() === 'x' ? 16 : 10))
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity.toLowerCase()]
})
function colorValue(value) {
  const clean = value.trim().toLowerCase(), hex = clean.match(/^#([\da-f]{3}|[\da-f]{6})$/)
  if (hex) return '#' + (hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1])
  const rgb = clean.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgb) return '#' + rgb.slice(1, 4).map(c => Number(c).toString(16).padStart(2, '0')).join('') + (rgb[4] !== undefined && Number(rgb[4]) !== 1 ? '@' + Number(rgb[4]) : '')
  return clean
}
function fontSizeValue(value) {
  return /^calc\(\s*(?:10px\s*\+\s*1em|1em\s*\+\s*10px)\s*\)$/i.test(value.trim()) ? 'calc(10px + 1em)' : value.trim()
}
function styles(value) {
  return Object.fromEntries(value.split(';').filter(s => s.trim()).map(declaration => {
    const colon = declaration.indexOf(':'), name = declaration.slice(0, colon).trim().toLowerCase(), raw = declaration.slice(colon + 1).trim()
    return [name, name.endsWith('color') ? colorValue(raw) : name === 'font-size' ? fontSizeValue(raw) : raw]
  }))
}
const initialStyle = () => ({ marks: [], bg: null, color: null, size: null })
function childStyle(parent, tag, attrs) {
  const state = { ...parent, marks: [...parent.marks] }, css = styles(attrs.style ?? '')
  if (css['background-color']) state.bg = css['background-color']
  if (css.color) state.color = css.color
  if (css['font-size']) state.size = css['font-size']
  const other = Object.entries(css).filter(([name]) => !['background-color', 'color', 'font-size'].includes(name)).sort()
  if (other.length) state.marks.push('css:' + JSON.stringify(other))
  const attributes = Object.entries(attrs).filter(([name]) => name !== 'style').sort()
  if (tag !== 'span' || attributes.length) state.marks.push((aliases[tag] ?? tag) + (attributes.length ? ':' + JSON.stringify(attributes) : ''))
  state.marks = [...new Set(state.marks)].sort()
  return state
}
function textUnits(text, state) {
  const result = []
  for (const part of text.split(/(\{\{swatch\}\})/)) {
    if (part === '{{swatch}}') result.push({ kind: 'widget', text: part, ...initialStyle() })
    else for (let index = 0; index < part.length; index++) result.push({ kind: 'text', text: part[index], ...state })
  }
  return result
}
// A deliberately small wire parser for these fixed author fixtures. It never
// writes an HTML sink, imports a sanitizer or invokes a production normalizer.
export function linkWireMeaning(html) {
  const result = [], stack = [{ tag: null, state: initialStyle() }]
  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim().toLowerCase(), index = stack.findLastIndex(entry => entry.tag === tag)
      if (index < 1) throw Error('Unexpected wire closing tag: ' + tag)
      stack.splice(index); continue
    }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]?.toLowerCase()
      if (!tag) throw Error('Unexpected author wire token: ' + token)
      if (tag === 'br') { result.push({ kind: 'break', text: '\n', ...initialStyle() }); continue }
      const attrs = {}
      for (const match of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3])
      stack.push({ tag, state: childStyle(stack.at(-1).state, tag, attrs) }); continue
    }
    result.push(...textUnits(decode(token), stack.at(-1).state))
  }
  if (stack.length !== 1) throw Error('Unclosed author wire tag')
  return result
}
function visibleMeaning(field) {
  const result = []
  const walk = (node, state) => {
    if (node.nodeType === 3) { result.push(...textUnits(node.data, state)); return }
    if (node.nodeType === 1) {
      if (node.hasAttribute('data-inline-plugin')) { result.push({ kind: 'widget', text: '{{' + node.getAttribute('data-id') + '}}', ...initialStyle() }); return }
      if (node.localName === 'br') { result.push({ kind: 'break', text: '\n', ...initialStyle() }); return }
      state = childStyle(state, node.localName, Object.fromEntries([...node.attributes].map(a => [a.name, a.value])))
    }
    for (const child of node.childNodes) walk(child, state)
  }
  for (const child of field.childNodes) walk(child, initialStyle())
  return result
}
function logicalLength(node) {
  if (node.nodeType === 3) return node.data.replace(/\{\{swatch\}\}/g, '\ufffc').length
  if (node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br')) return 1
  return [...node.childNodes].reduce((sum, child) => sum + logicalLength(child), 0)
}
function logicalOffset(field, target, offset) {
  let total = 0, found = false
  const visit = node => {
    if (node === target) { total += node.nodeType === 3 ? offset : [...node.childNodes].slice(0, offset).reduce((sum, child) => sum + logicalLength(child), 0); found = true; return }
    if (node.nodeType === 3 || (node.nodeType === 1 && (node.hasAttribute('data-inline-plugin') || node.localName === 'br'))) total += logicalLength(node)
    else for (const child of node.childNodes) { visit(child); if (found) break }
  }
  visit(field); return found ? total : null
}
const mainLinkCases=['apply','enter','unlink','mixed','nested'].flatMap(action=>(action==='nested'?['single']:['single','cross','fields']).flatMap(shape=>['Text','Element'].flatMap(boundary=>[false,true].map(backward=>({id:[action,shape,boundary,backward?'backward':'forward'].join('/'),action,shape,boundary,backward})))))
export const linkToolCases=[...mainLinkCases,...['back','escape','outside'].flatMap(cancel=>[false,true].map(backward=>({id:['cancel',cancel,backward?'backward':'forward'].join('/'),action:'cancel',cancel,shape:'single',boundary:'Text',backward}))),...['apply','enter'].flatMap(action=>[false,true].map(backward=>({id:['empty',action,backward?'backward':'forward'].join('/'),action,empty:true,shape:'single',boundary:'Text',backward}))),...['Text','Element'].flatMap(boundary=>[false,true].map(backward=>({id:['relink','single',boundary,backward?'backward':'forward'].join('/'),action:'relink',shape:'single',boundary,backward}))),...['plain','linked'].flatMap(atomic=>[false,true].map(backward=>({id:['atomic',atomic,backward?'backward':'forward'].join('/'),action:atomic==='plain'?'apply':'unlink',atomic,shape:'single',boundary:'Element',backward})))]
const URL_VALUE='https://chosen.example/path?q=proof#part',linkMark='a:'+JSON.stringify([['href',URL_VALUE],['rel','noopener noreferrer'],['target','_blank']])
linkToolCases.push(...['mode','render','destroy'].map(lifetime=>({id:'lifetime/'+lifetime,lifetime})))
const initialLead=action=>'un'+(['unlink','mixed','nested','relink'].includes(action)?'<a href="/old-alpha" rel="noopener noreferrer" target="_self"><b>'+(action==='nested'?'<i>Alpha</i>':'Alpha')+'</b></a>':'<b>Alpha</b>')+' <span style="font-size:24px;color:#800000;background-color:#0000ff"><i>Beta &amp; γ</i></span><br>{{swatch}}'
const initialTail=action=>(['unlink','relink'].includes(action)?'<a href="/old-bravo" rel="noopener noreferrer" target="articlePreview"><b>Bravo</b></a>':'<b>Bravo</b>')+' rest <a href="/kept" rel="noopener noreferrer" target="articlePreview">Kept</a> end'
const firstText=node=>node.nodeType===3?node:document.createTreeWalker(node,NodeFilter.SHOW_TEXT).nextNode()
// Coalesce adjacent text with identical author properties only for observation storage.
const compactMeaning=fields=>fields.map(units=>{const result=[];for(const unit of units){const last=result.at(-1);if(unit.kind==='text'&&last?.kind==='text'&&JSON.stringify({...last,text:''})===JSON.stringify({...unit,text:''}))last.text+=unit.text;else result.push(copy(unit))}return result})
export async function runLinkToolCase({sourceBase="../../",legacy=false,spec,nativeInput}){
 if(spec.lifetime)return runLinkLifetimeCase({sourceBase,legacy,spec,nativeInput})
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,quote,color,defaults]=await Promise.all(['core/index.js','plugins/paragraph/index.js','plugins/quote/index.js','inline-plugins/color.js',...(!legacy?['inline-tools/defaults.js']:[])].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');holder.style.cssText='width:850px;margin:100px auto';document.body.append(holder)
 const idle=!!(spec.cancel||spec.empty||spec.atomic==='plain'),relink=spec.action==='relink',observations=[],nativeEvents=[],pointTrace=[],transactions=[],diagnostics=[],unsupported=[],completedPhases=[],planned=idle?['load','input','prepare-redo','selection','action','redo-input','undo-input','dispose']:relink?['load','input','selection','action','relink','undo-relink','undo-action','undo-input','redo-input','redo-action','redo-relink','dispose']:['load','input','selection','action','undo-action','undo-input','redo-input','redo-action','dispose']
 const check=(phase,property,actual,expected)=>{const a=['meaning','visible'].includes(property)?compactMeaning(actual):actual,e=['meaning','visible'].includes(property)?compactMeaning(expected):expected;observations.push({phase,property,actual:copy(a),expected:copy(e),status:JSON.stringify(a)===JSON.stringify(e)?'PASS':'FAIL'})}
 const lead=spec.atomic==='linked'?initialLead(spec.action).replace('{{swatch}}','<a href="/old-atom" rel="noopener noreferrer" target="_self">{{swatch}}</a>'):initialLead(spec.action),tail=initialTail(spec.action),texts=spec.shape==='single'?[lead+' '+tail]:[lead,tail],sidecar={swatch:{type:'color',...(!legacy?{dataVersion:1}:{}),data:{value:'#aBcDef'}}}
 const input={version:legacy?'1.0.5':'2.0.0',blocks:spec.shape==='fields'?[{id:'a',type:'quote',...(!legacy?{dataVersion:1}:{}),data:{text:texts[0],caption:texts[1]},inline:sidecar}]:texts.map((text,i)=>({id:i?'b':'a',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text},...(!i?{inline:sidecar}:{})}))},originalInput=copy(input)
 let editor,phase='load',error=null,producerCalls=0
 const tools=legacy?['link']:defaults.createDefaultInlineTools({types:['link']}).map(tool=>({...tool,toggle(selection){producerCalls++;return tool.toggle(selection)},renderActions(ctx){return tool.renderActions({...ctx,mutate(operation,...options){return ctx.mutate(function(...args){producerCalls++;return operation.apply(this,args)},...options)}})}}))
 if(legacy)unsupported.push({property:'currentTransactionAndProducerPorts',reason:'The public legacy tool resolver owns its controller. Exact native actions, data and history execute; absent v2 observer/producer ports are not simulated.'})
 const click=async(element,role)=>{if(!element)throw Error('Missing public link control '+role);element.scrollIntoView({block:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=element.getBoundingClientRect();if(!r.width||!r.height)throw Error('Public link control not visible '+role);const x=r.x+r.width/2,y=r.y+r.height/2;pointTrace.push({role,connected:element.isConnected,hit:element.contains(document.elementFromPoint(x,y)),x,y,width:r.width,height:r.height});element.addEventListener('click',e=>nativeEvents.push({role,type:'click',trusted:e.isTrusted}),{once:true});await nativeInput('Input.click',{x,y});await pause()}
 const key=async(key,modifiers=0)=>{const[code,n]=({z:['KeyZ',90],a:['KeyA',65],Enter:['Enter',13],Escape:['Escape',27]})[key];await nativeInput('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n,modifiers});await nativeInput('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n,modifiers});await pause()}
 try{
  editor=core.createEditor({holder,injectStyles:true,plugins:[legacy?new paragraph.Paragraph():paragraph.createParagraphPlugin(),legacy?new quote.Quote():quote.createQuotePlugin()],inlinePlugins:[color.createColorSwatchPlugin()],inlineTools:tools,data:input,onDiagnostic:value=>diagnostics.push(value)})
  if(!legacy)editor.on('transaction:committed',event=>transactions.push({action:event.action,origin:event.origin,name:event.name}))
  holder.addEventListener('input',e=>{if(e.target.matches('.oe-paragraph,.oe-quote__text,.oe-quote__caption'))nativeEvents.push({role:'author',type:'input',trusted:e.isTrusted,inputType:e.inputType})})
  holder.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='z')nativeEvents.push({role:'history',type:'keydown',trusted:e.isTrusted,key:e.key,modifiers:(e.ctrlKey?2:0)|(e.shiftKey?8:0)})})
  const fields=()=>Array.from(holder.querySelectorAll(spec.shape==='fields'?'.oe-quote__text,.oe-quote__caption':'.oe-paragraph')),state=()=>editor.save().blocks,history=()=>[editor.canUndo,editor.canRedo],savedTexts=()=>spec.shape==='fields'?[state()[0].data.text,state()[0].data.caption]:state().map(b=>b.data.text),meaning=()=>savedTexts().map(linkWireMeaning)
  const endpoints=()=>{const s=getSelection(),list=fields(),endpoint=(node,at)=>{const i=list.findIndex(f=>f===node||f.contains(node));return{field:i<0?null:i,offset:i<0?null:logicalOffset(list[i],node,at)}};return{anchor:endpoint(s.anchorNode,s.anchorOffset),focus:endpoint(s.focusNode,s.focusOffset),collapsed:s.isCollapsed}}
  const before=texts.map(linkWireMeaning),typedMeaning=before.map((units,i)=>i===texts.length-1?[...units,...textUnits('X',initialStyle())]:units)
  const atomIndex=before[0].findIndex(u=>u.kind==='widget'),start={field:0,offset:spec.atomic?atomIndex:spec.boundary==='Text'?4:2},end={field:texts.length-1,offset:spec.atomic?atomIndex+1:(texts.length===1?linkWireMeaning(lead).length+1:0)+(spec.boundary==='Text'?3:5)},selection={anchor:spec.backward?end:start,focus:spec.backward?start:end,collapsed:false}
  const unlink=['unlink','mixed','nested','relink'].includes(spec.action),afterMeaning=idle?before:spec.atomic==='linked'?typedMeaning:typedMeaning.map((units,field)=>units.map((unit,index)=>{
   if(unlink)return{...unit,marks:unit.marks.filter(mark=>!mark.startsWith('a:')||!mark.includes('/old-'))}
   const selected=(field>start.field||index>=start.offset)&&(field<end.field||index<end.offset)
   return selected&&unit.kind==='text'?{...unit,marks:[...unit.marks,linkMark].sort()}:unit
  }))
  const view=(phase,wanted,atomHref=null)=>{check(phase,'meaning',meaning(),wanted);check(phase,'visible',fields().map(visibleMeaning),wanted);check(phase,'sidecars',state().map(b=>b.inline??null),input.blocks.map(b=>b.inline??null));check(phase,'widgets',fields().map(f=>Array.from(f.querySelectorAll('[data-inline-plugin]'),w=>({id:w.dataset.id,type:w.dataset.inlinePlugin,value:w.dataset.value,label:w.querySelector('.oe-ip__label')?.textContent??null,dot:w.querySelector('.oe-ip__dot')?.style.backgroundColor??null,editable:w.getAttribute('contenteditable')}))),texts.map((_,i)=>i?[]:[{id:'swatch',type:'color',value:'#aBcDef',label:'#aBcDef',dot:'rgb(171, 205, 239)',editable:'false'}]));check(phase,'widgetLinks',fields().map(f=>Array.from(f.querySelectorAll('[data-inline-plugin]'),w=>w.closest('a')?.getAttribute('href')??null)),texts.map((_,i)=>i?[]:[atomHref]))}
  const oldAtomHref=spec.atomic==='linked'?'/old-atom':null
  await pause(60);const initial=state();view(phase,before,oldAtomHref);check(phase,'history',history(),[false,false]);completedPhases.push(phase)
  phase='input';const last=fields().at(-1),native=getSelection();last.focus();native.setBaseAndExtent(last.lastChild,last.lastChild.textContent.length,last.lastChild,last.lastChild.textContent.length);await nativeInput('Input.insertText',{text:'X'});await pause();const typed=state();view(phase,typedMeaning,oldAtomHref);check(phase,'history',history(),[true,false]);completedPhases.push(phase)
  if(idle){phase='prepare-redo';await key('z',2);check(phase,'canonical',state(),initial);view(phase,before);check(phase,'history',history(),[false,true]);completedPhases.push(phase)}
  phase='selection';const all=fields(),from=all[0].querySelector('b'),to=all.at(-1).querySelectorAll('b')[all.at(-1).querySelectorAll('b').length-1];let a=spec.boundary==='Text'?firstText(from):from,b=spec.boundary==='Text'?firstText(to):to,aOffset=spec.boundary==='Text'?2:0,bOffset=spec.boundary==='Text'?3:1
  if(spec.atomic){let branch=all[0].querySelector('[data-inline-plugin]');while(branch.parentNode!==all[0])branch=branch.parentNode;a=b=all[0];aOffset=Array.from(all[0].childNodes).indexOf(branch);bOffset=aOffset+1}
  all[0].focus();native.setBaseAndExtent(spec.backward?b:a,spec.backward?bOffset:aOffset,spec.backward?a:b,spec.backward?aOffset:bOffset);document.dispatchEvent(new Event('selectionchange'));await pause(60);check(phase,'selection',endpoints(),selection);check(phase,'history',history(),idle?[false,true]:[true,false]);const widget=all[0].querySelector('[data-inline-plugin]'),children=Array.from(widget.childNodes),attributes=Array.from(widget.attributes,a=>[a.name,a.value]).sort(),widgetMarkup=widget.innerHTML;completedPhases.push(phase)
  phase='action';await click(holder.querySelector('[data-tool="link"]'),'tool');check(phase,'panelOpened',!!holder.querySelector('.oe-inline-toolbar__link-input'),!unlink)
  if(!unlink){const inputEl=holder.querySelector('.oe-inline-toolbar__link-input');await click(inputEl,'url');if(!spec.empty){inputEl.addEventListener('input',e=>nativeEvents.push({role:'url',type:'input',trusted:e.isTrusted,inputType:e.inputType}),{once:true});await nativeInput('Input.insertText',{text:URL_VALUE});await pause()}check(phase,'draftCanonical',state(),idle?initial:typed);check(phase,'draftHistory',history(),idle?[false,true]:[true,false]);check(phase,'auxiliaryFocus',document.activeElement===inputEl,true)
   const escape=async role=>{inputEl.addEventListener('keydown',e=>nativeEvents.push({role,type:'keydown',trusted:e.isTrusted,key:e.key}),{once:true});await key('Escape')}
   if(spec.cancel==='back')await click(holder.querySelector('.oe-inline-tool--back'),'cancel')
   else if(spec.cancel==='escape')await escape('cancel')
   else if(spec.cancel==='outside'){const outside=document.createElement('button');outside.textContent='Application control';holder.after(outside);try{await click(outside,'outside');check(phase,'outsideFocus',document.activeElement===outside,true);await click(from,'resume-editor');check(phase,'historyRefocused',document.activeElement===all[0],true)}finally{outside.remove()}}
   else{if(spec.action==='enter'){inputEl.addEventListener('keydown',e=>nativeEvents.push({role:'apply',type:'keydown',trusted:e.isTrusted,key:e.key}),{once:true});await key('Enter')}else await click(holder.querySelector('.oe-inline-tool--apply'),'apply');if(spec.empty){check(phase,'emptyPanelStayed',!!holder.querySelector('.oe-inline-toolbar__link-input'),true);check(phase,'emptyCanonical',state(),initial);check(phase,'emptyHistory',history(),[false,true]);await escape('close-empty')}}
  }
  const after=state();view(phase,afterMeaning);if(spec.cancel!=='outside')check(phase,'selection',endpoints(),selection);check(phase,'history',history(),idle?[false,true]:[true,false]);check(phase,'panelClosed',!holder.querySelector('.oe-inline-toolbar__link-input'),true);check(phase,'widgetIdentity',widget.isConnected&&all[0].querySelector('[data-inline-plugin]')===widget&&children.every((c,i)=>widget.childNodes[i]===c),true);check(phase,'widgetAttributes',Array.from(widget.attributes,a=>[a.name,a.value]).sort(),attributes);check(phase,'widgetMarkup',widget.innerHTML,widgetMarkup);if(!legacy){check(phase,'producerCalls',producerCalls,idle&&spec.atomic!=='plain'?0:1);check(phase,'actions',transactions.map(e=>e.action),idle?['commit','undo']:['commit','commit'])}completedPhases.push(phase)
  let relinked=null,relinkedMeaning=null
  if(relink){phase='relink';await click(holder.querySelector('[data-tool="link"]'),'relink-tool');check(phase,'panelOpened',!!holder.querySelector('.oe-inline-toolbar__link-input'),true);const inputEl=holder.querySelector('.oe-inline-toolbar__link-input');await click(inputEl,'relink-url');inputEl.addEventListener('input',e=>nativeEvents.push({role:'relink-url',type:'input',trusted:e.isTrusted,inputType:e.inputType}),{once:true});await nativeInput('Input.insertText',{text:URL_VALUE});await pause();check(phase,'draftCanonical',state(),after);check(phase,'draftHistory',history(),[true,false]);check(phase,'auxiliaryFocus',document.activeElement===inputEl,true);await click(holder.querySelector('.oe-inline-tool--apply'),'relink-apply');relinked=state();relinkedMeaning=afterMeaning.map((units,field)=>units.map((unit,index)=>unit.kind==='text'&&(field>start.field||index>=start.offset)&&(field<end.field||index<end.offset)?{...unit,marks:[...unit.marks,linkMark].sort()}:unit));view(phase,relinkedMeaning);check(phase,'selection',endpoints(),selection);check(phase,'history',history(),[true,false]);check(phase,'panelClosed',!holder.querySelector('.oe-inline-toolbar__link-input'),true);check(phase,'widgetMarkup',widget.innerHTML,widgetMarkup);if(!legacy){check(phase,'producerCalls',producerCalls,2);check(phase,'actions',transactions.map(e=>e.action),['commit','commit','commit'])}completedPhases.push(phase)}
  const replay=idle?[['redo-input',true,typed,typedMeaning,[true,false]],['undo-input',false,initial,before,[false,true]]]:[...(relink?[['undo-relink',false,after,afterMeaning,[true,true]]]:[]),['undo-action',false,typed,typedMeaning,[true,true]],['undo-input',false,initial,before,[false,true]],['redo-input',true,typed,typedMeaning,[true,true]],['redo-action',true,after,afterMeaning,relink?[true,true]:[true,false]],...(relink?[['redo-relink',true,relinked,relinkedMeaning,[true,false]]]:[])]
  for(const[step,redo,wanted,expectedMeaning,flags]of replay){phase=step;await key('z',redo?10:2);check(phase,'canonical',state(),wanted);view(phase,expectedMeaning,oldAtomHref&&['undo-action','undo-input','redo-input'].includes(step)?oldAtomHref:null);check(phase,'history',history(),flags);completedPhases.push(phase)}
  if(!legacy)check(phase,'actions',transactions.map(e=>e.action),idle?['commit','undo','redo','undo']:relink?['commit','commit','commit','undo','undo','undo','redo','redo','redo']:['commit','commit','undo','undo','redo','redo'])
  check(phase,'caller',input,originalInput);check(phase,'diagnostics',diagnostics,[]);phase='dispose';editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
 }catch(e){if(legacy&&spec.atomic&&phase==='action'&&e.message==='Public link control not visible tool')unsupported.push({property:'atomicOnlyToolbarActivation',reason:'The valid widget-only selection exists, but the public v1 Link control is hidden. No substitute action, producer or replay is fabricated.'});error=String(e.stack??e)}finally{editor?.destroy();holder.remove()}
 return{id:spec.id,spec,observations,planned,completedPhases,nativeEvents,pointTrace,transactions,diagnostics,unsupported,error}
}

async function runLinkLifetimeCase({sourceBase,legacy,spec,nativeInput}){
 const base=new URL(sourceBase,import.meta.url),[core,paragraph,color,defaults]=await Promise.all(['core/index.js','plugins/paragraph/index.js','inline-plugins/color.js',...(!legacy?['inline-tools/defaults.js']:[])].map(path=>import(new URL(path,base))))
 const holder=document.createElement('section');holder.style.cssText='width:850px;margin:100px auto';document.body.append(holder)
 const observations=[],completedPhases=[],nativeEvents=[],pointTrace=[],transactions=[],diagnostics=[],unsupported=[],planned=['load','inactive','live','undo','redo','dispose']
 const check=(phase,property,actual,expected)=>{const a=['meaning','visible'].includes(property)?compactMeaning(actual):actual,e=['meaning','visible'].includes(property)?compactMeaning(expected):expected;observations.push({phase,property,actual:copy(a),expected:copy(e),status:JSON.stringify(a)===JSON.stringify(e)?'PASS':'FAIL'})}
 if(legacy)unsupported.push({property:'currentTransactionAndProducerPorts',reason:'The public legacy tool resolver owns its controller. Real retired and successor controls execute; absent v2 observer/producer ports are not simulated.'})
 const html='<b><i>Alpha</i></b> <span style="font-size:24px;color:#800000;background-color:#0000ff">Beta</span><br>{{swatch}} tail'
 const data=suffix=>({version:legacy?'1.0.5':'2.0.0',blocks:[{id:'same-id',type:'paragraph',...(!legacy?{dataVersion:2}:{}),data:{text:html+suffix},inline:{swatch:{type:'color',...(!legacy?{dataVersion:1}:{}),data:{value:'#aBcDef'}}}}]})
 const key=async(key,modifiers=0)=>{const[code,n]=({z:['KeyZ',90]})[key];for(const type of ['rawKeyDown','keyUp'])await nativeInput('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n,modifiers});await pause()}
 const click=async(element,role)=>{if(!element)throw Error('Missing lifetime Link control '+role);element.scrollIntoView({block:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=element.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden lifetime Link control '+role);const x=r.x+r.width/2,y=r.y+r.height/2;pointTrace.push({role,connected:element.isConnected,hit:element.contains(document.elementFromPoint(x,y)),x,y,width:r.width,height:r.height});element.addEventListener('click',e=>nativeEvents.push({role,type:'click',trusted:e.isTrusted}),{once:true});await nativeInput('Input.click',{x,y});await pause()}
 const type=async(input,text,role)=>{await click(input,role);input.addEventListener('input',e=>nativeEvents.push({role,type:'input',trusted:e.isTrusted,inputType:e.inputType}),{once:true});await nativeInput('Input.insertText',{text});await pause()}
 const create=()=>{const state={calls:0,events:[]},tools=legacy?['link']:defaults.createDefaultInlineTools({types:['link']}).map(tool=>({...tool,toggle(selection){state.calls++;return tool.toggle(selection)},renderActions(ctx){return tool.renderActions({...ctx,mutate(operation,...options){return ctx.mutate(function(...args){state.calls++;return operation.apply(this,args)},...options)}})}})),input=data(''),original=copy(input),editor=core.createEditor({holder,injectStyles:true,plugins:[legacy?new paragraph.Paragraph():paragraph.createParagraphPlugin()],inlinePlugins:[color.createColorSwatchPlugin()],inlineTools:tools,data:input,onDiagnostic:value=>diagnostics.push(value)})
  if(!legacy)editor.on('transaction:committed',event=>{const value={action:event.action,origin:event.origin,name:event.name};state.events.push(value);transactions.push(value)})
  return{editor,state,input,original}}
 const field=()=>holder.querySelector('.oe-paragraph'),history=()=>[current.editor.canUndo,current.editor.canRedo],canonical=()=>current.editor.save().blocks,meaning=()=>canonical().map(b=>linkWireMeaning(b.data.text))
 const select=async()=>{const f=field(),text=f.querySelector('b i').firstChild;f.focus();getSelection().setBaseAndExtent(text,5,text,0);document.dispatchEvent(new Event('selectionchange'));await pause(60)}
 const view=(phase,wanted)=>{check(phase,'meaning',meaning(),wanted);check(phase,'visible',[visibleMeaning(field())],wanted);check(phase,'sidecars',canonical().map(b=>b.inline),data('').blocks.map(b=>b.inline));const w=field().querySelector('[data-inline-plugin]');check(phase,'widget',{id:w.dataset.id,type:w.dataset.inlinePlugin,value:w.dataset.value,label:w.querySelector('.oe-ip__label')?.textContent??null,dot:w.querySelector('.oe-ip__dot')?.style.backgroundColor??null,editable:w.getAttribute('contenteditable'),href:w.closest('a')?.getAttribute('href')??null},{id:'swatch',type:'color',value:'#aBcDef',label:'#aBcDef',dot:'rgb(171, 205, 239)',editable:'false',href:null})}
 holder.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='z')nativeEvents.push({role:'history',type:'keydown',trusted:e.isTrusted,key:e.key,modifiers:(e.ctrlKey?2:0)|(e.shiftKey?8:0)})})
 let original,current,phase='load',error=null
 try{
  original=current=create();await pause(60);view(phase,[linkWireMeaning(html)]);check(phase,'history',history(),[false,false]);await select();await click(holder.querySelector('[data-tool="link"]'),'old-tool');const oldInput=holder.querySelector('.oe-inline-toolbar__link-input'),oldApply=holder.querySelector('.oe-inline-tool--apply'),oldField=field();await type(oldInput,'https://retired.example/obsolete','old-url');check(phase,'draftHistory',history(),[false,false]);completedPhases.push(phase)
  phase='inactive'
  if(spec.lifetime==='mode'){current.editor.setReadOnly(true);check(phase,'readOnly',field().getAttribute('contenteditable'),'false');current.editor.setReadOnly(false)}
  else if(spec.lifetime==='render'){current.editor.render(data(' updated'));await pause(60)}
  else{current.editor.destroy();current=create();await pause(60)}
  const suffix=spec.lifetime==='render'?' updated':'',before=canonical(),beforeMeaning=[linkWireMeaning(html+suffix)],beforeHistory=history();view(phase,beforeMeaning)
  await select();await click(holder.querySelector('[data-tool="link"]'),'fresh-tool');const freshInput=holder.querySelector('.oe-inline-toolbar__link-input'),freshApply=holder.querySelector('.oe-inline-tool--apply');await type(freshInput,URL_VALUE,'fresh-url')
  const freshPanel=freshInput.closest('.oe-inline-toolbar__panel'),retiredHost=document.createElement('span');retiredHost.dataset.retiredHost='link';retiredHost.append(oldApply);freshPanel.append(retiredHost)
  const oldMarkup=oldField.innerHTML,calls=original.state.calls,events=copy(original.state.events),freshCalls=current.state.calls,freshEvents=copy(current.state.events)
  await click(oldApply,'retired-apply');check(phase,'retiredCanonical',canonical(),before);check(phase,'retiredHistory',history(),beforeHistory);check(phase,'retiredAuthorDom',oldField.innerHTML,oldMarkup);check(phase,'successorPanel',freshInput.isConnected&&holder.querySelector('.oe-inline-toolbar__link-input')===freshInput,true);check(phase,'successorUrl',freshInput.value,URL_VALUE);check(phase,'retiredUrl',oldInput.value,'https://retired.example/obsolete')
  if(!legacy){check(phase,'retiredProducer',original.state.calls,calls);check(phase,'retiredEvents',original.state.events,events);check(phase,'successorProducer',current.state.calls,freshCalls);check(phase,'successorEvents',current.state.events,freshEvents);check(phase,'noPriorProducer',calls,0)}
  retiredHost.remove();completedPhases.push(phase)
  phase='live';await click(freshApply,'fresh-apply');const after=canonical(),afterMeaning=beforeMeaning.map(units=>units.map((unit,i)=>i<5?{...unit,marks:[...unit.marks,linkMark].sort()}:unit));view(phase,afterMeaning);check(phase,'history',history(),[true,false]);check(phase,'panelClosed',!holder.querySelector('.oe-inline-toolbar__link-input'),true)
  const s=getSelection();check(phase,'selection',{anchor:logicalOffset(field(),s.anchorNode,s.anchorOffset),focus:logicalOffset(field(),s.focusNode,s.focusOffset),collapsed:s.isCollapsed},{anchor:5,focus:0,collapsed:false})
  if(!legacy){check(phase,'liveProducer',current.state.calls-freshCalls,1);check(phase,'liveEvents',current.state.events.slice(freshEvents.length),[{action:'commit',origin:'user',name:'inline.link'}])}completedPhases.push(phase)
  phase='undo';await key('z',2);check(phase,'canonical',canonical(),before);view(phase,beforeMeaning);check(phase,'history',history(),[beforeHistory[0],true]);completedPhases.push(phase)
  phase='redo';await key('z',10);check(phase,'canonical',canonical(),after);view(phase,afterMeaning);check(phase,'history',history(),[true,false]);check(phase,'caller',original.input,original.original);check(phase,'successorCaller',current.input,current.original);check(phase,'diagnostics',diagnostics,[]);completedPhases.push(phase)
  if(spec.lifetime==='destroy'){const successorField=field();original.editor.destroy();check(phase,'repeatedOldDestroy',holder.querySelector('.oe-paragraph')===successorField&&successorField.isConnected,true)}
  phase='dispose';current.editor.destroy();original.editor.destroy();check(phase,'rootRemoved',!holder.querySelector('.oe-editor'),true);completedPhases.push(phase)
 }catch(e){error=String(e.stack??e)}finally{current?.editor.destroy();original?.editor.destroy();holder.remove()}
 return{id:spec.id,spec,observations,planned,completedPhases,nativeEvents,pointTrace,transactions,diagnostics,unsupported,error}
}
