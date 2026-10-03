// @ts-check

export function createAbortError(message='Instance scope is revoked'){
  if(typeof DOMException==='function')return new DOMException(message,'AbortError')
  const error=new Error(message)
  error.name='AbortError'
  return error
}

export class InstanceScope{
  #state
  #token=Symbol('instance-scope')

  constructor({staged=false}={}){
    this.#state=staged?'staged':'active'
  }

  get token(){return this.#token}
  get state(){return this.#state}
  get active(){return this.#state==='active'}
  get staged(){return this.#state==='staged'}
  get revoked(){return this.#state==='revoked'}

  activate(){
    if(this.#state==='revoked')throw createAbortError()
    this.#state='active'
  }

  revoke(){
    if(this.#state==='revoked')return false
    this.#state='revoked'
    return true
  }

  assertReadable(){
    if(this.#state==='revoked')throw createAbortError()
  }
}
