// @ts-check

/**
 * Resolve the neutral v2 data schema explicitly owned by one plugin class.
 *
 * The own-property check is deliberate: subclasses/custom plugins that reuse
 * a built-in public type are not silently forced through the built-in schema.
 *
 * @param {import('./types').BlockPlugin} plugin
 * @returns {any}
 */
export function ownPluginDataSchema(plugin) {
  const constructor = /** @type {any} */ (plugin?.constructor)
  return constructor && Object.hasOwn(constructor, 'dataSchema')
    ? constructor.dataSchema
    : undefined
}
