---
title: "Guard Order and Route-record Reuse"
impact: HIGH
impactDescription: "Per-record entry is not every parameter change, and global beforeEach precedes update guards"
type: best-practice
tags: [vue-router, nuxt4, guards, lifecycle]
---

# beforeEnter is for entering a route record

For raw Vue Router configurations, beforeEnter does not rerun merely because
params, query or hash change within the same matched record. A parent's beforeEnter
also does not rerun when switching its children while that parent stays matched.
Do not infer guard execution solely from a URL string becoming different.

Ecom uses Nuxt pages/middleware. This reference explains underlying Router
semantics, not a request to add a parallel route table or duplicate API checks.
Backend authorization is required for every resource operation independently.

## Resolution order

For an ordinary successful non-duplicate navigation, applicable hooks follow:

1. Leaving components' beforeRouteLeave.
2. Global beforeEach.
3. Reused components' beforeRouteUpdate.
4. Newly entered records' beforeEnter.
5. Async route component resolution.
6. Entering components' beforeRouteEnter.
7. Global beforeResolve.
8. Confirmation, then afterEach.
9. DOM updates, then applicable beforeRouteEnter next-instance callbacks.

A cancellation, redirect, error or duplicate navigation changes which steps run.
In particular, an update guard does **not** precede beforeEach. Same-record
parameter changes can run global and component update guards even though there
is no new beforeEnter. Do not describe that as "only one hook runs".

## Choose one appropriate owner

For Nuxt navigation policy use its middleware with to/from. For component-local
unsaved changes or route-update behavior, use the supported update/leave hooks.
For existing query-managed resources make normalized route inputs reactive in
the query; do not add a second uncoordinated watcher/cache to compensate for a
missing mount hook.

Guard arrays do not change beforeEnter's entry-only semantics. Share a small
validation function where needed rather than executing the same expensive
request in several guards automatically. Keep failure/unknown-state handling
consistent with the existing auth flow.

## Acceptance

Cover direct entry, param-only and query-only updates, leaving/re-entering,
parent-child transitions, duplicate navigation, cancellation and redirects.
Assert observable navigation/data behavior rather than an invented universal
hook sequence that ignores record reuse.

## Primary sources

- [Vue Router guard semantics and full flow](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Nuxt middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware)
