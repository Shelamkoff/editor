import test from 'node:test'
import assert from 'node:assert/strict'
import { createParagraphPlugin } from './paragraph/index.js'
import { createHeadingPlugin } from './heading/index.js'
import { createListPlugin } from './list/index.js'
import { createQuotePlugin } from './quote/index.js'
import { createTablePlugin } from './table/index.js'
import { createChecklistPlugin } from './checklist/index.js'
import { createWarningPlugin } from './warning/index.js'
import { createTogglePlugin } from './toggle/index.js'
import { createColumnsPlugin } from './columns/index.js'
import { createSpoilerPlugin } from './spoiler/index.js'
import { createPollPlugin } from './poll/index.js'
import { createPersonPlugin } from './person/index.js'

function documentFixture() {
  return {
    createElement(name) {
      assert.equal(name, 'template')
      const template={ content: { textContent: '' } }
      Object.defineProperty(template, 'innerHTML', {
        set(value) {
          if(value==='<b></b>'||value==='<br>'||value==='&nbsp;') {
            template.content.textContent = value==='&nbsp;'?'\u00a0':''
          } else if(value==='<span>{{widget}}</span>') {
            template.content.textContent = '{{widget}}'
          } else throw new Error('Unexpected HTML fixture: '+value)
        },
      })
      return template
    },
  }
}
const doc=documentFixture()
const scenarios=[
  [createParagraphPlugin, { text:'<b></b>' }, { text:'<span>{{widget}}</span>' }],
  [createHeadingPlugin, { text:'<br>', level:2 }, { text:'Hello', level:2 }],
  [createListPlugin, {style:'unordered', items:[{ id:'one',text:'&nbsp;' }] }, {style:'unordered', items:[{ id:'one',text:'Hello' }] }],
  [createQuotePlugin, { text:'<b></b>',caption:'<br>' }, {text:'Hello',caption:'<br>'}],
  [createTablePlugin, {rows:[{id:'r',cells:[{id:'c',text:'<b></b>'}]}]}, {rows:[{id:'r',cells:[{id:'c',text:'Hello'}]}]}],
  [createChecklistPlugin, {items:[{id:'a',text:'<br>',checked:false}]}, {items:[{id:'a',text:'Hello',checked:false}]}],
  [createWarningPlugin, { title:'&nbsp;', message:'<br>' }, { title:'Hello', message:'<br>' }],
  [createTogglePlugin, { title:'<b></b>',content:'<br>' }, { title:'Hello',content:'<br>' }],
  [createColumnsPlugin, { columns:[{id:'a',content:'<b></b>'}] }, { columns:[{id:'a',content:'Hello'}] }],
  [createSpoilerPlugin, { label:'&nbsp;',content:'<br>' }, { label:'Hello',content:'<br>' }],
  [createPollPlugin, { question:'<br>',options:[{id:'o',text:'<b></b>'}] }, {question:'Hello',options:[{id:'o',text:'<b></b>'}]}],
  [createPersonPlugin, { persons:[{id:'a',avatar:'',name:'<b></b>',role:'',bio:'',links:[]}] }, {persons:[{id:'a',avatar:'',name:'Ada',role:'',bio:'',links:[]}]}],
]
for(const [factory,empty,authored] of scenarios) {
  test(factory.name+' detects empty markup and keeps authored rich text', () => {
    const capability=factory().capabilities.empty
    assert.equal(capability.isEmpty(empty,{ownerDocument:doc}), true)
    assert.equal(capability.isEmpty(authored,{ownerDocument:doc}), false)
  })
}
test('List Enter on a visually empty HTML-only item exits the list', () => {
  const previous=globalThis.document
  try {
    globalThis.document=doc
    const list=createListPlugin()
    const result=list.capabilities.shortcuts.handle({
      fieldKey:'item:a',key:'Enter',shiftKey:false,
      selection:{start:0,end:0},
    },{style:'unordered',items:[{id:'a',text:'<br>'}]},{})
    assert.equal(result.kind,'exit')
  } finally {
    globalThis.document=previous
  }
})
