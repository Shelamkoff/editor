import { test, make, para, equal } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('mutation requested by a synchronous change observer invalidates its block cache',()=>{
   let mutate;class Tracked extends Paragraph{render(data,context){const el=super.render(data);mutate=()=>context.mutate(()=>{el.textContent='observer edit'});return el}}
   const e=make([para('a','A')],{plugins:[new Tracked()]});let once=true;e.events.on('editor:changed',()=>{if(once){once=false;mutate()}});
   e.blocks.insert('paragraph',{text:'B'});const last=e.blocks.getBlockByIndex(1);equal(last.contentElement.textContent,'observer edit');equal(e.save().blocks[1].data.text,'observer edit','saved model must match live DOM after observer mutation');
  })
}
