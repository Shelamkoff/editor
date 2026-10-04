---
title: Await Guard Decisions and Preserve Explicit Failure Semantics
impact: HIGH
impactDescription: Fire-and-forget guard checks and manufactured auth decisions produce incorrect navigation
type: gotcha
tags: [vue3, vue-router, nuxt4, guards, promises]
---

# Async guards

A return-based async guard may fall through without an explicit success return.
Implicit undefined is valid and continues navigation after awaited work finishes.
Do not label that pattern as a missing-return bug.

Complete standalone Vue Router example. The application must define a `login`
route. The injected check resolves true/false only for a confirmed session and
rejects when it cannot decide; the app's router error handler owns that failure.
The function returns the guard-removal callback for lifecycle ownership.

```ts
import type { Router } from 'vue-router'

export function installAuthGuard(
  router: Router,
  checkSession: () => Promise<boolean>,
): () => void {
  return router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth || to.name === 'login') return
    const authenticated = await checkSession()
    if (!authenticated) return { name: 'login' }
  })
}
```

Calling checkSession without returning/awaiting its promise is different: the
guard can complete before the decision. Returning navigateTo/redirect results
matters too. Unexpected thrown errors are handled by router navigation error
handling; they do not inherently leave a guard unresolved forever.

## Nuxt/ecom integration

Do not install this standalone example as a competing global auth flow. Use the
existing Nuxt middleware and session recovery contract. Middleware uses to/from,
not useRoute, including inside helpers. Return/await navigateTo or abortNavigation
when those determine the result. Use Nuxt loading APIs or request-scoped state,
not module-global isNavigating refs shared between SSR requests.

A timeout/network failure is neither authenticated nor confirmed logout. Preserve
the existing policy for unresolved sessions, degraded shells and retryable errors.
Never manufacture protected data or suppress backend authorization. Do not apply
a generic allow-on-timeout rule to all protected navigation.

## Cancellation and timeouts

A Promise.race timeout does not cancel the underlying request. Prefer the approved
transport's cancellation/timeout support. Clean up timeout handles and reject or
ignore late work; parallel checks are appropriate only when actually independent.

Prevent recovery/redirect loops, including the destination route. Validate any
post-login return URL against the project's internal-destination policy.

## Verify

Test confirmed auth, confirmed guest, rejected/timed-out checks, implicit success,
redirect convergence, same-route changes and disposal. Client guards control
navigation only; each protected API still enforces authorization.

## Primary sources

- [Navigation guards](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Navigation failures](https://router.vuejs.org/guide/advanced/navigation-failures.html)
- [Nuxt middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware)
