import test from 'node:test'
import assert from 'node:assert/strict'
const { createMentionPlugin } = await import(process.env.RECTOR_MENTION_ENTRY ?? './mention/index.js')

test('Mention captures the trigger accessor once before validation and ownership',()=>{
 let reads=0
 const options={get trigger(){if(++reads>1)throw new Error('Trigger accessor reread');return '#'}}
 const definition=createMentionPlugin(options)
 assert.equal(definition.trigger,'#')
 assert.equal(reads,1)
 assert.equal(Object.isFrozen(options),false)
})

test('Mention ignores inherited trigger configuration without evaluating it',()=>{
 let reads=0
 const options=Object.create({get trigger(){reads++;throw new Error('Inherited trigger evaluated')}})
 assert.equal(createMentionPlugin(options).trigger,'@')
 assert.equal(reads,0)
})
test('Mention captures all own option accessors once and retains its chosen Unicode trigger',()=>{
 const reads={trigger:0,debounceDelay:0,searchFunction:0}
 const options={
  get trigger(){reads.trigger++;return '🦊'},
  get debounceDelay(){reads.debounceDelay++;return 0},
  get searchFunction(){reads.searchFunction++;return async()=>[]},
 }
 const definition=createMentionPlugin(options)
 assert.equal(definition.trigger,'🦊')
 assert.deepEqual(reads,{trigger:1,debounceDelay:1,searchFunction:1})
 Object.defineProperty(options,'trigger',{value:'#'})
 assert.equal(definition.trigger,'🦊')
})
test('Mention rejects a captured multi-codepoint trigger',()=>{
 let reads=0
 assert.throws(()=>createMentionPlugin({get trigger(){reads++;return '@@'}}),/exactly one Unicode code point/)
 assert.equal(reads,1)
})
