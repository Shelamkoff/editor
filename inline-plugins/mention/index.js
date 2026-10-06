// @ts-check
import { uid } from '../../plugin-kit/index.js'
import { invokeObserver } from '../../shared/invokeObserver.js'
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
  const captured={...options}
  const trigger=captured.trigger??'@'
  if(typeof trigger!=='string'||Array.from(trigger).length!==1)throw new TypeError('Mention trigger must be exactly one Unicode code point')
  const snapshot=Object.freeze({...captured,trigger})
  const delay=Number.isFinite(snapshot.debounceDelay)?Math.max(0,Number(snapshot.debounceDelay)):300

  return Object.freeze({
    type:'mention',
    label:Object.freeze({key:'title',fallback:'Mention'}),
    icon:ICON,
    styles:Object.freeze([STYLES_URL]),
    trigger,
    schema:mentionWidgetSchema,
    editing:Object.freeze({
      handle(input,data){
        const display=trigger+data.name
        const backward=input.inputType==='deleteContentBackward'
        const forward=input.inputType==='deleteContentForward'
        if(!backward&&!forward)return null

        const previousIndex=(text,index)=>{
          const at=Math.max(0,Math.min(index,text.length))
          if(at>=2){
            const last=text.charCodeAt(at-1)
            const prev=text.charCodeAt(at-2)
            if(last>=0xDC00&&last<=0xDFFF&&prev>=0xD800&&prev<=0xDBFF)return at-2
          }
          return Math.max(0,at-1)
        }
        const nextIndex=(text,index)=>{
          const at=Math.max(0,Math.min(index,text.length))
          if(at+1<text.length){
            const first=text.charCodeAt(at)
            const next=text.charCodeAt(at+1)
            if(first>=0xD800&&first<=0xDBFF&&next>=0xDC00&&next<=0xDFFF)return at+2
          }
          return Math.min(text.length,at+1)
        }

        let offset=input.offset
        if(input.position==='after')offset=display.length
        if(input.position==='before')offset=0

        if(backward){
          if(offset<=0)return null
          if(display===trigger&&offset>=trigger.length)return {kind:/** @type {'remove'} */('remove')}
          if(offset===trigger.length&&display.startsWith(trigger)){
            return {kind:/** @type {'replace-text'} */('replace-text'),text:data.name}
          }
          if(offset>trigger.length){
            const nameOffset=offset-trigger.length
            const from=previousIndex(data.name,nameOffset)
            return {
              kind:/** @type {'update'} */('update'),
              data:{...data,name:data.name.slice(0,from)+data.name.slice(nameOffset)},
            }
          }
          return null
        }

        if(offset>=display.length)return null
        if(offset<trigger.length){
          return data.name
            ?{kind:/** @type {'replace-text'} */('replace-text'),text:data.name}
            :{kind:/** @type {'remove'} */('remove')}
        }
        const nameOffset=offset-trigger.length
        const to=nextIndex(data.name,nameOffset)
        const nextName=data.name.slice(0,nameOffset)+data.name.slice(to)
        if(!nextName&&trigger.length===0)return {kind:/** @type {'remove'} */('remove')}
        return {kind:/** @type {'update'} */('update'),data:{...data,name:nextName}}
      },
    }),
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
      let compositionSession=null
      const widgetEntries=new Map()
      const listboxId='oe-mention-'+uid()

      const view=runtimeContext.ownerDocument.defaultView??globalThis
      const codePointStartBefore=(text,offset)=>{
        if(offset<=0)return 0
        const last=text.charCodeAt(offset-1)
        if(last>=0xDC00&&last<=0xDFFF&&offset>1){
          const lead=text.charCodeAt(offset-2)
          if(lead>=0xD800&&lead<=0xDBFF)return offset-2
        }
        return offset-1
      }
      const codePointEndAt=(text,offset)=>{
        if(offset>=text.length)return text.length
        const lead=text.charCodeAt(offset)
        if(lead>=0xD800&&lead<=0xDBFF&&offset+1<text.length){
          const tail=text.charCodeAt(offset+1)
          if(tail>=0xDC00&&tail<=0xDFFF)return offset+2
        }
        return offset+1
      }
      const setCaret=(node,offset)=>{
        const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
        if(!selection)return
        const range=runtimeContext.ownerDocument.createRange()
        try{
          range.setStart(node,offset)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
        }catch{}
      }
      const fieldForSpan=span=>span.parentElement?.closest?.('[contenteditable="true"]')??span.parentElement??span
      const ownedAtCaret=()=>{
        const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
        const node=selection?.anchorNode
        if(!node)return null
        const element=node.nodeType===1?node:node.parentElement
        const span=element?.closest?.('[data-inline-plugin="mention"]')
        const entry=span?widgetEntries.get(span):null
        return entry&&span.isConnected?entry:null
      }
      const offsetInSpan=(entry,node,offset)=>{
        if(!node||!entry.span.contains(node))return null
        try{
          const range=runtimeContext.ownerDocument.createRange()
          range.selectNodeContents(entry.span)
          range.setEnd(node,offset)
          return range.toString().length
        }catch{return null}
      }
      const caretOffsetInSpan=entry=>{
        const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
        return selection?offsetInSpan(entry,selection.anchorNode,selection.anchorOffset):null
      }
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
        if(session?.editEntry){
          const entry=session.editEntry
          if(!entry.dead&&entry.span.isConnected){
            try{entry.project(entry.context.getData())}catch{}
          }
        }
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
        const active=popup.querySelector('.oe-mention-item--active')
        queueMicrotask(()=>{
          if(active?.isConnected&&popup?.contains(active))active.scrollIntoView({block:'nearest'})
        })
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
          invokeObserver(()=>snapshot.onMentionSelect?.({id:item.id,name:item.name}))
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
          if(activeSession===session)loadingMore=false
        }
      }

      const startEditSession=(entry,nextText,nextOffset)=>{
        if(entry.dead||entry.readOnly||!entry.span.isConnected)return
        const field=fieldForSpan(entry.span)
        if(!field)return
        const query=nextText.startsWith(trigger)?nextText.slice(trigger.length):nextText
        const session={
          blockId:entry.context.blockId,
          fieldKey:entry.context.fieldKey,
          query,
          range:Object.freeze({start:0,end:0}),
          anchor:field,
          editEntry:entry,
          commit(payload){
            if(entry.dead||entry.readOnly||!entry.span.isConnected)return false
            try{
              entry.context.updateData(()=>payload)
              return true
            }catch{return false}
          },
          cancel(){close()},
        }
        schedule(session)
        const text=entry.span.firstChild
        if(text?.nodeType===3)setCaret(text,Math.min(nextOffset,text.data.length))
      }

      const removeMention=(entry)=>{
        close()
        const span=entry.span
        const field=fieldForSpan(span)
        entry.context.commitDomMutation(()=>{
          const previous=span.previousSibling
          const next=span.nextSibling
          span.remove()
          if(previous?.nodeType===3){
            setCaret(previous,previous.textContent?.length??0)
          }else if(next){
            const range=runtimeContext.ownerDocument.createRange()
            const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
            try{
              range.setStartBefore(next)
              range.collapse(true)
              selection?.removeAllRanges()
              selection?.addRange(range)
            }catch{}
          }else if(field){
            const range=runtimeContext.ownerDocument.createRange()
            const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
            try{
              range.selectNodeContents(field)
              range.collapse(false)
              selection?.removeAllRanges()
              selection?.addRange(range)
            }catch{}
          }
        })
      }

      const unwrapMention=(entry,text,offset=0)=>{
        close()
        const span=entry.span
        entry.context.commitDomMutation(()=>{
          const node=runtimeContext.ownerDocument.createTextNode(text)
          span.replaceWith(node)
          setCaret(node,Math.min(offset,node.data.length))
        })
      }

      const updateMentionText=(entry,text,offset)=>{
        entry.context.updateData(current=>({...current,name:text.slice(trigger.length)}))
        startEditSession(entry,text,offset)
      }

      const handleWidgetBeforeInput=event=>{
        if(event.defaultPrevented||event.isComposing||compositionSession)return
        const entry=ownedAtCaret()
        if(!entry||entry.readOnly||entry.dead)return
        const offset=caretOffsetInSpan(entry)
        if(offset===null)return
        const span=entry.span
        const text=span.textContent??''
        const atStart=offset===0
        const atEnd=offset===text.length

        const native=runtimeContext.ownerDocument.defaultView?.getSelection?.()
        if(native&&!native.isCollapsed){
          if(!native.rangeCount)return
          const range=native.getRangeAt(0)
          const localOffset=(node,at)=>node===span?(at===0?0:text.length):node===span.firstChild?at:null
          const start=localOffset(range.startContainer,range.startOffset)
          const end=localOffset(range.endContainer,range.endOffset)
          if(start===null||end===null)return
          const inserting=(event.inputType==='insertText'||event.inputType==='insertCompositionText')&&typeof event.data==='string'
          const deleting=event.inputType==='deleteContentBackward'||event.inputType==='deleteContentForward'
          if(!inserting&&!deleting)return
          event.preventDefault()
          const value=inserting?event.data:''
          const next=text.slice(0,start)+value+text.slice(end),caret=start+value.length
          if(!next)removeMention(entry)
          else if(!next.startsWith(trigger))unwrapMention(entry,next,caret)
          else{
            updateMentionText(entry,next,caret)
          }
          return
        }

        if(event.inputType==='deleteContentBackward'){
          event.preventDefault()
          if(text===trigger){
            removeMention(entry)
            return
          }
          if(atStart){
            const previous=span.previousSibling
            if(previous?.nodeType===3&&(previous.textContent?.length??0)>0){
              entry.context.commitDomMutation(()=>{
                const value=previous.textContent??''
                const start=codePointStartBefore(value,value.length)
                previous.textContent=value.slice(0,start)
                setCaret(previous,start)
              })
            }
            return
          }
          if(offset===trigger.length&&text.startsWith(trigger)){
            unwrapMention(entry,text.slice(trigger.length),0)
            return
          }
          const start=codePointStartBefore(text,offset)
          const next=text.slice(0,start)+text.slice(offset)
          updateMentionText(entry,next,start)
          return
        }

        if(event.inputType==='deleteContentForward'){
          event.preventDefault()
          if(atEnd){
            const next=span.nextSibling
            if(next?.nodeType===3&&(next.textContent?.length??0)>0){
              entry.context.commitDomMutation(()=>{
                const value=next.textContent??''
                next.textContent=value.slice(codePointEndAt(value,0))
                setCaret(span.firstChild??span,text.length)
              })
            }
            return
          }
          const end=codePointEndAt(text,offset)
          const nextText=text.slice(0,offset)+text.slice(end)
          if(!nextText){
            removeMention(entry)
            return
          }
          if(offset===0&&!nextText.startsWith(trigger)){
            unwrapMention(entry,nextText,0)
            return
          }
          updateMentionText(entry,nextText,offset)
          return
        }

        if(
          (event.inputType==='insertText'||event.inputType==='insertCompositionText')
          &&typeof event.data==='string'
        ){
          if(atStart||atEnd&&!activeSession?.editEntry){
            event.preventDefault()
            entry.context.commitDomMutation(()=>{
              const node=runtimeContext.ownerDocument.createTextNode(event.data)
              if(atStart)span.before(node)
              else span.after(node)
              setCaret(node,event.data.length)
            })
            return
          }
          event.preventDefault()
          const next=text.slice(0,offset)+event.data+text.slice(offset)
          const nextOffset=offset+event.data.length
          updateMentionText(entry,next,nextOffset)
          return
        }

        if(event.inputType==='insertLineBreak'||event.inputType==='insertParagraph'){
          if(activeSession?.editEntry===entry&&items.length){
            event.preventDefault()
            commitSelected()
          }
        }
      }

      const handleEditKeydown=event=>{
        const entry=ownedAtCaret()
        if(!entry||activeSession?.editEntry!==entry)return
        const result=handleSessionKeydown(event,activeSession)
        if(result==='handled'){
          event.preventDefault()
          event.stopPropagation()
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

      const handleSessionKeydown=(event,session)=>{
        if(destroyed||session!==activeSession||compositionSession
          ||event.defaultPrevented||event.isComposing||event.keyCode===229)return 'pass'
        if(!items.length&&(event.key==='ArrowUp'||event.key==='ArrowDown'))return 'pass'
        if(event.key==='ArrowDown'){
          if(items.length){
            if(selected===items.length-1&&cursor&&!loadingMore){
              void load(cursor,true)
            }else{
              selected=Math.min(selected+1,items.length-1)
              render()
            }
          }
          return 'handled'
        }
        if(event.key==='ArrowUp'){
          if(items.length)selected=Math.max(selected-1,0)
          render()
          return 'handled'
        }
        if((event.key==='Enter'||event.key==='Tab')&&items.length){
          commitSelected()
          return 'handled'
        }
        if(event.key==='Escape'){
          session.cancel()
          close()
          return 'handled'
        }
        return 'pass'
      }

      runtimeContext.ownerDocument.addEventListener('compositionstart',()=>{
        const entry=ownedAtCaret()
        if(!entry||entry.dead||entry.readOnly)return
        const selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
        const anchor=caretOffsetInSpan(entry),focus=selection?offsetInSpan(entry,selection.focusNode,selection.focusOffset):null
        if(anchor===null||focus===null)return
        close()
        compositionSession={entry,task:entry.context.beginTask(),anchor,focus}
      },{capture:true,signal:runtimeContext.signal})
      const finishComposition=(session,confirmed)=>{
        const {entry,task,anchor,focus}=session
        if(entry.dead||entry.readOnly||!entry.span.isConnected||task.signal.aborted){
          task.cancel()
          return
        }
        if(!confirmed){
          task.cancel()
          entry.project(entry.context.getData())
          const node=entry.span.firstChild,selection=runtimeContext.ownerDocument.defaultView?.getSelection?.()
          if(node?.nodeType===3)selection?.setBaseAndExtent(node,Math.min(anchor,node.data.length),node,Math.min(focus,node.data.length))
          return
        }
        const text=entry.span.textContent??'',offset=caretOffsetInSpan(entry)??text.length
        if(text.startsWith(trigger)){
          if(task.commit(current=>({...current,name:text.slice(trigger.length)})))startEditSession(entry,text,offset)
        }else{
          task.cancel()
          if(text)unwrapMention(entry,text,offset)
          else removeMention(entry)
        }
      }
      runtimeContext.ownerDocument.addEventListener('compositionend',event=>{
        const session=compositionSession
        compositionSession=null
        // Changing contenteditable can end IME during a host projection or
        // read-only transition. Commit only after that phase has completed.
        if(session)queueMicrotask(()=>finishComposition(session,!!event.data))
      },{capture:true,signal:runtimeContext.signal})

      runtimeContext.ownerDocument.addEventListener('selectionchange',()=>{
        const entry=activeSession?.editEntry
        if(entry&&ownedAtCaret()!==entry)close()
      },{signal:runtimeContext.signal})

      runtimeContext.ownerDocument.addEventListener('beforeinput',handleWidgetBeforeInput,{
        capture:true,
        signal:runtimeContext.signal,
      })
      runtimeContext.ownerDocument.addEventListener('keydown',handleEditKeydown,{
        capture:true,
        signal:runtimeContext.signal,
      })

      return {
        create(id,initial,context){
          if(destroyed)throw new Error('Mention inline runtime is destroyed')
          const span=runtimeContext.ownerDocument.createElement('span')
          span.className='oe-ip oe-ip--mention'
          span.dataset.inlinePlugin='mention'
          span.dataset.id=id
          let data={...initial}
          let readOnly=context.isReadOnly()
          let dead=false
          const entry={span,context,readOnly,dead,project:null}
          widgetEntries.set(span,entry)

          const project=next=>{
            data={...next}
            span.dataset.value=data.id
            const label=trigger+data.name
            if(span.textContent!==label)span.textContent=label
            span.contentEditable=readOnly?'false':'true'
            if(readOnly)span.contentEditable='false'
            else span.removeAttribute('contenteditable')
            span.tabIndex=readOnly?-1:0
            entry.readOnly=readOnly
          }
          entry.project=project
          project(data)

          return {
            element:span,
            update(next){if(!dead)project(next)},
            setReadOnly(value){readOnly=value;entry.readOnly=readOnly;project(data)},
            focus(){if(!dead&&!readOnly)span.focus()},
            destroy(){
              dead=true
              entry.dead=true
              widgetEntries.delete(span)
              if(compositionSession?.entry===entry){
                compositionSession.task.cancel()
                compositionSession=null
              }
              if(activeSession?.editEntry===entry)close()
            },
          }
        },
        onTriggerQuery(session){
          if(!destroyed)schedule(session)
        },
        onTriggerKeydown(event,session){
          return handleSessionKeydown(event,session)
        },
        onTriggerCancel(){
          close()
        },
        destroy(){
          destroyed=true
          compositionSession?.task.cancel()
          compositionSession=null
          close()
        },
      }
    },
  })
}

export { createMentionRenderer } from './widget.js'
