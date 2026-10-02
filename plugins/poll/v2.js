// @ts-check
import { pollDataSchema } from '../../shared/blockSchemas/poll.js'
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
 * @property {(context:{pollId:string,signal:AbortSignal})=>Promise<PollResults>} load
 * @property {(context:{pollId:string,optionIds:string[],revision?:string,signal:AbortSignal})=>Promise<PollResults>} vote
 * @property {(context:{pollId:string,signal:AbortSignal,onUpdate(results:PollResults):void,onError(error:unknown):void})=>void|(()=>void)} [subscribe]
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
    empty:Object.freeze({
      isEmpty:data=>!data.question.trim()&&data.options.every(option=>!option.text.trim()),
    }),
    conversion:Object.freeze({
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
        ]
      },
      apply(data,actionId){
        if(actionId==='single'||actionId==='multiple')return {...data,type:actionId}
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
          let loading=false
          let submitting=false
          let controller=null
          let unsubscribe=null
          let connectionVersion=0

          const report=error=>{
            if(snapshot.onError){
              try{void snapshot.onError(error)}catch{}
            }else{
              console.warn('[Poll] Runtime operation failed',error)
            }
          }

          const acceptResults=next=>{
            const normalized=normalizePollResults(next,data.options.map(option=>option.id),maxVoters,data.type)
            if(!shouldAcceptPollRevision(normalized.revision,runtime.revision,snapshot.compareRevisions))return false
            runtime=normalized
            selected=new Set(normalized.currentUserVote??selected)
            return true
          }

          const resultVisible=()=>data.resultsMode==='always'||(data.resultsMode==='afterVote'&&selected.size>0)

          const project=()=>{
            wrapper.replaceChildren()

            const question=document.createElement('div')
            question.className='oe-poll__question'
            question.contentEditable=readOnly?'false':'true'
            question.dataset.placeholder=runtimeContext.t('questionPlaceholder','Ask a question...')
            question.textContent=data.question
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
              choice.className='oe-poll__choice'
              choice.setAttribute('aria-pressed',String(selected.has(option.id)))
              choice.textContent=selected.has(option.id)?'✓':'○'
              choice.disabled=!readOnly||loading||submitting
              choice.addEventListener('click',()=>void toggleVote(option.id),{signal:context.signal})

              const text=document.createElement('div')
              text.className='oe-poll__option-text'
              text.contentEditable=readOnly?'false':'true'
              text.textContent=option.text
              text.dataset.optionId=option.id
              text.setAttribute('data-oe-document-input','text')
              row.append(choice,text)

              if(!readOnly){
                const remove=document.createElement('button')
                remove.type='button'
                remove.className='oe-poll__remove'
                remove.textContent='×'
                remove.disabled=data.options.length<=2
                remove.addEventListener('click',()=>{
                  if(data.options.length<=2)return
                  context.updateData(current=>({...current,options:current.options.filter(item=>item.id!==option.id)}))
                },{signal:context.signal})
                row.appendChild(remove)
              }

              if(resultVisible()){
                const votes=byId.get(option.id)??0
                const result=document.createElement('div')
                result.className='oe-poll__result'
                const percent=total>0?Math.round(votes/total*100):0
                result.textContent=`${votes} · ${percent}%`
                row.appendChild(result)
              }
              list.appendChild(row)
            })
            wrapper.appendChild(list)

            if(!readOnly){
              const add=document.createElement('button')
              add.type='button'
              add.className='oe-poll__add'
              add.textContent=runtimeContext.t('addOption','Add option')
              add.addEventListener('click',()=>{
                const id=context.createId('option')
                context.updateData(current=>({...current,options:[...current.options,{id,text:''}]}))
              },{signal:context.signal})
              wrapper.appendChild(add)
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
              question:question?.textContent??current.question,
              options:current.options.map(option=>{
                const node=optionNodes.find(el=>el.dataset.optionId===option.id)
                return node?{...option,text:node.textContent??''}:option
              }),
            }))
          }

          const connect=()=>{
            unsubscribe?.()
            unsubscribe=null
            controller?.abort()
            if(!snapshot.dataSource||!data.pollId||dead)return
            const Ctor=document.defaultView?.AbortController??AbortController
            controller=new Ctor()
            const version=++connectionVersion
            const abort=()=>controller?.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
            loading=true
            project()
            void snapshot.dataSource.load({pollId:data.pollId,signal:controller.signal}).then(results=>{
              if(dead||controller?.signal.aborted||version!==connectionVersion)return
              if(acceptResults(results))project()
            }).catch(error=>{
              if(!controller?.signal.aborted)report(error)
            }).finally(()=>{
              if(version===connectionVersion){
                loading=false
                project()
              }
            })
            if(snapshot.dataSource.subscribe){
              try{
                const stop=snapshot.dataSource.subscribe({
                  pollId:data.pollId,
                  signal:controller.signal,
                  onUpdate(results){
                    if(dead||controller?.signal.aborted||version!==connectionVersion)return
                    if(acceptResults(results))project()
                  },
                  onError:error=>{if(!controller?.signal.aborted)report(error)},
                })
                if(typeof stop==='function')unsubscribe=stop
              }catch(error){report(error)}
            }
          }

          const toggleVote=async optionId=>{
            if(!readOnly||dead||submitting)return
            const next=new Set(selected)
            if(data.type==='single'){
              next.clear()
              next.add(optionId)
            }else if(next.has(optionId)){
              next.delete(optionId)
            }else{
              next.add(optionId)
            }
            const previous=[...selected]
            const optionIds=[...next]
            if(!snapshot.dataSource||!data.pollId){
              runtime=applyLocalPollVote(runtime,previous,optionIds,data.options.map(option=>option.id))
              selected=new Set(optionIds)
              context.updateData(current=>({...current,initialResults:runtime}))
              project()
              return
            }
            if(!controller||controller.signal.aborted)connect()
            const Ctor=document.defaultView?.AbortController??AbortController
            const voteController=new Ctor()
            const abort=()=>voteController.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:voteController.signal})
            submitting=true
            project()
            try{
              const results=await snapshot.dataSource.vote({
                pollId:data.pollId,
                optionIds,
                revision:runtime.revision,
                signal:voteController.signal,
              })
              if(!dead&&!voteController.signal.aborted&&acceptResults(results))project()
            }catch(error){
              if(!voteController.signal.aborted)report(error)
            }finally{
              submitting=false
              project()
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
                question:question?.textContent??data.question,
                options:data.options.map(option=>{
                  const node=optionNodes.find(el=>el.dataset.optionId===option.id)
                  return node?{...option,text:node.textContent??''}:option
                }),
              }
            },
            update(next){
              const reconnect=next.pollId!==data.pollId||next.type!==data.type||next.options.map(x=>x.id).join('|')!==data.options.map(x=>x.id).join('|')
              data=cloneData(next)
              runtime=normalizePollResults(data.initialResults??runtime,data.options.map(option=>option.id),maxVoters,data.type)
              selected=new Set(runtime.currentUserVote??[])
              project()
              if(reconnect)connect()
            },
            editableFields:()=>Object.freeze([
              ...(!readOnly?[Object.freeze({key:'question',element:/** @type {HTMLElement} */(wrapper.querySelector('.oe-poll__question')),mode:/** @type {'plain-text'} */('plain-text')})]:[]),
              ...data.options.flatMap(option=>{
                const element=wrapper.querySelector(`.oe-poll__option-text[data-option-id="${cssEscape(option.id)}"]`)
                return element?[Object.freeze({key:'option:'+option.id,element:/** @type {HTMLElement} */(element),mode:/** @type {'plain-text'} */('plain-text')})]:[]
              }),
            ]),
            setReadOnly(value){readOnly=value;project()},
            focus(){if(!dead&&!readOnly)(wrapper.querySelector('.oe-poll__question'))?.focus()},
            destroy(){dead=true;controller?.abort();unsubscribe?.();unsubscribe=null},
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
