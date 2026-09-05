import { test, make, para, input, assert, equal } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('rejected render disposes staged resources if capturing the current document fails',()=>{
   const active=new Set();let invalid=false;
   class Tracked extends Paragraph {render(data){const n=super.render(data);active.add(n);return n}destroy(n){active.delete(n)}save(n){if(invalid&&n.textContent==='invalid')throw new Error('current state cannot save');return super.save(n)}}
   const e=make([para('a','A')],{plugins:[new Tracked()]});invalid=true;input(e.blocks.getBlockByIndex(0).contentElement,'invalid');let rejected=false;
   try{e.render({version:'1',blocks:[para('new','New')]})}catch{rejected=true}assert(rejected,'fixture must fail current snapshot');e.destroy();equal(active.size,0,'all rendered plugin resources must be disposed, including abandoned staged nodes');
  })
}
