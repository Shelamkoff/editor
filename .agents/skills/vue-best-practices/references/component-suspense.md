---
title: "Suspense Loading, Error and Nuxt Boundaries"
impact: HIGH
impactDescription: "Suspense does not catch errors or automatically track arbitrary later requests"
type: best-practice
tags: [vue3, nuxt4, suspense, async, errors]
---

# Suspense coordinates render dependencies

Vue documents Suspense as experimental. Nuxt uses it as part of NuxtPage; that is
not an instruction to add another application-wide Suspense/RouterView hierarchy.
Use the existing Nuxt loading and error contracts first.

## What is tracked

Async setup (including top-level await in script setup) and suspensible async
components participate in a boundary. A later arbitrary Promise or a query refetch
is not automatically a new Suspense dependency. Lazy route component imports are
a separate Router mechanism; async content within the page can still participate.

Default and fallback slots each need a single immediate root. Once resolved, a
boundary re-enters pending on replacement of the default slot's root, not every
nested data change. Do not force remounts with ever-changing keys just to display
a loader; use the query/loading state when that is the real owner.

## Fallback timing is not a network timeout

On a pending replacement, `timeout` controls how long previous content can stay
before fallback. It does not cancel the request or turn rejected dependencies
into an error screen. Initial pending rendering and later replacement have
different behavior. A fallback delay is a UX choice, not a universal number.

Suspense itself does not provide an error slot. Handle errors in the appropriate
parent error boundary/onErrorCaptured or Nuxt error contract. Do not swallow a
failure merely to make a boundary resolve, or display an endless loading state.

## Nested boundaries

A nested boundary may intentionally manage its own fallback. With `suspensible`
on the inner boundary (supported since Vue 3.3), the parent can coordinate it as
an async dependency. Neither independent nor coordinated nesting is universally
wrong. Choose the required loading ownership and test replacements.

Under a controlling Suspense boundary, an async component's own loading/error,
delay and timeout options do not independently drive the fallback. Check the
`suspensible: false` opt-out only when independent handling is intentional.

## SSR and Nuxt

Use NuxtPage rather than copying the standalone RouterView/Transition/KeepAlive/
Suspense example into ecom. Await required query work with the established SSR
pattern; do not await a query that remains disabled. Read
[data and SSR contracts](../../vue3-app/references/data-and-ssr.md).

## Acceptance

Test initial pending, resolved replacement, nested loading, rejection and retry.
Verify SSR completion, hydration and navigation cancellation, not just the
presence of a fallback slot in the template.

## Primary sources

- [Vue Suspense](https://vuejs.org/guide/built-ins/suspense.html)
- [NuxtPage](https://nuxt.com/docs/4.x/api/components/nuxt-page)
