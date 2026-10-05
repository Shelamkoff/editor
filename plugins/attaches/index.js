// @ts-check
import { setSafeUrlAttribute } from '../../plugin-kit/index.js'
import { insertTrustedHtml, setTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { attachesDataSchema } from '../../shared/blockSchemas/attaches.js'
import { sanitizeDownloadUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { formatSize, getExtension, getFileIcon, EXT_COLORS } from '../../shared/fileUtils.js'
import { triggerFileInput } from '../shared/fileInput.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { createMediaDropzone } from '../shared/mediaDropzone.js'
import { createPluginLayer } from '../shared/layer.js'
import { createPluginPanelPositioner } from '../shared/positionPluginPanel.js'

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
      selectionMode:'single',
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
          label:Object.freeze({key:'variant'+variant.toUpperCase(),fallback:'Variant '+variant.toUpperCase()}),
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
          const tasks=new Set()
          const nameFields=new Map()
          let expanded=false
          let groupBody=null
          let groupChevron=null
          let settingsController=null
          context.signal.addEventListener('abort',()=>settingsController?.abort(),{once:true})
          const setExpanded=value=>{
            expanded=value
            groupBody?.classList.toggle('oe-attaches__group-body--open',value)
            groupChevron?.classList.toggle('oe-attaches__chevron--open',value)
            groupChevron?.setAttribute('aria-expanded',String(value))
          }

          const updateData=next=>context.updateData(()=>next)
          const syncLoading=()=>wrapper.classList.toggle('oe-attaches--loading',tasks.size>0)

          const addResolved=(entries,task=null)=>{
            if(dead||readOnly||entries.length===0)return false
            const safe=entries.flatMap(entry=>{
              const url=sanitizeDownloadUrl(entry.url)
              if(!url)return []
              const name=String(entry.name||urlName(url)||'file')
              return [{
                id:typeof entry.id==='string'&&entry.id?entry.id:null,
                url,
                name,
                size:Number.isFinite(entry.size)?Math.max(0,Number(entry.size)):0,
                extension:String(entry.extension||getExtension(name)),
              }]
            })
            if(!safe.length)return false
            const producer=current=>({
              ...current,
              files:[
                ...current.files,
                ...safe.map(entry=>({
                  ...entry,
                  id:entry.id??context.createId('file'),
                })),
              ],
            })
            if(task)return retainControlFocus(wrapper,()=>task.commit(producer))
            retainControlFocus(wrapper,()=>context.updateData(producer))
            return true
          }

          const beginTask=()=>{
            const task=context.beginTask()
            tasks.add(task)
            task.signal.addEventListener('abort',()=>{
              tasks.delete(task)
              syncLoading()
            },{once:true})
            syncLoading()
            return task
          }
          const finishTask=task=>{
            task.cancel()
            tasks.delete(task)
            syncLoading()
          }
          const abortTasks=()=>{
            for(const task of tasks)task.cancel()
            tasks.clear()
            syncLoading()
          }

          const resolveFiles=async files=>{
            if(readOnly||dead||files.length===0)return
            const task=beginTask()
            const createdObjectUrls=[]
            try{
              /** @type {FileEntry[]} */
              const resolved=[]
              for(const file of files){
                if(task.signal.aborted)break
                if(snapshot.uploadFile){
                  try{
                    const result=await snapshot.uploadFile(file,{signal:task.signal})
                    const url=sanitizeDownloadUrl(result?.url||'')
                    if(url)resolved.push({
                      id:'',
                      url,
                      name:file.name||urlName(url)||'file',
                      size:Number.isFinite(result?.size)?Math.max(0,Number(result.size)):file.size||0,
                      extension:getExtension(file.name||urlName(url)),
                    })
                  }catch(error){
                    if(!task.signal.aborted)console.warn('[Attaches] Upload failed',error)
                  }
                }else{
                  const URLCtor=document.defaultView?.URL??URL
                  const url=URLCtor.createObjectURL(file)
                  if(task.signal.aborted||dead){
                    URLCtor.revokeObjectURL(url)
                    break
                  }
                  objectUrls.set(url,URLCtor)
                  createdObjectUrls.push(url)
                  resolved.push({
                    id:'',
                    url,
                    name:file.name||'file',
                    size:file.size||0,
                    extension:getExtension(file.name||''),
                  })
                }
              }
              const committed=!task.signal.aborted&&addResolved(resolved,task)
              if(!committed){
                for(const url of createdObjectUrls){
                  objectUrls.get(url)?.revokeObjectURL(url)
                  objectUrls.delete(url)
                }
              }
            }finally{
              finishTask(task)
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
            const task=beginTask()
            try{
              const result=await action.handler({signal:task.signal})
              if(task.signal.aborted||!Array.isArray(result))return
              addResolved(result.map(entry=>({
                id:'',
                url:String(entry?.url||''),
                name:String(entry?.name||''),
                size:Number(entry?.size)||0,
                extension:String(entry?.extension||''),
              })),task)
            }catch(error){
              if(!task.signal.aborted)console.warn('[Attaches] Source action failed',error)
            }finally{
              finishTask(task)
            }
          }

          const renderFile=(file,inGroup=false)=>{
            const row=document.createElement('div')
            const variant=data.variant
            row.className=inGroup?'oe-attaches__row':({a:'oe-attaches__card',b:'oe-attaches__pill',f:'oe-attaches__notion-row',g:'oe-attaches__material-card'}[variant])
            const icon=document.createElement('span')
            icon.className=variant==='g'?'oe-attaches__material-icon':variant==='b'?'oe-attaches__pill-icon':'oe-attaches__icon'
            setTrustedHtml(icon,variant==='g'?getFileIcon(file.extension).svg||ICON:ICON)
            if(variant==='a'&&file.extension){
              const badge=document.createElement('span')
              badge.className='oe-attaches__ext'
              badge.textContent=file.extension.toUpperCase()
              if(EXT_COLORS[file.extension.toLowerCase()])badge.style.backgroundColor=EXT_COLORS[file.extension.toLowerCase()]
              icon.appendChild(badge)
            }

            const info=document.createElement('div')
            info.className='oe-attaches__info'
            const name=document.createElement('div')
            name.className='oe-attaches__name'
            name.contentEditable=readOnly?'false':'true'
            name.setAttribute('data-oe-document-input','text')
            name.textContent=file.name
            name.addEventListener('keydown',event=>{
              if(event.key==='Enter'){
                event.preventDefault();event.stopPropagation();name.blur();wrapper.focus()
              }else if(!event.ctrlKey&&!event.metaKey)event.stopPropagation()
            },{signal:context.signal})
            nameFields.set(file.id,name)
            const meta=document.createElement('div')
            meta.className=inGroup?'oe-attaches__row-size':variant==='b'?'oe-attaches__pill-size':variant==='f'?'oe-attaches__notion-size':'oe-attaches__meta'
            meta.textContent=file.size?formatSize(file.size):''
            info.append(name,meta)

            const open=document.createElement('a')
            open.className='oe-attaches__open'
            open.target='_blank'
            open.rel='noopener noreferrer'
            open.textContent=runtimeContext.t('open','Open')
            setSafeUrlAttribute(open,'href',file.url,'download')

            if(variant==='a'&&!inGroup||variant==='g')row.append(icon,info)
            else{
              if(variant==='b')row.appendChild(icon)
              row.appendChild(name)
              if(variant==='f'&&file.extension){
                const tag=document.createElement('span')
                tag.className='oe-attaches__notion-tag'
                tag.textContent=file.extension.toUpperCase()
                const color=EXT_COLORS[file.extension.toLowerCase()]
                if(color){tag.style.color=color;tag.style.backgroundColor=color+'20'}
                row.appendChild(tag)
              }
              row.appendChild(meta)
            }
            if(readOnly)row.appendChild(open)
            if(!readOnly){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className='oe-attaches__remove'
              remove.textContent='×'
              remove.setAttribute('aria-label',runtimeContext.t('remove','Remove'))
              remove.addEventListener('click',()=>{
                if(readOnly||dead)return
                updateData({...data,files:data.files.filter(entry=>entry.id!==file.id)})
                wrapper.focus()
              },{signal:context.signal})
              row.appendChild(remove)
            }
            return row
          }

          const project=next=>{
            settingsController?.abort()
            data=cloneData(next)
            nameFields.clear()
            groupBody=null
            groupChevron=null
            wrapper.className='oe-attaches'+(data.files.length?' oe-attaches--filled':'')
            syncLoading()
            wrapper.dataset.variant=data.variant
            wrapper.replaceChildren()

            if(data.files.length===0){
              const empty=createMediaDropzone({ownerDocument:document,prefix:'oe-attaches',icon:ICON,
                uploadText:runtimeContext.t('dropzoneUpload','Upload'),afterText:runtimeContext.t('dropzoneText','files from your device or drag and drop them here'),
                urlPrefix:runtimeContext.t('dropzoneUrlPrefix','or'),emptyText:runtimeContext.t('emptyReadonly','No files'),readOnly,signal:context.signal,
                onUpload:chooseFiles,inlineActions:[{label:runtimeContext.t('dropzoneUrl','Insert a URL'),onSelect:openUrl}],
                actions:snapshot.actions.map(action=>({...action,onSelect:()=>void runAction(action)})),
              })
              wrapper.appendChild(empty)
            }else{
              const list=document.createElement('div')
              list.className=({a:data.files.length>1?'oe-attaches__group':'oe-attaches__list',b:'oe-attaches__pills',f:'oe-attaches__notion',g:'oe-attaches__material'}[data.variant])
              if(data.variant==='a'&&data.files.length>1){
                const header=document.createElement('div')
                header.className='oe-attaches__group-header'
                const count=document.createElement('div')
                count.className='oe-attaches__info'
                count.textContent=data.files.length+' '+runtimeContext.t('filesCount','files')
                groupChevron=document.createElement('button')
                groupChevron.type='button'
                groupChevron.className='oe-attaches__chevron'
                groupChevron.textContent='⌄'
                groupChevron.setAttribute('aria-label',runtimeContext.t('toggleGroup','Show or hide files'))
                groupBody=document.createElement('div')
                groupBody.className='oe-attaches__group-body'
                groupBody.id='oe-attaches-group-'+context.createId('view')
                groupChevron.setAttribute('aria-controls',groupBody.id)
                groupChevron.addEventListener('click',event=>{event.stopPropagation();setExpanded(!expanded)},{signal:context.signal})
                header.addEventListener('click',()=>setExpanded(!expanded),{signal:context.signal})
                header.append(count,groupChevron)
                data.files.forEach(file=>groupBody.appendChild(renderFile(file,true)))
                list.append(header,groupBody)
                setExpanded(expanded)
              }else data.files.forEach(file=>list.appendChild(renderFile(file)))
              wrapper.appendChild(list)
              if(!readOnly){
                const actions=document.createElement('div')
                actions.className='oe-attaches__actions'
                const add=document.createElement('button')
                add.type='button'
                add.className='oe-attaches__action-btn'
                add.textContent=runtimeContext.t('add','Add file')
                add.addEventListener('click',chooseFiles,{signal:context.signal})
                actions.appendChild(add)
                const byUrl=document.createElement('button')
                byUrl.type='button'
                byUrl.className='oe-attaches__action-btn'
                byUrl.textContent=runtimeContext.t('dropzoneUrl','Insert a URL')
                byUrl.addEventListener('click',openUrl,{signal:context.signal})
                actions.appendChild(byUrl)
                const AbortControllerCtor=document.defaultView?.AbortController??AbortController
                settingsController?.abort()
                settingsController=new AbortControllerCtor()
                const menuSignal=settingsController.signal
                const dropdown=document.createElement('div')
                dropdown.className='oe-attaches__dropdown'
                const settings=document.createElement('button')
                settings.type='button'
                settings.className='oe-attaches__action-btn'
                settings.textContent=runtimeContext.t('settings','Settings')
                settings.setAttribute('aria-haspopup','true')
                settings.setAttribute('aria-expanded','false')
                const panel=document.createElement('div')
                panel.className='oe-attaches__dropdown-panel'
                panel.setAttribute('role','group')
                panel.setAttribute('aria-label',runtimeContext.t('template','Template'))
                const grid=document.createElement('div')
                grid.className='oe-attaches__tpl-grid'
                const settingsLayer=createPluginLayer(wrapper,menuSignal)
                const positioner=createPluginPanelPositioner(panel,dropdown,{signal:menuSignal,preferAbove:true})
                const setOpen=open=>{
                  dropdown.classList.toggle('oe-attaches__dropdown--open',open)
                  settings.setAttribute('aria-expanded',String(open))
                  if(open){settingsLayer.open();positioner.open();settings.focus({preventScroll:true})}
                  else{settingsLayer.close();positioner.close()}
                }
                settings.addEventListener('mousedown',event=>event.preventDefault(),{signal:menuSignal})
                settings.addEventListener('click',()=>setOpen(settings.getAttribute('aria-expanded')!=='true'),{signal:menuSignal})
                for(const variant of VARIANTS){
                  const button=document.createElement('button')
                  button.type='button'
                  button.className='oe-attaches__tpl-btn'
                  button.classList.toggle('oe-attaches__tpl-btn--active',variant===data.variant)
                  button.dataset.variant=variant
                  const variantKey='variant'+variant.toUpperCase()
                  button.title=runtimeContext.t(variantKey,'Variant '+variant.toUpperCase())
                  button.setAttribute('aria-label',button.title)
                  button.setAttribute('aria-pressed',String(variant===data.variant))
                  const shape=variant==='a'?'<rect x="1" y="1" width="26" height="18" rx="2"/>':variant==='b'?'<rect x="1" y="5" width="26" height="10" rx="5"/>':variant==='f'?'<path d="M1 5h26M1 10h26M1 15h26"/>':'<rect x="1" y="1" width="26" height="18" rx="3"/><path d="M1 13h26"/>'
                  setTrustedHtml(button,`<svg width="28" height="20" viewBox="0 0 28 20" fill="none" stroke="currentColor">${shape}</svg>`)
                  button.addEventListener('mousedown',event=>event.preventDefault(),{signal:menuSignal})
                  button.addEventListener('click',()=>{
                    if(dead||readOnly)return
                    context.updateData(current=>({...current,variant}))
                    wrapper.focus({preventScroll:true})
                  },{signal:menuSignal})
                  grid.appendChild(button)
                }
                panel.appendChild(grid)
                dropdown.append(settings,panel)
                document.addEventListener('click',event=>{if(!dropdown.contains(event.target))setOpen(false)},{signal:menuSignal})
                dropdown.addEventListener('keydown',event=>{
                  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);settings.focus()}
                },{signal:menuSignal})
                actions.appendChild(dropdown)
                for(const action of snapshot.actions){
                  const button=document.createElement('button')
                  button.type='button'
                  button.className='oe-attaches__action-btn'
                  button.textContent=action.label
                  button.addEventListener('click',()=>void runAction(action),{signal:context.signal})
                  actions.appendChild(button)
                }
                const removeAll=document.createElement('button')
                removeAll.type='button'
                removeAll.className='oe-attaches__action-btn oe-attaches__action-btn--danger'
                removeAll.textContent=runtimeContext.t('deleteAll','Delete all')
                removeAll.addEventListener('click',()=>{
                  abortTasks()
                  context.updateData(current=>({...current,files:[]}))
                  wrapper.focus()
                },{signal:context.signal})
                actions.appendChild(removeAll)
                wrapper.appendChild(actions)
              }
            }
            preloadEditors()
          }

          wrapper.addEventListener('dragover',event=>{
            if(readOnly||!event.dataTransfer?.types.includes('Files'))return
            event.preventDefault()
            event.dataTransfer.dropEffect='copy'
          },{signal:context.signal})
          wrapper.addEventListener('drop',event=>{
            if(readOnly||!event.dataTransfer?.files.length)return
            event.preventDefault();event.stopPropagation()
            void resolveFiles([...event.dataTransfer.files])
          },{signal:context.signal})

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
            setReadOnly(value){settingsController?.abort();readOnly=value;project(data)},
            focus(target){
              if(dead||readOnly)return
              if(groupBody)setExpanded(true)
              const id=target?.fieldKey?.match(/^file:(.+):name$/)?.[1]??data.files[0]?.id
              ;(nameFields.get(id)??wrapper)?.focus()
            },
            destroy(){dead=true;settingsController?.abort();abortTasks()},
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
