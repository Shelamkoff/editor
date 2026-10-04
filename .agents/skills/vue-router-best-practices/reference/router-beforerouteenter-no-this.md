---
title: "Legacy Entry Guards Without Route-meta Resource Caches"
impact: HIGH
impactDescription: "An entering component does not exist yet; route metadata is not a query hydration boundary"
type: best-practice
tags: [vue-router, nuxt4, guards, cache, composition-api]
---

# Understand the legacy entry hook without adopting it everywhere

The Options API beforeRouteEnter guard cannot access the entering component as
this because that instance does not yet exist. Its optional next(instance => ...)
callback runs after confirmed navigation when the instance is available. Other
guards do not support that instance-callback form. Legacy code using next must
settle exactly once per path.

This is reference guidance for maintaining that API, not an instruction to
switch ecom components away from script setup. There is no matching
onBeforeRouteEnter Composition API hook. Supported composition hooks cover
update and leave, while Nuxt middleware and the existing query/SSR integration
handle the appropriate entry concerns.

## Do not cache fetched resources in to.meta

Route metadata describes navigation policy/configuration. Attaching a fetched
user/order to to.meta does not provide a resource key, SSR dehydration, invalidation,
request isolation or stale-completion handling. A setup-time assignment from
route.meta is another snapshot, not a reactive route-driven data pipeline.

Use the existing repository and server-state owner. Prefetch through that owner
when entry really needs data, then let the component consume the same keyed
resource. Do not add a separate route-meta cache alongside TanStack or Nuxt async
data, and do not default to onMounted fetching for data required in SSR HTML.

Use Nuxt's useRoute in component setup and to/from in middleware. Validate inputs
and preserve reactivity across same-record navigation. Do not perform an
injection-dependent composable call from an arbitrary late callback merely
because the guard itself was async.

## Acceptance

Test initial entry, navigation cancellation while loading, param changes, rejection,
SSR/hydration and identity changes. Verify a prefetch and its consumer share one
cache contract. UI navigation checks never replace backend authorization.

## Primary sources

- [Vue Router in-component guards](https://router.vuejs.org/guide/advanced/navigation-guards.html#in-component-guards)
- [Composition API guards](https://router.vuejs.org/guide/advanced/composition-api.html)
- [Ecom SSR/query boundary](../../vue3-app/references/data-and-ssr.md)
