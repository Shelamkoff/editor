// @ts-check
import { setSanitizedHtml, setTrustedHtml } from '../../plugin-kit/index.js'
import { personDataSchema } from '../../shared/blockSchemas/person.js'
import { sanitizeUrl, setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { requiresTrustedHtml } from '../../shared/sanitize/trustedHtml.js'
import { CropperDialog, cropperStylesUrl } from '@shelamkoff/cropper'
import { triggerFileInput, isSupportedImageFile } from '../shared/fileInput.js'
import { resolveSocialIcon, SOCIAL_ICONS } from './socialResolver.js'

const editorStyles=new URL('./person.css',import.meta.url).href
const ICON='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.8A6 6 0 0 1 10 16h4a6 6 0 0 1 3.8 2.8"/></svg>'
const CAMERA='<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3"/><circle cx="12" cy="13" r="3"/></svg>'
const REMOVE='<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'

function cloneData(data){
  return {
    persons:data.persons.map(person=>({
      ...person,
      links:person.links.map(link=>({...link})),
    })),
  }
}

function meaningful(person){
  return Boolean(person.avatar||person.name.trim()||person.role.trim()||person.bio.trim()||person.links.some(link=>link.url))
}

/**
 * @typedef {Object} PersonV2Config
 * @property {(file:File,context:{signal:AbortSignal})=>Promise<{url:string}>} [uploadFile] Upload a person avatar image.
 * @property {Array<{test:RegExp|((url:string)=>boolean),type:string,icon?:string}>} [socialResolvers] Custom URL-to-social-type resolvers.
 * @property {boolean} [injectStyles=true] Whether to acquire the built-in Person styles.
 * @property {string} [css] Additional stylesheet URL acquired with the definition.
 */

/** Create an immutable Person block definition.\n * @param {PersonV2Config} [config] Consumer-owned configuration snapshotted by the factory.\n * @returns {import('../../plugin-kit/types').BlockPluginDefinition<any>}\n */
export function createPersonPlugin(config={}){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Person configuration must be an object')
  const snapshot=Object.freeze({
    ...config,
    socialResolvers:Object.freeze([...(config.socialResolvers??[])]),
  })
  const styles=[]
  if(snapshot.injectStyles!==false)styles.push(editorStyles,cropperStylesUrl)
  if(snapshot.css)styles.push(snapshot.css)

  /** @type {import('../../plugin-kit/types').BlockCapabilities<any>} */
  const capabilities=Object.freeze({
    empty:Object.freeze({isEmpty:data=>data.persons.every(person=>!meaningful(person))}),
    shortcuts:Object.freeze({
      handle(input){
        const textField=input.fieldKey.startsWith('person:')
          && (input.fieldKey.endsWith(':name')||input.fieldKey.endsWith(':role')||input.fieldKey.endsWith(':bio'))
        if(textField&&['Enter','Backspace','Delete'].includes(input.key))return {kind:'native'}
        return null
      },
    }),
    conversion:Object.freeze({
      export(data){
        return {
          kind:'rich-text',
          data:{text:data.persons.map(person=>[person.name,person.role,person.bio].filter(Boolean).join('<br>')).filter(Boolean).join('<br>')},
        }
      },
      canImport(payload){
        return payload?.kind==='rich-text'&&typeof payload.data?.text==='string'
      },
      import(payload){
        if(payload?.kind!=='rich-text'||typeof payload.data?.text!=='string')throw new TypeError('Person can only import rich-text payloads')
        return {
          persons:[{
            id:'person-0',
            avatar:'',
            name:'',
            role:'',
            bio:payload.data.text,
            links:[],
          }],
        }
      },
    }),
  })

  return Object.freeze({
    type:'person',
    label:Object.freeze({key:'title',fallback:'Person'}),
    icon:ICON,
    styles:Object.freeze(styles),
    schema:personDataSchema,
    capabilities,
    setup(runtimeContext){
      let destroyed=false
      return {
        create(initial,context){
          if(destroyed)throw new Error('Person runtime is destroyed')
          const document=context.ownerDocument
          const wrapper=document.createElement('div')
          wrapper.className='oe-person'
          wrapper.contentEditable='false'
          wrapper.tabIndex=-1

          const tabs=document.createElement('div')
          tabs.className='oe-person__tabs'
          const body=document.createElement('div')
          body.className='oe-person__body'
          wrapper.append(tabs,body)

          let data=cloneData(initial)
          let activeId=data.persons[0]?.id??''
          let readOnly=context.isReadOnly()
          let dead=false
          let dragId=null
          const avatarTasks=new Map()
          let cropperDialog=null

          const activePerson=()=>data.persons.find(person=>person.id===activeId)??data.persons[0]

          const syncVisible=()=>{
            const person=activePerson()
            if(!person)return
            const name=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__name'))
            const role=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__role'))
            const bio=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__bio'))
            if(name)person.name=name.innerHTML.trim()
            if(role)person.role=role.innerHTML.trim()
            if(bio)person.bio=bio.innerHTML.trim()
            for(const input of body.querySelectorAll('input[data-link-id]')){
              const link=person.links.find(item=>item.id===input.dataset.linkId)
              if(!link)continue
              const safe=sanitizeUrl(input.value,{policy:'link',fallback:''})
              link.url=safe
              link.type=resolveSocialIcon(safe,snapshot.socialResolvers).type
            }
          }

          const commit=producer=>{
            syncVisible()
            context.updateData(current=>producer(cloneData(current)))
          }

          const beginAvatarTask=personId=>{
            avatarTasks.get(personId)?.abort()
            const Ctor=document.defaultView?.AbortController??AbortController
            const controller=new Ctor()
            avatarTasks.set(personId,controller)
            const abort=()=>controller.abort(context.signal.reason)
            context.signal.addEventListener('abort',abort,{once:true,signal:controller.signal})
            return controller
          }

          const readAvatar=async(file,signal)=>{
            const FileReaderCtor=document.defaultView?.FileReader??FileReader
            return await new Promise((resolve,reject)=>{
              const reader=new FileReaderCtor()
              const abort=()=>reader.abort()
              signal.addEventListener('abort',abort,{once:true})
              reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:'')
              reader.onerror=()=>reject(reader.error??new Error('Failed to read avatar'))
              reader.onabort=()=>reject(signal.reason??new DOMException('Avatar read aborted','AbortError'))
              reader.readAsDataURL(file)
            })
          }

          const selectAvatar=personId=>{
            if(readOnly||dead)return
            triggerFileInput({
              ownerDocument:document,
              accept:'image/*',
              signal:context.signal,
              onFiles:files=>{
                const file=files[0]
                if(!file||!isSupportedImageFile(file))return
                void (async()=>{
                  const controller=beginAvatarTask(personId)
                  try{
                    let blob=/** @type {Blob} */(file)
                    let filename=file.name||'avatar'
                    let mime=file.type||'application/octet-stream'
                    if(document===globalThis.document&&!requiresTrustedHtml(document)){
                      cropperDialog?.destroy()
                      const dialog=new CropperDialog(file,{
                        title:runtimeContext.t('cropTitle','Crop avatar'),
                        confirmText:runtimeContext.t('cropConfirm','Apply'),
                        cancelText:runtimeContext.t('cropCancel','Cancel'),
                      })
                      cropperDialog=dialog
                      dialog.open()
                      try{
                        const cropped=await dialog.result
                        if(!cropped||controller.signal.aborted)return
                        blob=cropped
                        filename='avatar.webp'
                        mime='image/webp'
                      }finally{
                        if(cropperDialog===dialog)cropperDialog=null
                      }
                    }
                    let url=''
                    if(snapshot.uploadFile){
                      const FileCtor=document.defaultView?.File??File
                      const upload=new FileCtor([blob],filename,{type:mime})
                      const result=await snapshot.uploadFile(upload,{signal:controller.signal})
                      url=sanitizeUrl(result?.url??'',{policy:'media',fallback:''})
                    }else{
                      url=String(await readAvatar(blob,controller.signal))
                    }
                    if(controller.signal.aborted||!url||dead)return
                    commit(current=>({
                      persons:current.persons.map(person=>person.id===personId?{...person,avatar:url}:person),
                    }))
                  }catch{
                    // Cancelled/failed avatar work leaves canonical data unchanged.
                  }finally{
                    if(avatarTasks.get(personId)===controller)avatarTasks.delete(personId)
                  }
                })()
              },
            })
          }

          const renderTabs=()=>{
            tabs.replaceChildren()
            for(const person of data.persons){
              const tab=document.createElement('button')
              tab.type='button'
              tab.className='oe-person__tab'
              tab.dataset.personId=person.id
              tab.textContent=person.name.trim()||runtimeContext.t('person','Person')
              tab.setAttribute('aria-pressed',String(person.id===activeId))
              tab.draggable=!readOnly
              tab.addEventListener('click',()=>{
                syncVisible()
                activeId=person.id
                render()
              },{signal:context.signal})
              tab.addEventListener('dragstart',()=>{
                if(!readOnly)dragId=person.id
              },{signal:context.signal})
              tab.addEventListener('dragover',event=>{
                if(!readOnly)event.preventDefault()
              },{signal:context.signal})
              tab.addEventListener('drop',event=>{
                if(readOnly||!dragId||dragId===person.id)return
                event.preventDefault()
                const from=dragId
                dragId=null
                commit(current=>{
                  const persons=[...current.persons]
                  const fromIndex=persons.findIndex(item=>item.id===from)
                  const toIndex=persons.findIndex(item=>item.id===person.id)
                  if(fromIndex<0||toIndex<0)return current
                  const moved=persons.splice(fromIndex,1)[0]
                  persons.splice(toIndex,0,moved)
                  return {persons}
                })
              },{signal:context.signal})
              tabs.appendChild(tab)
            }
            if(!readOnly){
              const add=document.createElement('button')
              add.type='button'
              add.className='oe-person__tab oe-person__tab--add'
              add.textContent='+'
              add.setAttribute('aria-label',runtimeContext.t('addPerson','Add person'))
              add.addEventListener('click',()=>{
                const id=context.createId('person')
                activeId=id
                commit(current=>({
                  persons:[...current.persons,{id,avatar:'',name:'',role:'',bio:'',links:[]}],
                }))
              },{signal:context.signal})
              tabs.appendChild(add)
            }
          }

          const createLinkRow=(person,link)=>{
            const row=document.createElement('div')
            row.className='oe-person__link-row'
            const icon=document.createElement('span')
            icon.className='oe-person__link-icon'
            const resolved=resolveSocialIcon(link.url,snapshot.socialResolvers)
            setTrustedHtml(icon,resolved.icon||SOCIAL_ICONS.website||'')
            const input=document.createElement('input')
            input.type='url'
            input.className='oe-person__link-url'
            input.dataset.linkId=link.id
            input.value=link.url
            input.readOnly=readOnly
            input.setAttribute('data-oe-document-input','value')
            input.addEventListener('input',()=>{
              const current=resolveSocialIcon(input.value,snapshot.socialResolvers)
              setTrustedHtml(icon,current.icon||SOCIAL_ICONS.website||'')
            },{signal:context.signal})
            row.append(icon,input)
            if(!readOnly){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className='oe-person__link-remove'
              setTrustedHtml(remove,REMOVE)
              remove.setAttribute('aria-label',runtimeContext.t('removeLink','Remove link'))
              remove.addEventListener('click',()=>{
                commit(current=>({
                  persons:current.persons.map(item=>item.id===person.id
                    ?{...item,links:item.links.filter(candidate=>candidate.id!==link.id)}
                    :item),
                }))
              },{signal:context.signal})
              row.appendChild(remove)
            }
            return row
          }

          const renderBody=()=>{
            body.replaceChildren()
            const person=activePerson()
            if(!person)return
            const card=document.createElement('div')
            card.className='oe-person__card'

            const avatarWrap=document.createElement('div')
            avatarWrap.className='oe-person__avatar-wrap'
            if(person.avatar){
              const image=document.createElement('img')
              image.className='oe-person__avatar-img'
              setSafeUrlAttribute(image,'src',person.avatar,'media')
              image.alt=''
              avatarWrap.appendChild(image)
            }else{
              const placeholder=document.createElement('div')
              placeholder.className='oe-person__avatar-placeholder'
              setTrustedHtml(placeholder,CAMERA)
              avatarWrap.appendChild(placeholder)
            }
            if(!readOnly){
              const upload=document.createElement('button')
              upload.type='button'
              upload.className='oe-person__avatar-upload'
              setTrustedHtml(upload,CAMERA)
              upload.setAttribute('aria-label',runtimeContext.t('uploadAvatar','Upload avatar'))
              upload.addEventListener('click',()=>selectAvatar(person.id),{signal:context.signal})
              avatarWrap.appendChild(upload)
            }

            const info=document.createElement('div')
            info.className='oe-person__info'
            const name=document.createElement('div')
            name.className='oe-person__name'
            name.contentEditable=readOnly?'false':'true'
            name.dataset.placeholder=runtimeContext.t('namePlaceholder','Name')
            if(person.name)setSanitizedHtml(name,person.name)

            const role=document.createElement('div')
            role.className='oe-person__role'
            role.contentEditable=readOnly?'false':'true'
            role.dataset.placeholder=runtimeContext.t('rolePlaceholder','Role / Position')
            if(person.role)setSanitizedHtml(role,person.role)

            const bio=document.createElement('div')
            bio.className='oe-person__bio'
            bio.contentEditable=readOnly?'false':'true'
            bio.dataset.placeholder=runtimeContext.t('bioPlaceholder','Short bio...')
            if(person.bio)setSanitizedHtml(bio,person.bio)

            const links=document.createElement('div')
            links.className='oe-person__links'
            for(const link of person.links)links.appendChild(createLinkRow(person,link))
            if(!readOnly){
              const addLink=document.createElement('button')
              addLink.type='button'
              addLink.className='oe-person__link-add'
              addLink.textContent=runtimeContext.t('addLink','Add link')
              addLink.addEventListener('click',()=>{
                const id=context.createId('link')
                commit(current=>({
                  persons:current.persons.map(item=>item.id===person.id
                    ?{...item,links:[...item.links,{id,type:'website',url:''}]}
                    :item),
                }))
              },{signal:context.signal})
              links.appendChild(addLink)
            }

            if(!readOnly&&data.persons.length>1){
              const remove=document.createElement('button')
              remove.type='button'
              remove.className='oe-person__remove'
              remove.textContent=runtimeContext.t('removePerson','Remove person')
              remove.addEventListener('click',()=>{
                const removing=person.id
                const remaining=data.persons.filter(item=>item.id!==removing)
                activeId=remaining[0]?.id??''
                commit(current=>({persons:current.persons.filter(item=>item.id!==removing)}))
              },{signal:context.signal})
              info.append(name,role,bio,links,remove)
            }else{
              info.append(name,role,bio,links)
            }

            card.append(avatarWrap,info)
            body.appendChild(card)
          }

          const render=()=>{
            if(!data.persons.some(person=>person.id===activeId))activeId=data.persons[0]?.id??''
            renderTabs()
            renderBody()
          }

          render()

          return {
            element:wrapper,
            read(){
              syncVisible()
              return cloneData(data)
            },
            update(next){
              if(dead)return
              data=cloneData(next)
              render()
            },
            editableFields(){
              const person=activePerson()
              if(!person)return Object.freeze([])
              const result=[]
              const name=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__name'))
              const role=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__role'))
              const bio=/** @type {HTMLElement|null} */(body.querySelector('.oe-person__bio'))
              if(name)result.push(Object.freeze({key:'person:'+person.id+':name',element:name,mode:/** @type {'rich-text'} */('rich-text')}))
              if(role)result.push(Object.freeze({key:'person:'+person.id+':role',element:role,mode:/** @type {'rich-text'} */('rich-text')}))
              if(bio)result.push(Object.freeze({key:'person:'+person.id+':bio',element:bio,mode:/** @type {'rich-text'} */('rich-text')}))
              for(const input of body.querySelectorAll('input[data-link-id]')){
                result.push(Object.freeze({
                  key:'person:'+person.id+':link:'+input.dataset.linkId+':url',
                  element:/** @type {HTMLElement} */(input),
                  mode:/** @type {'plain-text'} */('plain-text'),
                }))
              }
              return Object.freeze(result)
            },
            setReadOnly(value){
              syncVisible()
              readOnly=value
              render()
            },
            focus(target){
              if(dead||readOnly)return
              const key=target?.fieldKey??''
              const selector=key.endsWith(':role')?'.oe-person__role':key.endsWith(':bio')?'.oe-person__bio':'.oe-person__name'
              ;(/** @type {HTMLElement|null} */(body.querySelector(selector)))?.focus()
            },
            destroy(){
              dead=true
              cropperDialog?.destroy()
              for(const controller of avatarTasks.values())controller.abort()
              avatarTasks.clear()
              body.replaceChildren()
              tabs.replaceChildren()
            },
          }
        },
        destroy(){destroyed=true},
      }
    },
  })
}
