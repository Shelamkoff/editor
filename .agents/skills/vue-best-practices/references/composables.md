---
title: Composables with Explicit Ownership and Cleanup
impact: HIGH
impactDescription: Browser access during SSR and cleanup against a changed target cause crashes and resource leaks
type: best-practice
tags: [vue3, composables, ssr, cleanup, contracts]
---

# Composable organization

A composable owns a coherent reactive behavior, not every helper called by a
component. Keep pure transformations as plain functions. Extract reusable or
lifecycle-heavy behavior at meaningful seams, not by a fixed component-size quota.
Use an options object when multiple optional parameters need names.

For value/ref/getter inputs also apply
[create-adaptable-composable](../../create-adaptable-composable/SKILL.md).
Do not redefine Vue utility types or treat a one-time toValue read as reactive.

## Browser resources and changing targets

Call lifecycle-based composables synchronously from component setup. This complete
example evaluates a browser target only after mount, reattaches on target changes,
and removes the listener from the exact target on which it was installed.

```ts
import { onMounted, onScopeDispose, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, WatchStopHandle } from 'vue'

export function useEventListener(
  target: MaybeRefOrGetter<EventTarget | null | undefined>,
  type: string,
  listener: EventListener,
  capture = false,
): void {
  let stop: WatchStopHandle | undefined

  onMounted(() => {
    stop = watch(() => toValue(target), (node, _old, onCleanup) => {
      if (!node) return
      node.addEventListener(type, listener, capture)
      onCleanup(() => node.removeEventListener(type, listener, capture))
    }, { immediate: true, flush: 'post' })
  })
  onScopeDispose(() => stop?.())
}
```

Pass `() => window` rather than evaluating `window` during SSR setup. Null DOM
refs are expected before mount and when conditional elements disappear. Never
re-evaluate a changed target during cleanup: that may remove from the new target
and leak the old listener. Use equivalent lifecycle ownership for observers,
subscriptions and timers. For KeepAlive, decide whether deactivation should pause
an effect; unmount cleanup alone does not define that policy.

## Return contracts

Ordinary composables may expose readonly state and explicit mutation actions when
they own it. Other composables intentionally return writable refs (for example a
form field). Choose and document the contract; neither is universally mandatory.

Pinia setup stores have different integration requirements: return their owned
state as mutable refs/reactive objects, not readonly wrappers. Do not spread an
ordinary composable's readonly facade into Pinia state mechanically. Do not
return injected router/app objects as state, or serialize runtime resources.

## Nuxt boundaries

Use Nuxt head APIs for title/meta management rather than a competing document.title
watcher. Keep Nuxt composable calls in valid context; dependency injection does not
become safe merely by moving a call into an arbitrary function.

Do not name a generic helper `useFetch` or `useAsyncData`; these names have Nuxt
framework semantics. A repository/query composable should compose the established
server-state owner, not add a manual onMounted fetch cache on top of it.

Instance-local state can live inside the composable. Shared SSR state must use an
app/request-safe owner; do not export mutable process-wide refs as a shortcut.

## Review and tests

Check value/ref/getter updates, null/changed targets, mount/disposal, stale async
completion, errors and SSR import/setup without browser globals. Ensure a returned
stop function actually stops its resources. Test observable effects, not private
function names or incidental implementation order.

## Primary sources

- [Vue composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue effect scope](https://vuejs.org/api/reactivity-advanced.html#onscopedispose)
- [Pinia setup stores](https://pinia.vuejs.org/core-concepts/#setup-stores)
