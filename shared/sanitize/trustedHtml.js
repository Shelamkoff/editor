const policies = new WeakMap()

/**
 * Convert an internal HTML string to TrustedHTML when Trusted Types are
 * available. The policy is intentionally private to Rector and is used only
 * at sinks whose input is subsequently constrained by Rector's sanitizers.
 *
 * Applications enforcing a `trusted-types` CSP must allow the `rector` policy.
 *
 * @param {string} html
 * @param {Document} [ownerDocument]
 * @returns {string | unknown}
 */
export function toTrustedHtml(html, ownerDocument = globalThis.document) {
  const view = ownerDocument?.defaultView
  const trustedTypes = view ? /** @type {any} */ (view).trustedTypes : null
  if (!trustedTypes?.createPolicy || !view) return html

  let policy = policies.get(view)
  if (!policy) {
    try {
      policy = trustedTypes.createPolicy('rector', {
        createHTML(value) { return value },
      })
    } catch (cause) {
      throw new TypeError(
        'Rector could not create its Trusted Types policy. Allow the "rector" policy in the trusted-types CSP directive.',
        { cause },
      )
    }
    policies.set(view, policy)
  }
  return policy.createHTML(html)
}
