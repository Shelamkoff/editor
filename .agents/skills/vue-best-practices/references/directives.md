---
title: "Directive Hook and Resource Ownership"
impact: HIGH
impactDescription: "Function shorthand runs at both mount and update; it is not a mount-only autofocus hook"
type: best-practice
tags: [vue3, directives, typescript, ssr, cleanup]
---

# Directives are a DOM-level boundary

Prefer ordinary bindings for rendered attributes and components/composables for
structured behavior. Use a directive for a genuine low-level DOM concern. Local
script-setup registration uses a camelCase variable such as `vFocus`, consumed as
`v-focus` in the template. Do not mutate binding/argument objects as storage.

## Mount-only behavior requires a mount-only hook

A function directive is shorthand for **both mounted and updated**. Repeated
focus on update can steal a user's focus. When initial focus is required by the
UX, use an object hook. This complete directive definition is typed and performs
no browser access at import time:

```ts
import type { ObjectDirective } from 'vue'

export const vFocus: ObjectDirective<HTMLInputElement> = {
  mounted(element) {
    element.focus()
  },
}
```

Use this only where deliberate initial focus is appropriate, not on every input.
A typed local declaration needs no global type augmentation. For a global
directive, use the Vue/tooling interface documented for the resolved version;
current docs describe `GlobalDirectives`. Do not assume an unrelated component
property declaration proves template directive typing.

## Updates and teardown

A directive whose behavior depends on binding.value must handle value changes,
not just mount. When replacing a listener/observer, release the old resource first.
Store handles in an explicitly typed owner (for example an element-keyed WeakMap),
not an undeclared `element._observer` property. A WeakMap does not disconnect an
observer by itself: perform idempotent cleanup on teardown.

Do not register Vue component lifecycle composables from arbitrary directive
callbacks. The directive's own hooks own its resources. Consider cached/deactivated
views separately; a directive's unmounted hook is not a pause-on-deactivation API.

## SSR and component roots

DOM hooks do not execute during SSR. Prefer declarative attributes for content
that must render on the server. If a directive must supply SSR props, implement
and verify getSSRProps consistently with the client behavior. In Nuxt make sure
server rendering can resolve the directive; a client-only registration is not
a universal solution for an SSR template using it.

Use directives on DOM elements rather than depending on a component's private
root shape. A multi-root component cannot forward a directive using `$attrs`.

## Acceptance

Test mount, reactive binding update, teardown and repeated initialization. Verify
focus is not recaptured on unrelated renders, and test SSR when the directive
changes HTML-visible state.

## Primary sources

- [Vue custom directives](https://vuejs.org/guide/reusability/custom-directives.html)
- [Directive SSR](https://vuejs.org/guide/scaling-up/ssr.html#custom-directives)
- [Typing directives](https://vuejs.org/guide/typescript/composition-api.html#typing-global-custom-directives)
