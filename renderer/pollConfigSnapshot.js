// @ts-check

/**
 * Snapshot the built-in Poll runtime adapter so validated configuration cannot
 * drift through accessor-backed properties after construction or across an
 * asynchronous dynamic-import boundary.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {import('./types').PollRendererConfig | undefined}
 */
export function snapshotPollRendererConfig(input, label = 'EditorRenderer blockConfigs.poll') {
  if (input === undefined) return undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`)
  }

  const source = /** @type {Record<string, unknown>} */ (input)
  const dataSourceInput = source.dataSource
  let dataSource
  if (dataSourceInput !== undefined) {
    if (!dataSourceInput || typeof dataSourceInput !== 'object' || Array.isArray(dataSourceInput)) {
      throw new TypeError('EditorRenderer Poll dataSource must be an object')
    }
    const adapter = /** @type {Record<string, unknown>} */ (dataSourceInput)
    const load = adapter.load
    const vote = adapter.vote
    const subscribe = adapter.subscribe
    if (typeof load !== 'function' || typeof vote !== 'function') {
      throw new TypeError('EditorRenderer Poll dataSource must implement load() and vote()')
    }
    if (subscribe !== undefined && typeof subscribe !== 'function') {
      throw new TypeError('EditorRenderer Poll dataSource subscribe must be a function')
    }
    dataSource = {
      load: /** @type {any} */ (load).bind(dataSourceInput),
      vote: /** @type {any} */ (vote).bind(dataSourceInput),
      ...(typeof subscribe === 'function'
        ? { subscribe: /** @type {any} */ (subscribe).bind(dataSourceInput) }
        : {}),
    }
  }

  const onError = source.onError
  if (onError !== undefined && typeof onError !== 'function') {
    throw new TypeError('EditorRenderer Poll onError must be a function')
  }
  const compareRevisions = source.compareRevisions
  if (compareRevisions !== undefined && typeof compareRevisions !== 'function') {
    throw new TypeError('EditorRenderer Poll compareRevisions must be a function')
  }
  const maxVoters = source.maxVoters

  return {
    ...(dataSource ? { dataSource } : {}),
    ...(typeof onError === 'function' ? { onError: /** @type {any} */ (onError) } : {}),
    ...(typeof compareRevisions === 'function'
      ? { compareRevisions: /** @type {any} */ (compareRevisions) }
      : {}),
    ...(maxVoters !== undefined ? { maxVoters: /** @type {any} */ (maxVoters) } : {}),
  }
}
