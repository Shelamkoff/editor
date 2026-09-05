import { test, make, select, assert, equal } from './harness.js'
import { Paragraph, Quote } from '../../../plugins/index.js'

export function register() {
  test('duplicating a Quote through its settings preserves custom tunes',()=>{
   const e=make([{id:'q',type:'quote',data:{text:'Quote',caption:'Author'},tunes:{textAlign:'right',custom:{x:true}}}],{plugins:[new Paragraph(),new Quote()]});
   const text=e.blocks.getBlockByIndex(0).contentElement.querySelector('blockquote');select(text,1);e.blocks.setCurrentIndex(0);
   const toggle=e.rootElement.querySelector('.oe-toolbar > button:nth-child(2)');assert(toggle);toggle.dispatchEvent(new MouseEvent('mousedown',{button:0,buttons:1,bubbles:true,cancelable:true}));document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
   const item=[...e.rootElement.querySelectorAll('.oe-settings-menu__item')].find(n=>n.textContent==='Duplicate');assert(item,'duplicate settings item exists');item.click();
   equal(e.save().blocks.length,2);equal(e.save().blocks[1].tunes,e.save().blocks[0].tunes);
  })
}
