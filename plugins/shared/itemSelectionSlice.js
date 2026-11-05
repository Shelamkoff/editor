// @ts-check
/** Slice rich item fields while preserving checked/style settings and item identities.
 * @returns {import('../../plugin-kit/types').SelectionSliceCapability<any>}
 */
export function createItemSelectionSlice(){
  return Object.freeze({
    split(data,start,end,context){
      const first=data.items.findIndex(item=>`item:${item.id}`===start.fieldKey)
      const last=data.items.findIndex(item=>`item:${item.id}`===end.fieldKey)
      if(first<0||last<=first)return null
      const before=context.sliceField(start.fieldKey,{start:start.offset,end:Number.MAX_SAFE_INTEGER})
      const after=context.sliceField(end.fieldKey,{start:0,end:end.offset})
      if(!before||!after)return null
      return {
        data:{...data,items:[
          ...data.items.slice(0,first).map(item=>({...item})),
          {...data.items[first],text:before.before},
          {...data.items[last],text:after.after},
          ...data.items.slice(last+1).map(item=>({...item})),
        ]},
        focus:{fieldKey:end.fieldKey,offset:0},
      }
    },
    slice(data,start,end,context){
      const startId=start.fieldKey.startsWith('item:')?start.fieldKey.slice(5):''
      const endId=end.fieldKey.startsWith('item:')?end.fieldKey.slice(5):''
      const startIndex=data.items.findIndex(item=>item.id===startId)
      const endIndex=data.items.findIndex(item=>item.id===endId)
      if(startIndex<0||endIndex<startIndex)return null

      const beforeItems=data.items.slice(0,startIndex).map(item=>({...item}))
      const afterItems=data.items.slice(endIndex+1).map(item=>({...item}))
      const selected=[]

      if(startIndex===endIndex){
        const slice=context.sliceField(start.fieldKey,{start:start.offset,end:end.offset})
        if(!slice)return null
        const hasBefore=Boolean(slice.before)&&start.offset>0
        const hasAfter=Boolean(slice.after)&&(slice.length===undefined||end.offset<slice.length)
        if(hasBefore)beforeItems.push({...data.items[startIndex],text:slice.before})
        if(slice.selected)selected.push(slice.selected)
        if(hasAfter)afterItems.unshift({
          ...data.items[startIndex],
          id:hasBefore?context.createId('item'):data.items[startIndex].id,
          text:slice.after,
        })
      }else{
        const first=context.sliceField(start.fieldKey,{start:start.offset,end:Number.MAX_SAFE_INTEGER})
        const last=context.sliceField(end.fieldKey,{start:0,end:end.offset})
        if(!first||!last)return null
        if(first.before&&start.offset>0)beforeItems.push({...data.items[startIndex],text:first.before})
        if(first.selected)selected.push(first.selected)
        for(let index=startIndex+1;index<endIndex;index++)selected.push(data.items[index].text)
        if(last.selected)selected.push(last.selected)
        if(last.after&&(last.length===undefined||end.offset<last.length))afterItems.unshift({...data.items[endIndex],text:last.after})
      }

      if(selected.length===0)return null
      return {
        before:beforeItems.length?{...data,items:beforeItems}:null,
        selected:{kind:'rich-text',data:{text:selected.join('<br>'),...(data.style===undefined?{}:{style:data.style})}},
        after:afterItems.length?{...data,items:afterItems}:null,
      }
    },
  })
}
