import test from 'node:test'
import assert from 'node:assert/strict'
import {createChecklistPlugin} from './index.js'
const slice=createChecklistPlugin().capabilities.clipboard.slice
test('fully selected Checklist item leaves no mark-only ghost while unchecked/checked siblings retain IDs',()=>{
 const data=Object.freeze({items:Object.freeze([Object.freeze({id:'a',text:'<i></i>',checked:true}),Object.freeze({id:'b',text:'<b>Alpha</b> {{color}}',checked:false}),Object.freeze({id:'c',text:'<s></s>',checked:true})])})
 const result=slice(data,{field:key=>key==='item:b'?{fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b> {{color}}',after:'',whole:true}:null,createId(){throw Error('Empty unselected siblings retain IDs')}})
 assert.deepEqual(result,{parts:[{kind:'local-block',data:{items:[{id:'b',text:'<b>Alpha</b> {{color}}',checked:false}]}}],remaining:{items:[{id:'a',text:'<i></i>',checked:true},{id:'c',text:'<s></s>',checked:true}]},focus:null})
 assert.equal(data.items.length,3)
})
test('partly selected Checklist item retains its authored break and checked state without DOM parsing',()=>{
 const result=slice({items:[{id:'b',text:'<b>Alpha</b><br>',checked:true}]},{field:key=>({fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b>',after:'<br>',whole:false}),createId(){throw Error('Unselected break remains')}})
 assert.deepEqual(result.remaining,{items:[{id:'b',text:'<b></b><br>',checked:true}]})
})
test('whole sole Checklist item Cut creates exactly one unchecked empty editing item',()=>{
 const ids=[],result=slice({items:[{id:'b',text:'<b>Alpha</b>',checked:true}]},{field:key=>({fieldKey:key,before:'<b></b>',selected:'<b>Alpha</b>',after:'',whole:true}),createId(prefix){ids.push(prefix);return'replacement'}})
 assert.deepEqual(result.remaining,{items:[{id:'replacement',text:'',checked:false}]});assert.deepEqual(ids,['item'])
})
