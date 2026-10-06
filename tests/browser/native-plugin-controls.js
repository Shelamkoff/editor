import { test, make, para, editorRoot, blockElement, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, printable } from './native-input-helpers.js'
import { pluginParityFixtures, pixel } from './plugin-parity-fixtures.js'
import { createParagraphPlugin, createGalleryPlugin, createAttachesPlugin, createImagePlugin, createLinkPreviewPlugin, createPollPlugin, createPersonPlugin } from '../../plugins/index.js'

function pluginEditor(name, data) {
  const fixture = pluginParityFixtures.find(entry => entry.name === name)
  const definition = fixture.factory()
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
    data: { ...definition.schema.createDefault(), ...(data ?? fixture.data) } }], { plugins: [createParagraphPlugin(), definition] })
}
async function history(editor, before, after) {
  const focusBefore=document.activeElement?.outerHTML.slice(0,250)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before,`Undo focus ${focusBefore} → ${document.activeElement?.outerHTML.slice(0,250)}, canUndo ${editor.canUndo}`)
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after)
}

for (const template of ['horizontal','compact','large-top','minimal','twitter','notion','split']) {
  test(`LinkPreview template ${template} changes its actual styled card`, async () => {
    const editor = pluginEditor('LinkPreview', { url: 'https://example.com', title: 'Alpha', description: 'Bravo', image: pixel, favicon: pixel, template })
    const card = blockElement(editor, 'a').querySelector('.oe-lp__card')
    assert(card.classList.contains('oe-lp__card--' + template), 'LinkPreview has a template only in JSON')
    assert(card.querySelector('.oe-lp__content'), 'LinkPreview body is not connected to its stylesheet')
    equal(!!card.querySelector('.oe-lp__image:not([hidden])'), !['minimal','notion'].includes(template))
    if (template === 'notion') assert(card.querySelector('.oe-lp__favicon-large'), 'Notion favicon is missing')
    if (['large-top','twitter'].includes(template)) equal(getComputedStyle(card).flexDirection, 'column')
  })
}
test('LinkPreview filled Delete clears the card while keeping the block and one history action', async () => {
  const editor = pluginEditor('LinkPreview')
  const before = editor.save().blocks
  const button = blockElement(editor, 'a').querySelector('.oe-lp__action-btn--danger')
  assert(button, 'LinkPreview filled Delete from v1 is missing')
  await clickNative(button)
  const after = editor.save().blocks
  equal(after.map(block => [block.id, block.type, block.data.url]), [['a','linkPreview','']])
  await history(editor, before, after)
})

for (const [variant, selector] of [['a','.oe-attaches__card'],['b','.oe-attaches__pill'],['f','.oe-attaches__notion-row'],['g','.oe-attaches__material-card']]) {
  test(`Attaches variant ${variant} projects its v1 presentation`, async () => {
    const editor = pluginEditor('Attaches', { files: [{ id: 'first', url: '/alpha.txt', name: 'Alpha', size: 5, extension: 'txt' }], variant })
    assert(blockElement(editor, 'a').querySelector(selector), 'Attachment variant exists only in JSON')
    equal(blockElement(editor, 'a').querySelector('.oe-attaches__name').textContent, 'Alpha')
    editor.setReadOnly(true)
    assert(blockElement(editor, 'a').querySelector(selector), 'Read-only mode lost attachment presentation')
  })
}
test('Attaches multi-file Card group expands without creating a document action', async () => {
  const editor = pluginEditor('Attaches', { files: [{ id: 'first', url: '/alpha.txt', name: 'Alpha', size: 5, extension: 'txt' }, { id: 'second', url: '/bravo.pdf', name: 'Bravo', size: 7, extension: 'pdf' }], variant: 'a' })
  const before = editor.save().blocks
  const chevron = blockElement(editor, 'a').querySelector('.oe-attaches__chevron')
  assert(chevron, 'Attachment group chevron is missing')
  equal(chevron.getAttribute('aria-expanded'), 'false')
  await clickNative(chevron)
  equal(chevron.getAttribute('aria-expanded'), 'true')
  equal(blockElement(editor, 'a').querySelectorAll('.oe-attaches__group-body--open .oe-attaches__name').length, 2)
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})
test('Gallery native drag swaps image identities and captions as one action', async () => {
  const editor = pluginEditor('Gallery', { images: [{ id: 'first', url: pixel, caption: 'Alpha' }, { id: 'second', url: pixel, caption: 'Bravo' }, { id: 'third', url: pixel, caption: 'Charlie' }], layout: '3a' })
  const before = editor.save().blocks
  const slots = blockElement(editor, 'a').querySelectorAll('.oe-gallery__slot--filled')
  assert(slots[0].draggable, 'Gallery internal drag was not transferred')
  const from = slots[0].querySelector('img').getBoundingClientRect()
  const to = slots[2].querySelector('img').getBoundingClientRect()
  await window.__testInput('Input.drag', { from: { x: from.left + from.width / 2, y: from.top + from.height / 2 }, to: { x: to.left + to.width / 2, y: to.top + to.height / 2 } })
  await pause(40)
  const after = editor.save().blocks
  equal(after[0].data.images, [before[0].data.images[2], before[0].data.images[1], before[0].data.images[0]])
  editor.blocks.focus('a')
  await history(editor, before, after)
})

test('Person tab switch registers its new editing hosts for real clicks and input', async () => {
  const editor=pluginEditor('Person',{persons:[{id:'first',avatar:'',name:'Alpha',role:'',bio:'',links:[]},{id:'second',avatar:'',name:'Bravo',role:'',bio:'',links:[]}]})
  const before=editor.save().blocks
  await clickNative(blockElement(editor,'a').querySelector('[data-person-id="second"]'))
  const name=blockElement(editor,'a').querySelector('.oe-person__name')
  await clickNative(name)
  await dispatchKey('End','End',35)
  await printable('X')
  const after=editor.save().blocks
  equal(after[0].data.persons[0].name,'Alpha')
  equal(after[0].data.persons[1].name,'BravoX')
  equal(blockElement(editor,'a').querySelector('[data-person-id="second"] .oe-person__tab-label')?.textContent,'BravoX','Typing a name left the tab label stale')
  await history(editor,before,after)
})

test('Person tabs show the active card, rich-text names and avatars and remove an inactive person',async()=>{
  const editor=pluginEditor('Person',{persons:[{id:'first',avatar:pixel,name:'<strong>Alpha</strong>',role:'Bravo',bio:'Charlie',links:[]},{id:'second',avatar:'',name:'Delta',role:'',bio:'',links:[]}]})
  editor.blocks.focus('a',{fieldKey:'person:first:name',offset:2})
  const before=editor.save().blocks
  const tabs=()=>blockElement(editor,'a').querySelectorAll('.oe-person__tab[data-person-id]')
  assert(tabs()[0].classList.contains('oe-person__tab--active'),'Active person has no visual tab state')
  equal(tabs()[0].querySelector('.oe-person__tab-label')?.textContent,'Alpha','Tab renders authored HTML as literal text')
  assert(tabs()[0].querySelector('.oe-person__tab-avatar'),'Tab lost its avatar preview')
  assert(tabs()[0].querySelector('.oe-person__tab-grip'),'Tab lost its drag grip')
  await clickNative(tabs()[1].querySelector('.oe-person__tab-remove'))
  const after=editor.save().blocks
  equal(after[0].data.persons,[before[0].data.persons[0]])
  equal(blockElement(editor,'a').querySelector('.oe-person__name').textContent,'Alpha','Removing another tab switched the active card')
  equal(tabs()[0].querySelector('.oe-person__tab-remove'),null,'The last person can be removed')
  await history(editor,before,after)
  editor.setReadOnly(true)
  equal(blockElement(editor,'a').querySelector('.oe-person__tab-remove'),null,'Read-only tabs offer a document mutation')
})

test('Person nested IDs containing separators restore the correct link field through history',async()=>{
  const editor=pluginEditor('Person',{persons:[
    {id:'a',avatar:'',name:'First',role:'',bio:'',links:[{id:'b:link:c',type:'website',url:'https://first.example'}]},
    {id:'a:link:b',avatar:'',name:'Second',role:'',bio:'',links:[{id:'c',type:'website',url:'https://second.example'}]},
  ]})
  const before=editor.save().blocks
  await clickNative(blockElement(editor,'a').querySelector('[data-person-id="a:link:b"] .oe-person__tab-select'))
  await clickNative(blockElement(editor,'a').querySelector('.oe-person__link-url'))
  await dispatchKey('a','KeyA',65,2)
  await window.__testInput('Input.insertText',{text:'https://second.example/edited'})
  const after=editor.save().blocks
  equal(after[0].data.persons[0],before[0].data.persons[0])
  equal(after[0].data.persons[1].links[0].url,'https://second.example/edited')
  await clickNative(blockElement(editor,'a').querySelector('[data-person-id="a"] .oe-person__tab-select'))
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before)
  equal(blockElement(editor,'a').querySelector('.oe-person__name').textContent,'Second','Undo restored a different person with the same composite field key')
  equal(document.activeElement?.value,'https://second.example')
  await dispatchKey('z','KeyZ',90,2|8)
  equal(editor.save().blocks,after)
  equal(document.activeElement?.value,'https://second.example/edited')
})
test('Carousel navigation registers the next caption for real input and history', async () => {
  const editor=pluginEditor('Carousel',{slides:[{id:'first',type:'image',src:pixel,caption:'Alpha'},{id:'second',type:'image',src:pixel,caption:'Bravo'}],options:{autoplay:false}})
  const before=editor.save().blocks
  await clickNative(blockElement(editor,'a').querySelector('.oe-carousel-block__nav--next'))
  await clickNative(blockElement(editor,'a').querySelector('.oe-carousel-block__caption'))
  await dispatchKey('End','End',35)
  await printable('X')
  const after=editor.save().blocks
  equal(after[0].data.slides.map(slide=>slide.caption),['Alpha','BravoX'])
  await history(editor,before,after)
})
for(const [name,factory] of [['Gallery',createGalleryPlugin],['Attaches',createAttachesPlugin],['Image',createImagePlugin]]){
  test(`${name} external file drop reaches its upload service in empty and filled states`, async()=>{
    let calls=0
    const definition=factory({uploadFile:async file=>{calls++;equal(file.name,'alpha.png');return {url:pixel}}})
    const editor=make([{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:definition.schema.createDefault()}],{plugins:[createParagraphPlugin(),definition],injectStyles:true})
    const drop=()=>{
      const transfer=new DataTransfer()
      transfer.items.add(new File(['image'],'alpha.png',{type:'image/png'}))
      const target=blockElement(editor,'a').firstElementChild
      const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer})
      target.dispatchEvent(event)
      assert(event.defaultPrevented,'Plugin did not accept its file drop')
    }
    drop()
    await pause(120)
    equal(calls,1)
    drop()
    await pause(120)
    equal(calls,2)
    editor.setReadOnly(true)
    const transfer=new DataTransfer()
    transfer.items.add(new File(['image'],'alpha.png',{type:'image/png'}))
    blockElement(editor,'a').firstElementChild.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}))
    await pause(30)
    equal(calls,2)
  })
}

async function chooseSetting(editor,label){
  editor.blocks.focus('a')
  await clickNative(editorRoot(editor).querySelector('.oe-toolbar__drag'))
  const menu=editorRoot(editor).querySelector('.oe-settings-menu')
  const item=[...menu.querySelectorAll('[role="menuitem"]')].find(button=>button.querySelector('.oe-settings-menu__label')?.textContent===label)
  assert(item,'Missing setting '+label)
  await clickNative(item)
}
for(const [label,action] of [['Toggle header','header'],['Add row','row-add'],['Delete row','row-del'],['Add column','col-add'],['Delete column','col-del']]){
  test(`Table ${label} preserves unaffected cell IDs and one Undo/Redo`,async()=>{
    const rows=[{id:'first',cells:[{id:'one',text:'Alpha'},{id:'two',text:'Bravo'}]},{id:'second',cells:[{id:'three',text:'Charlie'},{id:'four',text:'Delta'}]}]
    const editor=pluginEditor('Table',{withHeadings:false,rows})
    const before=editor.save().blocks
    await chooseSetting(editor,label)
    const after=editor.save().blocks
    equal(after[0].data.rows[0].cells[0],rows[0].cells[0])
    if(action==='header')equal(after[0].data.withHeadings,true)
    if(action==='row-add')equal(after[0].data.rows.length,3)
    if(action==='row-del')equal(after[0].data.rows.length,1)
    if(action==='col-add')equal(after[0].data.rows.map(row=>row.cells.length),[3,3])
    if(action==='col-del')equal(after[0].data.rows.map(row=>row.cells.length),[1,1])
    await history(editor,before,after)
  })
}
test('Columns 3 to 2 via settings keeps excess content and retained column IDs',async()=>{
  const editor=pluginEditor('Columns',{layout:'1-1-1',columns:[{id:'left',content:'Alpha'},{id:'center',content:'Bravo'},{id:'right',content:'Charlie'}]})
  const before=editor.save().blocks
  const definition=pluginParityFixtures.find(entry=>entry.name==='Columns').factory()
  const label=definition.capabilities.settings.actions(before[0].data).find(action=>action.id==='1-1').label.fallback
  await chooseSetting(editor,label)
  const after=editor.save().blocks
  equal(after[0].data.columns,[{id:'left',content:'Alpha'},{id:'center',content:'Bravo<br>Charlie'}])
  await history(editor,before,after)
})

test('Columns inline layout selector changes the grid, retains text and supports native Undo/Redo',async()=>{
  const editor=pluginEditor('Columns',{layout:'1-1-1',columns:[{id:'left',content:'Alpha'},{id:'center',content:'Bravo'},{id:'right',content:'Charlie'}]})
  editor.blocks.focus('a',{fieldKey:'column:right',offset:3})
  const before=editor.save().blocks
  const buttons=()=>blockElement(editor,'a').querySelectorAll('.oe-columns__layout-btn')
  equal(buttons().length,4,'The v1 inline layout selector is missing')
  equal(blockElement(editor,'a').querySelector('.oe-columns__layout-btn--active')?.dataset.layout,'1-1-1')
  await clickNative(blockElement(editor,'a').querySelector('[data-layout="1-1"]'))
  const after=editor.save().blocks
  equal(after[0].data.columns,[{id:'left',content:'Alpha'},{id:'center',content:'Bravo<br>Charlie'}])
  equal(blockElement(editor,'a').querySelector('.oe-columns__layout-btn--active')?.dataset.layout,'1-1')
  await history(editor,before,after)
  editor.setReadOnly(true)
  for(const button of buttons())assert(!button.checkVisibility(),'Read-only Columns show an authoring layout button')
})
test('Checklist checkbox is one document action and preserves item identity',async()=>{
  const editor=pluginEditor('Checklist')
  const before=editor.save().blocks
  editor.blocks.focus('a')
  await clickNative(blockElement(editor,'a').querySelector('[role="checkbox"],.oe-checklist__checkbox'))
  const after=editor.save().blocks
  equal(after[0].data.items,before[0].data.items.map((item,index)=>index===0?{...item,checked:!item.checked}:item))
  await history(editor,before,after)
})

for(const name of ['Person','Carousel']){
  test(`${name} public field focus and history reveal the requested hidden item`,async()=>{
    const person=name==='Person'
    const data=person?{persons:[{id:'first',avatar:'',name:'Alpha',role:'',bio:'',links:[]},{id:'second',avatar:'',name:'Bravo',role:'',bio:'',links:[]}]}:
      {slides:[{id:'first',type:'image',src:pixel,caption:'Alpha'},{id:'second',type:'image',src:pixel,caption:'Bravo'}],options:{autoplay:false}}
    const editor=pluginEditor(name,data)
    const key=person?'person:second:name':'slide:second:caption'
    const selector=person?'.oe-person__name':'.oe-carousel-block__caption'
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:key,offset:2})
    equal(document.activeElement?.textContent,'Bravo','Field focus stayed on a different item')
    await printable('X')
    const after=editor.save().blocks
    await clickNative(blockElement(editor,'a').querySelector(person?'[data-person-id="first"]':'.oe-carousel-block__nav--prev'))
    await dispatchKey('z','KeyZ',90,2)
    equal(editor.save().blocks,before)
    equal(document.activeElement,blockElement(editor,'a').querySelector(selector))
    equal(document.activeElement.textContent,'Bravo','Undo restored the caret into another item')
    await dispatchKey('z','KeyZ',90,2|8)
    equal(editor.save().blocks,after)
    equal(document.activeElement.textContent,'BrXavo')
  })
}
test('LinkPreview changing its URL clears metadata belonging to the previous page',async()=>{
  let finish
  const definition=createLinkPreviewPlugin({fetchMeta:()=>new Promise(resolve=>{finish=resolve})})
  const editor=make([{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),url:'https://old.example',title:'Old',description:'Old description',image:pixel,favicon:pixel}}],{plugins:[createParagraphPlugin(),definition]})
  const input=blockElement(editor,'a').querySelector('input')
  await clickNative(input)
  await dispatchKey('a','KeyA',65,2)
  await window.__testInput('Input.insertText',{text:'https://new.example'})
  await pause(650)
  const draft=editor.save().blocks[0].data
  equal([draft.url,draft.title,draft.description,draft.image,draft.favicon],['https://new.example','','','',''],'Old page metadata was shown under a new URL')
  assert(finish,'New URL did not reach metadata resolution')
  finish({title:'New'})
  await pause(50)
  const resolved=editor.save().blocks[0].data
  equal([resolved.title,resolved.description,resolved.image,resolved.favicon],['New','','',''])
})
test('LinkPreview template menu retains its compact visual selectors and localized names',async()=>{
  const editor=pluginEditor('LinkPreview')
  await clickNative(blockElement(editor,'a').querySelector('.oe-lp__dropdown > button'))
  const buttons=[...blockElement(editor,'a').querySelectorAll('.oe-lp__tpl-btn')]
  equal(buttons.length,7)
  for(const button of buttons){
    assert(button.querySelector('svg'),'Template menu rendered a long label in place of its visual selector')
    assert(button.getAttribute('aria-label')&&button.title,'Template selector has no accessible name')
  }
  await clickNative(buttons.find(button=>button.dataset.template==='split'))
  equal(editor.save().blocks[0].data.template,'split')
})
for(const variant of ['a','b','f','g']){
  test(`Attaches inline template menu switches to ${variant} and retains native history`,async()=>{
    const editor=pluginEditor('Attaches',{files:[{id:'first',url:'/alpha.txt',name:'Alpha',size:5,extension:'txt'}],variant:variant==='a'?'f':'a'})
    const before=editor.save().blocks
    const button=blockElement(editor,'a').querySelector('.oe-attaches__dropdown > button')
    assert(button,'Filled attachment lost its inline Settings menu')
    await clickNative(button)
    const option=blockElement(editor,'a').querySelector(`.oe-attaches__tpl-btn[data-variant="${variant}"]`)
    assert(option,'Attachment template selector is missing')
    await clickNative(option)
    const after=editor.save().blocks
    equal(after[0].data,{...before[0].data,variant})
    await history(editor,before,after)
  })
}
for(const action of ['add-person','remove-person','remove-link']){
  test(`Person ${action} through its button preserves IDs and one native Undo/Redo`,async()=>{
    const editor=pluginEditor('Person',{persons:[{id:'first',avatar:'',name:'Alpha',role:'Bravo',bio:'Charlie',links:[{id:'site',type:'website',url:'https://example.com'}]},{id:'second',avatar:'',name:'Delta',role:'',bio:'',links:[]}]})
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:'person:first:name',offset:2})
    const selector=action==='add-person'?'.oe-person__tab--add':action==='remove-person'?'.oe-person__tab-remove':'.oe-person__link-remove'
    await clickNative(blockElement(editor,'a').querySelector(selector))
    const after=editor.save().blocks
    if(action==='add-person'){
      equal(after[0].data.persons.slice(0,2),before[0].data.persons)
      equal(after[0].data.persons.length,3)
      assert(after[0].data.persons[2].id)
    }else if(action==='remove-person')equal(after[0].data.persons,[before[0].data.persons[1]])
    else equal(after[0].data.persons,[{...before[0].data.persons[0],links:[]},before[0].data.persons[1]])
    await history(editor,before,after)
  })
}
for(const action of ['remove','forward','backward']){
  test(`Carousel ${action} button keeps slide identities and one native Undo/Redo`,async()=>{
    const editor=pluginEditor('Carousel',{slides:[{id:'first',type:'image',src:pixel,caption:'Alpha'},{id:'second',type:'image',src:pixel,caption:'Bravo'}],options:{autoplay:false}})
    const before=editor.save().blocks
    if(action==='backward')await clickNative(blockElement(editor,'a').querySelector('.oe-carousel-block__nav--next'))
    editor.blocks.focus('a',{offset:2})
    const selector=action==='remove'?'.oe-carousel-block__action-btn--danger':action==='forward'?'[aria-label="Move slide forward"]':'[aria-label="Move slide backward"]'
    await clickNative(blockElement(editor,'a').querySelector(selector))
    const after=editor.save().blocks
    equal(after[0].data.slides,action==='remove'?[before[0].data.slides[1]]:[before[0].data.slides[1],before[0].data.slides[0]])
    await history(editor,before,after)
  })
}
for(const action of ['add','remove']){
  test(`Poll ${action} option button keeps a valid minimum and native history`,async()=>{
    const editor=pluginEditor('Poll',{question:'Question',type:'single',resultsMode:'afterVote',options:[{id:'first',text:'Alpha'},{id:'second',text:'Bravo'},{id:'third',text:'Charlie'}]})
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:'question',offset:2})
    await clickNative(blockElement(editor,'a').querySelector(action==='add'?'.oe-poll__add':'.oe-poll__remove'))
    const after=editor.save().blocks
    if(action==='add'){
      equal(after[0].data.options.slice(0,3),before[0].data.options)
      equal(after[0].data.options.length,4)
    }else equal(after[0].data.options,before[0].data.options.slice(1))
    await history(editor,before,after)
  })
}
for(const action of ['remove','forward']){
  test(`Gallery ${action} button keeps image identities and native history`,async()=>{
    const editor=pluginEditor('Gallery',{images:[{id:'first',url:pixel,caption:'Alpha'},{id:'second',url:pixel,caption:'Bravo'}],layout:'3a'})
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:'image:first:caption',offset:2})
    const slot=blockElement(editor,'a').querySelector('[data-image-id="first"].oe-gallery__slot')
    const button=action==='remove'?slot.querySelector('.oe-gallery__slot-remove'):[...slot.querySelectorAll('button')].find(button=>button.textContent==='→')
    await clickNative(button)
    const after=editor.save().blocks
    equal(after[0].data.images,action==='remove'?[before[0].data.images[1]]:[before[0].data.images[1],before[0].data.images[0]])
    await history(editor,before,after)
  })
}
test('Image Delete keeps the block and provides one native Undo/Redo',async()=>{
  const editor=pluginEditor('Image')
  const before=editor.save().blocks
  editor.blocks.focus('a',{offset:2})
  const button=blockElement(editor,'a').querySelector('button[aria-label="Delete"]')
  await clickNative(button)
  const after=editor.save().blocks
  equal(after.map(block=>[block.id,block.type,block.data.file.url]),[['a','image','']])
  await history(editor,before,after)
})
test('Poll local vote changes results once and supports native history after choosing an option',async()=>{
  const editor=pluginEditor('Poll')
  const before=editor.save().blocks
  editor.blocks.focus('a',{fieldKey:'question',offset:2})
  await clickNative(blockElement(editor,'a').querySelector('.oe-poll__choice'))
  equal(editor.save().blocks,before,'Selecting a vote mutated author data')
  equal(editor.canUndo,false)
  await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
  const after=editor.save().blocks
  equal(after[0].data.initialResults.total,1)
  equal(after[0].data.initialResults.currentUserVote,['first'])
  equal(after[0].data.initialResults.options.find(option=>option.id==='first').votes,1)
  equal(blockElement(editor,'a').querySelector('.oe-poll__result-pct').textContent,'100%')
  await history(editor,before,after)
})
test('Gallery filled Settings exposes visual layout selectors and one native Undo/Redo', async () => {
  const editor=pluginEditor('Gallery')
  const before=editor.save().blocks
  editor.blocks.focus('a',{fieldKey:'image:first:caption',offset:2})
  const settings=blockElement(editor,'a').querySelector('.oe-gallery__dropdown > button')
  assert(settings,'Filled Gallery lost its inline Settings dropdown')
  await clickNative(settings)
  equal(settings.getAttribute('aria-expanded'),'true')
  const panel=blockElement(editor,'a').querySelector('.oe-gallery__dropdown-panel')
  const buttons=[...panel.querySelectorAll('.oe-gallery__layout-btn')]
  equal(buttons.length,21)
  for(const button of buttons){
    assert(button.querySelector('svg'),'Layout has no visual selector')
    assert(button.getAttribute('aria-label'),'Layout has no accessible label')
  }
  await clickNative(buttons.find(button=>button.dataset.layout==='3b'))
  const after=editor.save().blocks
  equal(after[0].data,{...before[0].data,layout:'3b'})
  assert(blockElement(editor,'a').querySelector('.oe-gallery__grid.eg--3b'),'Layout changed only in JSON')
  await history(editor,before,after)
})
for(const action of ['type','results','sort','reset']){
  test(`Poll inline ${action} action matches v1 and retains one native Undo/Redo`,async()=>{
    const editor=pluginEditor('Poll',{question:'Question',type:'single',resultsMode:'always',options:[{id:'first',text:'Zulu'},{id:'second',text:'Alpha'}]})
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:'question',offset:2})
    const button=blockElement(editor,'a').querySelector(`[data-poll-action="${action}"]`)
    assert(button,'Poll lost its inline '+action+' action')
    await clickNative(button)
    const after=editor.save().blocks
    if(action==='type')equal(after[0].data,{...before[0].data,type:'multiple'})
    if(action==='results')equal(after[0].data,{...before[0].data,resultsMode:'afterVote'})
    if(action==='sort')equal(after[0].data,{...before[0].data,options:[before[0].data.options[1],before[0].data.options[0]]})
    if(action==='reset'){
      equal(after[0].id,'a')
      equal(after[0].data,pluginParityFixtures.find(fixture=>fixture.name==='Poll').factory().schema.createDefault())
    }
    await history(editor,before,after)
  })
}
test('Poll runtime reset aborts a pending remote vote and rejects its late results',async()=>{
  let finish,signal
  const definition=createPollPlugin({dataSource:{
    load:async()=>({total:0,options:[{id:'first',votes:0},{id:'second',votes:0}]}),
    vote:context=>{signal=context.signal;return new Promise(resolve=>{finish=resolve})},
  }})
  const editor=make([{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),pollId:'remote',question:'Question',options:[{id:'first',text:'Alpha'},{id:'second',text:'Bravo'}]}}],{plugins:[createParagraphPlugin(),definition]})
  await pause(80)
  await clickNative(blockElement(editor,'a').querySelector('.oe-poll__choice'))
  await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
  assert(finish,'Remote vote was not submitted')
  await clickNative(blockElement(editor,'a').querySelector('[data-poll-action="reset"]'))
  assert(signal.aborted,'Reset left the previous poll vote alive')
  finish({total:1,options:[{id:'first',votes:1},{id:'second',votes:0}],currentUserVote:['first']})
  await pause(60)
  equal(editor.save().blocks[0].data,definition.schema.createDefault())
  assert(!blockElement(editor,'a').querySelector('.oe-poll__status'),'Reset retained an old loading/submitting state')
  equal([...blockElement(editor,'a').querySelectorAll('.oe-poll__result-pct')].map(node=>node.textContent),['0%','0%'])
})
test('Poll runtime changing multiple choice to single corrects the previous local ballot',async()=>{
  const editor=pluginEditor('Poll',{question:'Question',type:'multiple',resultsMode:'always',options:[{id:'first',text:'Alpha'},{id:'second',text:'Bravo'}]})
  for(const id of ['first','second'])await clickNative(blockElement(editor,'a').querySelector(`.oe-poll__choice[data-option-id="${id}"]`))
  await clickNative(blockElement(editor,'a').querySelector('.oe-poll__submit'))
  const before=editor.save().blocks
  equal(before[0].data.initialResults.currentUserVote,['first','second'])
  await clickNative(blockElement(editor,'a').querySelector('[data-poll-action="type"]'))
  const after=editor.save().blocks
  equal(after[0].data.type,'single')
  equal(after[0].data.initialResults.currentUserVote,['first'])
  equal(after[0].data.initialResults.options.map(option=>option.votes),[1,0],'Old multiple-choice vote was still counted in the single-choice poll')
  equal(after[0].data.initialResults.total,1)
  await dispatchKey('z','KeyZ',90,2)
  equal(editor.save().blocks,before)
  await dispatchKey('z','KeyZ',90,2|8)
  equal(editor.save().blocks,after)
})
test('Carousel navigation and thumbnails use styled controls and preserve author data',async()=>{
  const editor=pluginEditor('Carousel',{slides:[{id:'first',type:'image',src:pixel,caption:'Alpha'},{id:'second',type:'image',src:pixel,caption:'Bravo'}],options:{loop:false,autoplay:false,navigation:true,pagination:true,thumbnails:true}})
  const before=editor.save().blocks
  const shell=blockElement(editor,'a')
  const previous=shell.querySelector('.oe-carousel-block__nav--prev'),next=shell.querySelector('.oe-carousel-block__nav--next')
  assert(previous.getBoundingClientRect().left<next.getBoundingClientRect().left,'Previous and Next controls lost their left/right placement')
  assert(previous.getBoundingClientRect().left-shell.querySelector('.oe-carousel-block__stage').getBoundingClientRect().left<24,'Previous control is not anchored to the left edge')
  equal(previous.disabled,true)
  equal(next.disabled,false)
  const thumbnails=[...shell.querySelectorAll('.oe-carousel-block__thumbnail')]
  equal(thumbnails.length,2,'Carousel displayed plain numbers instead of styled thumbnails')
  assert(thumbnails[0].querySelector('img'),'Image thumbnail is missing')
  equal(thumbnails[0].getAttribute('aria-current'),'true')
  await clickNative(thumbnails[1])
  equal(shell.querySelector('.oe-carousel-block__caption').textContent,'Bravo')
  equal(shell.querySelectorAll('.oe-carousel-block__thumbnail')[1].getAttribute('aria-current'),'true')
  equal(editor.save().blocks,before)
  equal(editor.canUndo,false)
  editor.setReadOnly(true)
  await clickNative(shell.querySelectorAll('.oe-carousel-block__thumbnail')[0])
  equal(shell.querySelector('.oe-carousel-block__caption').textContent,'Alpha')
  equal(editor.save().blocks,before)
})
test('Person native tab drag reorders cards with all fields and one keyboard Undo/Redo',async()=>{
  const persons=['Alpha','Bravo','Charlie'].map((name,index)=>({id:String(index),avatar:'',name,role:'Role '+name,bio:'Bio '+name,links:[]}))
  const editor=pluginEditor('Person',{persons})
  const before=editor.save().blocks
  editor.blocks.focus('a',{fieldKey:'person:0:name',offset:2})
  const tabs=blockElement(editor,'a').querySelectorAll('.oe-person__tab:not(.oe-person__tab--add)')
  let styledStart=false,styledTarget=false
  tabs[0].addEventListener('dragstart',()=>{styledStart=tabs[0].classList.contains('oe-person__tab--dragging')},{once:true})
  tabs[2].addEventListener('dragover',()=>{styledTarget=tabs[2].classList.contains('oe-person__tab--dragover')})
  const from=tabs[0].getBoundingClientRect(),to=tabs[2].getBoundingClientRect()
  await window.__testInput('Input.drag',{from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+to.height/2}})
  await pause(40)
  const after=editor.save().blocks
  assert(styledStart&&styledTarget,'Person tab drag lost its visible source and target feedback')
  equal(after[0].data.persons,[persons[1],persons[2],persons[0]])
  await history(editor,before,after)
})
function comparisonData(value){
  if(Array.isArray(value))return value.map(comparisonData)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='id').map(([key,item])=>[key,comparisonData(item)]))
  return value
}
for(const fixture of pluginParityFixtures){
  for(const action of ['Move up','Move down','Duplicate','Delete']){
    test(`${fixture.name} block menu ${action} keeps data, order and one native Undo/Redo`,async()=>{
      const definition=fixture.factory()
      const editor=make([para('lead','Before'),{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:{...definition.schema.createDefault(),...fixture.data}},para('trail','After')],{
        plugins:[createParagraphPlugin(),... (definition.type==='paragraph'?[]:[definition])],
      })
      const before=editor.save().blocks
      await chooseSetting(editor,action)
      const after=editor.save().blocks
      if(action==='Move up')equal(after,[before[1],before[0],before[2]])
      else if(action==='Move down')equal(after,[before[0],before[2],before[1]])
      else if(action==='Delete')equal(after,[before[0],before[2]])
      else{
        equal(after.length,4)
        equal([after[0],after[1],after[3]],before)
        equal(after[2].type,definition.type)
        equal(comparisonData(after[2].data),comparisonData(before[1].data),'Duplicate changed author content or plugin settings')
        assert(after[2].id!=='a','Duplicate reused the source block ID')
      }
      await history(editor,before,after)
    })
  }
}
for(const confirming of [false,true]){
  test(`Person avatar crop ${confirming?'Apply':'Cancel'} through real dialog controls preserves author data and history`,async()=>{
    let uploaded=null
    const definition=createPersonPlugin({uploadFile:async file=>{uploaded=file;return {url:pixel}}})
    const editor=make([{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:{persons:[{id:'first',avatar:'',name:'Alpha',role:'Bravo',bio:'Charlie',links:[]}]}}],{plugins:[createParagraphPlugin(),definition]})
    const before=editor.save().blocks
    editor.blocks.focus('a',{fieldKey:'person:first:name',offset:2})
    let picker
    const original=HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click=function(){if(this.type==='file')picker=this;else original.call(this)}
    try{await clickNative(blockElement(editor,'a').querySelector('.oe-person__avatar-upload'))}
    finally{HTMLInputElement.prototype.click=original}
    assert(picker,'Avatar button did not open its file picker')
    const transfer=new DataTransfer()
    transfer.items.add(new File([await (await fetch(pixel)).blob()],'avatar.png',{type:'image/png'}))
    picker.files=transfer.files
    picker.dispatchEvent(new Event('change',{bubbles:true}))
    const deadline=performance.now()+2500
    while(!document.querySelector('.oe-cropper-btn--confirm')&&!document.querySelector('.oe-cropper-btn--cancel')&&performance.now()<deadline)await pause(20)
    const button=document.querySelector(confirming?'.oe-cropper-btn--confirm':'.oe-cropper-btn--cancel')
    assert(button,'Cropper dialog was not opened')
    await pause(150)
    await clickNative(button)
    while(confirming&&!uploaded&&performance.now()<deadline)await pause(20)
    equal(document.querySelectorAll('.oe-cropper-overlay').length,0,'Crop dialog remained open after its completed action')
    if(confirming){
      assert(uploaded&&uploaded.type==='image/webp'&&uploaded.size>0,'Crop did not produce an actual image for upload')
      const after=editor.save().blocks
      equal(after[0].data.persons,[{...before[0].data.persons[0],avatar:pixel}])
      await history(editor,before,after)
    }else{
      equal(uploaded,null)
      equal(editor.save().blocks,before)
      equal(editor.canUndo,false)
    }
  })
}
await run()
