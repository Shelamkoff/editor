---
title: React to Route Inputs Without Assuming a Remount
impact: HIGH
impactDescription: Reused views and stale requests can display data belonging to an earlier route
type: gotcha
tags: [vue3, vue-router, nuxt4, params, reactivity]
---

# Route reuse and data identity

When a route record reuses its component for another parameter, creation/mount
hooks do not necessarily run again. This does not mean all lifecycle hooks stop:
updates, activation and disposal depend on actual rendering and caching.
Nuxt page keys may also influence reuse. Inspect the current configuration rather
than assuming every parameter change always remounts or never remounts.

Use Nuxt's useRoute from auto-imports/#app in Nuxt components. Direct imports
from vue-router bypass Nuxt's route synchronization. Middleware and route-update
checks should use the target to/from values supplied to them.

## Query-managed resources

Derive the specific normalized param/query input and pass a getter/ref into
reactive query options. Evaluating route.params.id once outside a reactive wrapper
freezes the query input. Read
[the reactive query example](../../vue3-app/references/data-and-ssr.md).

A key must identify the same inputs captured by its query function. Forward
AbortSignal; clear/cancel sensitive old queries on identity changes. Do not create
a second manual watch/fetch cache alongside an existing TanStack or Nuxt owner.

## Other effects

For non-query effects, watch the specific relevant route source, not the entire
route object by default. Use immediate only when initial execution is intended;
it is not by itself an SSR prefetch strategy.

A component onBeforeRouteUpdate guard can decide whether pending navigation may
proceed; it is not an initial-load hook. Fetch-before-navigation and fetch-after-
navigation are different policies. Do not commit target data to the old view
before a navigation that another guard may still reject without a deliberate plan.

Handle cancellation, errors and stale completion. A slower request for item A
must not overwrite item B's data/error/loading state after route change.

## Keys and lifecycle

Do not key the entire app by route.fullPath as a default fix. It destroys local
state on unrelated query/hash changes and fragments differ between server and
client. Use a deliberate Nuxt page key only when reset/recreation is the intended
contract; prefer a minimal identity key.

There is no universal lifecycle table based on URL text alone. Different records,
identical param values, nested views, KeepAlive and explicit keys change behavior.

## Verify

Test initial SSR load, A-to-B parameter navigation, relevant query changes,
Back/Forward, fast A-to-B requests with reversed completion, failed navigation and
intentional draft preservation/reset. Observe visible data and request behavior,
not only whether onMounted was called.

## Primary sources

- [Dynamic matching](https://router.vuejs.org/guide/essentials/dynamic-matching.html#reacting-to-params-changes)
- [Nuxt useRoute](https://nuxt.com/docs/4.x/api/composables/use-route)
- [Nuxt pages](https://nuxt.com/docs/4.x/directory-structure/app/pages)
