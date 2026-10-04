---
title: "Async Components and Deliberate Hydration Strategy"
impact: HIGH
impactDescription: "Code splitting, hydration scheduling and fallback ownership are separate decisions"
type: best-practice
tags: [vue3, nuxt4, async-components, hydration]
---

# Async components without accidental loading policy

Use code splitting for a meaningful loading boundary. A synchronous component
or ordinary defineAsyncComponent loader is not wrong merely because lazy hydration
is available. Critical navigation, forms and immediately interactive controls
may need hydration promptly.

## Separate three decisions

- A dynamic import determines a code-loading boundary.
- Hydration strategies determine when server-rendered markup becomes interactive.
- Suspense or component loading/error options determine fallback ownership.

Vue 3.5 offers hydration strategies such as visibility, idle and interaction.
Choose a strategy for a measured non-critical subtree; it does not eliminate its
SSR cost or guarantee that its chunk was never downloaded earlier. Import only
helpers actually used. Check Nuxt's corresponding supported lazy-component APIs
before adding manual integration.

## Loading, failure and retry

`delay` controls the loading component's appearance, while `timeout` can switch
to an error component when configured. These options do not cancel a JavaScript
module import. A controlling Suspense boundary owns fallback behavior unless the
async component deliberately opts out with `suspensible: false`.

Do not prescribe 100/200/500 ms delays from an invented performance table. Match
existing UX and network/error behavior. Bound any retry policy, handle cancellation
and avoid retry loops for permanently unavailable chunks. Keep loading/error UI
lightweight and accessible without moving keyboard focus unexpectedly.

## Nuxt and SSR

Preserve Nuxt page loading rather than using defineAsyncComponent as a route-table
replacement. Client-only content and lazily hydrated SSR content are different
contracts. Keep initial markup stable and provide a usable non-interactive state
until hydration. User interaction must not be silently lost; test the chosen
strategy with the installed version and actual controls.

For optional browser libraries, use the established client boundary. Do not add
an unapproved dependency or a global plugin solely to imitate an example.

## Acceptance

Check first load, chunk failure, retry, interaction before hydration, disposal
before resolution and server/client parity. A parser check does not test these
runtime behaviors.

## Primary sources

- [Vue async components](https://vuejs.org/guide/components/async.html)
- [Nuxt components and lazy hydration](https://nuxt.com/docs/4.x/directory-structure/app/components)
- [Suspense](https://vuejs.org/guide/built-ins/suspense.html)
