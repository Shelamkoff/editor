import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
export function register() {
for(const operation of ['split','merge','convert']) test('R3-02 unresolved inline metadata survives '+operation,()=>{
 const e=make(operation==='merge'?[para('a','A'),para('b','X{{w_missing}}Y',{inline})]:[para('a','X{{w_missing}}Y',{inline})],{plugins:[new Paragraph(),new Heading()]});
 if(operation==='split'){const p=e.blocks.getBlockByIndex(0).contentElement;select(p,1);key(p,'Enter')}
 if(operation==='merge'){const p=e.blocks.getBlockByIndex(1).contentElement;select(p,0);e.blocks.setCurrentIndex(1);key(p,'Backspace');equal(texts(e),['AX{{w_missing}}Y'],'merge must execute')}
 if(operation==='convert')e.blocks.convert(0,'heading',{level:2});
 const containing=e.save().blocks.find(b=>JSON.stringify(b.data).includes('{{w_missing}}')); assert(containing,'token must remain');equal(containing.inline,inline);
})

  test('merging unresolved tokens with colliding IDs preserves both payloads', () => {
    const first = { w: { type: 'missing', data: { name: 'First' } } }
    const second = { w: { type: 'missing', data: { name: 'Second' } } }
    const editor = make([para('a', '{{w}}', { inline: first }), para('b', '{{w}}', { inline: second })])
    const p = editor.blocks.getBlockByIndex(1).contentElement
    select(p, 0)
    key(p, 'Backspace')
    const merged = editor.save().blocks[0]
    const ids = [...merged.data.text.matchAll(/\{\{([\w-]+)\}\}/g)].map(match => match[1])
    equal(ids.length, 2)
    assert(ids[0] !== ids[1], 'conflicting payloads must not share a token')
    equal(ids.map(id => merged.inline[id].data.name), ['First', 'Second'])
    editor.undo()
    equal(editor.save().blocks.map(block => block.inline), [first, second])
    editor.redo()
    equal(editor.save().blocks[0].inline, merged.inline)
  })
  test('partial conversion carries unresolved tokens into both resulting blocks', () => {
    const editor = make([para('a', 'X{{w_missing}}Y', { inline })], { plugins: [new Paragraph(), new Heading()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 1, 14)
    editor.rootElement.querySelector('.oe-inline-toolbar__type-select').click()
    editor.rootElement.querySelector('[data-plugin-type="heading"].oe-inline-toolbar__type-item').click()
    const containing = editor.save().blocks.find(block => block.data.text.includes('{{w_missing}}'))
    equal(containing?.inline, inline)
  })
}
