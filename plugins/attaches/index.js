// @ts-check
import { setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { insertTrustedHtml, setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { attachesDataSchema } from '../../shared/blockSchemas/attaches.js'
import { sanitizeDownloadUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { formatSize, getExtension, getFileIcon } from '../../shared/fileUtils.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'

const editorStyles=new URL('./attaches.css',import.meta.url).href
const sourceEditorStyles=new URL('../shared/sourceEditor.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2"/><path d="M12 11v6"/><path d="M9.5 13.5l2.5-2.5l2.5 2.5"/></svg>'
const VARIANTS=Object.freeze(['a','b','f','g'])

/**
 * @typedef {{id:string,url:string,name:string,size:number,extension:string}} FileEntry
 * @typedef {(file:File,context:{signal:AbortSignal})=>Promise<{url:string,size?:number}>} UploadFn
 * @typedef {{label:string,icon?:string,handler:(context:{signal:AbortSignal})=>Promise<Array<{url:string,name:string,size?:number,extension?:string}>|null>}} SourceAction
 */

/**
 * Create an immutable file-attachment block definition with optional upload and custom source actions.
 * @param {{uploadFile?:UploadFn,actions?:SourceAction[],injectStyles?:boolean,css?:string}} [config]
 * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{files:FileEntry[],variant:string}>}
 */
export function createAttachesPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Attaches configuration must be an object')
  const snapshot=Object.freeze({...config,actions:Object.freeze([...(config.actions??[])])})
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles,sourceEditorStyles)
  if(snapshot.css)styles.push(snapshot.css)

  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>data.files.length===0}),
    conversion:Object.freeze({
      export:data=>({kind:'plain-text',data:{text:data.files.map(file=>file.name).join(', ')}}),
      canImport:payload=>payload?.kind==='plain-text'&&typeof payload.data?.text==='string',
      import(){
        return attachesDataSchema.createDefault()
      },
    }),
    settings:Object.freeze({
      kind:/** @type {'actions'} */('actions'),
      actions(data){
        return VARIANTS.map(variant=>Object.freeze({
          id:variant,
          label:Object.freeze({key:'variant.'+variant,fallback:'Variant '+variant.toUpperCase()}),
          active:data.variant===variant,
        }))
      },
      apply(data,actionId){
        if(!VARIANTS.includes(actionId))throw new RangeError('Unknown attachments variant: '+actionId)
        return {...data,variant:actionId}
      },
    }),
  })

  return Object.freeze({
    type:'attaches',
    label:Object.freeze({key:'title',fallback:'File'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:attachesDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      const objectUrls=new Map()
      return {
        create(initial,context){
          if(destroyed)throw new Error('Attaches runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-attaches'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          let data=cloneData(initial)
          let readOnly=context.isReadOnly()
          let dead=false
          const preloadEditors=()=>{if(!readOnly)preloadSourceEditor(wrapper,context.signal,['url'])}
          const taskControllers=new Set()
          const nameFields=new Map()

          const updateData=next=>context.updateData(()=>next)
          const syncLoading=()=>wrapper.classList.toggle('oe-attaches--loading',taskControllers.size>0)

          const addResolved=entries=>{
            if(dead||readOnly||entries.length===0)return
            const safe=entries.flatMap(entry=>{
              const url=sanitizeDownloadUrl(entry.url)
              if(!url)return []
              const name=String(entry.name||urlName(url)||'file')
              return [{
                id:typeof entry.id==='string'&&entry.id?entry.id:context.createId('file'),
                url,
                name,
                size:Number.isFinite(entry.size)?Math.max(0,Number(entry.size)):0,
                extension:String(entry.extension||getExtension(name)),
              }]
            })
            if(safe.length)context.updateData(current=>({
              ...current,
              files:[...current.files,...safe],
            }))
          }

          const beginTask=()=>{
            const Ctor=document.defaultView?.AbortController??AbortController
            const controller=new Ctor()
            taskControllers.add(controller)
            const abort=()=>controller.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
            syncLoading()
            return controller
          }
          const finishTask=controller=>{
            taskControllers.delete(controller)
            syncLoading()
          }
          const abortTasks=()=>{
            for(const controller of taskControllers)controller.abort()
            taskControllers.clear()
            syncLoading()
          }

          const resolveFiles=async files=>{
            if(readOnly||dead||files.length===0)return
            const controller=beginTask()
            try{
              /** @type {FileEntry[]} */
              const resolved=[]
              for(const file of files){
                if(controller.signal.aborted)break
                if(snapshot.uploadFile){
                  try{
                    const result=await snapshot.uploadFile(file,{signal:controller.signal})
                    const url=sanitizeDownloadUrl(result?.url||'')
                    if(url)resolved.push({
                      id:context.createId('file'),
                      url,
                      name:file.name||urlName(url)||'file',
                      size:Number.isFinite(result?.size)?Math.max(0,Number(result.size)):file.size||0,
                      extension:getExtension(file.name||urlName(url)),
                    })
                  }catch(error){
                    if(!controller.signal.aborted)console.warn('[Attaches] Upload failed',error)
                  }
                }else{
                  const URLCtor=document.defaultView?.URL??URL
                  const url=URLCtor.createObjectURL(file)
                  if(controller.signal.aborted||dead){
                    URLCtor.revokeObjectURL(url)
                    break
                  }
                  objectUrls.set(url,URLCtor)
                  resolved.push({
                    id:context.createId('file'),
                    url,
                    name:file.name||'file',
                    size:file.size||0,
                    extension:getExtension(file.name||''),
                  })
                }
              }
              if(!controller.signal.aborted)addResolved(resolved)
            }finally{
              finishTask(controller)
            }
          }

          const chooseFiles=()=>{
            if(readOnly)return
            triggerFileInput({
              ownerDocument:document,
              multiple:true,
              signal:context.signal,
              onFiles:files=>void resolveFiles([...files]),
            })
          }

          const openUrl=()=>{
            if(readOnly)return
            openSourceEditor({
              wrapper,
              signal:context.signal,
              kind:'url',
              title:runtimeContext.t('urlEditorTitle','Insert file by URL'),
              label:runtimeContext.t('urlEditorLabel','File URL'),
              placeholder:'https://',
              submitText:runtimeContext.t('insert','Insert'),
              cancelText:runtimeContext.t('cancel','Cancel'),
              invalidText:runtimeContext.t('invalidUrl','Invalid file URL'),
              normalize:sanitizeDownloadUrl,
              onSubmit:url=>addResolved([{id:context.createId('file'),url,name:urlName(url)||'file',size:0,extension:getExtension(urlName(url))}]),
            })
          }

          const runAction=async action=>{
            if(readOnly||dead)return
            const controller=beginTask()
            try{
              const result=await action.handler({signal:controller.signal})
              if(controller.signal.aborted||!Array.isArray(result))return
              addResolved(result.map(entry=>({
                id:context.createId('file'),
                url:String(entry?.url||''),
                name:String(entry?.name||''),
                size:Number(entry?.size)||0,
                extension:String(entry?.extension||''),
              })))
            }catch(error){
              if(!controller.signal.aborted)console.warn('[Attaches] Source action failed',error)
            }finally{
              finishTask(controller)
            }
          }

          const renderFile=file=>{
            const row=document.createElement('div')
            row.className='oe-attaches__card'
            const icon=document.createElement('span')
            icon.className='oe-attaches__icon'
            setTrustedHtml(icon,getFileIcon(file.extension).svg||ICON)

            const info=document.createElement('div')
            info.className='oe-attaches__info'
            const name=document.createElement('div')
            name.className='oe-attaches__name'
            name.contentEditable=readOnly?'false':'true'
            name.setAttribute('data-oe-document-input','text')
            name.textContent=file.name
            nameFields.set(file.id,name)
            const meta=document.createElement('div')
            meta.className='oe-attaches__meta'
            meta.textContent=[file.extension?.toUpperCase(),file.size?formatSize(file.size):''].filter(Boolean).join(' · ')
            info.append(name,meta)

            const open=document.createElement('a')
            open.className='oe-attaches__open'
            open.target='_blank'
            open.rel='noopener noreferrer'
            open.textContent=runtimeContext.t('open','Open')
            setSafeUrlAttribute(open,'href',file.url,'download')

            row.append(icon,info,open)
            if(!readOnly){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className='oe-attaches__remove'
              remove.textContent='×'
              remove.setAttribute('aria-label',runtimeContext.t('remove','Remove'))
              remove.addEventListener('click',()=>{
                if(readOnly||dead)return
                updateData({...data,files:data.files.filter(entry=>entry.id!==file.id)})
              },{signal:context.signal})
              row.appendChild(remove)
            }
            return row
          }

          const project=next=>{
            data=cloneData(next)
            nameFields.clear()
            wrapper.className='oe-attaches'+(data.files.length?' oe-attaches--filled':'')
            syncLoading()
            wrapper.dataset.variant=data.variant
            wrapper.replaceChildren()

            if(data.files.length===0){
              const empty=document.createElement('div')
              empty.className='oe-attaches__select'
              if(readOnly){
                empty.textContent=runtimeContext.t('emptyReadonly','No files')
              }else{
                const upload=document.createElement('button')
                upload.type='button'
                upload.textContent=runtimeContext.t('dropzoneUpload','Upload files')
                upload.addEventListener('click',chooseFiles,{signal:context.signal})
                const byUrl=document.createElement('button')
                byUrl.type='button'
                byUrl.textContent=runtimeContext.t('dropzoneUrl','Insert a URL')
                byUrl.addEventListener('click',openUrl,{signal:context.signal})
                empty.append(upload,byUrl)
                for(const action of snapshot.actions){
                  const button=document.createElement('button')
                  button.type='button'
                  if(action.icon)insertTrustedHtml(button,'afterbegin',action.icon)
                  button.append(document.createTextNode(action.label))
                  button.addEventListener('click',()=>void runAction(action),{signal:context.signal})
                  empty.appendChild(button)
                }
              }
              wrapper.appendChild(empty)
            }else{
              const list=document.createElement('div')
              list.className='oe-attaches__list'
              data.files.forEach(file=>list.appendChild(renderFile(file)))
              wrapper.appendChild(list)
              if(!readOnly){
                const actions=document.createElement('div')
                actions.className='oe-attaches__actions'
                const add=document.createElement('button')
                add.type='button'
                add.textContent=runtimeContext.t('add','Add file')
                add.addEventListener('click',chooseFiles,{signal:context.signal})
                actions.appendChild(add)
                wrapper.appendChild(actions)
              }
            }
            preloadEditors()
          }

          project(data)

          return {
            element:wrapper,
            read:()=>({
              variant:data.variant,
              files:data.files.map(file=>({...file,name:nameFields.get(file.id)?.textContent?.trim()||file.name})),
            }),
            update(next){if(!dead)project(next)},
            editableFields:()=>Object.freeze(data.files.flatMap(file=>{
              const element=nameFields.get(file.id)
              return element?[Object.freeze({
                key:'file:'+file.id+':name',
                element,
                mode:/** @type {'plain-text'} */('plain-text'),
              })]:[]
            })),
            setReadOnly(value){readOnly=value;if(value)abortTasks();project(data)},
            focus(){if(!dead&&!readOnly)(nameFields.get(data.files[0]?.id)??wrapper.querySelector('button'))?.focus()},
            destroy(){dead=true;abortTasks()},
          }
        },
        destroy(){
          destroyed=true
          for(const [url,URLCtor] of objectUrls)URLCtor.revokeObjectURL(url)
          objectUrls.clear()
        },
      }
    },
  })
}

function cloneData(data){
  return {variant:data.variant,files:data.files.map(file=>({...file}))}
}

function urlName(url){
  try{
    const part=new URL(url).pathname.split('/').filter(Boolean).at(-1)||''
    try{return decodeURIComponent(part)}catch{return part}
  }catch{return ''}
}
