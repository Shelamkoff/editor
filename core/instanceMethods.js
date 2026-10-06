// @ts-check

/** Capture one runtime or instance method with its original receiver.
 * @param {any} source
 * @param {string} name
 * @returns {((...args: any[]) => any) | undefined}
 */
export function captureInstanceMethod(source, name) {
  const method = source?.[name]
  return typeof method === 'function' ? (...args) => Reflect.apply(method, source, args) : undefined
}

/** Capture cleanup before inspecting other instance members, and run it once.
 * @param {any} source
 * @returns {(() => void) | undefined}
 */
export function captureInstanceDestroy(source) {
  const destroy = captureInstanceMethod(source, 'destroy')
  if (!destroy) return undefined
  let destroyed = false
  return () => {
    if (destroyed) return
    destroyed = true
    destroy()
  }
}
