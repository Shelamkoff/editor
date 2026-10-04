---
title: Resolve the Correct Pinia Instance in the Correct Context
impact: HIGH
impactDescription: Late function calls alone do not guarantee app/request-safe store resolution
type: gotcha
tags: [vue3, pinia, nuxt4, context, ssr]
---

# Store resolution is a context contract

In ecom, @pinia/nuxt installs Pinia. Do not fix a context error by creating a
second Pinia or manually bootstrapping another Vue application.

Call stores from a valid component/composable, Nuxt plugin or route middleware
context. When needed, capture the current app's Pinia before an async boundary
and pass it explicitly. Nuxt usePinia resolves the Nuxt instance; getActivePinia
is not a substitute for request isolation.

Moving useStore into an arbitrary function or dynamically importing it is not
proof of safety. A timer, utility or resumed callback may lack injection context.
Pass the already resolved store/dependency to plain application services instead.

## Explicit instance example

This self-contained helper assumes the caller supplies its own installed Pinia
instance. It neither creates a global store nor guesses a currently active app.

```ts
import { defineStore } from 'pinia'
import type { Pinia } from 'pinia'
import { ref } from 'vue'

const useCounterStore = defineStore('context-example', () => {
  const count = ref(0)
  function increment(): void { count.value += 1 }
  return { count, increment }
})

export function incrementForApp(pinia: Pinia): number {
  const store = useCounterStore(pinia)
  store.increment()
  return store.count
}
```

Defining a store factory at module scope is fine; creating a request-sensitive
store there is not. For standalone Vue, install Pinia before consumers run;
Nuxt's integration already owns that installation.

## Diagnostics

Check import-time store creation, lost async context, multiple Pinia instances,
plugin ordering and circular dependencies. Do not conceal a broken initialization
contract with a catch-all null return. Do not place await inside a non-async
function as a supposed dynamic-import fix.

A normal `<script>` can contain a valid setup function. The issue is invocation
time/context, not a claim that all normal-script code is invalid. Ecom components
still use script setup by project convention.

Test two independent app/Pinia instances, setup-time usage and the relevant SSR
or middleware path. Preserve the approved API/session boundary while fixing
context; do not add bearer-token reads or a second HTTP client.

## Primary sources

- [Stores outside components](https://pinia.vuejs.org/core-concepts/outside-component-usage.html)
- [Nuxt integration](https://pinia.vuejs.org/ssr/nuxt.html)
