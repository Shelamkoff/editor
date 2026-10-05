// @ts-check
import { pollDataSchema } from '../../shared/blockSchemas/poll.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { setSanitizedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import { createTextClipboardSlice } from '../shared/textClipboardSlice.js'
import {
  applyLocalPollVote,
  normalizePollResults,
  shouldAcceptPollRevision,
} from '../../shared/pollData.js'

const editorStyles=new URL('./poll.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16v-8"/><path d="M17 16V5"/></svg>'

/**
 * @typedef {import('../../shared/pollData').PollResults} PollResults
 * @typedef {Object} PollDataSource
 * @property {(context:{pollId:string,signal:AbortSignal})=>Promise<PollResults>} load Load the latest results for a poll.
 * @property {(context:{pollId:string,optionIds:string[],revision?:string,signal:AbortSignal})=>Promise<PollResults>} vote Submit a vote and return the resulting poll state.
 * @property {(context:{pollId:string,signal:AbortSignal,onUpdate(results:PollResults):void,onError(error:unknown):void})=>void|(()=>void)} [subscribe] Subscribe to live poll result updates; return an optional disposer.
 */

/**
 * Create an immutable Poll block definition with optional remote loading, voting, and live result subscription.
 * @param {{dataSource?:PollDataSource,onError?:(error:unknown)=>void|Promise<void>,maxVoters?:number,compareRevisions?:(next:string,current:string)=>number,injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}
 */
export function createPollPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Poll configuration must be an object')
  const snapshot=Object.freeze({...config})
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles)
  if(snapshot.css)styles.push(snapshot.css)
  const maxVoters=Number.isFinite(snapshot.maxVoters)?Math.max(0,Math.floor(Number(snapshot.maxVoters))):50

  const capabilities=Object.freeze({
    selectionSlice:createTextSelectionSlice(pollDataSchema),
    clipboard:createTextClipboardSlice(pollDataSchema),
    empty:Object.freeze({
      isEmpty:data=>!data.question.trim()&&data.options.every(option=>!option.text.trim()),
    }),
    shortcuts:Object.freeze(/** @type {import('../../plugin-kit/types').ShortcutCapability<any>} */ ({
      handle(input,data,context){
        if(input.fieldKey==='question'&&input.key==='Enter'&&!input.shiftKey){
          return {kind:'focus',target:{fieldKey:'option:'+data.options[0].id,offset:'start'}}
        }
        if(input.fieldKey.startsWith('option:')&&input.key==='Enter'&&!input.shiftKey){
          const index=data.options.findIndex(option=>'option:'+option.id===input.fieldKey)
          if(index<0)return null
          const option={id:context.createId('option'),text:''}
          const options=[...data.options.slice(0,index+1),option,...data.options.slice(index+1)]
          return {kind:'update',data:{...data,options},focus:{fieldKey:'option:'+option.id,offset:'start'}}
        }
        if(input.fieldKey.startsWith('option:')&&input.key==='Backspace'&&data.options.length>2){
          const index=data.options.findIndex(option=>'option:'+option.id===input.fieldKey)
          if(index>=0&&!data.options[index].text.trim()){
            const previous=data.options[Math.max(0,index-1)]
            const next=index===0?data.options[1]:previous
            return {
              kind:'update',data:{...data,options:data.options.filter((_,itemIndex)=>itemIndex!==index)},
              focus:{fieldKey:'option:'+next.id,offset:context.fieldLength('option:'+next.id)},
            }
          }
        }
        if((input.fieldKey==='question'||input.fieldKey.startsWith('option:'))
          &&['Enter','Backspace','Delete','ArrowUp','ArrowDown'].includes(input.key))return {kind:'native'}
        return null
      },
    })),
    conversion:Object.freeze({
      selectionMode:'single',
      export:data=>({kind:'rich-text',data:{text:[data.question,...data.options.map(option=>option.text)].filter(Boolean).join('<br>')}}),
      canImport:payload=>payload?.kind==='rich-text'&&typeof payload.data?.text==='string',
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string')throw new TypeError('Poll can only import rich-text payloads')
        const data=pollDataSchema.createDefault()
        return {...data,question:payload.data.text}
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return [
          Object.freeze({id:'single',label:Object.freeze({key:'single',fallback:'Single choice'}),active:data.type==='single'}),
          Object.freeze({id:'multiple',label:Object.freeze({key:'multiple',fallback:'Multiple choice'}),active:data.type==='multiple'}),
          Object.freeze({id:'results-always',label:Object.freeze({key:'resultsAlways',fallback:'Always show results'}),active:data.resultsMode==='always'}),
          Object.freeze({id:'results-afterVote',label:Object.freeze({key:'resultsAfterVote',fallback:'Show after vote'}),active:data.resultsMode==='afterVote'}),
          Object.freeze({id:'results-hidden',label:Object.freeze({key:'resultsHidden',fallback:'Hide results'}),active:data.resultsMode==='hidden'}),
          Object.freeze({id:'sort',label:Object.freeze({key:'sort',fallback:'Sort'})}),
        ]
      },
      apply(data,actionId){
        if(actionId==='sort')return {...data,options:[...data.options].sort((a,b)=>a.text.localeCompare(b.text))}
        if(actionId==='single'||actionId==='multiple'){
          const next={...data,type:actionId}
          const previous=data.initialResults?.currentUserVote??[]
          if(actionId==='single'&&previous.length>1&&!snapshot.dataSource){
            next.initialResults=applyLocalPollVote(data.initialResults,previous,previous.slice(0,1),data.options.map(option=>option.id))
          }
          return next
        }
        if(actionId.startsWith('results-')){
          const mode=actionId.slice(8)
          if(mode==='always'||mode==='afterVote'||mode==='hidden')return {...data,resultsMode:mode}
        }
        throw new RangeError('Unknown poll setting: '+actionId)
      },
    }),
  })

  return Object.freeze({
    type:'poll',
    label:Object.freeze({key:'title',fallback:'Poll'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:pollDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Poll runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-poll'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          let data=cloneData(initial)
          let readOnly=context.isReadOnly()
          let dead=false
          let runtime=normalizePollResults(data.initialResults,data.options.map(option=>option.id),maxVoters,data.type)
          let selected=new Set(runtime.currentUserVote??[])
          let hasVoted=(runtime.currentUserVote?.length??0)>0
          let loading=false
          let submitting=false
          let controller=null
          let voteController=null
          let unsubscribe=null
          let connectionVersion=0
          let loadVersion=0

          const report=error=>{
            if(snapshot.onError){
              try{
                const observed=snapshot.onError(error)
                Promise.resolve(observed).catch(()=>{})
              }catch{}
            }else{
              console.warn('[Poll] Runtime operation failed',error)
            }
          }

          const acceptResults=next=>{
            const normalized=normalizePollResults(next,data.options.map(option=>option.id),maxVoters,data.type)
            if(!shouldAcceptPollRevision(normalized.revision,runtime.revision,snapshot.compareRevisions))return false
            runtime=normalized
            selected=new Set(normalized.currentUserVote??selected)
            hasVoted ||= (normalized.currentUserVote?.length??0)>0
            return true
          }

          const resultVisible=()=>data.resultsMode==='always'||(data.resultsMode==='afterVote'&&hasVoted)

          const project=()=>{
            wrapper.replaceChildren()

            const question=document.createElement('div')
            question.className='oe-poll__question'
            question.contentEditable=readOnly?'false':'true'
            question.dataset.placeholder=runtimeContext.t('questionPlaceholder','Ask a question...')
            setSanitizedHtml(question,data.question)
            question.setAttribute('data-oe-document-input','text')
            wrapper.appendChild(question)

            const list=document.createElement('div')
            list.className='oe-poll__options'
            const byId=new Map(runtime.options.map(option=>[option.id,option.votes]))
            const total=Math.max(0,runtime.total||0)

            data.options.forEach((option,index)=>{
              const row=document.createElement('div')
              row.className='oe-poll__option'
              row.dataset.optionId=option.id

              const choice=document.createElement('button')
              choice.type='button'
              choice.className='oe-poll__choice oe-poll__option-marker oe-poll__option-marker--'+data.type
              choice.dataset.optionId=option.id
              choice.setAttribute('aria-pressed',String(selected.has(option.id)))
              choice.textContent=selected.has(option.id)?'✓':'○'
              choice.classList.toggle('oe-poll__option-marker--selected',selected.has(option.id))
              choice.disabled=readOnly||loading||submitting
              choice.addEventListener('click',()=>toggleSelection(option.id),{signal:context.signal})

              const text=document.createElement('div')
              text.className='oe-poll__option-text'
              text.contentEditable=readOnly?'false':'true'
              setSanitizedHtml(text,option.text)
              text.dataset.optionId=option.id
              text.setAttribute('data-oe-document-input','text')
              row.append(choice,text)

              if(!readOnly){
                const remove=document.createElement('button')
                remove.type='button'
                remove.className='oe-poll__remove oe-poll__option-remove'
                remove.textContent='×'
                remove.disabled=data.options.length<=2
                remove.addEventListener('click',()=>{
                  if(data.options.length<=2)return
                  retainControlFocus(wrapper,()=>context.updateData(current=>({...current,options:current.options.filter(item=>item.id!==option.id)})))
                },{signal:context.signal})
                row.appendChild(remove)
              }


              list.appendChild(row)
            })
            wrapper.appendChild(list)

            if(resultVisible()&&!loading){
              const results=document.createElement('div')
              results.className='oe-poll__results'
              for(const option of data.options){
                const row=document.createElement('div')
                row.className='oe-poll__result-row'
                const label=document.createElement('span')
                label.className='oe-poll__result-label'
                setSanitizedHtml(label,option.text||'—')
                const bar=document.createElement('div')
                bar.className='oe-poll__result-bar'
                const fill=document.createElement('div')
                fill.className='oe-poll__result-fill'
                const votes=byId.get(option.id)??0
                const percent=total>0?Math.round(votes/total*100):0
                fill.style.width=percent+'%'
                bar.appendChild(fill)
                const pct=document.createElement('span')
                pct.className='oe-poll__pct oe-poll__result-pct'
                pct.textContent=percent+'%'
                row.append(label,bar,pct)
                results.appendChild(row)
              }
              wrapper.appendChild(results)

              if(runtime.voters?.length){
                const section=document.createElement('div')
                section.className='oe-poll__voters'
                const list=document.createElement('ul')
                for(const voter of runtime.voters){
                  const item=document.createElement('li')
                  if(voter.avatar){
                    try{
                      const url=new URL(voter.avatar,document.baseURI)
                      if(['http:','https:','data:','blob:'].includes(url.protocol)){
                        const avatar=document.createElement('img')
                        avatar.src=url.href
                        avatar.alt=''
                        item.appendChild(avatar)
                      }
                    }catch{}
                  }
                  const name=document.createElement('span')
                  name.textContent=voter.name||runtimeContext.t('anonymousVoter','Anonymous voter')
                  item.appendChild(name)
                  list.appendChild(item)
                }
                section.appendChild(list)
                wrapper.appendChild(section)
              }
            }

            const submit=document.createElement('button')
            submit.type='button'
            submit.className='oe-poll__submit'
            submit.disabled=readOnly||loading||submitting||selected.size===0
            submit.textContent=submitting?runtimeContext.t('submitting','Submitting…'):runtimeContext.t('vote','Vote')
            submit.addEventListener('click',()=>void submitVote(),{signal:context.signal})
            wrapper.appendChild(submit)

            if(!readOnly){
              const add=document.createElement('button')
              add.type='button'
              add.className='oe-poll__add oe-poll__option-add'
              add.textContent=runtimeContext.t('addOption','Add option')
              add.addEventListener('click',()=>{
                const id=context.createId('option')
                retainControlFocus(wrapper,()=>context.updateData(current=>({...current,options:[...current.options,{id,text:''}]})))
              },{signal:context.signal})
              wrapper.appendChild(add)

              const actions=document.createElement('div')
              actions.className='oe-poll__actions'
              const actionButton=(id,label,operation)=>{
                const button=document.createElement('button')
                button.type='button'
                button.className='oe-poll__action-btn'+(id==='reset'?' oe-poll__action-btn--danger':'')
                button.dataset.pollAction=id
                button.textContent=label
                button.addEventListener('mousedown',event=>event.preventDefault(),{signal:context.signal})
                button.addEventListener('click',()=>{
                  if(dead||readOnly)return
                  wrapper.focus({preventScroll:true})
                  retainControlFocus(wrapper,()=>context.updateData(operation))
                },{signal:context.signal})
                actions.appendChild(button)
              }
              actionButton('type',runtimeContext.t(data.type==='single'?'single':'multiple','Choice type'),current=>capabilities.settings.apply(current,current.type==='single'?'multiple':'single'))
              const resultsKey=data.resultsMode==='always'?'resultsAlways':data.resultsMode==='afterVote'?'resultsAfterVote':'resultsHidden'
              actionButton('results',runtimeContext.t(resultsKey,'Results'),current=>{
                const modes=['always','afterVote','hidden']
                return capabilities.settings.apply(current,'results-'+modes[(modes.indexOf(current.resultsMode)+1)%modes.length])
              })
              actionButton('sort',runtimeContext.t('sort','Sort'),current=>capabilities.settings.apply(current,'sort'))
              actionButton('reset',runtimeContext.t('delete','Delete'),()=>pollDataSchema.createDefault())
              wrapper.appendChild(actions)
            }

            if(loading||submitting){
              const status=document.createElement('div')
              status.className='oe-poll__status'
              status.textContent=loading?runtimeContext.t('loading','Loading...'):runtimeContext.t('submitting','Submitting...')
              wrapper.appendChild(status)
            }
          }

          const syncAuthoring=()=>{
            if(readOnly||dead)return
            const question=wrapper.querySelector('.oe-poll__question')
            const optionNodes=[...wrapper.querySelectorAll('.oe-poll__option-text')]
            context.updateData(current=>({
              ...current,
              question:question?.innerHTML??current.question,
              options:current.options.map(option=>{
                const node=optionNodes.find(el=>el.dataset.optionId===option.id)
                return node?{...option,text:node.innerHTML}:option
              }),
            }))
          }

          const disposeSubscription=()=>{
            const dispose=unsubscribe
            unsubscribe=null
            if(typeof dispose!=='function')return
            try{dispose()}catch(error){report(error)}
          }

          const connect=()=>{
            disposeSubscription()
            controller?.abort()
            voteController?.abort()
            voteController=null
            submitting=false
            loading=false
            if(!snapshot.dataSource||!data.pollId||dead)return
            const Ctor=document.defaultView?.AbortController??AbortController
            const connectionController=new Ctor()
            controller=connectionController
            const version=++connectionVersion
            const pendingLoad=++loadVersion
            const abort=()=>connectionController.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:connectionController.signal})
            loading=true
            project()
            if(snapshot.dataSource.subscribe){
              try{
                const stop=snapshot.dataSource.subscribe({
                  pollId:data.pollId,
                  signal:connectionController.signal,
                  onUpdate(results){
                    if(dead||connectionController.signal.aborted||version!==connectionVersion)return
                    loadVersion++
                    loading=false
                    if(acceptResults(results))project()
                  },
                  onError:error=>{if(!dead&&!connectionController.signal.aborted&&version===connectionVersion)report(error)},
                })
                if(typeof stop==='function')unsubscribe=stop
              }catch(error){
                if(!dead&&!connectionController.signal.aborted&&version===connectionVersion)report(error)
              }
            }
            void Promise.resolve().then(()=>{
              if(dead||connectionController.signal.aborted||version!==connectionVersion||pendingLoad!==loadVersion)return undefined
              return snapshot.dataSource.load({pollId:data.pollId,signal:connectionController.signal})
            }).then(results=>{
              if(results===undefined||dead||connectionController.signal.aborted||version!==connectionVersion||pendingLoad!==loadVersion)return
              if(acceptResults(results))project()
            }).catch(error=>{
              if(!dead&&!connectionController.signal.aborted&&version===connectionVersion&&pendingLoad===loadVersion)report(error)
            }).finally(()=>{
              if(dead||connectionController.signal.aborted||version!==connectionVersion||pendingLoad!==loadVersion)return
              loading=false
              project()
            })
          }

          const toggleSelection=optionId=>{
            if(readOnly||dead||submitting)return
            const next=new Set(selected)
            if(data.type==='single'){
              next.clear()
              next.add(optionId)
            }else if(next.has(optionId)){
              next.delete(optionId)
            }else{
              next.add(optionId)
            }
            selected=next
            project()
          }

          const submitVote=async ()=>{
            if(readOnly||dead||submitting||selected.size===0)return
            const previous=[...(runtime.currentUserVote??[])]
            const optionIds=[...selected]
            if(!snapshot.dataSource||!data.pollId){
              runtime=applyLocalPollVote(runtime,previous,optionIds,data.options.map(option=>option.id))
              selected=new Set(optionIds)
              hasVoted=true
              retainControlFocus(wrapper,()=>{
                context.updateData(current=>({...current,initialResults:runtime}))
                project()
              })
              return
            }
            if(!controller||controller.signal.aborted)connect()
            const Ctor=document.defaultView?.AbortController??AbortController
            const pendingVote=new Ctor()
            voteController=pendingVote
            const abort=()=>pendingVote.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:pendingVote.signal})
            submitting=true
            project()
            try{
              const results=await snapshot.dataSource.vote({
                pollId:data.pollId,
                optionIds,
                revision:runtime.revision,
                signal:pendingVote.signal,
              })
              if(!dead&&!pendingVote.signal.aborted&&voteController===pendingVote){
                hasVoted=true
                acceptResults(results)
                project()
              }
            }catch(error){
              if(!dead&&!pendingVote.signal.aborted&&voteController===pendingVote)report(error)
            }finally{
              if(voteController===pendingVote){
                voteController=null
                submitting=false
                if(!dead)project()
              }
              pendingVote.abort()
            }
          }

          wrapper.addEventListener('focusout',event=>{
            if(!readOnly&&wrapper.contains(/** @type {Node} */(event.target)))queueMicrotask(syncAuthoring)
          },{signal:context.signal})

          project()
          connect()

          return {
            element:wrapper,
            read:()=>{
              const question=wrapper.querySelector('.oe-poll__question')
              const optionNodes=[...wrapper.querySelectorAll('.oe-poll__option-text')]
              return {
                ...cloneData(data),
                question:question?.innerHTML??data.question,
                options:data.options.map(option=>{
                  const node=optionNodes.find(el=>el.dataset.optionId===option.id)
                  return node?{...option,text:node.innerHTML}:option
                }),
              }
            },
            update(next){
              const reconnect=next.pollId!==data.pollId||next.type!==data.type||next.options.map(x=>x.id).join('|')!==data.options.map(x=>x.id).join('|')
              const initialChanged=JSON.stringify(next.initialResults??null)!==JSON.stringify(data.initialResults??null)
              data=cloneData(next)
              runtime=normalizePollResults(
                initialChanged?data.initialResults:(data.initialResults??runtime),
                data.options.map(option=>option.id),
                maxVoters,
                data.type,
              )
              selected=new Set(runtime.currentUserVote??[])
              if(initialChanged)hasVoted=(runtime.currentUserVote?.length??0)>0
              else hasVoted=(runtime.currentUserVote?.length??0)>0||hasVoted
              if(reconnect)connect()
              project()
            },
            editableFields:()=>Object.freeze([
              ...(!readOnly?[Object.freeze({key:'question',element:/** @type {HTMLElement} */(wrapper.querySelector('.oe-poll__question')),mode:/** @type {'rich-text'} */('rich-text')})]:[]),
              ...data.options.flatMap(option=>{
                const element=wrapper.querySelector(`.oe-poll__option-text[data-option-id="${cssEscape(option.id)}"]`)
                return element?[Object.freeze({key:'option:'+option.id,element:/** @type {HTMLElement} */(element),mode:/** @type {'rich-text'} */('rich-text')})]:[]
              }),
            ]),
            setReadOnly(value){readOnly=value;project()},
            focus(){if(!dead&&!readOnly)(wrapper.querySelector('.oe-poll__question'))?.focus()},
            destroy(){
              if(dead)return
              dead=true
              connectionVersion++
              loadVersion++
              controller?.abort()
              voteController?.abort()
              voteController=null
              controller=null
              disposeSubscription()
            },
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}

function cloneData(data){
  const copy={
    question:data.question,
    type:data.type,
    options:data.options.map(option=>({...option})),
    resultsMode:data.resultsMode,
  }
  if(data.pollId)copy.pollId=data.pollId
  if(data.initialResults)copy.initialResults=structuredCloneSafe(data.initialResults)
  return copy
}

function structuredCloneSafe(value){
  return JSON.parse(JSON.stringify(value))
}

function cssEscape(value){
  const escape=globalThis.CSS?.escape
  return escape?escape(value):value.replace(/["\\]/g,'\\$&')
}
