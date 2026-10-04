---
title: Choose Reactivity by Ownership and Mutation Semantics
impact: HIGH
impactDescription: Incorrect source tracking and stale async completion produce inconsistent UI state
type: best-practice
tags: [vue3, reactivity, computed, watch, cleanup]
---

# Reactivity contracts

Use `ref` for ordinary local state and deep reactive values. Use `reactive` for
object state mutated in place; replacing its root variable disconnects consumers.
Use `shallowRef` for opaque values or replacement-based immutable data. Primitive
shallow refs are valid; do not churn them or claim a universal performance gain.

```ts
import { computed, reactive, ref, shallowRef } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
const form = reactive({ title: '' })
const external = shallowRef<AbortController | null>(null)

count.value += 1
form.title = 'Example'
external.value = new AbortController()
console.log(doubled.value, form.title, external.value.signal.aborted)
```

Nested mutation inside a shallow ref does not trigger deep tracking. For mutable
forms needing nested updates, choose deep reactivity instead of compensating with
manual trigger calls everywhere. Computed getters must not perform requests,
emits, storage writes or source mutations.

## Preserve sources

Destructuring a primitive from `reactive` is a snapshot. Use toRef/toRefs or a
getter. Watch `() => state.count`, not the evaluated number `state.count`.
Pinia state/getters require storeToRefs; actions are a different case.

Both `const props = defineProps<...>()` and Vue 3.5 reactive props destructuring
are supported. A destructured prop passed to another function as a plain value
is still a snapshot at that call: pass `() => prop` when ongoing tracking matters.
`toValue` unwraps at evaluation time; it is not a subscription outside an effect.

## Async effects: cancellation and late completion

Use the established query cache for server resources. The following standalone
Vue composable illustrates a manual effect when such an effect is actually
needed. Call it synchronously from setup/an active scope. It does not replace a
Nuxt SSR data loader or a TanStack query.

```ts
import { ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useLatestResult<T>(
  source: MaybeRefOrGetter<string>,
  load: (value: string, signal: AbortSignal) => Promise<T>,
) {
  const data = shallowRef<T>()
  const error = shallowRef<unknown>()
  const pending = ref(false)

  const stop = watch(() => toValue(source), async (value, _old, onCleanup) => {
    const controller = new AbortController()
    let current = true
    onCleanup(() => {
      current = false
      controller.abort()
      pending.value = false
    })
    data.value = undefined
    error.value = undefined
    pending.value = true
    try {
      const result = await load(value, controller.signal)
      if (current) data.value = result
    }
    catch (cause: unknown) {
      if (current && !controller.signal.aborted) error.value = cause
    }
    finally {
      if (current) pending.value = false
    }
  }, { immediate: true })

  return { data, error, pending, stop }
}
```

The current flag prevents an old producer that ignores abort from overwriting
new data, errors or loading state. Cleanup also runs when the watcher is stopped.
Do not use `void request()` as a substitute for handling rejected promises.

Vue 3.5 `onWatcherCleanup` must be registered synchronously in the watcher before
an await. The callback's onCleanup argument is another supported cleanup API.
Create watchers synchronously in setup for automatic scope disposal; watchers
created in later async callbacks need explicit ownership and teardown.

With watchEffect, only dependencies read during synchronous execution are tracked;
read the reactive source before the first await. For browser-only effects, delay
creation/access until the client lifecycle boundary.

## Primary sources

- [Core reactivity](https://vuejs.org/api/reactivity-core.html)
- [Shallow APIs](https://vuejs.org/api/reactivity-advanced.html)
- [Utilities](https://vuejs.org/api/reactivity-utilities.html)
- [Watcher cleanup](https://vuejs.org/guide/essentials/watchers.html#side-effect-cleanup)
