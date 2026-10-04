---
title: Return Store-Owned State Without Exposing Secrets or Infrastructure
impact: HIGH
impactDescription: Hidden or readonly owned state breaks Pinia integration; returning secrets exposes them to the client
type: gotcha
tags: [vue3, pinia, setup-stores, ssr, ownership]
---

# Return the state the store owns

Pinia setup stores must return their owned state so hydration, DevTools and
plugins can observe it. Keep that state mutable for Pinia; do not wrap it in
readonly. Computed getters are naturally readonly and are supported.

This is not an instruction to return every variable in the closure. Injected
route/router/app values are not owned state. Plain implementation handles such
as an in-flight promise or AbortController are not serializable application state.
Their lifetime must still be app/request-scoped and cleaned up where necessary.

Complete example with non-sensitive UI state:

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  const selectedIds = ref<string[]>([])
  const count = computed(() => selectedIds.value.length)

  function select(id: string): void {
    if (!selectedIds.value.includes(id)) selectedIds.value.push(id)
  }
  function reset(): void {
    selectedIds.value = []
  }

  return { selectedIds, count, select, reset }
})
```

## No secret-state workaround

Do not use bearer tokens or session-cookie values as example hydrated state.
An underscore prefix communicates naming, not privacy. A hidden ref is also not
a security boundary. Keep server-only credentials server-side and preserve the
application's cookie/session transport. Browser-visible anti-CSRF tokens required
by the protocol are distinct; follow the existing in-memory/header contract and
exclude them from logs, URLs and generic persistence.

Return presentation state (for example an account view and explicit session
status), not the credentials proving a session. Do not bypass the approved API
repository with an ad-hoc fetch in a store example.

## Ordinary composables are not Pinia stores

A readonly facade can be a valid ordinary composable API. It must not be copied
blindly into a setup store: Pinia needs its owned state, and hydration/plugins may
need to assign to it. Keep ownership explicit at the seam.

When testing a store, use a fresh Pinia per test/app and check actions, reset and
hydration behavior. Confirm no secrets or runtime infrastructure enter serialized
state. An object dump in DevTools is not an SSR isolation test.

## Primary sources

- [Pinia setup stores](https://pinia.vuejs.org/core-concepts/#setup-stores)
- [Pinia SSR](https://pinia.vuejs.org/ssr/)
- [Pinia Nuxt](https://pinia.vuejs.org/ssr/nuxt.html)
