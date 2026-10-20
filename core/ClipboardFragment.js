// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

export const CLIPBOARD_FRAGMENT_MIME = 'application/x-rector-fragment'
export const CLIPBOARD_FRAGMENT_VERSION = 2

const FRAGMENT_FIELDS = new Set(['version', 'parts'])
const RICH_TEXT_FIELDS = new Set(['kind', 'html', 'inline'])
const BLOCK_PART_FIELDS = new Set(['kind', 'block'])
const TRANSFER_BLOCK_FIELDS = new Set(['type', 'dataVersion', 'data', 'tunes', 'inline'])

function assertKnownClipboardFields(value, known, label) {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      throw new TypeError(`${label} contains unknown field: ${key}`)
    }
  }
}

function object(value,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${label} must be an object`)
  return value
}
function dense(parts){
  if(!Array.isArray(parts))throw new TypeError('Clipboard fragment parts must be a dense non-empty array')
  const length=parts.length
  if(length===0)throw new TypeError('Clipboard fragment parts must be a dense non-empty array')
  for(let i=0;i<length;i++)if(!Object.hasOwn(parts,i))throw new TypeError('Clipboard fragment parts must be dense')
  return length
}
function optionalObject(value,label){
  if(value===undefined)return undefined
  return cloneEditorData(object(value,label))
}

export function transferBlockFromRecord(record){
  const source=object(record,'Clipboard source block')
  const type=source.type
  if(typeof type!=='string'||!type)throw new TypeError('Clipboard block type must be a non-empty string')
  const dataVersion=source.dataVersion
  if(!Number.isSafeInteger(dataVersion)||dataVersion<1)throw new TypeError('Clipboard block dataVersion must be positive')
  const data=cloneEditorData(source.data)
  object(data,'Clipboard block data')
  const block={type,dataVersion,data}
  const tunes=optionalObject(source.tunes,'Clipboard block tunes')
  const inline=optionalObject(source.inline,'Clipboard block inline')
  if(tunes!==undefined)block.tunes=tunes
  if(inline!==undefined)block.inline=inline
  return block
}

export function createClipboardFragment(parts){
  const length=dense(parts)
  // Do not call methods or iterators supplied by a caller-owned Array.
  const owned=[]
  for(let index=0;index<length;index++){
    const source=object(parts[index],`Clipboard fragment part[${index}]`)
    const kind=source.kind
    if(kind==='rich-text'){
      const html=source.html
      if(typeof html!=='string')throw new TypeError('Clipboard rich-text html must be a string')
      const result={kind:'rich-text',html}
      const inline=optionalObject(source.inline,'Clipboard rich-text inline')
      if(inline!==undefined)result.inline=inline
      owned.push(result)
      continue
    }
    if(kind==='block'){
      owned.push({kind:'block',block:transferBlockFromRecord(source.block)})
      continue
    }
    throw new TypeError('Clipboard fragment part kind must be rich-text or block')
  }
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
  // Private clipboard MIME is an external serialized wire format, not a
  // local record export. Unknown envelope/part fields must fail closed:
  // silently removing them could discard meaningful future producer data.
  assertKnownClipboardFields(source, FRAGMENT_FIELDS, 'Clipboard fragment')
  if (Array.isArray(source.parts)) {
    for (const candidate of source.parts) {
      const part = object(candidate, 'Clipboard fragment part')
      if (part.kind === 'rich-text') {
        assertKnownClipboardFields(part, RICH_TEXT_FIELDS, 'Clipboard rich-text part')
      } else if (part.kind === 'block') {
        assertKnownClipboardFields(part, BLOCK_PART_FIELDS, 'Clipboard block part')
        const transfer = object(part.block, 'Clipboard transfer block')
        assertKnownClipboardFields(transfer, TRANSFER_BLOCK_FIELDS, 'Clipboard transfer block')
      }
      // createClipboardFragment still validates missing/invalid part kinds
      // and owns all accepted nested JSON payloads.
    }
  }
  return createClipboardFragment(source.parts)
}
