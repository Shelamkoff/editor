// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'
import { getRichTextLogicalLength, replaceRichTextRange, scanRichTextPlaceholders, splitRichTextRange } from '../shared/richTextOperations.js'
import { remapCanonicalFragment } from './CanonicalTransforms.js'
import { decodeCurrentBlock } from '../shared/DocumentSchema.js'
import { synchronousResult } from '../shared/synchronousResult.js'
import { richTextFields, orderedLogicalRange, replaceBlockRichTextRange, splitClipboardResiduals, sliceLogicalFields, logicalPoint, validateTextReplacement, updatedRecord } from './LogicalRangePlans.js'
const cloneInline = value => value === undefined ? undefined : cloneEditorData(value)

function focusAt(s,record,key,position) {
  const {fieldKey,offset}=logicalPoint(s,record,key,position)
  return {fieldKey,offset}
}

/** Compound owners retain their selection data through the same field slices. */
export function selectedSourceData(s,record,start,end) {
  const definition=s.getBlockDefinition(record.type)
  const fields=richTextFields(s,definition,record.data,record.inline??{})
  if(!fields.length)return null
  const first=start??{fieldKey:fields[0].key,offset:0}
  const last=end??{fieldKey:fields.at(-1).key,offset:fields.at(-1).length}
  if(definition.capabilities?.clipboard){
    const sliced=prepareClipboardBlockSlice(s,record,first,last)
    if(sliced?.parts.length===1&&sliced.parts[0].kind==='block')return sliced.parts[0].block.data
  }
  const slice=sliceLogicalFields(s,record,first,last)
  if(!slice)return null
  return definition.schema.mapRichText(cloneEditorData(record.data),(_html,key)=>slice.selected.get(key)?.selected??'')
}
export function prepareClipboardBlockSlice(s,record,start,end) {
  const slice=sliceLogicalFields(s,record,start,end)
  if(!slice)return null
  const {definition,inline,selected}=slice

  const capability=definition.capabilities?.clipboard
  if(!capability){
    if(selected.size!==1)return null
    const field=selected.values().next().value
    const part=clipboardRichTextPart(s,field.selected,inline)
    const remaining=replaceBlockRichTextRange(s,
      record,start,end,{kind:'text',text:''},
    )
    if(!remaining)return null
    return {
      parts:[part],
      remaining:isClipboardResidualEmpty(s,remaining)?null:remaining,
      focus:{fieldKey:start.fieldKey,offset:start.offset},
      compound:false,
    }
  }

  const result=cloneEditorData(synchronousResult(capability.slice(cloneEditorData(record.data),{
    ownerDocument:s.ownerDocument,
    createId:prefix=>s.allocateId(prefix),
    field:key=>selected.get(key)??null,
  })))
  if(!result||typeof result!=='object'||Array.isArray(result)){
    throw new TypeError(`Clipboard capability for "${record.type}" returned an invalid result`)
  }
  if(!Array.isArray(result.parts)||result.parts.length===0){
    throw new TypeError(`Clipboard capability for "${record.type}" must return parts`)
  }
  for(let index=0;index<result.parts.length;index++){
    if(!Object.hasOwn(result.parts,index))throw new TypeError('Clipboard capability parts must be dense')
  }

  const parts=result.parts.map(part=>{
    if(part?.kind==='rich-text'){
      if(typeof part.html!=='string')throw new TypeError('Clipboard rich-text part must contain html')
      return clipboardRichTextPart(s,part.html,inline)
    }
    if(part?.kind==='local-block'){
      const local=s.recordFromData(
        record.id,record.type,definition,part.data,record.tunes,record.inline,
      )
      return {kind:'block',block:local}
    }
    throw new TypeError('Clipboard capability part must be local-block or rich-text')
  })

  let remaining=null
  if(result.remaining!==null){
    remaining=s.recordFromData(
      record.id,record.type,definition,result.remaining,record.tunes,record.inline,
    )
  }
  const candidate=result.focus??{fieldKey:start.fieldKey,offset:start.offset}
  if(typeof candidate!=='object'||Array.isArray(candidate)||typeof candidate.fieldKey!=='string'||!candidate.fieldKey
    ||!Number.isInteger(candidate.offset)||candidate.offset<0)throw new TypeError('Clipboard focus must contain a field key and non-negative offset')
  const focus={fieldKey:candidate.fieldKey,offset:candidate.offset}
  return {parts,remaining,focus,compound:true}

}

export function clipboardRichTextPart(s,html,inline) {
  const scan=scanRichTextPlaceholders(html,inline,s.ownerDocument)
  const selectedInline=Object.fromEntries([...scan.references].map(id=>[id,cloneEditorData(inline[id])]))
  return {
    kind:'rich-text',
    html,
    ...(Object.keys(selectedInline).length?{inline:selectedInline}:{}),
  }

}

export function materializeClipboardBlock(s,input,reserved) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Clipboard block part is invalid')
  if(typeof input.type!=='string'||!input.type)throw new TypeError('Clipboard block type must be non-empty')
  const id=s.allocateId(input.type,reserved)
  const candidate={id,type:input.type,dataVersion:input.dataVersion,data:input.data}
  if(Object.hasOwn(input,'tunes'))candidate.tunes=input.tunes
  if(Object.hasOwn(input,'inline'))candidate.inline=input.inline
  const decoded=decodeCurrentBlock(candidate,{
    getBlockSchema:type=>s.getBlockDefinition(type)?.schema,
    getInlineSchema:type=>s.getInlineDefinition(type)?.schema,
  })
  const definition=s.getBlockDefinition(decoded.type)
  return definition
    ?s.recordFromData(
        decoded.id,decoded.type,definition,decoded.data,decoded.tunes,decoded.inline,
      )
    :decoded

}

export function isClipboardResidualEmpty(s,record) {
  const definition=s.getBlockDefinition(record.type)
  const empty=definition?.capabilities?.empty?.isEmpty
  if(typeof empty!=='function')return false
  const result=synchronousResult(empty(cloneEditorData(record.data),{ownerDocument:s.ownerDocument}))
  if(typeof result!=='boolean')throw new TypeError('Empty capability must return a boolean')
  return result

}

export function recordWithRichTextFragment(s,current,fieldKey,range,fragment) {
  if(!fragment||typeof fragment!=='object'||Array.isArray(fragment)||typeof fragment.html!=='string'){
    throw new TypeError('Rich-text clipboard fragment must contain html')
  }
  if(!s.getBlockDefinition(current.type)){
    throw new Error(`Unregistered block cannot be updated: ${current.id}`)
  }
  const definition=s.getBlockDefinition(current.type)
  if(!definition?.schema?.mapRichText)throw new Error(`Block type has no rich-text fields: ${current.type}`)
  const currentInline=cloneInline(current.inline)??{}
  const sourceInline=fragment.inline===undefined
    ?{}
    :s.normalizeExternalInline(fragment.inline)??{}
  const scan=s.scanBlockRichText(definition,current.data,currentInline)
  const reserved=new Set([
    ...Object.keys(currentInline),
    ...scan.references,
    ...scan.literals,
  ])
  const remapped=remapCanonicalFragment({
    html:fragment.html,
    inline:sourceInline,
    reservedIds:reserved,
    ownerDocument:s.ownerDocument,
    allocateInlineId:ids=>s.allocateInlineId(ids),
  })
  const inline={...currentInline,...remapped.inline}
  let matched=false
  const nextData=definition.schema.mapRichText(cloneEditorData(current.data),(html,key)=>{
    if(key!==fieldKey)return html
    matched=true
    return replaceRichTextRange(
      html,currentInline,range,{kind:'html',html:remapped.html},s.ownerDocument,
    )
  })
  if(!matched)throw new Error(`Unknown rich-text field "${fieldKey}" for block "${current.id}"`)
  return s.recordFromData(
    current.id,current.type,definition,nextData,current.tunes,inline,
  )

}

export function materializeClipboardRichText(s,part,reserved) {
  if(typeof part?.html!=='string')throw new TypeError('Clipboard rich-text part must contain html')
  const inline=part.inline===undefined?{}:s.normalizeExternalInline(part.inline)??{}
  const payload={kind:/** @type {'rich-text'} */('rich-text'),data:{text:part.html}}
  const importContext=Object.freeze({ownerDocument:s.ownerDocument})
  const ordered=[
    s.defaultBlockType,
    ...s.blockTypes.filter(type=>type!==s.defaultBlockType),
  ]
  for(const type of ordered){
    const definition=s.getBlockDefinition(type)
    const conversion=definition?.capabilities?.conversion
    if(!conversion||typeof conversion.canImport!=='function')continue
    // Each extension receives a separate author snapshot. A rejected
    // candidate cannot change what later importers inspect or commit.
    const accepted=synchronousResult(conversion.canImport(cloneEditorData(payload)))
    if(typeof accepted!=='boolean')throw new TypeError('Clipboard conversion canImport() must return a boolean')
    if(!accepted)continue
    const data=synchronousResult(conversion.import(cloneEditorData(payload),importContext))
    const id=s.allocateId(type,reserved)
    const record=s.recordFromData(id,type,definition,data,undefined,inline)
    s.assertConversionInlinePreserved(payload,inline,definition,record)
    return record
  }
  throw new Error('No registered block type can materialize clipboard rich-text')

}

export function prepareClipboardSlice(s,view,bookmark,wholeBlockIds=[]) {
  if(!Array.isArray(wholeBlockIds))throw new TypeError('Clipboard block IDs must be an array')
  const ids=view.ids
  if (wholeBlockIds.length) {
    const selected = ids.filter(id => wholeBlockIds.includes(id))
    if (selected.length !== wholeBlockIds.length || selected.some((id, index) => id !== wholeBlockIds[index])) return null
    const first = view.peek(selected[0])
    const definition = s.getBlockDefinition(first.type)
    const field = richTextFields(s,definition, first.data, cloneInline(first.inline) ?? {})[0]
    return Object.freeze({
      bookmark: bookmark ? cloneEditorData(bookmark) : null,
      startIndex: ids.indexOf(first.id),
      parts: selected.map(id => ({ kind: 'block', block: view.peek(id) })),
      blocks: selected.map(id => Object.freeze({ id, remaining: null })),
      focus: Object.freeze({ blockId: first.id, fieldKey: field?.key ?? '', offset: 0 }),
      compound: true,
    })
  }
  const ordered=orderedLogicalRange(s,view,bookmark)
  if(!ordered)return null
  const {start,end}=ordered
  if(start.blockId===end.blockId&&start.fieldKey===end.fieldKey&&start.offset===end.offset)return null
  const startIndex=ids.indexOf(start.blockId)
  const endIndex=ids.indexOf(end.blockId)
  if(startIndex<0||endIndex<startIndex)return null

  const parts=[]
  const blocks=[]
  let compound=false
  let focus={blockId:start.blockId,fieldKey:start.fieldKey,offset:start.offset}

  if(startIndex===endIndex){
    const record=view.peek(start.blockId)
    if(!record)return null
    const slice=prepareClipboardBlockSlice(s,record,start,end)
    if(!slice)return null
    parts.push(...slice.parts)
    blocks.push({id:record.id,remaining:slice.remaining})
    compound=slice.compound
    if(slice.focus)focus={blockId:record.id,...slice.focus}
  }else{
    const startRecord=view.peek(start.blockId)
    const endRecord=view.peek(end.blockId)
    if(!startRecord||!endRecord)return null
    const startDefinition=s.getBlockDefinition(startRecord.type)
    const endDefinition=s.getBlockDefinition(endRecord.type)
    const startFields=richTextFields(s,
      startDefinition,startRecord.data,cloneInline(startRecord.inline)??{},
    )
    const endFields=richTextFields(s,
      endDefinition,endRecord.data,cloneInline(endRecord.inline)??{},
    )
    if(!startFields.length||!endFields.length)return null

    const startSlice=prepareClipboardBlockSlice(s,
      startRecord,
      start,
      {
        blockId:start.blockId,
        fieldKey:startFields.at(-1).key,
        offset:startFields.at(-1).length,
      },
    )
    const endSlice=prepareClipboardBlockSlice(s,
      endRecord,
      {blockId:end.blockId,fieldKey:endFields[0].key,offset:0},
      end,
    )
    if(!startSlice||!endSlice)return null
    parts.push(...startSlice.parts)
    blocks.push({id:startRecord.id,remaining:startSlice.remaining})
    compound=compound||startSlice.compound
    if(startSlice.focus)focus={blockId:startRecord.id,...startSlice.focus}

    for(let index=startIndex+1;index<endIndex;index++){
      const record=view.peek(ids[index])
      if(!record)return null
      parts.push({kind:'block',block:record})
      blocks.push({id:record.id,remaining:null})
    }

    parts.push(...endSlice.parts)
    blocks.push({id:endRecord.id,remaining:endSlice.remaining})
    compound=compound||endSlice.compound
  }

  if(!parts.length)return null
  return Object.freeze({
    bookmark:cloneEditorData(bookmark),
    startIndex,
    parts:cloneEditorData(parts),
    blocks:blocks.map(entry=>Object.freeze({
      id:entry.id,
      remaining:entry.remaining===null?null:cloneEditorData(entry.remaining),
    })),
    focus:Object.freeze({...focus}),
    compound,
  })

}

export function prepareClipboardCut(s,view,plan) {
  const entries=plan.blocks.map(entry=>({
    id:entry.id,
    remaining:entry.remaining===null?null:cloneEditorData(entry.remaining),
  }))

  // Deleting a cross-block selection may leave two endpoint residuals.
  // Collapse them only when the owning type explicitly declares a lossless
  // merge contract; this is the same canonical merge used by keyboard
  // deletion and conversion.
  if(entries.length>1){
    const first=entries[0]
    const last=entries.at(-1)
    if(first.remaining&&last.remaining&&first.id!==last.id&&first.remaining.type===last.remaining.type){
      const definition=s.getBlockDefinition(first.remaining.type)
      const merge=definition?.capabilities?.merge?.merge
      if(typeof merge==='function'){
        const prepared=s.prepareInlineMerge(definition,first.remaining,last.remaining)
        const mergedData=merge(prepared.targetData,prepared.sourceData)
        first.remaining=s.recordFromData(
          first.id,
          first.remaining.type,
          definition,
          mergedData,
          first.remaining.tunes,
          prepared.inline,
        )
        last.remaining=null
      }
    }
  }

  const removals=new Set(entries.filter(entry=>entry.remaining===null).map(entry=>entry.id))
  const survivors=view.ids.filter(id=>!removals.has(id))
  let fallback=null
  if(!survivors.length){
    const type=s.defaultBlockType
    const definition=s.getBlockDefinition(type)
    fallback=s.recordFromData(
      s.allocateId(type,new Set(view.ids)),
      type,
      definition,
      definition.schema.createDefault(),
      undefined,
      undefined,
    )
  }

  const edits=[]
  for(const entry of entries){
    if(entry.remaining===null)edits.push({kind:'remove',id:entry.id})
    else edits.push(...updatedRecord(entry.id,view.peek(entry.id),entry.remaining))
  }
  if(fallback)edits.push({kind:'insert',index:0,record:fallback})
  const preferred=entries.find(entry=>entry.remaining!==null)?.id??fallback?.id??survivors[Math.min(plan.startIndex,survivors.length-1)]
  if(!edits.length||!preferred)return {edits:[],result:null}
  const remaining=entries.find(entry=>entry.id===preferred)?.remaining
  const field=remaining&&richTextFields(s,s.getBlockDefinition(remaining.type),remaining.data,remaining.inline??{}).find(field=>field.key===plan.focus?.fieldKey)
  const focus=field&&plan.focus.blockId===preferred?{fieldKey:field.key,offset:Math.min(field.length,plan.focus.offset)}:undefined
  return {edits,result:{blockId:preferred,...(focus?{focus}:{})}}

}

export function prepareReplaceClipboardSlice(s,view,plan,parts) {
  if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')

  if(!plan.compound&&!parts.some(part=>part?.kind==='local-block')){
    return prepareReplaceClipboardRange(s,view,plan.bookmark,parts)
  }

  const reserved=new Set(view.ids)
  const incoming=parts.map(part=>{
    if(part?.kind==='block')return materializeClipboardBlock(s,part.block,reserved)
    if(part?.kind==='rich-text')return materializeClipboardRichText(s,part,reserved)
    if(part?.kind==='local-block'){
      if(typeof part.type!=='string'||!part.type)throw new TypeError('Local clipboard block is missing a type')
      const definition=s.getBlockDefinition(part.type)
      if(!definition)throw new Error(`Local clipboard block type is not registered: ${part.type}`)
      s.normalizeLocalData(definition,part.data)
      const id=s.allocateId(part.type,reserved)
      return s.recordFromData(id,part.type,definition,part.data,undefined,undefined)
    }
    throw new TypeError('Clipboard part must be block, local-block, or rich-text')
  })

  const edits=[],ids=[...view.ids]
  for(const entry of plan.blocks){
    if(entry.remaining===null){edits.push({kind:'remove',id:entry.id});ids.splice(ids.indexOf(entry.id),1)}
    else edits.push(...updatedRecord(entry.id,view.peek(entry.id),entry.remaining))
  }
  const first=plan.blocks[0]
  let index=first?.remaining!==null?ids.indexOf(first.id)+1:Math.min(plan.startIndex,ids.length)
  for(const record of incoming)edits.push({kind:'insert',index:index++,record})
  const blockId=incoming.at(-1)?.id??plan.blocks.find(entry=>entry.remaining!==null)?.id??ids[Math.min(plan.startIndex,ids.length-1)]
  return {edits,result:blockId?{blockId,inserted:incoming.map(record=>record.id)}:false}

}

export function prepareInsertClipboardParts(s,view,blockId,fieldKey,range,parts) {
  if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')
  const current=view.peek(blockId)
  if(!current)throw new Error(`Unknown block id: ${blockId}`)
  if(!s.getBlockDefinition(view.peek(blockId)?.type))throw new Error(`Unregistered block cannot receive clipboard data: ${blockId}`)

  const reserved=new Set(view.ids)
  const preparedBlocks=[]
  let targetNext=current
  let partIndex=0

  if(parts[0]?.kind==='rich-text'){
    targetNext=recordWithRichTextFragment(s,current,fieldKey,range,parts[0])
    partIndex=1
  }else if((Math.trunc(range?.end)||0)>(Math.trunc(range?.start)||0)){
    targetNext=replaceBlockRichTextRange(s,
      current,
      {blockId,fieldKey,offset:Math.max(0,Math.trunc(range.start)||0)},
      {blockId,fieldKey,offset:Math.max(0,Math.trunc(range.end)||0)},
      {kind:'text',text:''},
    )
    if(!targetNext)throw new Error('Clipboard target selection is not a rich-text range')
  }

  for(;partIndex<parts.length;partIndex++){
    const part=parts[partIndex]
    if(part?.kind==='block'){
      preparedBlocks.push(materializeClipboardBlock(s,part.block,reserved))
      continue
    }
    if(part?.kind==='local-block'){
      if(typeof part.type!=='string'||!part.type)throw new TypeError('Local clipboard block must have a type')
      const definition=s.getBlockDefinition(part.type)
      if(!definition)throw new Error('Local clipboard block type is not registered: '+part.type)
      s.normalizeLocalData(definition,part.data)
      const id=s.allocateId(part.type,reserved)
      preparedBlocks.push(s.recordFromData(id,part.type,definition,part.data,undefined,undefined))
      continue
    }

    if(part?.kind!=='rich-text'||typeof part.html!=='string'){
      throw new TypeError('Clipboard part must be block, local-block, or rich-text')
    }
    preparedBlocks.push(materializeClipboardRichText(s,part,reserved))
  }

  const replaceEmpty=(parts[0]?.kind==='block'||parts[0]?.kind==='local-block')
    &&range.start===range.end
    &&isClipboardResidualEmpty(s,current)
    &&preparedBlocks.length>0
  const anchorIndex=view.ids.indexOf(blockId)
  const inserted=[]
  const edits=[]
  let start=0,index=anchorIndex+1
  if(replaceEmpty){
    const first={...preparedBlocks[0],id:blockId}
    edits.push(...updatedRecord(blockId,current,first));inserted.push(blockId);start=1
  }else edits.push(...updatedRecord(blockId,current,targetNext))
  for(;start<preparedBlocks.length;start++){
    const record=preparedBlocks[start];edits.push({kind:'insert',index:index++,record});inserted.push(record.id)
  }
  const focus = !inserted.length && parts[0]?.kind === 'rich-text'
    ? focusAt(s,targetNext,fieldKey,Math.max(0,Math.trunc(range.start)||0)+getRichTextLogicalLength(parts[0].html,parts[0].inline,s.ownerDocument))
    : undefined
  return {edits,result:{
    blockId:inserted.at(-1)??blockId,
    inserted,
    ...(focus ? { focus } : {}),
  }}

}

export function prepareReplaceClipboardRange(s,view,bookmark,parts) {
  if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard parts must be a non-empty array')
  const ordered=orderedLogicalRange(s,view,bookmark)
  if(!ordered)return {edits:[],result:false}
  const {start,end}=ordered

  if(start.blockId===end.blockId&&parts.length===1&&parts[0]?.kind==='rich-text'){
    const current=view.peek(start.blockId)
    if(!current)return {edits:[],result:false}
    let next=recordWithRichTextFragment(s,
      current,start.fieldKey,{start:start.offset,end:start.fieldKey===end.fieldKey?end.offset:Number.MAX_SAFE_INTEGER},parts[0],
    )
    if(start.fieldKey!==end.fieldKey){
      const fields=richTextFields(s,
        s.getBlockDefinition(current.type),current.data,cloneInline(current.inline)??{},
      )
      const startIndex=fields.findIndex(field=>field.key===start.fieldKey)
      const endIndex=fields.findIndex(field=>field.key===end.fieldKey)
      if(startIndex<0||endIndex<=startIndex)return {edits:[],result:false}
      next=replaceBlockRichTextRange(s,
        next,
        {blockId:next.id,fieldKey:fields[startIndex+1].key,offset:0},
        {blockId:next.id,fieldKey:end.fieldKey,offset:end.offset},
        {kind:'text',text:''},
      )
      if(!next)return {edits:[],result:false}
    }
    return {edits:updatedRecord(current.id,current,next),result:{blockId:current.id,inserted:[],
      focus:focusAt(s,next,start.fieldKey,start.offset+getRichTextLogicalLength(parts[0].html,parts[0].inline,s.ownerDocument)),
    }}
  }

  const ids=view.ids
  const startIndex=ids.indexOf(start.blockId)
  const endIndex=ids.indexOf(end.blockId)
  if(startIndex<0||endIndex<startIndex)return {edits:[],result:false}
  const startRecord=view.peek(start.blockId)
  const endRecord=view.peek(end.blockId)
  if(!startRecord||!endRecord)return {edits:[],result:false}

  const startDefinition=s.getBlockDefinition(startRecord.type)
  const endDefinition=s.getBlockDefinition(endRecord.type)
  const startFields=richTextFields(s,startDefinition,startRecord.data,cloneInline(startRecord.inline)??{})
  const endFields=richTextFields(s,endDefinition,endRecord.data,cloneInline(endRecord.inline)??{})
  if(!startFields.length||!endFields.length)return {edits:[],result:false}
  const startFieldIndex=startFields.findIndex(field=>field.key===start.fieldKey)
  const endFieldIndex=endFields.findIndex(field=>field.key===end.fieldKey)
  if(startFieldIndex<0||endFieldIndex<0)return {edits:[],result:false}

  const firstPart=parts[0]
  let before
  let consumedFirst=false
  if(firstPart?.kind==='rich-text'){
    before=recordWithRichTextFragment(s,
      startRecord,start.fieldKey,{start:start.offset,end:Number.MAX_SAFE_INTEGER},firstPart,
    )
    if(startFieldIndex<startFields.length-1){
      before=replaceBlockRichTextRange(s,
        before,
        {blockId:before.id,fieldKey:startFields[startFieldIndex+1].key,offset:0},
        {blockId:before.id,fieldKey:startFields.at(-1).key,offset:startFields.at(-1).length},
        {kind:'text',text:''},
      )
    }
    consumedFirst=true
  }else{
    const split=splitClipboardResiduals(s,
      startRecord,
      start,
      {blockId:start.blockId,fieldKey:startFields.at(-1).key,offset:startFields.at(-1).length},
    )
    before=split?.before??null
  }

  const lastPart=parts.at(-1)
  const consumedLast=parts.length>(consumedFirst?1:0)&&lastPart?.kind==='rich-text'
  let after
  if(consumedLast){
    after=recordWithRichTextFragment(s,
      endRecord,end.fieldKey,{start:0,end:end.offset},lastPart,
    )
    if(endFieldIndex>0){
      after=replaceBlockRichTextRange(s,
        after,
        {blockId:after.id,fieldKey:endFields[0].key,offset:0},
        {blockId:after.id,fieldKey:endFields[endFieldIndex-1].key,offset:endFields[endFieldIndex-1].length},
        {kind:'text',text:''},
      )
    }
  }else if(start.blockId===end.blockId){
    const split=splitClipboardResiduals(s,startRecord,start,end)
    after=split?.after??null
  }else{
    const split=splitClipboardResiduals(s,
      endRecord,
      {blockId:end.blockId,fieldKey:endFields[0].key,offset:0},
      end,
    )
    after=split?.after??null
  }

  const reserved=new Set(ids)
  const insertedRecords=[]
  const partEnd=consumedLast?parts.length-1:parts.length
  for(let index=consumedFirst?1:0;index<partEnd;index++){
    const part=parts[index]
    if(part?.kind==='block')insertedRecords.push(materializeClipboardBlock(s,part.block,reserved))
    else if(part?.kind==='rich-text')insertedRecords.push(materializeClipboardRichText(s,part,reserved))
    else throw new TypeError('Clipboard part must be block or rich-text')
  }

  // A pure rich-text cross-block replacement may collapse endpoint residuals
  // back into one block when the owning type declares a merge contract.
  if(
    consumedFirst
    &&insertedRecords.length===0
    &&before
    &&after
    &&before.type===after.type
  ){
    const merge=startDefinition?.capabilities?.merge?.merge
    if(typeof merge==='function'){
      const prepared=s.prepareInlineMerge(startDefinition,before,after)
      const mergedData=merge(prepared.targetData,prepared.sourceData)
      before=s.recordFromData(
        before.id,before.type,startDefinition,mergedData,before.tunes,prepared.inline,
      )
      after=null
    }
  }

  const beforeKeep=before&&!isClipboardResidualEmpty(s,before)
  const afterKeep=after&&!isClipboardResidualEmpty(s,after)
  const inserted=[]
  let sameBlockAfter=null
  if(start.blockId===end.blockId&&afterKeep){
    sameBlockAfter={
      ...after,
      id:s.allocateId(after.type,reserved),
    }
  }

  const edits=[],live=[...ids]
  if(beforeKeep)edits.push(...updatedRecord(start.blockId,startRecord,before))
  else {edits.push({kind:'remove',id:start.blockId});live.splice(live.indexOf(start.blockId),1)}
  if(start.blockId!==end.blockId){
    for(let index=startIndex+1;index<endIndex;index++){
      edits.push({kind:'remove',id:ids[index]});live.splice(live.indexOf(ids[index]),1)
    }
    if(afterKeep)edits.push(...updatedRecord(end.blockId,endRecord,after))
    else {edits.push({kind:'remove',id:end.blockId});live.splice(live.indexOf(end.blockId),1)}
  }
  let insertAt=beforeKeep?live.indexOf(start.blockId)+1:start.blockId!==end.blockId&&afterKeep?live.indexOf(end.blockId):Math.min(startIndex,live.length)
  for(const record of insertedRecords){edits.push({kind:'insert',index:insertAt++,record});live.splice(insertAt-1,0,record.id);inserted.push(record.id)}
  if(sameBlockAfter){edits.push({kind:'insert',index:insertAt,record:sameBlockAfter});live.splice(insertAt,0,sameBlockAfter.id);inserted.push(sameBlockAfter.id)}

  if(parts.length===1&&firstPart?.kind==='rich-text'&&beforeKeep){
    return {edits,result:{blockId:start.blockId,inserted,
      focus:focusAt(s,before,start.fieldKey,start.offset+getRichTextLogicalLength(firstPart.html,firstPart.inline,s.ownerDocument)),
    }}
  }
  const focusId=inserted.at(-1)??(afterKeep&&start.blockId!==end.blockId?end.blockId:beforeKeep?start.blockId:live[Math.min(startIndex,live.length-1)])
  return {edits,result:focusId?{blockId:focusId,inserted}:false}

}

export function prepareInsertLocalBlocks(s,view,anchorId,inputs,options={}) {
  if(!Array.isArray(inputs)||inputs.length===0)return {edits:[],result:[]}
  const ids=view.ids
  const anchorIndex=ids.indexOf(anchorId)
  if(anchorIndex<0)throw new Error(`Unknown block id: ${anchorId}`)

  const validated=inputs.map((input,index)=>{
    if(!input||typeof input!=='object'||Array.isArray(input)){
      throw new TypeError(`Local block input[${index}] must be an object`)
    }
    if(typeof input.type!=='string'||!input.type){
      throw new TypeError(`Local block input[${index}] must contain a type`)
    }
    const definition=s.getBlockDefinition(input.type)
    if(!definition)throw new Error(`Local block type is not registered: ${input.type}`)
    // Validate the complete local payload before allocating persisted block ids.
    s.normalizeLocalData(definition,input.data)
    const tunes=input.tunes===undefined?undefined:s.normalizeTunes(input.tunes)
    const inline=input.inline===undefined?undefined:s.normalizeExternalInline(input.inline)
    return {type:input.type,definition,data:input.data,tunes,inline}
  })

  const reserved=new Set(ids)
  const records=validated.map(input=>{
    const id=s.allocateId(input.type,reserved)
    return s.recordFromData(
      id,input.type,input.definition,input.data,input.tunes,input.inline,
    )
  })

  const replaceEmpty=options.replaceEmpty===true&&isClipboardResidualEmpty(s,view.peek(anchorId))
  const inserted=[]
  const edits=[]
  let offset=1,start=0
  if(replaceEmpty){
    const first={...records[0],id:anchorId}
    edits.push(...updatedRecord(anchorId,view.peek(anchorId),first));inserted.push(anchorId);start=1
  }
  for(let index=start;index<records.length;index++){
    edits.push({kind:'insert',index:anchorIndex+offset++,record:records[index]});inserted.push(records[index].id)
  }
  return {edits,result:inserted}

}

export function preparePasteResults(s,view,blockId,fieldKey,range,entries) {
  if(!Array.isArray(entries)||entries.length===0)throw new TypeError('Paste results must be a non-empty array')
  const current=view.peek(blockId)
  if(!current)throw new Error(`Unknown block id: ${blockId}`)
  if(!s.getBlockDefinition(view.peek(blockId)?.type))throw new Error(`Unregistered block cannot receive paste results: ${blockId}`)

  let rich=null
  const local=[]
  for(let index=0;index<entries.length;index++){
    if(!Object.hasOwn(entries,index))throw new TypeError('Paste results must be dense')
    const entry=entries[index]
    const result=entry?.result
    if(!result||typeof result!=='object'||Array.isArray(result))throw new TypeError('Paste resolver returned an invalid result')
    if(result.kind==='rich-text'){
      if(rich)throw new Error('Paste plan may contain at most one rich-text result')
      if(!result.replacement||typeof result.replacement!=='object')throw new TypeError('Paste rich-text result is invalid')
      rich=validateTextReplacement(result.replacement)
      continue
    }
    if(result.kind!=='block')throw new TypeError('Paste result kind must be block or rich-text')
    if(typeof entry.type!=='string'||!entry.type)throw new TypeError('Paste block result is missing a type')
    const definition=s.getBlockDefinition(entry.type)
    if(!definition)throw new Error(`Paste block type is not registered: ${entry.type}`)
    // Validate local data before allocating any persisted block identity.
    s.normalizeLocalData(definition,result.data)
    local.push({type:entry.type,definition,data:result.data})
  }

  let targetNext=current
  if(rich){
    targetNext=replaceBlockRichTextRange(s,
      current,
      {blockId,fieldKey,offset:Math.max(0,Math.trunc(range?.start)||0)},
      {blockId,fieldKey,offset:Math.max(0,Math.trunc(range?.end)||0)},
      rich,
    )
    if(!targetNext)throw new Error('Paste target is not a valid rich-text range')
  }

  const replaceEmpty=!rich&&local.length>0&&isClipboardResidualEmpty(s,current)
  const reserved=new Set(view.ids)
  const prepared=local.map((entry,index)=>{
    const id=replaceEmpty&&index===0?blockId:s.allocateId(entry.type,reserved)
    return s.recordFromData(id,entry.type,entry.definition,entry.data,undefined,undefined)
  })

  const anchorIndex=view.ids.indexOf(blockId)
  const inserted=[]
  const edits=[]
  if(rich)edits.push(...updatedRecord(blockId,current,targetNext))
  let start=0,index=anchorIndex+1
  if(replaceEmpty){edits.push(...updatedRecord(blockId,current,prepared[0]));inserted.push(blockId);start=1}
  for(;start<prepared.length;start++){
    const record=prepared[start];edits.push({kind:'insert',index:index++,record});inserted.push(record.id)
  }

  const focus = rich && !inserted.length
    ? focusAt(s,targetNext,fieldKey,Math.max(0,Math.trunc(range.start)||0)+(rich.kind==='text'?rich.text.length:getRichTextLogicalLength(rich.html,{},s.ownerDocument)))
    : undefined
  return {edits,result:{
    blockId:inserted.at(-1)??blockId,
    inserted,
    ...(focus ? { focus } : {}),
  }}

}

export function prepareInlineSegments(s,view,blockId,fieldKey,range,segments) {
  if (!Array.isArray(segments) || segments.length === 0) return {edits:[],result:false}
  const current = view.peek(blockId)
  if (!current) throw new Error(`Unknown block id: ${blockId}`)
  if (!s.getBlockDefinition(view.peek(blockId)?.type)) {
    throw new Error(`Unregistered block cannot be updated: ${blockId}`)
  }
  const blockDefinition = s.getBlockDefinition(current.type)
  if (!blockDefinition?.schema?.mapRichText) {
    throw new Error(`Block type has no rich-text fields: ${current.type}`)
  }

  const defaultType = s.defaultBlockType
  const defaultDefinition = s.getBlockDefinition(defaultType)
  const inline = cloneInline(current.inline) ?? {}
  const reservedInline = new Set(Object.keys(inline))
  for (const id of s.scanBlockRichText(blockDefinition, current.data, inline).literals) {
    reservedInline.add(id)
  }
  if (defaultDefinition?.schema?.mapRichText) {
    for (const id of s.scanBlockRichText(
      defaultDefinition,
      defaultDefinition.schema.createDefault(),
      {},
    ).literals) reservedInline.add(id)
  }

  const lines = [[]]
  for (const raw of segments) {
    if (!raw || typeof raw !== 'object') throw new TypeError('Inline paste segment must be an object')
    if (raw.kind === 'text') {
      if(typeof raw.text!=='string')throw new TypeError('Inline text segment must contain text')
      const parts = raw.text.split(/\r\n?|\n/)
      for (let index = 0; index < parts.length; index++) {
        if (parts[index]) lines.at(-1).push({ kind: 'text', text: parts[index] })
        if (index < parts.length - 1) lines.push([])
      }
      continue
    }
    if (raw.kind !== 'widget' || typeof raw.type !== 'string' || !raw.type) {
      throw new TypeError('Inline paste segment must be text or widget')
    }
    const definition = s.getInlineDefinition(raw.type)
    if (!definition) throw new Error(`Unknown inline widget type: ${raw.type}`)
    const encoded = definition.schema.encode(raw.data)
    const id = s.allocateInlineId(reservedInline)
    reservedInline.add(id)
    Object.defineProperty(inline, id, { value: {
      type: raw.type,
      dataVersion: encoded.dataVersion,
      data: encoded.data,
    }, enumerable: true, configurable: true, writable: true })
    lines.at(-1).push({ kind: 'reference', id })
  }

  const serialized = lines.map(line => {
    let text = ''
    let logicalLength = 0
    for (const segment of line) {
      if (segment.kind === 'text') {
        text += segment.text
        logicalLength += segment.text.length
      } else {
        text += `{{${segment.id}}}`
        logicalLength++
      }
    }
    return { text, logicalLength }
  })

  const startOffset = Math.max(0, Math.trunc(range?.start) || 0)
  const endOffset = Math.max(startOffset, Math.trunc(range?.end ?? startOffset) || 0)

  if (serialized.length === 1 || !defaultDefinition?.schema?.mapRichText) {
    let matched = false
    const nextData = blockDefinition.schema.mapRichText(
      cloneEditorData(current.data),
      (html, key) => {
        if (key !== fieldKey) return html
        matched = true
        return replaceRichTextRange(
          html,
          inline,
          { start: startOffset, end: endOffset },
          { kind: 'text', text: serialized.map(line => line.text).join('\n') },
          s.ownerDocument,
        )
      },
    )
    if (!matched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)
    const next = s.recordFromData(
      current.id, current.type, blockDefinition, nextData, current.tunes, inline,
    )
    return {edits:updatedRecord(blockId,current,next),result:logicalPoint(s,next,fieldKey,startOffset+serialized.reduce((sum,line,index)=>sum+line.logicalLength+(index?1:0),0))}
  }

  let suffix = ''
  let sourceMatched = false
  const sourceData = blockDefinition.schema.mapRichText(
    cloneEditorData(current.data),
    (html, key) => {
      if (key !== fieldKey) return html
      sourceMatched = true
      suffix = splitRichTextRange(
        html,
        inline,
        { start: startOffset, end: endOffset },
        s.ownerDocument,
      ).after
      return replaceRichTextRange(
        html,
        inline,
        { start: startOffset, end: Number.MAX_SAFE_INTEGER },
        { kind: 'text', text: serialized[0].text },
        s.ownerDocument,
      )
    },
  )
  if (!sourceMatched) throw new Error(`Unknown rich-text field "${fieldKey}" for block "${blockId}"`)

  const sourceNext = s.recordFromData(
    current.id, current.type, blockDefinition, sourceData, current.tunes, inline,
  )

  const records = []
  const occupiedBlocks = new Set(view.ids)
  const allocateBlockId = () => s.allocateId(defaultType, occupiedBlocks)

  let finalFieldKey = null
  for (let index = 1; index < serialized.length; index++) {
    const line = serialized[index]
    const isLast = index === serialized.length - 1
    let fieldKeyForBlock = null
    const data = defaultDefinition.schema.mapRichText(
      defaultDefinition.schema.createDefault(),
      (html, key) => {
        if (fieldKeyForBlock !== null) return html
        fieldKeyForBlock = key
        const base = isLast ? suffix : ''
        return replaceRichTextRange(
          base,
          inline,
          { start: 0, end: 0 },
          { kind: 'text', text: line.text },
          s.ownerDocument,
        )
      },
    )
    if (fieldKeyForBlock === null) {
      throw new Error(`Default block type has no rich-text field: ${defaultType}`)
    }
    finalFieldKey = fieldKeyForBlock
    records.push(s.recordFromData(
      allocateBlockId(), defaultType, defaultDefinition, data, current.tunes, inline,
    ))
  }

  const sourceIndex = view.ids.indexOf(blockId)
  const edits=updatedRecord(blockId,current,sourceNext)
  for(let index=0;index<records.length;index++)edits.push({kind:'insert',index:sourceIndex+index+1,record:records[index]})

  const last = records.at(-1)
  return {edits,result:logicalPoint(s,last,finalFieldKey,serialized.at(-1).logicalLength)}

}
