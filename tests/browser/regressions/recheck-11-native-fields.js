import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
export function register() {
for(const tag of ['input','textarea'])test('R3-07 native auxiliary '+tag+' should own Enter and text editing',()=>{
 const plugin={type:'aux',title:'Aux',icon:'',render(){const root=document.createElement('div');root.innerHTML='<p contenteditable="true">Authored</p><'+tag+' class="aux-control"></'+tag+'>';return root},save(root){return {text:root.querySelector('p').innerHTML}}};
 const e=make([{id:'a',type:'aux',data:{text:'Authored'}}],{plugins:[new Paragraph(),plugin]});const control=e.blocks.getBlockByIndex(0).contentElement.querySelector(tag);control.focus();
 const event=key(control,'Enter');equal({prevented:event.defaultPrevented,types:e.save().blocks.map(b=>b.type)},{prevented:false,types:['aux']});
})
for(const operation of ['Enter','paste'])test('R3-07 built-in Image URL field retains native '+operation,async()=>{
 const e=make([{id:'im',type:'image',data:{}}],{plugins:[new Paragraph(),new Image()]});
 const b=e.blocks.getBlockByIndex(0).contentElement;const link=[...b.querySelectorAll('button,a')].find(n=>/URL/i.test(n.textContent));assert(link,'URL source action');link.click();await pause(10);
 const field=b.querySelector('.oe-source-editor__field');assert(field&&!field.closest('[inert]'),'source field visible');field.focus();field.value='https://example.test/new.png';
 if(operation==='Enter'){const event=key(field,'Enter');equal({prevented:event.defaultPrevented,types:e.save().blocks.map(b=>b.type)},{prevented:false,types:['image']},'source form must own Enter, without inserting a document block')}
 else {const dt=new DataTransfer();dt.setData('text/plain','https://example.test/new.png');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});field.dispatchEvent(ev);equal(ev.defaultPrevented,false,'input must own clipboard paste')}
 equal(e.save().blocks.length,1);
})
test('document-backed LinkPreview URL field delegates Undo without structural keys', async () => {
  const editor = make([{ id: 'link', type: 'linkPreview', data: {
    url: 'https://example.test/article', title: 'Article', description: '',
  } }], { plugins: [new Paragraph(), new LinkPreview()] })
  const before = editor.save().blocks
  editor.blocks.getBlockByIndex(0).contentElement.querySelector('.oe-lp__action-btn--danger').click()
  const cleared = editor.save().blocks
  assert(JSON.stringify(before) !== JSON.stringify(cleared), 'delete must change the saved URL')
  assert(document.activeElement.matches('.oe-lp__url-input'), 'URL editor owns focus after deletion')
  key(document.activeElement, 'z', { ctrlKey: true, code: 'KeyZ' })
  equal(editor.save().blocks, before, 'Undo from document URL restores the deleted preview')
  key(document.activeElement, 'z', { ctrlKey: true, shiftKey: true, code: 'KeyZ' })
  equal(editor.save().blocks, cleared)
  const field = editor.blocks.getBlockByIndex(0).contentElement.querySelector('input')
  field.focus()
  key(field, 'Enter')
  equal(editor.save().blocks.length, 1, 'the URL handler must not split the document')
})

test('document-backed Embed URL field restores a deleted player with Undo', () => {
  const editor = make([{ id: 'video', type: 'embed', data: {
    service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Video',
  } }], { plugins: [new Paragraph(), new Embed({ resolvePreview: false })] })
  const before = editor.save().blocks
  editor.blocks.getBlockByIndex(0).contentElement.querySelector('.oe-embed__action-btn--danger').click()
  assert(document.activeElement.matches('.oe-embed__url-input'), 'delete focuses URL editor')
  const cleared = editor.save().blocks
  key(document.activeElement, 'z', { ctrlKey: true, code: 'KeyZ' })
  equal(editor.save().blocks, before)
  key(document.activeElement, 'z', { ctrlKey: true, shiftKey: true, code: 'KeyZ' })
  equal(editor.save().blocks, cleared)
})

}
