import { test, make, para, select, assert, equal, texts } from './harness.js'
import { Paragraph, Heading } from '../../../plugins/index.js'

export function register() {
  const inline = { w_missing: { type: 'missing', data: { id: '42', name: 'Anna' } } }
  
  test('partial conversion failure leaves the entire original paragraph intact',()=>{
   class Failing extends Heading {type='bad';render(){throw new Error('deliberate target render error')}}
   const e=make([para('a','abcdef')],{plugins:[new Paragraph(),new Failing()]});select(e.blocks.getBlockByIndex(0).contentElement,2,4);
   e.rootElement.querySelector('.oe-inline-toolbar__type-select').click();const item=e.rootElement.querySelector('[data-plugin-type="bad"].oe-inline-toolbar__type-item');assert(item,'bad conversion item available');item.click();
   equal(texts(e),['abcdef']);equal(e.canUndo,false);
  })
  
  test('multi-block conversion failure rolls back every converted block',()=>{
   class Failing extends Heading {type='bad';render(data){if(data.text==='Alpha')throw new Error('deliberate second block failure');return super.render(data)}}
   const e=make([para('a','Alpha'),para('b','Bravo')],{plugins:[new Paragraph(),new Failing()]});select(e.blocks.getBlockByIndex(0).contentElement,1);
   e.blocks.selectBlocks(['a','b']);e.rootElement.querySelector('.oe-inline-toolbar__type-select').click();e.rootElement.querySelector('[data-plugin-type="bad"].oe-inline-toolbar__type-item').click();
   equal(e.save().blocks.map(b=>b.type),['paragraph','paragraph']);equal(texts(e),['Alpha','Bravo']);
  })
}
