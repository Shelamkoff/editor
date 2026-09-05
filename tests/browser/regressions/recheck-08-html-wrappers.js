import { test, make, para, input, key, select, paste, pause, assert, equal, texts } from './harness.js'
import { Paragraph, Heading, Table, Quote, Image, Columns, Warning, Toggle, Spoiler, Checklist, List, Code, Raw, Poll, Person, Gallery, Attaches, Embed, LinkPreview, CarouselBlock, Delimiter } from '../../../plugins/index.js'
import { SelectionManager } from '../../../core/SelectionManager.js'
const inline={w_missing:{type:'missing',data:{id:'42',name:'Anna'}}}
export function register() {
test('R3-03 HTML clipboard wrappers preserve nested paragraph boundaries',async()=>{
 const e=make([para('a','')]);const p=e.blocks.getBlockByIndex(0).contentElement;select(p,0);await paste(p,{'text/html':'<div><p>First</p><p>Second</p></div>'});equal(texts(e),['First','Second']);
})

  test('transparent nested HTML wrappers preserve inline groups and routed lists', async () => {
    const editor = make([para('a', '')], { plugins: [new Paragraph(), new List()] })
    const p = editor.blocks.getBlockByIndex(0).contentElement
    select(p, 0)
    await paste(p, { 'text/html': '<section><div>Before <strong>bold</strong><p>Middle</p>After</div><ul><li>One</li><li>Two</li></ul></section>' })
    const blocks = editor.save().blocks
    equal(blocks.map(b => b.type), ['paragraph', 'paragraph', 'paragraph', 'list'])
    equal(blocks.slice(0, 3).map(b => b.data.text), ['Before <strong>bold</strong>', 'Middle', 'After'])
    equal(blocks[3].data.items, ['One', 'Two'])
  })
}
