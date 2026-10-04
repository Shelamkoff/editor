---
title: "Preserve Store References and Bound Action Contracts"
impact: HIGH
impactDescription: "Destructured primitive values are snapshots; object references also lose connection to later replacement"
type: best-practice
tags: [vue3, pinia, reactivity, actions, typescript]
---

# State/getters and actions are different contracts

Use direct store.property access or storeToRefs for state/getters that must stay
connected to the store. Plain destructuring of a primitive reads its current value.
Destructuring an object may retain reactivity inside that object, but does not
follow a later replacement of the store property. Do not simplify this into a
claim that every destructured object instantly becomes non-reactive.

## A complete typed example

The caller supplies the correct installed Pinia instance; this module does not
create a process-wide store. In a component/Nuxt integration use the established
request-aware resolution instead of inventing another Pinia.

```ts
import { defineStore, storeToRefs } from 'pinia'
import type { Pinia } from 'pinia'
import { computed, ref } from 'vue'

const useCounterStore = defineStore('reference-example', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  function increment(): void { count.value += 1 }
  return { count, doubled, increment }
})

export function useCounterView(pinia: Pinia) {
  const store = useCounterStore(pinia)
  const { count, doubled } = storeToRefs(store)
  const { increment } = store
  return { count, doubled, increment }
}
```

Refs use .value in script and unwrap where Vue's template rules apply. Getters
may be readonly computed refs; storeToRefs does not grant permission to write a
getter. It skips actions/non-reactive members, so obtain actions from the store.

Pinia binds actions. A bare DOM event handler passes the event argument, whereas
an explicit call can supply the intended business arguments. Use the
[handler contract reference](store-method-binding-parentheses.md) for that distinction.
Do not assume an async action has finished merely because it was called; await
it before asserting a result that depends on its completion.

## Acceptance

Test primitive updates, root object replacement, computed getters, destructured
actions and their arguments. Use a fresh Pinia per test and real actions where
their logic is under test. Preserve ownership: a query-cache object is not made
into a writable form draft by exposing it through another ref.

## Primary sources

- [Pinia reactive stores and bound actions](https://pinia.vuejs.org/core-concepts/#destructuring-from-a-store)
- [Vue reactive destructuring limitations](https://vuejs.org/guide/essentials/reactivity-fundamentals.html#limitations-of-reactive)
