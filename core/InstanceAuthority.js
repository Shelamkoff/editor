// @ts-check
import { cloneEditorData } from '../shared/cloneEditorData.js'

const states = new WeakMap()
let nextToken = 0

function abortError(message) {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError')
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}

function snapshot(value) {
  return deepFreeze(cloneEditorData(value))
}

function stateFor(context) {
  const getData = context?.getData
  return typeof getData === 'function' ? states.get(getData) ?? null : null
}

function assertReadable(state) {
  if (state.status === 'revoked') throw abortError('Instance context is revoked')
  if (state.health() !== 'ready') throw abortError('Instance context runtime is not ready')
}

function assertActiveMutation(state) {
  if (state.status === 'revoked') return false
  if (state.status !== 'active') throw new Error('Instance context is staged')
  if (state.readOnly) return false
  if (state.health() !== 'ready') return false
  const phase = state.phase()
  if (phase !== 'idle') throw new Error(`Cannot mutate instance context during ${phase} phase`)
  return true
}

function closeTask(task, { abort = false } = {}) {
  if (task.closed) return
  task.closed = true
  task.state.tasks.delete(task)
  if (abort && !task.controller.signal.aborted) task.controller.abort()
}

function cancelTasks(state) {
  for (const task of [...state.tasks]) closeTask(task, { abort: true })
}

function revokeState(state) {
  if (state.status === 'revoked') return
  state.status = 'revoked'
  state.interactionEpoch++
  cancelTasks(state)
  for (const child of [...state.children]) revokeState(child)
  state.children.clear()
  state.parent?.children.delete(state)
  try { state.onRevoke?.() } catch {}
}

function activateState(state, generation) {
  if (state.status === 'revoked') throw abortError('Cannot activate a revoked instance context')
  if (Number.isSafeInteger(generation) && generation > 0) state.generation = generation
  state.status = 'active'
  for (const child of state.children) {
    if (child.status === 'staged') activateState(child, state.generation)
  }
}

/**
 * Create public block/inline authority methods backed by a host-only lifecycle.
 *
 * @param {{
 *   readData:()=>Record<string,unknown>,
 *   updateData:(producer:(current:any)=>Record<string,unknown>)=>void,
 *   commitDomMutation?:(operation:()=>void)=>void,
 *   createId?:(prefix:string)=>string,
 *   readOnly?:boolean,
 *   health?:()=>string,
 *   phase?:()=>string,
 *   generation?:number,
 *   currentGeneration?:()=>number,
 *   signal?:AbortSignal,
 *   parent?:object|null,
 *   onRevoke?:()=>void,
 * }} options
 */
export function createInstanceAuthority(options) {
  if (!options || typeof options !== 'object') throw new TypeError('Instance authority options must be an object')
  if (typeof options.readData !== 'function') throw new TypeError('Instance authority requires readData()')
  if (typeof options.updateData !== 'function') throw new TypeError('Instance authority requires updateData()')

  const parent = stateFor(options.parent)
  const state = {
    token: ++nextToken,
    status: 'staged',
    generation: Number.isSafeInteger(options.generation) ? options.generation : 0,
    interactionEpoch: 0,
    readOnly: options.readOnly === true,
    readData: options.readData,
    updateData: options.updateData,
    commitDomMutation: options.commitDomMutation,
    createId: options.createId,
    health: typeof options.health === 'function' ? options.health : () => 'ready',
    phase: typeof options.phase === 'function' ? options.phase : () => 'idle',
    currentGeneration: typeof options.currentGeneration === 'function'
      ? options.currentGeneration
      : () => state.generation,
    tasks: new Set(),
    children: new Set(),
    parent,
    onRevoke: typeof options.onRevoke === 'function' ? options.onRevoke : null,
  }
  if (parent) parent.children.add(state)

  const getData = () => {
    assertReadable(state)
    return snapshot(state.readData())
  }

  const updateData = producer => {
    if (typeof producer !== 'function') throw new TypeError('updateData() requires a producer')
    if (!assertActiveMutation(state)) return
    state.updateData(current => producer(snapshot(current)))
  }

  const commitDomMutation = operation => {
    if (typeof operation !== 'function') throw new TypeError('commitDomMutation() requires an operation')
    if (!assertActiveMutation(state)) return
    return state.commitDomMutation?.(operation)
  }

  const createId = prefix => {
    assertReadable(state)
    if (typeof state.createId !== 'function') throw new Error('Instance context has no id allocator')
    return state.createId(prefix)
  }

  const isReadOnly = () => state.status === 'revoked' || state.readOnly

  const beginTask = () => {
    if (state.status !== 'active' || state.readOnly || state.health() !== 'ready') {
      throw abortError('Cannot begin a data task for an inactive instance context')
    }
    if (state.phase() !== 'idle') {
      throw new Error(`Cannot begin a data task during ${state.phase()} phase`)
    }

    const Ctor = globalThis.AbortController
    const controller = new Ctor()
    const taskState = {
      state,
      controller,
      closed: false,
      epoch: state.interactionEpoch,
      generation: state.generation,
    }
    state.tasks.add(taskState)

    const commit = producer => {
      if (typeof producer !== 'function') throw new TypeError('DataTask.commit() requires a producer')
      if (taskState.closed || controller.signal.aborted) return false
      if (
        state.status !== 'active'
        || state.readOnly
        || state.health() !== 'ready'
        || state.interactionEpoch !== taskState.epoch
        || state.generation !== taskState.generation
        || state.currentGeneration() !== taskState.generation
      ) {
        closeTask(taskState, { abort: true })
        return false
      }
      const phase = state.phase()
      if (phase !== 'idle') throw new Error(`Cannot commit a data task during ${phase} phase`)

      try {
        state.updateData(current => producer(snapshot(current)))
        closeTask(taskState)
        return true
      } catch (error) {
        closeTask(taskState, { abort: true })
        throw error
      }
    }

    return Object.freeze({
      signal: controller.signal,
      commit,
      cancel() { closeTask(taskState, { abort: true }) },
    })
  }

  const authority = Object.freeze({
    getData,
    updateData,
    commitDomMutation,
    createId,
    isReadOnly,
    beginTask,
  })
  states.set(getData, state)

  if (options.signal) {
    if (options.signal.aborted) revokeState(state)
    else options.signal.addEventListener('abort', () => revokeState(state), { once: true })
  }

  return authority
}

export function activateInstanceContext(context, generation) {
  const state = stateFor(context)
  if (state) activateState(state, generation)
}

export function revokeInstanceContext(context) {
  const state = stateFor(context)
  if (state) revokeState(state)
}

function setReadOnlyState(state, next) {
  if (!state || state.status === 'revoked') return
  if (state.readOnly !== next) {
    state.readOnly = next
    state.interactionEpoch++
    cancelTasks(state)
  }
  for (const child of state.children) setReadOnlyState(child, next)
}

export function setInstanceContextReadOnly(context, readOnly) {
  const state = stateFor(context)
  if (state) setReadOnlyState(state, readOnly === true)
}

export function instanceContextState(context) {
  const state = stateFor(context)
  return state ? Object.freeze({
    token: state.token,
    status: state.status,
    generation: state.generation,
    interactionEpoch: state.interactionEpoch,
    readOnly: state.readOnly,
  }) : null
}
