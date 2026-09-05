import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
function point(element, offset){
 const text=element.firstChild;assert(text?.nodeType===3,'point requires text node');const range=document.createRange();range.setStart(text,Math.max(0,offset-1));range.setEnd(text,Math.max(1,offset));const rect=range.getBoundingClientRect();return {clientX:offset?rect.right-1:rect.left+1,clientY:rect.top+rect.height/2}
}
async function across(e,a,aOffset,b,bOffset){
 e.rootElement.scrollIntoView();a.focus();a.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,buttons:1,...point(a,aOffset)}));
 document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,buttons:1,...point(b,bOffset)}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0,buttons:0}));
 await pause(20);assert(e.rootElement.classList.contains('oe-editor--cross-selecting'),'mouse cross-selection fixture must activate');
}
export function register() {
test('R3-15 cross-block deletion ending inside quote caption preserves its suffix',async()=>{
 const e=make([para('a','Alpha'),{id:'q',type:'quote',data:{text:'Main text',caption:'CAPTAIL'}}],{plugins:[new Paragraph(),new Quote()]});
 const a=e.blocks.getBlockByIndex(0).contentElement;const caption=e.blocks.getBlockByIndex(1).contentElement.querySelector('cite');await across(e,a,2,caption,3);key(a,'Delete');equal(texts(e),['AlTAIL']);
})
test('R3-15 cross-block deletion from quote caption preserves earlier quote text',async()=>{
 const e=make([{id:'q',type:'quote',data:{text:'KEEP MAIN',caption:'CAPTAIL'}},para('b','Bravo')],{plugins:[new Paragraph(),new Quote()]});
 const caption=e.blocks.getBlockByIndex(0).contentElement.querySelector('cite');const b=e.blocks.getBlockByIndex(1).contentElement;await across(e,caption,3,b,3);key(caption,'Delete');
 const block=e.save().blocks[0];equal(block.data,{text:'KEEP MAIN',caption:'CAPvo'});
})

  test('cross-block deletion retains fields following the end point', async () => {
    const editor = make([para('a', 'Alpha'), { id: 'q', type: 'quote', data: { text: 'Quote', caption: 'Unselected' } }], { plugins: [new Paragraph(), new Quote()] })
    const a = editor.blocks.getBlockByIndex(0).contentElement
    const q = editor.blocks.getBlockByIndex(1).contentElement.querySelector('blockquote')
    await across(editor, a, 2, q, 2)
    key(a, 'Delete')
    const blocks = editor.save().blocks
    equal(blocks.map(b => b.data), [{ text: 'Alote' }, { text: '', caption: 'Unselected' }])
    editor.undo()
    equal(editor.save().blocks.map(b => b.data), [{ text: 'Alpha' }, { text: 'Quote', caption: 'Unselected' }])
    editor.redo()
    equal(editor.save().blocks.map(b => b.data), blocks.map(b => b.data))
  })
}
