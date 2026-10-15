// @ts-check
import { synchronousResult } from '../shared/synchronousResult.js'

const owners = new WeakMap()

/** Capture the host-used tool surface exactly once with its original receiver. */
function captureTool(runtime, source) {
  return runtime.prepareExtensionValue(() => {
    const type = source.type
    const icon = source.icon
    const title = source.title
    const shortcut = source.shortcut
    const tag = source.tag
    if (typeof type !== 'string' || !type) throw new TypeError('Inline tool type must be a non-empty string')
    if (typeof icon !== 'string') throw new TypeError(`Inline tool "${type}" icon must be a string`)
    for (const [name, value] of [['title', title], ['shortcut', shortcut], ['tag', tag]]) {
      if (value !== undefined && typeof value !== 'string') {
        throw new TypeError(`Inline tool "${type}" ${name} must be a string`)
      }
    }
    const methods = {}
    for (const name of ['isActive', 'toggle', 'renderActions', 'getIcon', 'getTitle',
      'onMount', 'isDropdownOpen', 'bindSelectionPort', 'destroy']) {
      const member = source[name]
      if (member === undefined && name !== 'isActive' && name !== 'toggle') continue
      if (typeof member !== 'function') throw new TypeError(`Inline tool "${type}" ${name} must be a function`)
      Object.defineProperty(methods, name, {
        value: (...args) => Reflect.apply(member, source, args),
        enumerable: true,
      })
    }
    return Object.freeze({ type, icon, title, shortcut, tag, ...methods })
  })
}

/** One inline toolbar's ownership, started hooks and independent release ledger. */
export class InlineToolMounts {
  #entries = []
  #error
  #closed = false

  /** @param {readonly object[]} sources @param {{prepareExtensionValue:(operation:()=>any)=>any}} runtime @param {(error:unknown)=>void} [onError] */
  constructor(sources, runtime, onError = () => {}) {
    this.#error = onError
    const seen = new Set()
    const names = new Set()
    for (const source of sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Inline tools must be objects')
      if (seen.has(source)) throw new Error('Inline tool instance occurs more than once')
      if (owners.has(source)) throw new Error('Inline tool instance is already mounted')
      seen.add(source)
    }
    /** @type {Array<{source:any,tool:any,started:boolean,revoke:(()=>void)|null,owner:InlineToolMounts}>} */
    const staged = sources.map(source => {
      const tool = captureTool(runtime, source)
      if (names.has(tool.type)) throw new Error(`Duplicate inline tool type: ${tool.type}`)
      names.add(tool.type)
      return { source, tool, started: false, revoke: null, owner: this }
    })
    for (const entry of staged) owners.set(entry.source, entry)
    this.#entries = staged
  }

  get tools() {
    return this.#entries.map(entry => entry.tool)
  }

  /** Mark acquisition before invoking hooks; a throwing mount is still cleaned.
   * @param {object} tool
   * @param {unknown} port
   * @param {HTMLElement} button
   * @param {unknown} mutations
   * @param {()=>void} [revoke]
   */
  start(tool, port, button, mutations, revoke = () => {}) {
    if (this.#closed) throw new Error('Inline tool mounts are already destroyed')
    const entry = this.#entries.find(entry => entry.tool === tool)
    if (!entry || entry.started) throw new Error('Inline tool mount is not available')
    entry.started = true
    entry.revoke = revoke
    this.#complete(tool.bindSelectionPort?.(port))
    this.#complete(tool.onMount?.(button, mutations))
  }

  /** Retire all scopes before cleanup; independently release every started owner. */
  destroy() {
    if (this.#closed) return
    this.#closed = true
    const errors = []
    const attempt = callback => {
      try { callback() } catch (error) { errors.push(error) }
    }
    for (const entry of this.#entries) attempt(() => entry.revoke?.())
    for (const entry of [...this.#entries].reverse()) {
      if (entry.started) {
        attempt(() => this.#complete(entry.tool.bindSelectionPort?.(null)))
        attempt(() => this.#complete(entry.tool.destroy?.()))
      }
      if (owners.get(entry.source) === entry) owners.delete(entry.source)
    }
    this.#entries = []
    for (const error of errors) this.#report(error)
  }

  #complete(value) {
    return synchronousResult(value, error => this.#report(error))
  }

  #report(error) {
    try { this.#error(error) } catch {}
  }
}
