// @ts-check
import { getTextLength } from '../shared/textOffset.js'

/** Resolve the post-conversion selection from mounted fields, independently of plugin names. */
export function convertedSelection(result,view){
  if(!result?.focusId)return null
  const ids=result.convertedIds??[result.focusId]
  const firstFields=ids.length>1?view.fields(ids[0]).filter(field=>field.mode!=='plain-text'):[]
  const first=firstFields.find(field=>getTextLength(field.element)>0)??firstFields[0]
  const lastFields=ids.length>1?view.fields(ids.at(-1)).filter(field=>field.mode!=='plain-text'):[]
  const last=lastFields.filter(field=>getTextLength(field.element)>0).at(-1)??lastFields.at(-1)
  if(first&&last)return {
    anchor:{blockId:ids[0],fieldKey:first.key,offset:0},
    focus:{blockId:ids.at(-1),fieldKey:last.key,offset:getTextLength(last.element)},
    conversionCaret:true,
  }
  const field=view.fields(result.focusId)[0]
  const point={blockId:result.focusId,fieldKey:field?.key??'',offset:0}
  return {anchor:point,focus:{...point}}
}

/** Keep the converted text range and the last field's end caret as in v1. */
export function restoreConvertedSelection(result,view,selectionPort){
  const bookmark=convertedSelection(result,view)
  if(bookmark?.conversionCaret&&selectionPort?.restore(bookmark))return
  selectionPort?.deactivate?.()
  view.focus(result.focusId,{offset:'start'})
}
