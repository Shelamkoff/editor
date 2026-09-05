import { test, make, pause, equal, texts } from './harness.js'

export function register() {
  test('Undo must notify onChange after a fully delivered edit',async()=>{
   const changes=[];const e=make(undefined,{onChange:d=>changes.push(d.blocks.map(b=>b.data.text)),tuning:{change:{debounceMs:1}}});
   e.blocks.insert('paragraph',{text:'B'}); await pause(40); equal(changes,[['A','B']]); e.undo(); await pause(40);
   equal(texts(e),['A']);equal(changes,[['A','B'],['A']]);
  })
  
  test('Redo must emit editor:changed and notify onChange',async()=>{
   const changes=[];const e=make(undefined,{onChange:d=>changes.push(d.blocks.map(b=>b.data.text)),tuning:{change:{debounceMs:1}}});
   e.blocks.insert('paragraph',{text:'B'});await pause(25);e.undo();await pause(25);changes.length=0;
   let events=0;e.events.on('editor:changed',()=>events++);e.redo();await pause(25);equal(texts(e),['A','B']);equal({events,changes},{events:1,changes:[['A','B']]});
  })
}
