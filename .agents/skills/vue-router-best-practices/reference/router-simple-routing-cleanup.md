---
title: "Own Route-related Browser Listeners and Hook Disposal"
impact: HIGH
impactDescription: "SSR cannot read browser globals, and unmount cleanup does not cover every cached-view lifetime"
type: best-practice
tags: [vue3, nuxt4, routing, listeners, cleanup]
---

# Observe browser resources without creating another router

Ecom uses Nuxt routing. Do not replace it with a hand-written hash router or add
another route registry from a learning example. If a feature genuinely observes
a browser event, the effect must have an explicit client lifetime.

## Browser-event ownership

Read window/document only at a client lifecycle boundary. Register a listener with
a stable function and remove it from the same target with matching capture
semantics. An anonymous function can be removed if its reference is retained;
creating a new function at teardown cannot remove the original listener.

A complete observation-only composable for an explicitly needed hash display:

```ts
import { onMounted, onScopeDispose, readonly, ref } from 'vue'

export function useClientHash() {
  const hash = ref('')
  let cleanup: (() => void) | undefined

  onMounted(() => {
    const target = window
    const update = () => { hash.value = target.location.hash }
    update()
    target.addEventListener('hashchange', update)
    cleanup = () => target.removeEventListener('hashchange', update)
  })
  onScopeDispose(() => cleanup?.())
  return readonly(hash)
}
```

This does not manage navigation and is not a substitute for Nuxt useRoute.
The initial value deliberately excludes browser fragments during SSR. Use it
only when that post-mount observation contract is intended. Native hashchange
also does not report every History API update; Router-owned state should use
Router/Nuxt reactivity instead of combining competing observers.

## Hooks, timers and cached views

Global Router hook registration APIs expose removal callbacks; keep and call them
when the registering owner is disposed. Do not repeatedly register app-wide hooks
from every page without teardown. Nuxt app-level registration belongs in its
existing plugin lifecycle. Verify the installed API before using teardown hooks.

KeepAlive deactivation does not unmount a component. Decide whether observation
continues while inactive or must pause, and implement activation/deactivation
idempotently. Apply the same ownership to timers, subscriptions and in-flight
work, including late completions that ignore cancellation.

## Acceptance

Test SSR setup without browser globals, mount/dispose/remount, target changes,
HMR or repeated hook registration where relevant, and cached-view behavior.
Static hosting does not by itself require a custom router.

## Primary sources

- [Vue composable cleanup](https://vuejs.org/guide/reusability/composables.html)
- [Router API](https://router.vuejs.org/api/interfaces/Router.html)
- [Vue KeepAlive lifecycle](https://vuejs.org/guide/built-ins/keep-alive.html)
