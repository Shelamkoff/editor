import { test, make, para, select, assert, equal } from './harness.js'
import { Paragraph } from '../../../plugins/index.js'

export function register() {
  test('removing the last block is atomic when the fallback plugin fails',()=>{
   let fail=false;class Fragile extends Paragraph{render(d){if(fail&&!d?.text)throw new Error('fallback failure');return super.render(d)}}
   const e=make([para('a','Keep me')],{plugins:[new Fragile()]});const before=e.save().blocks;select(e.blocks.getBlockByIndex(0).contentElement,1);
   const toggle=e.rootElement.querySelector('.oe-toolbar > button:nth-child(2)');toggle.dispatchEvent(new MouseEvent('mousedown',{button:0,buttons:1,bubbles:true,cancelable:true}));document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
   const del=e.rootElement.querySelector('.oe-settings-menu__item--danger');assert(del,'delete item available');fail=true;del.click();fail=false;equal(e.save().blocks,before);
  })
}
