import test from 'node:test'
import assert from 'node:assert/strict'
import {createItemSelectionSlice} from './itemSelectionSlice.js'
const capability=createItemSelectionSlice(),point=(id,offset)=>({fieldKey:'item:'+id,offset})
test('whole marked item range has no synthetic prefix or suffix and keeps selected labels',()=>{
 const data=Object.freeze({style:'ordered',items:Object.freeze([Object.freeze({id:'a',text:'<b>First</b>',checked:true}),Object.freeze({id:'b',text:'<i>Tail</i>',checked:false})])})
 const result=capability.slice(data,point('a',0),point('b',4),{createId(){throw Error('Whole selection needs no extra item ID')},sliceField(key){return key==='item:a'?{before:'<b></b>',selected:'<b>First</b>',after:'',length:5}:{before:'',selected:'<i>Tail</i>',after:'<i></i>',length:4}}})
 assert.deepEqual(result,{before:null,selected:{kind:'rich-text',data:{text:'<b>First</b><br><i>Tail</i>',style:'ordered'}},after:null});assert.equal(data.items[0].text,'<b>First</b>')
})
test('selected marked prefix retains the original suffix item ID without a ghost prefix',()=>{
 const result=capability.slice({items:[{id:'a',text:'<b>First</b>',checked:true}]},point('a',0),point('a',2),{createId(){throw Error('The suffix retains its authored ID')},sliceField:()=>({before:'<b></b>',selected:'<b>Fi</b>',after:'<b>rst</b>',length:5})})
 assert.deepEqual(result,{before:null,selected:{kind:'rich-text',data:{text:'<b>Fi</b>'}},after:{items:[{id:'a',text:'<b>rst</b>',checked:true}]}})
})
test('an authored trailing break outside the selected range remains a real suffix',()=>{
 const result=capability.slice({items:[{id:'a',text:'<b>Text</b><br>',checked:false}]},point('a',0),point('a',4),{createId(){throw Error('The break keeps the original ID')},sliceField:()=>({before:'<b></b>',selected:'<b>Text</b>',after:'<br>',length:5})})
 assert.deepEqual(result.after,{items:[{id:'a',text:'<br>',checked:false}]});assert.equal(result.before,null)
})
test('whole marked middle selection retains unselected authored empty sibling IDs and checks',()=>{
 const data={items:[{id:'before',text:'<i></i>',checked:true},{id:'chosen',text:'<b>Text</b>',checked:false},{id:'after',text:'<s></s>',checked:true}]},result=capability.slice(data,point('chosen',0),point('chosen',4),{createId(){throw Error('No new IDs')},sliceField:()=>({before:'<b></b>',selected:'<b>Text</b>',after:'<b></b>',length:4})})
 assert.deepEqual(result.before,{items:[data.items[0]]});assert.deepEqual(result.after,{items:[data.items[2]]})
})
test('genuine partial marked endpoints preserve the prefix and allocate only the second suffix',()=>{
 const result=capability.slice({items:[{id:'a',text:'<b>Alpha</b>',checked:true}]},point('a',2),point('a',4),{createId:()=> 'fresh',sliceField:()=>({before:'<b>Al</b>',selected:'<b>ph</b>',after:'<b>a</b>',length:5})})
 assert.deepEqual(result.before,{items:[{id:'a',text:'<b>Al</b>',checked:true}]});assert.deepEqual(result.after,{items:[{id:'fresh',text:'<b>a</b>',checked:true}]})
})
