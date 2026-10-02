// @ts-check
import { uid } from '../../plugin-kit/index.js'
import { setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { mentionWidgetSchema } from '../../shared/inlineSchemas/mention.js'

const STYLES_URL=new URL('./styles.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6m-3-3h6"/></svg>'

function isElement(value,document){
  const Ctor=document.defaultView?.HTMLElement
  return !!Ctor&&value instanceof Ctor
}

function normalizeResult(raw){
  const source=Array.isArray(raw)
    ?raw
    :(raw&&typeof raw==='object'&&Array.isArray(raw.items)?raw.items:[])
  const items=source.filter(item=>(
    item&&typeof item==='object'
    &&(typeof item.id==='string'||(typeof item.id==='number'&&Number.isFinite(item.id)))
    &&typeof item.name==='string'
  ))
  const cursor=!Array.isArray(raw)&&raw&&typeof raw==='object'&&typeof raw.nextPageUrl==='string'&&raw.nextPageUrl
    ?raw.nextPageUrl
    :null
  return {items,cursor}
}

/**
 * @typedef {Object} MentionV2Options
 * @property {string} [trigger='@'] Single-code-point trigger that starts mention search.
 * @property {(query:string,nextPageUrl:string|null,context:{signal:AbortSignal})=>Promise<any>} [searchFunction] Resolve mention candidates for the current query and optional next page.
 * @property {number} [debounceDelay=300] Delay in milliseconds before invoking mention search.
 * @property {string} [noResultsText] Fallback label shown when search returns no candidates.
 * @property {string} [dropdownClass] Additional class applied to the mention results popup.
 * @property {(data:{id:string|number,name:string})=>void} [onMentionSelect] Observer invoked after a mention is committed.
 * @property {(data:any,index:number,isActive:boolean)=>HTMLElement|null|undefined} [renderItem] Render one search-result row in the editor owner document.
 * @property {(text:string)=>HTMLElement|null|undefined} [renderNoResults] Render custom empty-search content.
 * @property {()=>HTMLElement|null|undefined} [renderLoading] Render custom loading content while fetching more results.
 */

/** Create an immutable inline mention-widget definition.\n * @param {MentionV2Options} [options] Consumer-owned options snapshotted by the factory.\n * @returns {import('../../plugin-kit/types').InlinePluginDefinition<{id:string,name:string}>}\n */
export function createMentionPlugin(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Mention options must be an object')
  const trigger=options.trigger??'@'
  if(typeof trigger!=='string'||Array.from(trigger).length!==1)throw new TypeError('Mention trigger must be exactly one Unicode code point')
  const snapshot=Object.freeze({...options,trigger})
  const delay=Number.isFinite(snapshot.debounceDelay)?Math.max(0,Number(snapshot.debounceDelay)):300

  return Object.freeze({
    type:'mention',
    label:Object.freeze({key:'title',fallback:'Mention'}),
    icon:ICON,
    styles:Object.freeze([STYLES_URL]),
    trigger,
    schema:mentionWidgetSchema,
    insertion:Object.freeze({
      createInitial(){
        return {kind:/** @type {'text'} */('text'),text:trigger}
      },
    }),
    setup(runtimeContext){
      let destroyed=false
      let popup=null
      let activeSession=null
      let items=[]
      let selected=0
      let cursor=null
      let query=''
      let searchController=null
      let timer=null
      let loadingMore=false
      const listboxId='oe-mention-'+uid()

      const view=runtimeContext.ownerDocument.defaultView??globalThis
      const clearTimer=()=>{
        if(timer!==null){
          view.clearTimeout(timer)
          timer=null
        }
      }
      const abortSearch=()=>{
        searchController?.abort()
        searchController=null
        clearTimer()
        loadingMore=false
      }
      const clearAria=session=>{
        const anchor=session?.anchor
        if(!anchor)return
        if(anchor.getAttribute('aria-controls')===listboxId)anchor.removeAttribute('aria-controls')
        anchor.removeAttribute('aria-expanded')
        anchor.removeAttribute('aria-haspopup')
        anchor.removeAttribute('aria-autocomplete')
        anchor.removeAttribute('aria-activedescendant')
      }
      const syncAria=()=>{
        const anchor=activeSession?.anchor
        if(!anchor||!popup)return
        anchor.setAttribute('aria-controls',listboxId)
        anchor.setAttribute('aria-expanded','true')
        anchor.setAttribute('aria-haspopup','listbox')
        anchor.setAttribute('aria-autocomplete','list')
        const active=popup.querySelector('.oe-mention-item--active[role="option"]')
        if(active?.id)anchor.setAttribute('aria-activedescendant',active.id)
        else anchor.removeAttribute('aria-activedescendant')
      }
      const close=()=>{
        const session=activeSession
        abortSearch()
        activeSession=null
        items=[]
        selected=0
        cursor=null
        query=''
        clearAria(session)
        runtimeContext.hidePopup()
        popup?.remove()
        popup=null
      }

      const render=()=>{
        if(!popup)return
        popup.replaceChildren()
        if(items.length===0){
          const text=snapshot.noResultsText??runtimeContext.t('noResults','No results')
          const custom=snapshot.renderNoResults?.(text)
          if(isElement(custom,runtimeContext.ownerDocument)){
            custom.classList.add('oe-mention-no-results')
            custom.setAttribute('role','status')
            popup.appendChild(custom)
          }else{
            const empty=runtimeContext.ownerDocument.createElement('div')
            empty.className='oe-mention-item oe-mention-no-results'
            empty.setAttribute('role','status')
            empty.textContent=text
            popup.appendChild(empty)
          }
          syncAria()
          return
        }

        items.forEach((item,index)=>{
          let row=snapshot.renderItem?.(item,index,index===selected)
          if(!isElement(row,runtimeContext.ownerDocument)){
            const button=runtimeContext.ownerDocument.createElement('button')
            button.type='button'
            button.className='oe-mention-item'
            row=button
            if(item.avatar){
              const image=runtimeContext.ownerDocument.createElement('img')
              image.className='oe-mention-avatar'
              image.alt=''
              setSafeUrlAttribute(image,'src',String(item.avatar),'media')
              row.appendChild(image)
            }else{
              const placeholder=runtimeContext.ownerDocument.createElement('span')
              placeholder.className='oe-mention-avatar-placeholder'
              placeholder.textContent=(item.name||'?').charAt(0).toUpperCase()
              row.appendChild(placeholder)
            }
            const info=runtimeContext.ownerDocument.createElement('span')
            info.className='oe-mention-info'
            const name=runtimeContext.ownerDocument.createElement('span')
            name.className='oe-mention-name'
            name.textContent=item.name
            info.appendChild(name)
            if(item.details){
              const details=runtimeContext.ownerDocument.createElement('span')
              details.className='oe-mention-details'
              details.textContent=String(item.details)
              info.appendChild(details)
            }
            row.appendChild(info)
          }
          row.classList.add('oe-mention-item')
          row.classList.toggle('oe-mention-item--active',index===selected)
          row.dataset.index=String(index)
          row.id=`${listboxId}-option-${index}`
          row.setAttribute('role','option')
          row.setAttribute('aria-selected',String(index===selected))
          row.addEventListener('mousedown',event=>event.preventDefault(),{signal:runtimeContext.signal})
          row.addEventListener('click',()=>{
            selected=index
            commitSelected()
          },{signal:runtimeContext.signal})
          popup.appendChild(row)
        })
        syncAria()
      }

      const showLoading=()=>{
        if(!popup)return
        let loader=snapshot.renderLoading?.()
        if(!isElement(loader,runtimeContext.ownerDocument)){
          loader=runtimeContext.ownerDocument.createElement('div')
          loader.className='oe-mention-loading'
          loader.textContent=runtimeContext.t('loading','Loading...')
        }
        loader.classList.add('oe-mention-loading')
        popup.appendChild(loader)
      }

      const commitSelected=()=>{
        const session=activeSession
        const item=items[selected]
        if(!session||!item)return
        const payload={id:String(item.id),name:item.name}
        if(session.commit(payload)){
          snapshot.onMentionSelect?.({id:item.id,name:item.name})
          close()
        }
      }

      const load=async(nextPageUrl=null,append=false)=>{
        const session=activeSession
        if(!session||destroyed)return
        if(typeof snapshot.searchFunction!=='function'){
          items=[]
          cursor=null
          render()
          return
        }
        searchController?.abort()
        const Ctor=runtimeContext.ownerDocument.defaultView?.AbortController??AbortController
        const controller=new Ctor()
        searchController=controller
        const abort=()=>controller.abort(runtimeContext.signal.reason)
        runtimeContext.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
        if(append)loadingMore=true
        else{
          items=[]
          selected=0
          render()
        }
        showLoading()
        try{
          const raw=await snapshot.searchFunction(query,nextPageUrl,{signal:controller.signal})
          if(controller.signal.aborted||session!==activeSession)return
          const normalized=normalizeResult(raw)
          items=append?[...items,...normalized.items]:normalized.items
          cursor=normalized.cursor
          selected=Math.min(selected,Math.max(0,items.length-1))
          render()
        }catch{
          if(!controller.signal.aborted&&session===activeSession){
            items=[]
            cursor=null
            render()
          }
        }finally{
          if(searchController===controller)searchController=null
          loadingMore=false
        }
      }

      const schedule=session=>{
        abortSearch()
        activeSession=session
        query=session.query
        if(!popup){
          popup=runtimeContext.ownerDocument.createElement('div')
          popup.id=listboxId
          popup.className=['oe-mention-dropdown','oe-mention-dropdown--active',snapshot.dropdownClass??''].filter(Boolean).join(' ')
          popup.setAttribute('role','listbox')
          popup.addEventListener('scroll',()=>{
            if(!cursor||loadingMore||!popup)return
            if(popup.scrollTop+popup.clientHeight>=popup.scrollHeight-24)void load(cursor,true)
          },{signal:runtimeContext.signal})
        }
        syncAria()
        runtimeContext.showPopup(session.anchor,popup,()=>{
          clearAria(session)
          if(activeSession===session){
            abortSearch()
            activeSession=null
          }
        })
        timer=view.setTimeout(()=>{
          timer=null
          void load(null,false)
        },delay)
      }

      return {
        create(id,initial,context){
          if(destroyed)throw new Error('Mention inline runtime is destroyed')
          const span=runtimeContext.ownerDocument.createElement('span')
          span.contentEditable='false'
          span.className='oe-ip oe-ip--mention'
          span.dataset.inlinePlugin='mention'
          span.dataset.id=id
          let data={...initial}
          let readOnly=context.isReadOnly()
          let dead=false

          const project=next=>{
            data={...next}
            span.dataset.value=data.id
            span.textContent=trigger+data.name
            span.tabIndex=readOnly?-1:0
          }
          project(data)

          return {
            element:span,
            update(next){if(!dead)project(next)},
            setReadOnly(value){readOnly=value;project(data)},
            focus(){if(!dead&&!readOnly)span.focus()},
            destroy(){dead=true},
          }
        },
        onTriggerQuery(session){
          if(!destroyed)schedule(session)
        },
        onTriggerKeydown(event,session){
          if(destroyed||session!==activeSession)return 'pass'
          if(event.key==='ArrowDown'){
            if(items.length)selected=(selected+1)%items.length
            render()
            return 'handled'
          }
          if(event.key==='ArrowUp'){
            if(items.length)selected=(selected-1+items.length)%items.length
            render()
            return 'handled'
          }
          if(event.key==='Enter'&&items.length){
            commitSelected()
            return 'handled'
          }
          if(event.key==='Escape'){
            session.cancel()
            close()
            return 'handled'
          }
          return 'pass'
        },
        onTriggerCancel(){
          close()
        },
        destroy(){
          destroyed=true
          close()
        },
      }
    },
  })
}

export { createMentionRenderer } from './widget.js'
