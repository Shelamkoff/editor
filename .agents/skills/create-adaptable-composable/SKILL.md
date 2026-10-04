---
name: create-adaptable-composable
description: >-
  Design reusable Vue composables accepting values, refs or getters without
  losing reactivity. Use for adaptable inputs, explicit mutation ownership,
  resource cleanup and SSR-safe Nuxt integration.
license: MIT
compatibility: "Vue 3.5; Nuxt 4 integration where applicable"
metadata:
  author: "github.com/vuejs-ai"
  maintainer: "ecom project"
  version: "17.0.2-ecom.1"
  upstream-version: "17.0.0"
  source: "https://github.com/vuejs-ai/skills"
---

# Adaptable Composables

Apply [vue-best-practices](../vue-best-practices/SKILL.md), including its
[composable reference](../vue-best-practices/references/composables.md).
For ecom apply [vue3-app](../vue3-app/SKILL.md). Load each skill once.
This is a local revision, not an upstream package release.

## Define ownership first

Describe the concern, required inputs, lifetime, side effects and return contract.
Use a plain function for stateless transformations. Use a composable when Vue
reactivity/lifecycle/context is actually needed. Do not create a wrapper solely
to rename an existing API or force every parameter to be reactive.

Import MaybeRef and MaybeRefOrGetter from Vue; do not redefine them with an
explicit-any default. MaybeRefOrGetter is useful for read-only value/ref/getter
inputs. MaybeRef is useful for value/ref inputs, but neither normalization nor
that type is proof that a caller permits mutation of the supplied value.

## Preserve tracking and do not invoke callbacks accidentally

Read toValue inside computed/watch/watchEffect when ongoing tracking is needed.
Calling toValue once outside an effect intentionally produces a snapshot.
A destructured Vue 3.5 prop remains reactive in its script block, but passing its
current primitive to an ordinary function does not transfer that subscription:
pass a getter or ref instead.

Both toValue and the normalization form of toRef interpret a bare function as a
getter. If an input is a callback/predicate value, pass it as an explicit callback
or unwrap a value/ref with unref; do not call toValue/toRef on it merely because
its TypeScript annotation says MaybeRef. Use toRef for a tracked property/getter
or existing ref when those are the desired semantics.

Complete read-only example:

```ts
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useNormalizedSearch(input: MaybeRefOrGetter<string>) {
  const search = computed(() => toValue(input).trim())
  const hasSearch = computed(() => search.value.length > 0)
  return { search, hasSearch }
}
```

## Writes are a separate contract

A plain value normalized into a ref is not connected back to the caller's variable.
A readonly computed/prop must not be assigned through toRef. Accept an explicitly
owned writable model or an update callback; do not infer permission from structural
Ref typing alone. For components use a real v-model contract when appropriate.

Ordinary composables may expose readonly views with explicit actions. In Pinia,
return owned mutable state for hydration instead: apply
[vue-pinia-best-practices](../vue-pinia-best-practices/SKILL.md). Do not hide owned
state behind readonly or accidentally serialize injected infrastructure/secrets.

## Lifecycle and asynchronous work

Create context-dependent composables synchronously in setup, or in a documented
Nuxt context. Capture dependencies before arbitrary async callbacks/awaits.
Register cleanup for listeners, observers, timers, subscriptions and requests.
When the target changes, clean up the exact previous target, not whichever target
is current at unmount. Handle rejection and stale completion as well as abort.

Read browser globals only on the client at a suitable lifecycle boundary. Even
passing window as an argument during SSR evaluates it immediately: prefer a
getter evaluated after mount. For Nuxt document title/meta use Nuxt head APIs,
not a document.title watcher competing with SSR/head management.
Do not introduce a process-wide mutable composable singleton into SSR.

## Verify

Test value/ref/getter updates, callback non-invocation, disposal/target replacement,
readonly/write boundaries and relevant SSR behavior. For server data preserve the
existing query owner instead of introducing a second ad-hoc request cache.

## Primary sources

- [Vue utility types](https://vuejs.org/api/utility-types.html)
- [toValue/toRef/unref](https://vuejs.org/api/reactivity-utilities.html)
- [Composable lifecycle](https://vuejs.org/guide/reusability/composables.html)
- [Nuxt head management](https://nuxt.com/docs/4.x/api/composables/use-head)
