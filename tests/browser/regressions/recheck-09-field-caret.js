import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
export function register() {
for(const layout of [['','B'],['A','']])test('R3-04 history restores the caret in the correct empty table cell '+JSON.stringify(layout),()=>{
 const e=make([{id:'t',type:'table',data:{content:[layout]}}],{plugins:[new Paragraph(),new Table()]});
 const cells=e.blocks.getBlockByIndex(0).contentElement.querySelectorAll('td');const index=layout[0]===''?0:1;select(cells[index],0);
 e.blocks.insert('paragraph',{text:'later'});e.undo();
 const current=e.blocks.getBlockByIndex(0).contentElement.querySelectorAll('td')[index];const anchor=window.getSelection().anchorNode;assert(current.contains(anchor),'expected cell '+index+'; actual anchor '+anchor?.parentElement?.outerHTML);
})
}
