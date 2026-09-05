import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
export function register() {
for(const kind of ['image','delimiter','code'])test('R3-10 HTML clipboard exports meaningful '+kind+' content',()=>{
 const configs={image:{Plugin:Image,data:{file:{url:'https://example.test/image.png'},caption:'Pic'}},delimiter:{Plugin:Delimiter,data:{}},code:{Plugin:Code,data:{code:'alert(1)',language:'javascript'}}};const {Plugin,data}=configs[kind];
 const e=make([{id:'a',type:kind,data}],{plugins:[new Paragraph(),new Plugin()]});e.blocks.selectBlocks(['a']);const dt=new DataTransfer();e.blocks.getBlockByIndex(0).contentElement.dispatchEvent(new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true}));
 const tpl=document.createElement('template');tpl.innerHTML=dt.getData('text/html');
 if(kind==='image')assert(tpl.content.querySelector('img')?.getAttribute('src')==='https://example.test/image.png','image dropped: '+dt.getData('text/html'));
 if(kind==='delimiter')assert(tpl.content.querySelector('hr'),'delimiter dropped: '+dt.getData('text/html'));
 if(kind==='code')equal(tpl.content.querySelector('pre code')?.textContent,'alert(1)');
})
}
