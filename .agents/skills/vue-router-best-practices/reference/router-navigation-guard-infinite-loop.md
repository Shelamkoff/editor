---
title: "Convergent Redirects Instead of URL-controlled Counters"
impact: HIGH
impactDescription: "A counter in the query string neither proves convergence nor safely terminates a redirect cycle"
type: best-practice
tags: [vue-router, nuxt4, redirects, auth, state]
---

# Make redirect decisions converge

A guard redirect starts another navigation. The destination must reach a stable
allow/error/cancel result under the same policy. Excluding a self-redirect is
necessary in simple cases, but does not prevent a cycle across two or more routes.

Do not use a query-string _redirectCount as the safety mechanism. Query values
are untrusted strings/arrays, string addition can concatenate, and redirecting
to an error route with the same counter/policy can continue the cycle. Fix the
state transition and terminal route, not just a numeric threshold.

## Review the whole policy

Use the established session state: confirmed guest, confirmed authenticated or
unresolved. A transport failure is neither proof of a guest nor proof of access.
Preserve ecom's recovery/offline behavior; do not translate all failures into a
login redirect. Keep login/recovery/error endpoints from re-entering their own
unauthorized handling indefinitely.

For each redirect, identify the condition that differs at the target. Public
terminal error/recovery screens must be reachable under the intended policy.
Test guest-only redirects together with protected-route redirects, onboarding
requirements and role restrictions. Do not copy a generic public-route name list
that does not match Nuxt's real route contract.

## Navigation and return URLs

Return/await navigation results. Use Nuxt navigateTo/abortNavigation semantics
in Nuxt middleware and raw Router return results only in Router guards.
Validate a supplied return destination against allowed internal routes before
using it; a startsWith('/') check alone does not exclude protocol-relative URLs.
Do not copy secrets or unfiltered query parameters into redirect logs/analytics.

If unexpected state needs to terminate navigation, use the application's error
or cancellation contract without recursively navigating to the same failed
condition. A dev-mode Router warning is not the application's recovery strategy.

## Acceptance

Exercise direct SSR entry, hydration, guest/auth/unresolved states, expired sessions,
Back/Forward, login as the current target, multi-route cycles and invalid return
URLs. Include concurrent session recovery and failed navigation. Assert a bounded
observable outcome, not merely that a counter increased.

## Primary sources

- [Vue Router redirects from guards](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Nuxt middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware)
- [Nuxt navigateTo](https://nuxt.com/docs/4.x/api/utils/navigate-to)
