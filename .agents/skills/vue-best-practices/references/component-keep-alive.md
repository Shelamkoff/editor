---
title: "KeepAlive Ownership, Eviction and Identity Changes"
impact: HIGH
impactDescription: "Changing a child key creates a different cached instance rather than evicting the previous one"
type: best-practice
tags: [vue3, nuxt4, keepalive, cache, lifecycle]
---

# KeepAlive is an instance cache

Use it when preserving a view's local state is part of the UX. It is not a
server-data cache or a universal performance improvement. Use Nuxt page/KeepAlive
configuration for Nuxt pages, not a second hand-built RouterView stack.

## Cache size, names and keys

Choose a bounded set of cached views or an appropriate `max`. Include/exclude
matches component names; `<script setup>` SFCs infer a name from the filename in
supported Vue versions. Set `defineOptions({ name: ... })` when an explicit name
is needed, not as boilerplate in every component.

Use a stable primitive key representing the actual view identity. Changing a
child key creates another cache entry; it is **not eviction** of the old entry.
Repeated generation counters or route.fullPath keys can retain many stale views.
A max bound limits retention through LRU eviction, not immediate identity cleanup.

To discard an entire cache intentionally, replace/unmount the enclosing KeepAlive
boundary through the owning application contract. Name-based include/exclude can
prune matching caches, but is not a public per-key delete API. Do not mutate Vue's
private cache internals. Distinguish all of this from invalidating server query data.

## Lifecycle and resources

Deactivation is not unmount. Watchers, timers and subscriptions need an explicit
pause/resume policy where background activity is unwanted. `onActivated` runs on
initial mount and reactivation; `onDeactivated` also runs on final unmount.
Cleanup must be idempotent; avoid starting the same timer in both mounted and
activated hooks. Unmount/disposal remains the final resource boundary.

Refreshing a view should use its established query owner and stale-data policy,
not a competing fetch cache. Do not automatically refetch everything twice on
mount plus activation.

## Sensitive views and Nuxt

Do not retain account A's drafts or DOM when switching to account B. Reset the
relevant instance cache and owned state as part of the existing identity flow;
clearing TanStack data alone does not remove component-local cached data.
Prefer not caching sensitive workflows unless their lifecycle is explicitly owned.

For Nuxt use `definePageMeta`/NuxtPage keepalive configuration supported by the
resolved Nuxt version. Limit key variation to the needed identity. A URL fragment
is not sent to SSR, so fullPath is not a safe universal server/client key.

## Acceptance

Exercise activation/deactivation, final disposal, repeated identities, max
eviction and auth changes. Verify both freshness and retained draft behavior.

## Primary sources

- [Vue KeepAlive](https://vuejs.org/guide/built-ins/keep-alive.html)
- [NuxtPage](https://nuxt.com/docs/4.x/api/components/nuxt-page)
- [Nuxt page metadata](https://nuxt.com/docs/4.x/api/utils/define-page-meta)
