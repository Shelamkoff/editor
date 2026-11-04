import test from 'node:test'
import assert from 'node:assert/strict'
import {createListPlugin} from './index.js'
const slice=createListPlugin().capabilities.clipboard.slice

test('fully selected List item is removed despite empty mark wrappers, retaining unselected empty IDs',()=>{
 const data=Object.freeze({style:'ordered',items:Object.freeze([
  Object.freeze({id:'a',text:'<i></i>'}),Object.freeze({id:'b',text:'<b>Alpha</b> {{color}}'}),Object.freeze({id:'c',text:'<s></s>'}),
 ])}),result=slice(data,{field:key=>key==='item:b'?{fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b> {{color}}',after:'',whole:true}:null,createId(){throw Error('Existing empty siblings retain their IDs')}})
 assert.deepEqual(result,{parts:[{kind:'local-block',data:{style:'ordered',items:[{id:'b',text:'<b>Alpha</b> {{color}}'}]}}],remaining:{style:'ordered',items:[{id:'a',text:'<i></i>'},{id:'c',text:'<s></s>'}]},focus:null})
 assert.equal(data.items[1].text,'<b>Alpha</b> {{color}}')
})

test('partly selected List item retains its authored break and ID without requiring DOM parsing',()=>{
 const result=slice({style:'unordered',items:[{id:'b',text:'<b>Alpha</b><br>'}]},{field:key=>({fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b>',after:'<br>',whole:false}),createId(){throw Error('An unselected authored break remains')}})
 assert.deepEqual(result.remaining,{style:'unordered',items:[{id:'b',text:'<b></b><br>'}]})
})

test('whole sole item Cut retains exactly one fresh empty editing item',()=>{
 const allocated=[],result=slice({style:'ordered',items:[{id:'b',text:'<b>Alpha</b>'}]},{field:key=>({fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b>',after:'',whole:true}),createId(prefix){allocated.push(prefix);return'replacement'}})
 assert.deepEqual(result.remaining,{style:'ordered',items:[{id:'replacement',text:''}]})
 assert.deepEqual(allocated,['item'])
})
