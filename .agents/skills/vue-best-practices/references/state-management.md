---
title: State Management Strategy
impact: HIGH
impactDescription: Choosing the wrong shared-state boundary can cause SSR request leaks, duplicate server state, and brittle mutation flows
type: best-practice
tags: [vue3, nuxt4, state-management, pinia, composables, ssr]
---

# State Management Strategy

Keep state as local as possible, then promote it only when its lifetime or
sharing requirements justify a broader boundary.

## Decision Order

1. Component-local `ref()`/`reactive()` for local UI state.
2. A feature composable for reusable behavior whose state remains instance-local.
3. URL/query params for shareable navigation/filter state.
4. Nuxt `useState()` for small SSR-safe shared state in a Nuxt application.
5. Pinia for meaningful shared application/domain state, actions, DevTools or
   plugin needs.
6. Server-state/query cache for remote data; do not duplicate it in a client
   store without a concrete reason.

Nuxt is not opinionated about a single global state library. `useState()` and
Pinia are both valid; choose by state semantics and existing project contracts.

## SSR Safety

Never export a mutable Vue reactive singleton from module scope in SSR code.

Bad:

    export const cart = reactive({
      items: [],
    })

A server runtime can reuse that module across requests.

For small Nuxt shared state:

    export function useCheckoutStep() {
      return useState<number>('checkout-step', () => 1)
    }

For application/domain stores, use Pinia through the Nuxt integration.

## Nuxt useState()

`useState()` is SSR-aware and hydrates its serializable value to the client.
Use it for small shared values when a store abstraction would add no meaningful
behavior.

Values must be serializable. Avoid functions, symbols, class instances and
server-only data unless the application deliberately defines serialization.

## Pinia

Use Pinia when shared state has domain/application behavior or benefits from
store tooling.

Examples:

- authenticated-account/session presentation state;
- cart application state;
- multi-step workflows shared across routes;
- shared state with explicit actions and invariants.

In Nuxt use `@pinia/nuxt`; do not manually create a second Pinia instance.

When setup stores are used, return all reactive state so SSR, DevTools and
plugins can observe it. Apply the dedicated Pinia skill for store-specific work.

## Server State Is Not Client State

Remote resources cached by TanStack Query, `useFetch()`, or
`useAsyncData()` should normally stay in their server-state cache.

Do not mirror query results into Pinia merely to make them globally accessible.
That creates two sources of truth and invalidation complexity.

## URL State

Filters, sorting, pagination and selected views that users should be able to
bookmark/share belong in the URL where practical.

Use the router skill for route-driven state.

## Official References

- https://nuxt.com/docs/4.x/getting-started/state-management
- https://nuxt.com/docs/4.x/api/composables/use-state
- https://pinia.vuejs.org/ssr/nuxt.html
- https://vuejs.org/guide/scaling-up/state-management.html
