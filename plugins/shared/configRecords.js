// @ts-check

/**
 * Capture immutable configuration records without freezing callers.
 * Known members also support non-enumerable/prototype accessors. Methods keep
 * their captured implementation and original receiver; RegExp values retain identity.
 * @template {object} T
 * @param {readonly T[] | null | undefined} records
 * @param {'actions' | 'socialResolvers'} kind
 * @returns {readonly Readonly<T>[]}
 */
export function snapshotConfigRecords(records, kind) {
  const keys = kind === 'actions' ? ['label', 'icon', 'handler'] : ['test', 'type', 'icon']
  const callbackKey = kind === 'actions' ? 'handler' : 'test'
  return Object.freeze([...(records ?? [])].map(record => {
    const source = /** @type {Record<string, unknown>} */ (record)
    const captured = { ...source }
    for (const key of keys) {
      if (!Object.hasOwn(captured, key)) captured[key] = source[key]
    }
    const callback = captured[callbackKey]
    if (typeof callback === 'function') captured[callbackKey] = Reflect.apply(Function.prototype.bind, callback, [record])
    return Object.freeze(/** @type {T} */ (/** @type {object} */ (captured)))
  }))
}

/**
 * Capture block options and their built-in record lists before an async import.
 * @param {Record<string, unknown>} config
 * @returns {Readonly<Record<string, unknown>>}
 */
export function snapshotBlockPluginConfig(config) {
  const snapshot = { ...config }
  for (const key of /** @type {const} */ (['actions', 'socialResolvers'])) {
    if (Array.isArray(snapshot[key])) snapshot[key] = snapshotConfigRecords(snapshot[key], key)
  }
  if (snapshot.dataSource && typeof snapshot.dataSource === 'object') {
    snapshot.dataSource = snapshotConfigMethods(snapshot.dataSource, ['load', 'vote', 'subscribe'])
  }
  return Object.freeze(snapshot)
}

/**
 * Capture a service's declared methods once, preserving its original receiver.
 * Service state remains caller-owned and may be read by the captured methods.
 * @template {object} T
 * @param {T} source
 * @param {readonly string[]} keys
 * @returns {Readonly<T>}
 */
export function snapshotConfigMethods(source, keys) {
  const record = /** @type {Record<string, unknown>} */ (source)
  const captured = /** @type {Record<string, unknown>} */ ({})
  for (const key of keys) {
    const value = record[key]
    captured[key] = typeof value === 'function'
      ? Reflect.apply(Function.prototype.bind, value, [source]) : value
  }
  return Object.freeze(/** @type {T} */ (/** @type {object} */ (captured)))
}
