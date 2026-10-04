---
title: Choose Pinia for Meaningful Shared Application State
impact: HIGH
impactDescription: A clear state boundary prevents SSR leaks, duplicate server state, and ad-hoc global singletons
type: best-practice
tags: [vue3, nuxt4, pinia, state-management, ssr, architecture]
---

# Choose Pinia for Meaningful Shared Application State

Pinia is the official Vue store library and integrates with Nuxt through
`@pinia/nuxt`. It is a strong choice when shared state has application/domain
behavior, actions, DevTools needs or plugin requirements.

It is **not** necessary to move every shared value into Pinia. Nuxt provides
`useState()` for small SSR-safe shared values, and remote data belongs in the
application's server-state cache when one is already established.

## Use Pinia When

- state is shared across unrelated components/routes;
- state has meaningful actions/invariants;
- DevTools/action tracing improves maintainability;
- a Pinia plugin or store lifecycle is required;
- the existing feature already owns a Pinia store.

## Prefer a Simpler Boundary When

- state is purely component-local;
- a reusable composable can own instance-local state;
- the value is a small Nuxt-wide serializable preference/config flag;
- state is already owned by the URL;
- data is remote server state cached by TanStack Query/useAsyncData/useFetch.

## Nuxt 4

With Nuxt, install/use Pinia through the official module and let Nuxt create the
request-safe application instance.

    export default defineNuxtConfig({
      modules: ['@pinia/nuxt'],
      pinia: {
        storesDirs: ['./app/modules/**/stores'],
      },
    })

Do not manually call `createPinia()` in a parallel application bootstrap.

## Setup Stores

Both Pinia store syntaxes are supported. In a Composition API application such
as ecom, setup stores are a natural default:

    export const useCartStore = defineStore('cart', () => {
      const items = ref<CartItem[]>([])
      const total = computed(() =>
        items.value.reduce((sum, item) => sum + item.total, 0),
      )

      function clear(): void {
        items.value = []
      }

      return { items, total, clear }
    })

Return all reactive state from setup stores. See the dedicated setup-store
reference for the SSR/DevTools rationale.

## SSR

Never replace Pinia/Nuxt request isolation with exported module-level
`reactive()` or `ref()` singletons. A long-running server can reuse modules
between requests.

Also avoid storing secrets or server-only credentials in hydrated client state.

## Server State

Do not use Pinia merely as a second cache for data already managed by a query
library. Duplicating the same resource across Pinia and TanStack Query creates
two sources of truth and more invalidation paths.

## Official References

- https://pinia.vuejs.org/core-concepts/
- https://pinia.vuejs.org/ssr/
- https://pinia.vuejs.org/ssr/nuxt.html
- https://nuxt.com/docs/4.x/getting-started/state-management
