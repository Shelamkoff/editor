const policies = new WeakMap()
const enforcement = new WeakMap()
const sharedPolicyKey = Symbol.for('@shelamkoff/rector/trusted-types-policy')

/**
 * Convert an internal HTML string to TrustedHTML when Trusted Types are
 * available. The policy is intentionally private to Rector and is used only
 * at reviewed sinks. Persisted/user HTML must be sanitized before a trusted
 * sink helper is used.
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
    const shared = /** @type {any} */ (view)[sharedPolicyKey]
    if (shared && typeof shared.createHTML === 'function') {
      policy = shared
    } else {
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
      // Separate installed/bundled copies of Rector have independent module
      // state but share the same Window realm. Reuse one policy through a
      // global-symbol slot so CSP does not need the weaker 'allow-duplicates'
      // keyword merely because the package appears twice in a dependency graph.
      try {
        Object.defineProperty(view, sharedPolicyKey, {
          value: policy,
          configurable: false,
          enumerable: false,
          writable: false,
        })
      } catch {
        // A non-extensible Window is highly unusual, but the local module can
        // still operate. A second package copy in that realm will surface the
        // browser's duplicate-policy TypeError rather than silently weakening CSP.
      }
    }
    policies.set(view, policy)
  }
  return policy.createHTML(html)
}

/**
 * Detect whether this document rejects plain strings at HTML sinks.
 *
 * Merely exposing `window.trustedTypes` does not mean enforcement is enabled,
 * so integrations with third-party DOM libraries cannot use feature detection
 * alone. Probe an inert detached template once per realm and cache the result.
 * No attacker-controlled markup is parsed by this probe.
 *
 * @param {Document} ownerDocument
 * @returns {boolean}
 */
export function requiresTrustedHtml(ownerDocument) {
  const view = ownerDocument?.defaultView
  const trustedTypes = view ? /** @type {any} */ (view).trustedTypes : null
  if (!trustedTypes || !view) return false
  if (enforcement.has(view)) return enforcement.get(view) === true

  const template = ownerDocument.createElement('template')
  let required = false
  try {
    // This deliberately probes the browser contract with an empty, inert value.
    // Under require-trusted-types-for 'script' the assignment throws TypeError.
    template.innerHTML = ''
  } catch (error) {
    const TypeErrorCtor = view.TypeError ?? TypeError
    if (!(error instanceof TypeErrorCtor)) throw error
    required = true
  }
  enforcement.set(view, required)
  return required
}
