import test from 'node:test'
import assert from 'node:assert/strict'
import {createItemSelectionSlice} from './itemSelectionSlice.js'

test('Enter across item fields retains endpoint IDs, style, checks and untouched siblings',()=>{
  const data=Object.freeze({style:'ordered',items:Object.freeze([
    Object.freeze({id:'before',text:'Before',checked:true}),
    Object.freeze({id:'left',text:'<i>First</i>',checked:false}),
    Object.freeze({id:'middle',text:'Removed',checked:true}),
    Object.freeze({id:'right',text:'<b>Alpha</b> {{color}}',checked:true}),
    Object.freeze({id:'after',text:'After',checked:false}),
  ])})
  const calls=[],result=createItemSelectionSlice().split(data,
    {fieldKey:'item:left',offset:2},{fieldKey:'item:right',offset:4},{
      createId(){throw Error('Unselected endpoints already have stable identities')},
      sliceField(key,range){calls.push([key,range]);return key==='item:left'
        ?{before:'<i>Fi</i>',selected:'<i>rst</i>',after:''}
        :{before:'',selected:'<b>Alph</b>',after:'<b>a</b> {{color}}'}
      }
    })
  assert.deepEqual(result,{data:{style:'ordered',items:[
    {id:'before',text:'Before',checked:true},
    {id:'left',text:'<i>Fi</i>',checked:false},
    {id:'right',text:'<b>a</b> {{color}}',checked:true},
    {id:'after',text:'After',checked:false},
  ]},focus:{fieldKey:'item:right',offset:0}})
  assert.deepEqual(calls,[['item:left',{start:2,end:Number.MAX_SAFE_INTEGER}],['item:right',{start:0,end:4}]])
  assert.equal(data.items.length,5)
  assert.equal(data.items[1].text,'<i>First</i>')
  assert.equal(data.items[3].text,'<b>Alpha</b> {{color}}')
})

test('cross-item Enter retains empty endpoints as the authored new line',()=>{
  const result=createItemSelectionSlice().split({items:[{id:'a',text:'A'},{id:'b',text:'B'}]},
    {fieldKey:'item:a',offset:0},{fieldKey:'item:b',offset:1},{
      sliceField:()=>({before:'',selected:'selected',after:''}),createId(){throw Error('No allocation')},
    })
  assert.deepEqual(result,{data:{items:[{id:'a',text:''},{id:'b',text:''}]},focus:{fieldKey:'item:b',offset:0}})
})

test('item split declines same-field, reversed, missing and unsliceable boundaries',()=>{
  const capability=createItemSelectionSlice(),data={items:[{id:'a',text:'A'},{id:'b',text:'B'}]},context={sliceField:()=>null,createId(){throw Error('No allocation')}}
  for(const[start,end]of[['a','a'],['b','a'],['missing','b'],['a','b']]){
    assert.equal(capability.split(data,{fieldKey:'item:'+start,offset:0},{fieldKey:'item:'+end,offset:1},context),null)
  }
})
