// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { getRichTextLogicalLength, replaceRichTextRange, sliceRichTextRange } from '../shared/richTextOperations.js'
import { canonicalRecordsEqual } from './CanonicalTransforms.js'
import { mapRichTextFields } from './projectionFields.js'
const cloneInline = value => value === undefined ? undefined : cloneEditorData(value)
/** @typedef {import('./CanonicalTransforms.js').CanonicalEdit} CanonicalEdit */
/** @returns {CanonicalEdit[]} */
export const updatedRecord = (id,current,next) => canonicalRecordsEqual(current,next) ? [] : [{kind:'update',id,record:next}]

export function validateTextReplacement(replacement) {
  if(!replacement||typeof replacement!=='object'||Array.isArray(replacement)
    ||!(replacement.kind==='text'&&typeof replacement.text==='string'||replacement.kind==='html'&&typeof replacement.html==='string')){
    throw new TypeError('Rich-text replacement must contain text or html')
  }
  return replacement
}

/** The shared interpretation of field order and slices for clipboard/conversion. */
export function sliceLogicalFields(s,record,start,end) {
  const definition=s.getBlockDefinition(record.type)
  const inline=cloneInline(record.inline)??{}
  const fields=richTextFields(s,definition,record.data,inline)
  const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
  const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
  if(startIndex<0||endIndex<startIndex)return null
  const selected=new Map()
  for(let index=startIndex;index<=endIndex;index++){
    const field=fields[index]
    const from=index===startIndex?Math.max(0,Math.min(field.length,start.offset)):0
    const to=index===endIndex?Math.max(from,Math.min(field.length,end.offset)):field.length
    const slice=sliceRichTextRange(field.html,inline,{start:from,end:to},s.ownerDocument)
    selected.set(field.key,Object.freeze({fieldKey:field.key,...slice,whole:from===0&&to===field.length}))
  }
  return {definition,inline,fields,selected}
}

/** Resolve focus against the final normalized record, before applying edits. */
export function logicalPoint(s,record,fieldKey,offset) {
  const fields=richTextFields(s,s.getBlockDefinition(record.type),record.data,record.inline??{})
  const field=fields.find(field=>field.key===fieldKey)
  if(!field)throw new Error('Prepared edit has no surviving rich-text field')
  return {blockId:record.id,fieldKey,offset:Math.max(0,Math.min(field.length,Math.trunc(offset)||0))}
}
export function replaceBlockRichTextRange(s,record,start,end,replacement) {
  const definition=s.getBlockDefinition(record.type)
  if(!definition?.schema?.mapRichText)return null
  const inline=cloneInline(record.inline)??{}
  const fields=richTextFields(s,definition,record.data,inline)
  const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
  const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
  if(startIndex<0||endIndex<startIndex)return null
  const nextData=definition.schema.mapRichText(
    cloneEditorData(record.data),
    (html,key)=>{
      const index=fields.findIndex(field=>field.key===key)
      if(index<startIndex||index>endIndex)return html
      if(startIndex===endIndex){
        return replaceRichTextRange(
          html,inline,{start:start.offset,end:end.offset},replacement,s.ownerDocument,
        )
      }
      if(index===startIndex){
        return replaceRichTextRange(
          html,inline,{start:start.offset,end:Number.MAX_SAFE_INTEGER},replacement,s.ownerDocument,
        )
      }
      if(index===endIndex){
        return replaceRichTextRange(
          html,inline,{start:0,end:end.offset},{kind:'text',text:''},s.ownerDocument,
        )
      }
      return replaceRichTextRange(
        html,inline,{start:0,end:Number.MAX_SAFE_INTEGER},{kind:'text',text:''},s.ownerDocument,
      )
    },
  )
  return s.recordFromData(
    record.id,record.type,definition,nextData,record.tunes,inline,
  )

}

export function richTextFields(s,definition,data,inline) {
  const fields=[]
  if(typeof definition?.schema?.mapRichText!=='function')return fields
  mapRichTextFields(definition,cloneEditorData(data),(html,key)=>{
    fields.push({
      key,
      html,
      length:getRichTextLogicalLength(html,inline,s.ownerDocument),
    })
    return html
  })
  return fields

}

export function sliceSelection(s,record,start,end) {
  const slice=sliceLogicalFields(s,record,start,end)
  if(!slice)return null
  const {definition,inline,fields}=slice

  const sliceField=(fieldKey,range)=>{
    const field=fields.find(item=>item.key===fieldKey)
    if(!field)return null
    return sliceRichTextRange(field.html,inline,range,s.ownerDocument)
  }

  const capability=definition.capabilities?.selectionSlice
  if(capability?.slice){
    const result=capability.slice(
      cloneEditorData(record.data),
      {fieldKey:start.fieldKey,offset:start.offset},
      {fieldKey:end.fieldKey,offset:end.offset},
      {
        createId:prefix=>s.allocateId(prefix),
        sliceField,
      },
    )
    if(!result)return null
    return {
      definition,
      inline,
      before:result.before,
      selected:result.selected,
      after:result.after,
    }
  }

  if(fields.length!==1||start.fieldKey!==fields[0].key||end.fieldKey!==fields[0].key)return null
  const field=fields[0]
  const from=Math.max(0,Math.min(start.offset,field.length))
  const to=Math.max(from,Math.min(end.offset,field.length))
  if(to<=from)return null
  const sliced=slice.selected.get(field.key)
  const withField=html=>definition.schema.mapRichText(
    cloneEditorData(record.data),
    (value,key)=>key===field.key?html:value,
  )
  return {
    definition,
    inline,
    before:from>0?withField(sliced.before):null,
    selected:{kind:/** @type {'rich-text'} */('rich-text'),data:{text:sliced.selected}},
    after:to<field.length?withField(sliced.after):null,
  }

}

export function endpointSelection(s,record,point,side) {
  const definition=s.getBlockDefinition(record.type)
  if(!definition?.schema?.mapRichText)return null
  const inline=cloneInline(record.inline)??{}
  const fields=richTextFields(s,definition,record.data,inline)
  if(!fields.length)return null
  if(side==='first'){
    const last=fields[fields.length-1]
    return sliceSelection(s,record,point,{fieldKey:last.key,offset:last.length})
  }
  const first=fields[0]
  return sliceSelection(s,record,{fieldKey:first.key,offset:0},point)

}

export function splitClipboardResiduals(s,record,start,end) {
  const definition=s.getBlockDefinition(record.type)
  if(!definition?.schema?.mapRichText)return null
  const inline=cloneInline(record.inline)??{}
  const fields=richTextFields(s,definition,record.data,inline)
  const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
  const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
  if(startIndex<0||endIndex<startIndex)return null

  const beforeData=definition.schema.mapRichText(cloneEditorData(record.data),(html,key)=>{
    const index=fields.findIndex(field=>field.key===key)
    if(index<startIndex)return html
    if(index>startIndex)return ''
    return sliceRichTextRange(
      html,inline,{start:0,end:start.offset},s.ownerDocument,
    ).selected
  })
  const afterData=definition.schema.mapRichText(cloneEditorData(record.data),(html,key)=>{
    const index=fields.findIndex(field=>field.key===key)
    if(index>endIndex)return html
    if(index<endIndex)return ''
    return sliceRichTextRange(
      html,inline,{start:end.offset,end:Number.MAX_SAFE_INTEGER},s.ownerDocument,
    ).selected
  })
  return {
    before:s.recordFromData(
      record.id,record.type,definition,beforeData,record.tunes,inline,
    ),
    after:s.recordFromData(
      record.id,record.type,definition,afterData,record.tunes,inline,
    ),
  }

}

export function orderedLogicalRange(s,view,bookmark) {
 const anchor=bookmark?.anchor, focus=bookmark?.focus
 if(!anchor||!focus)return null
 const a=view.ids.indexOf(anchor.blockId),b=view.ids.indexOf(focus.blockId)
 if(a<0||b<0)return null
 const point=(raw)=>{
  const record=view.peek(raw.blockId)
  const fields=richTextFields(s,s.getBlockDefinition(record.type),record.data,record.inline??{})
  const field=fields.findIndex(item=>item.key===raw.fieldKey)
  if(field<0)return null
  return {blockId:raw.blockId,fieldKey:raw.fieldKey,offset:Math.max(0,Math.min(fields[field].length,Math.trunc(raw.offset)||0)),field}
 }
 const left=point(anchor),right=point(focus)
 if(!left||!right)return null
 const forward=(a-b||left.field-right.field||left.offset-right.offset)<=0
 const clean=p=>({blockId:p.blockId,fieldKey:p.fieldKey,offset:p.offset})
 return {start:clean(forward?left:right),end:clean(forward?right:left)}
}

export function prepareReplaceLogicalRange(s,view,bookmark,replacement) {
  validateTextReplacement(replacement)
  const ordered = orderedLogicalRange(s,view,bookmark)
  if (!ordered) return {edits:[],result:false}
  const { start, end } = ordered
  const ids = view.ids
  const startIndex = ids.indexOf(start.blockId)
  const endIndex = ids.indexOf(end.blockId)
  if (startIndex < 0 || endIndex < startIndex) return {edits:[],result:false}

  const startCurrent = view.peek(start.blockId)
  const endCurrent = view.peek(end.blockId)
  if (!startCurrent || !endCurrent) return {edits:[],result:false}
  if (
    !s.getBlockDefinition(view.peek(start.blockId)?.type)
    || !s.getBlockDefinition(view.peek(end.blockId)?.type)
  ) return {edits:[],result:false}

  const caretOffset = start.offset + (replacement.kind === 'text'
    ? replacement.text.length
    : getRichTextLogicalLength(replacement.html, {}, s.ownerDocument))

  if (start.blockId === end.blockId) {
    const next = replaceBlockRichTextRange(s,
      startCurrent,start,end,replacement,
    )
    if (!next) return {edits:[],result:false}
    return {edits:updatedRecord(start.blockId,startCurrent,next),result:logicalPoint(s,next,start.fieldKey,caretOffset)}
  }

  const startDefinition = s.getBlockDefinition(startCurrent.type)
  const endDefinition = s.getBlockDefinition(endCurrent.type)
  const startFields = richTextFields(s,
    startDefinition,startCurrent.data,cloneInline(startCurrent.inline)??{},
  )
  const endFields = richTextFields(s,
    endDefinition,endCurrent.data,cloneInline(endCurrent.inline)??{},
  )
  if (!startFields.length || !endFields.length) return {edits:[],result:false}

  const lastStartField = startFields[startFields.length - 1]
  const firstEndField = endFields[0]
  const startNext = replaceBlockRichTextRange(s,
    startCurrent,
    start,
    { blockId:start.blockId, fieldKey:lastStartField.key, offset:lastStartField.length },
    replacement,
  )
  const endNext = replaceBlockRichTextRange(s,
    endCurrent,
    { blockId:end.blockId, fieldKey:firstEndField.key, offset:0 },
    end,
    { kind:'text', text:'' },
  )
  if (!startNext || !endNext) return {edits:[],result:false}

  let merged = null
  if (startNext.type === endNext.type) {
    const merge = startDefinition?.capabilities?.merge?.merge
    if (typeof merge === 'function') {
      const prepared = s.prepareInlineMerge(startDefinition, startNext, endNext)
      const mergedData = merge(prepared.targetData, prepared.sourceData)
      merged = s.recordFromData(
        startNext.id,
        startNext.type,
        startDefinition,
        mergedData,
        startNext.tunes,
        prepared.inline,
      )
    }
  }

  const edits=updatedRecord(start.blockId,startCurrent,merged??startNext)
  for(let index=startIndex+1;index<endIndex;index++)edits.push({kind:'remove',id:ids[index]})
  if(merged)edits.push({kind:'remove',id:end.blockId})
  else edits.push(...updatedRecord(end.blockId,endCurrent,endNext))
  return {edits,result:logicalPoint(s,merged??startNext,start.fieldKey,caretOffset)}

}

export function prepareRemoveBlocks(s,view,blockIds) {
 if(!Array.isArray(blockIds))throw new TypeError('removeBlocks() requires an array of block ids')
 const requested=new Set(blockIds),removals=view.ids.filter(id=>requested.has(id))
 if(!removals.length)return {edits:[],result:false}
 const index=view.ids.indexOf(removals[0]),survivors=view.ids.filter(id=>!requested.has(id))
 /** @type {CanonicalEdit[]} */
 const edits=removals.map(id=>({kind:'remove',id}))
 let target=survivors[Math.min(index,survivors.length-1)]
 if(!survivors.length){
  const type=s.defaultBlockType,definition=s.getBlockDefinition(type)
  const record=s.recordFromData(s.allocateId(type,new Set(view.ids)),type,definition,definition.schema.createDefault(),undefined,undefined)
  edits.push({kind:'insert',index:0,record});target=record.id
 }
 return {edits,result:target}
}

export function prepareReplaceWholeDocument(s,view,replacement,blockIds) {
  validateTextReplacement(replacement)
  const selected = new Set(blockIds??view.ids)
  const ids = view.ids.filter(id => selected.has(id))
  if (!ids.length) return {edits:[],result:false}
  const index = view.ids.indexOf(ids[0])
  const type = s.defaultBlockType
  const definition = s.getBlockDefinition(type)
  if (!definition?.schema?.mapRichText) return {edits:[],result:false}
  let fieldKey = null
  const data = definition.schema.mapRichText(definition.schema.createDefault(), (html, key) => {
    if (fieldKey !== null) return html
    fieldKey = key
    return replaceRichTextRange('', {}, { start: 0, end: 0 }, replacement, s.ownerDocument)
  })
  if (fieldKey === null) return {edits:[],result:false}
  const blockId = s.allocateId(type,new Set(view.ids))
  const record = s.recordFromData(blockId, type, definition, data, undefined, undefined)
  const edits=[...ids.map(id=>({kind:'remove',id})),{kind:'insert',index,record}]
  return {edits,result:logicalPoint(s,record,fieldKey,replacement.kind==='text'?replacement.text.length:getRichTextLogicalLength(replacement.html,{},s.ownerDocument))}

}
