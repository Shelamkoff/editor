// @ts-check
import { synchronousResult } from '../shared/synchronousResult.js'

/** @typedef {Readonly<{id:string,label:string,compactLabel?:string,icon?:string,active?:boolean,disabled?:boolean}>} PreparedSettingsAction */

/** Copy only the declared label fields while the runtime preparation guard is held.
 * @param {unknown} input
 * @param {string} name
 * @returns {Readonly<import('../plugin-kit/types').LocalizedLabel>}
 */
function captureLabel(input, name) {
  const value = synchronousResult(input)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a LocalizedLabel object`)
  }
  const source = /** @type {any} */ (value)
  const key = synchronousResult(source.key)
  const fallback = synchronousResult(source.fallback)
  if (typeof key !== 'string' || !key || typeof fallback !== 'string') {
    throw new TypeError(`${name} must contain a non-empty key and a fallback string`)
  }
  return Object.freeze({ key, fallback })
}

/** Prepare a complete settings/inline-control group before publishing any UI.
 * Returned labels and actions contain no extension-owned getters. Action IDs
 * remain opaque, and the selected apply method retains its original receiver.
 * @template {object} D
 * @param {{prepareExtensionValue:<T>(operation:()=>T)=>T}} runtime
 * @param {import('../plugin-kit/types').SettingsActionCapability<D & object>} capability
 * @param {Readonly<D>} data
 * @param {import('../plugin-kit/types').ExtensionUiContext} context
 * @param {import('../plugin-kit/types').LocalizedLabel} fallbackLabel
 */
export function prepareSettingsActions(runtime, capability, data, context, fallbackLabel) {
  return runtime.prepareExtensionValue(() => {
    const actionsMethod = synchronousResult(capability.actions)
    const applyMethod = synchronousResult(capability.apply)
    if (typeof actionsMethod !== 'function' || typeof applyMethod !== 'function') {
      throw new TypeError('Settings actions and apply must be functions')
    }
    const translate = context.t
    if (typeof translate !== 'function') throw new TypeError('Settings label translator must be a function')
    const groupLabel = capability.label
    const group = captureLabel(groupLabel === undefined ? fallbackLabel : groupLabel, 'Settings group label')
    const localize = (input, name = 'Settings action label') => {
      const owned = captureLabel(input, name)
      const text = synchronousResult(Reflect.apply(translate, context, [owned]))
      if (typeof text !== 'string') throw new TypeError(`${name} translation must be a string`)
      return text
    }
    const ui = Object.freeze({
      ownerDocument: context.ownerDocument,
      t: input => localize(input),
    })
    const source = synchronousResult(Reflect.apply(actionsMethod, capability, [data, ui]))
    if (!Array.isArray(source)) throw new TypeError('Settings actions must return a dense array')
    const length = source.length
    const ids = new Set()
    /** @type {PreparedSettingsAction[]} */
    const actions = []
    for (let index = 0; index < length; index++) {
      if (!Object.hasOwn(source, index)) throw new TypeError('Settings actions must return a dense array')
      const action = synchronousResult(source[index])
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw new TypeError(`Settings action ${index} must be an object`)
      }
      const id = synchronousResult(action.id)
      const label = action.label
      const compactLabel = action.compactLabel
      const icon = synchronousResult(action.icon)
      const active = synchronousResult(action.active)
      const disabled = synchronousResult(action.disabled)
      if (typeof id !== 'string' || !id || ids.has(id)) {
        throw new TypeError('Settings action IDs must be unique non-empty strings')
      }
      ids.add(id)
      if (icon !== undefined && typeof icon !== 'string') throw new TypeError(`Settings action "${id}" icon must be a string`)
      if (active !== undefined && typeof active !== 'boolean') throw new TypeError(`Settings action "${id}" active must be a boolean`)
      if (disabled !== undefined && typeof disabled !== 'boolean') throw new TypeError(`Settings action "${id}" disabled must be a boolean`)
      actions.push(Object.freeze({
        id,
        label: localize(label, `Settings action "${id}" label`),
        ...(compactLabel === undefined ? {} : { compactLabel: localize(compactLabel, `Settings action "${id}" compactLabel`) }),
        ...(icon === undefined ? {} : { icon }),
        ...(active === undefined ? {} : { active }),
        ...(disabled === undefined ? {} : { disabled }),
      }))
    }
    return Object.freeze({
      label: localize(group, 'Settings group label'),
      actions: Object.freeze(actions),
      apply: (current, actionId, operationContext) => synchronousResult(
        Reflect.apply(applyMethod, capability, [current, actionId, operationContext]),
      ),
    })
  })
}
