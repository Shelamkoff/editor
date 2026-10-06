// @ts-check

/**
 * Snapshot stylesheet ownership for a built-in block definition.
 * @param {{injectStyles?: boolean, css?: string}} config
 * @param {readonly string[]} builtIn
 * @returns {readonly string[]} Immutable URLs acquired by the editor registry.
 */
export function definitionStyles(config, builtIn) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Plugin configuration must be an object')
  const { injectStyles, css } = { ...config }
  if (injectStyles !== undefined && typeof injectStyles !== 'boolean') throw new TypeError('injectStyles must be a boolean')
  if (css !== undefined && typeof css !== 'string') throw new TypeError('css must be a string')
  return Object.freeze([
    ...(injectStyles === false ? [] : builtIn),
    ...(css ? [css] : []),
  ])
}
