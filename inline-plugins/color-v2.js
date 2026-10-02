// @ts-check
import { colorPickerStylesUrl, parseColorInput } from '@shelamkoff/color-picker'
import { createOwnedColorPicker } from '../shared/colorPickerRealm.js'
import { colorWidgetSchema } from '../shared/inlineSchemas/color.js'

const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21a9 9 0 1 1 9-9c0 2-1 3-3 3h-4a2 2 0 1 0-1 3.7A1.3 1.3 0 0 1 12 21"/><circle cx="7.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="12" cy="7.5" r=".5" fill="currentColor"/><circle cx="16.5" cy="10.5" r=".5" fill="currentColor"/></svg>'

const PATTERNS=Object.freeze([
  /^#[0-9a-fA-F]{3}$/,
  /^#[0-9a-fA-F]{6}$/,
  /^#[0-9a-fA-F]{8}$/,
  /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
  /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/,
  /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/,
  /^hsla\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*,\s*[\d.]+\s*\)$/,
])

function normalizeToHex6(value,ownerDocument){
  const m3=value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if(m3)return '#'+m3[1]+m3[1]+m3[2]+m3[2]+m3[3]+m3[3]
  const m8=value.match(/^#([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/)
  if(m8)return '#'+m8[1]
  if(/^#[0-9a-fA-F]{6}$/.test(value))return value
  const temp=ownerDocument.createElement('span')
  temp.style.color=value
  ownerDocument.body.appendChild(temp)
  const computed=(ownerDocument.defaultView??globalThis).getComputedStyle(temp).color
  temp.remove()
  const m=computed.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if(!m)return '#000000'
  return '#'+[m[1],m[2],m[3]].map(n=>Number(n).toString(16).padStart(2,'0')).join('')
}

function displayValue(value,ownerDocument){
  const parsed=parseColorInput(value)
  if(!parsed)return '#000000'
  return (parsed.a??1)<1?value:normalizeToHex6(value,ownerDocument)
}

/** @returns {import('../plugin-kit/types').InlinePluginDefinition<{value:string}>} */
export function createColorSwatchPluginV2(){
  return Object.freeze({
    type:'color',
    label:Object.freeze({key:'title',fallback:'Color'}),
    icon:ICON,
    styles:Object.freeze([colorPickerStylesUrl]),
    schema:colorWidgetSchema,
    paste:Object.freeze({
      patterns:PATTERNS,
      fromMatch(match){
        try{return colorWidgetSchema.encode({value:match}).data}catch{return null}
      },
    }),
    insertion:Object.freeze({
      createInitial(){
        return {kind:/** @type {'widget'} */('widget'),data:colorWidgetSchema.createDefault()}
      },
    }),
    setup(runtimeContext){
      let destroyed=false
      return {
        create(id,initial,context){
          if(destroyed)throw new Error('Color inline runtime is destroyed')
          const document=runtimeContext.ownerDocument
          const span=document.createElement('span')
          span.contentEditable='false'
          span.className='oe-ip oe-ip--color'
          span.dataset.inlinePlugin='color'
          span.dataset.id=id

          const dot=document.createElement('span')
          dot.className='oe-ip__dot'
          const label=document.createElement('span')
          label.className='oe-ip__label'
          span.append(dot,label)

          let data={...initial}
          let readOnly=context.isReadOnly()
          let dead=false

          const project=next=>{
            data={...next}
            dot.style.backgroundColor=data.value
            label.textContent=data.value
            span.dataset.value=data.value
            span.setAttribute('aria-label',data.value)
            span.tabIndex=readOnly?-1:0
          }

          const open=()=>{
            if(readOnly||dead)return
            const canonical=context.getData().value
            let committed=false
            const picker=createOwnedColorPicker(document,{
              onApply(cssColor){
                const next=displayValue(cssColor,document)
                context.updateData(()=>({value:next}))
                committed=true
                runtimeContext.hidePopup()
              },
              onChange(cssColor){
                const next=displayValue(cssColor,document)
                dot.style.backgroundColor=next
                label.textContent=next
              },
              onFormatChange(formatted){
                label.textContent=formatted
              },
              showRemove:false,
            })
            const surface=picker.element
            surface.style.display=''
            surface.style.position='static'
            surface.style.transform='none'
            picker.open(parseColorInput(canonical)?canonical:normalizeToHex6(canonical,document))
            runtimeContext.showPopup(span,surface,()=>{
              if(!committed)project(context.getData())
              picker.destroy()
            })
          }

          span.addEventListener('click',event=>{
            if(readOnly)return
            event.preventDefault()
            event.stopPropagation()
            open()
          },{signal:context.signal})
          span.addEventListener('keydown',event=>{
            if(readOnly)return
            if(event.key==='Enter'||event.key===' '){
              event.preventDefault()
              event.stopPropagation()
              open()
            }
          },{signal:context.signal})

          project(data)

          return {
            element:span,
            update(next){if(!dead)project(next)},
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)span.focus()},
            destroy(){dead=true},
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
