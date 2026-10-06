// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'
const { EditorRenderer } = await import(process.env.RECTOR_RENDERER_ENTRY ?? './index.js')

test('Registering a block renderer captures all schema descriptor members once',()=>{
 const reads={currentVersion:0,createDefault:0,decode:0,encode:0}
 const methods={
  currentVersion:1,
  createDefault:()=>({text:''}),
  decode:({dataVersion,data})=>({dataVersion,data:{...data}}),
  encode:data=>({dataVersion:1,data:{...data}}),
 }
 const schema={}
 for(const key of Object.keys(reads))Object.defineProperty(schema,key,{configurable:true,get(){
  if(++reads[key]>1)throw new Error(key+' descriptor reread')
  return methods[key]
 }})
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
 try{
  renderer.registerRenderer({type:'article',schema,render(){throw new Error('Not rendering during registration')}})
  assert.equal(renderer.hasRenderer('article'),true)
  assert.deepEqual(reads,{currentVersion:1,createDefault:1,decode:1,encode:1})
  assert.equal(Object.isFrozen(schema),false)
 }finally{renderer.destroy()}
})

test('Inline renderer captures its declared styles once without freezing the caller',()=>{
 let reads=0
 const styles=['https://example.test/widget.css']
 const source={
  type:'probe',schema:{currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:input=>input},
  render(){throw new Error('Not rendering during construction')},
  get styles(){if(++reads>1)throw new Error('Inline styles accessor reread');return styles},
 }
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false,inlineRenderers:[source]})
 try{
  assert.equal(reads,1)
  styles[0]='https://example.test/later.css'
  assert.equal(renderer.getStyleUrls().includes('https://example.test/widget.css'),true)
  assert.equal(renderer.getStyleUrls().includes('https://example.test/later.css'),false)
  assert.equal(Object.isFrozen(source),false)
  assert.equal(Object.isFrozen(styles),false)
 }finally{renderer.destroy()}
})

class FixtureElement {
 constructor(document){this.ownerDocument=document;this.dataset={};this.style={};this.className='';this.childNodes=[];this.parentNode=null;this.textContent=''}
 get children(){return this.childNodes}
 get firstChild(){return this.childNodes[0]??null}
 get nextSibling(){const list=this.parentNode?.childNodes??[];return list[list.indexOf(this)+1]??null}
 appendChild(child){return this.insertBefore(child,null)}
 insertBefore(child,anchor){child.remove();const index=anchor===null?this.childNodes.length:this.childNodes.indexOf(anchor);this.childNodes.splice(index,0,child);child.parentNode=this;return child}
 replaceChildren(...children){for(const child of [...this.childNodes])child.remove();for(const child of children)this.appendChild(child)}
 remove(){if(this.parentNode){const list=this.parentNode.childNodes;list.splice(list.indexOf(this),1);this.parentNode=null}}
 querySelectorAll(){return []}
}
function fixture(operation){
 const previousDocument=globalThis.document,previousElement=globalThis.HTMLElement
 const document={defaultView:{HTMLElement:FixtureElement},createElement(){return new FixtureElement(document)}}
 globalThis.document=document;globalThis.HTMLElement=FixtureElement
 try{return operation(document)}finally{globalThis.document=previousDocument;globalThis.HTMLElement=previousElement}
}
const envelope=(dataVersion=1)=>({id:'a',type:'article',dataVersion,data:{text:'Alpha'}})
const request=(renderer,operation,block,container)=>operation==='renderBlock'?renderer.renderBlock(block)
 :operation==='render'?renderer.render({version:'2.0.0',blocks:[block]})
  :renderer.renderTo({version:'2.0.0',blocks:[block]},container)

for(const operation of ['renderBlock','render','renderTo']){
 test(operation+' retains the registered schema methods and original class receiver',()=>fixture(document=>{
  class Schema {
   #calls=0
   currentVersion=1
   createDefault(){return {text:''}}
   encode(data){return {dataVersion:1,data}}
   decode({data}){this.#calls++;return {dataVersion:1,data:{...data,text:data.text+' '+this.#calls}}}
  }
  const schema=new Schema(),renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
  renderer.registerRenderer({type:'article',schema,render(block){const element=document.createElement('div');element.textContent=block.data.text;return element}})
  schema.currentVersion=99;schema.decode=()=>{throw new Error('Later decoder invoked')}
  schema.encode=()=>{throw new Error('Later encoder invoked')};schema.createDefault=()=>{throw new Error('Later default invoked')}
  const container=document.createElement('section'),input=envelope(),before=structuredClone(input)
  try{
   const result=request(renderer,operation,input,container)
   const element=operation==='renderBlock'?result:operation==='render'?result.children[0]:container.children[0].children[0]
   assert.equal(element.textContent,'Alpha 1')
   assert.deepEqual(input,before)
   assert.equal(Object.isFrozen(schema),false)
  }finally{renderer.destroy()}
 }))
 test(operation+' rejects a mismatched input version even when a custom decoder ignores it',()=>fixture(document=>{
  let rendered=0
  const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
  renderer.registerRenderer({type:'article',schema:{currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:({data})=>({dataVersion:1,data})},render(){rendered++;return document.createElement('div')}})
  try{
   assert.throws(()=>request(renderer,operation,envelope(2),document.createElement('section')),/current schema/)
   assert.equal(rendered,0)
  }finally{renderer.destroy()}
 }))
 test(operation+' rejects a schema output version drift before projection',()=>fixture(document=>{
  let outputVersion=1,rendered=0
  const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
  renderer.registerRenderer({type:'article',schema:{currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:({data})=>({dataVersion:outputVersion,data})},render(){rendered++;return document.createElement('div')}})
  outputVersion=2
  try{
   assert.throws(()=>request(renderer,operation,envelope(),document.createElement('section')),/current schema/)
   assert.equal(rendered,0)
  }finally{renderer.destroy()}
 }))
}
for(const [kind,invalid]of [
 ['array',()=>[]],['class',()=>new Date()],['non-finite',()=>({value:Infinity})],['cycle',()=>{const value={};value.self=value;return value}],
])test('Renderer rejects '+kind+' schema results before calling the projector',()=>fixture(document=>{
 let rendered=0
 const renderer=new EditorRenderer({blockTypes:[],injectStyles:false})
 renderer.registerRenderer({type:'article',schema:{currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:()=>({dataVersion:1,data:invalid()})},render(){rendered++;return document.createElement('div')}})
 try{
  assert.throws(()=>renderer.renderBlock(envelope()),/current schema/)
  assert.equal(rendered,0)
 }finally{renderer.destroy()}
}))
for(const kind of ['block','inline'])for(const key of ['legacyVersion','migrations'])test('Renderer '+kind+' schemas reject removed '+key+' metadata without reading it',()=>{
 let reads=0
 const schema={currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:input=>input}
 Object.defineProperty(schema,key,{get(){reads++;throw new Error('Removed option evaluated')}})
 const definition={type:'probe',schema,render(){}}
 if(kind==='inline')assert.throws(()=>new EditorRenderer({blockTypes:[],inlineRenderers:[definition]}),/removed compatibility/)
 else{
  const renderer=new EditorRenderer({blockTypes:[]})
  try{assert.throws(()=>renderer.registerRenderer(definition),/removed compatibility/)}finally{renderer.destroy()}
 }
 assert.equal(reads,0)
})
test('Inline renderer captures schema prototype accessors once and uses private method state',()=>{
 const reads={currentVersion:0,createDefault:0,decode:0,encode:0}
 class Schema {
  #version=1
  get currentVersion(){if(++reads.currentVersion>1)throw new Error('Version reread');return this.#version}
  get createDefault(){reads.createDefault++;return function(){return {version:this.#version}}}
  get encode(){reads.encode++;return function(data){return {dataVersion:this.#version,data}}}
  get decode(){reads.decode++;return function(input){return {dataVersion:this.#version,data:input.data}}}
 }
 const schema=new Schema()
 const renderer=new EditorRenderer({blockTypes:[],inlineRenderers:[{type:'probe',schema,render(){}}]})
 try{assert.deepEqual(reads,{currentVersion:1,createDefault:1,decode:1,encode:1});assert.equal(Object.isFrozen(schema),false)}
 finally{renderer.destroy()}
})

for(const kind of ['block','inline'])test('Renderer '+kind+' captures callable render methods without reading unrelated bind accessors',()=>{
 let bindReads=0
 const render=()=>{}
 Object.defineProperty(render,'bind',{get(){bindReads++;throw new Error('Unrelated function bind accessed')}})
 const schema={currentVersion:1,createDefault:()=>({}),encode:data=>({dataVersion:1,data}),decode:input=>input}
 const definition={type:'probe',schema,render}
 if(kind==='inline'){
  const renderer=new EditorRenderer({blockTypes:[],inlineRenderers:[definition]});renderer.destroy()
 }else{
  const renderer=new EditorRenderer({blockTypes:[]})
  try{renderer.registerRenderer(definition)}finally{renderer.destroy()}
 }
 assert.equal(bindReads,0)
})
test('Poll renderer captures source functions without reading their unrelated bind accessors',()=>{
 let reads=0
 const source={
  async load(){return {total:0,options:[]}},
  async vote(){return {total:0,options:[]}},
  subscribe(){},
 }
 for(const method of Object.values(source))Object.defineProperty(method,'bind',{get(){reads++;throw new Error('Unrelated service bind accessed')}})
 const renderer=new EditorRenderer({blockTypes:['poll'],blockConfigs:{poll:{dataSource:source}},injectStyles:false})
 renderer.destroy()
 assert.equal(reads,0)
})
