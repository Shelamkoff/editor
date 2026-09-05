import { test, make, pause, assert, equal, texts } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('failed replacement does not emit phantom block additions',()=>{
   const bad={type:'bad',title:'Bad',icon:'',render(){return document.createElement('p')},save(){throw new Error('expected save failure')}};
   const e=make(undefined,{plugins:[new Paragraph(),bad]});const added=[];e.events.on('block:added',v=>added.push(v.blockId));let err;
   try{e.blocks.insert('bad',{},1,'failed')}catch(x){err=x}assert(err);equal(texts(e),['A']);equal(added,[]);
  })
  
  test('observers of failed insertion receive a document-restored notification',async()=>{
   const bad={type:'bad',title:'Bad',icon:'',render(){return document.createElement('p')},save(){throw new Error('failure')}};
   const e=make(undefined,{plugins:[new Paragraph(),bad]});let added=0,changed=0;e.events.on('block:added',()=>added++);e.events.on('editor:changed',()=>changed++);
   try{e.blocks.insert('bad',{},1,'failed')}catch{}await pause(20);assert(added===0||changed>0,'a published addition requires a restoration notification; added='+added+' changed='+changed);
  })
  test('once subscriptions survive rolled-back events and fire on the next committed addition', () => {
    const bad = { type: 'bad', title: 'Bad', icon: '', render() { return document.createElement('p') }, save() { throw new Error('save failed') } }
    const editor = make(undefined, { plugins: [new Paragraph(), bad] })
    const ids = []
    editor.events.once('block:added', event => ids.push(event.blockId))
    try { editor.blocks.insert('bad', {}, 1, 'failed') } catch {}
    editor.blocks.insert('paragraph', { text: 'B' }, 1, 'good')
    editor.blocks.insert('paragraph', { text: 'C' }, 2, 'later')
    equal(ids, ['good'])
  })

}
