// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

export const CLIPBOARD_FRAGMENT_MIME = 'application/x-rector-fragment'
export const CLIPBOARD_FRAGMENT_VERSION = 2

function object(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`)
  return value
}
function dense(parts){
  if(!Array.isArray(parts)||parts.length===0)throw new TypeError('Clipboard fragment parts must be a dense non-empty array')
  for(let i=0;i<parts.length;i++)if(!Object.hasOwn(parts,i))throw new TypeError('Clipboard fragment parts must be dense')
}
function optionalObject(value,label){
  if(value===undefined)return undefined
  return cloneEditorData(object(value,label))
}

export function transferBlockFromRecord(record){
  const source=object(record,'Clipboard source block')
  const block={
    type:String(source.type??''),
    dataVersion:source.dataVersion,
    data:cloneEditorData(source.data),
  }
  if(!block.type)throw new TypeError('Clipboard block type must be non-empty')
  if(!Number.isSafeInteger(block.dataVersion)||block.dataVersion<1)throw new TypeError('Clipboard block dataVersion must be positive')
  object(block.data,'Clipboard block data')
  const tunes=optionalObject(source.tunes,'Clipboard block tunes')
  const inline=optionalObject(source.inline,'Clipboard block inline')
  if(tunes!==undefined)block.tunes=tunes
  if(inline!==undefined)block.inline=inline
  return block
}

export function createClipboardFragment(parts){
  dense(parts)
  const owned=parts.map((part,index)=>{
    const source=object(part,`Clipboard fragment part[${index}]`)
    if(source.kind==='rich-text'){
      if(typeof source.html!=='string')throw new TypeError('Clipboard rich-text html must be a string')
      const result={kind:'rich-text',html:source.html}
      const inline=optionalObject(source.inline,'Clipboard rich-text inline')
      if(inline!==undefined)result.inline=inline
      return result
    }
    if(source.kind==='block'){
      return {kind:'block',block:transferBlockFromRecord(source.block)}
    }
    throw new TypeError('Clipboard fragment part kind must be rich-text or block')
  })
  return {version:CLIPBOARD_FRAGMENT_VERSION,parts:owned}
}

export function encodeClipboardFragment(fragment){
  return JSON.stringify(createClipboardFragment(fragment?.parts??fragment))
}

export function decodeClipboardFragment(text){
  let parsed
  try{parsed=JSON.parse(String(text??''))}
  catch{throw new TypeError('Clipboard fragment must contain valid JSON')}
  const source=object(parsed,'Clipboard fragment')
  if(source.version!==CLIPBOARD_FRAGMENT_VERSION){
    throw new RangeError(`Unsupported clipboard fragment version: ${String(source.version)}`)
  }
  if(Object.hasOwn(source,'blocks')||Object.hasOwn(source,'records')){
    throw new TypeError('Clipboard fragment contains removed legacy shape')
  }
  return createClipboardFragment(source.parts)
}
