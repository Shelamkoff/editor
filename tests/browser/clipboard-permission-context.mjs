/** Select permission addressing for the disposable default profile launched by
 * physical-history.mjs. That runner never creates a separate browser context.
 * TargetInfo may report a default-profile ID that Browser.setPermission does
 * not accept as an explicitly created context; default addressing omits it.
 */
export function selectOwnedDefaultPermissionContext(targetInfo, browserContexts) {
  if (!targetInfo || typeof targetInfo !== 'object' || Array.isArray(targetInfo)) {
    throw new TypeError('Invalid target context metadata')
  }
  const reportedId = targetInfo.browserContextId
  if (reportedId !== undefined && (typeof reportedId !== 'string' || !reportedId)) {
    throw new TypeError('Invalid target context ID')
  }
  if (!browserContexts || typeof browserContexts !== 'object' || Array.isArray(browserContexts)
    || !Array.isArray(browserContexts.browserContextIds)) {
    throw new TypeError('Invalid browser context inventory')
  }
  if (browserContexts.browserContextIds.length !== 0) {
    throw new Error('The owned fresh profile unexpectedly contains created browser contexts')
  }
  const defaultId = browserContexts.defaultBrowserContextId
  if (defaultId !== undefined && (typeof defaultId !== 'string' || !defaultId || reportedId !== defaultId)) {
    throw new Error('The reported target does not match the default browser context')
  }
  return Object.freeze({
    parameters: Object.freeze({}),
    evidence: Object.freeze({
      kind: 'owned-default-profile',
      reportedBrowserContextId: reportedId ?? null,
      defaultBrowserContextId: defaultId ?? null,
      createdBrowserContextIds: Object.freeze([]),
      selectionReason: 'Fresh owned profile has no CDP-created contexts; CDP addresses its default context by omission.',
    }),
  })
}
