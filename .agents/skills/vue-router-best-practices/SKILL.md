---
name: vue-router-best-practices
description: >-
  Use for navigation guards, route params, route reuse and URL-driven state.
  Distinguishes Nuxt pages/middleware/useRoute from standalone Vue Router APIs.
  Check installed versions before adopting version-specific routing features.
license: MIT
compatibility: "Vue Router with Vue; Nuxt 4 integration in ecom"
metadata:
  author: "github.com/vuejs-ai"
  maintainer: "ecom project"
  version: "2.0.2-ecom.1"
  upstream-version: "1.0.0"
  source: "https://github.com/vuejs-ai/skills"
---

# Vue Router Best Practices

This is an ecom-local revision of the upstream instruction set.
Always pair Vue work with [vue-best-practices](../vue-best-practices/SKILL.md).
Use [vue3-app](../vue3-app/SKILL.md) for project boundaries, fetching and SSR.
Follow AGENTS and established contracts; do not create a competing router.

## Nuxt first

- Nuxt owns normal file-based routes in app/pages and page metadata.
- Use app/middleware with defineNuxtRouteMiddleware for navigation policy.
- Use Nuxt's auto-imported useRoute or import it from #app. Importing useRoute
  directly from vue-router bypasses Nuxt's route synchronization.
- In middleware use to/from, never useRoute, including indirectly via a helper.
- Return/await navigateTo or abortNavigation results where applicable.
- Middleware may execute for SSR and again on client hydration. Avoid duplicate
  side effects; distinguish a skipped redundant effect from a skipped security check.
- Do not force remounts with fullPath by default. Fragments are client-only and
  may create hydration differences; use the specific identity/reset key needed.

Vue Router hooks/types may be imported when needed. A standalone Vue Router
example is not an instruction to replace Nuxt's route composable or bootstrap.

## Guard semantics

An async guard is awaited. Falling through without an explicit return is a valid
allow result, not an async bug. Return a redirect/cancellation when that branch
requires it. Detached promises are different: await or return them.
Return false to cancel in raw Router guards; throw unexpected errors so the
framework's navigation error handling observes them. Prevent redirect loops.

The optional next argument is supported by the documented guard API; prefer
return-based code. Support is not the same as a promise about deprecation in
every release. Consult the resolved Router version's notes/types before making
such a claim. Nuxt route middleware does not use the next callback model.

Treat authentication as confirmed authenticated, confirmed guest, or unresolved
according to the existing session contract. Network failure is not proof of
login/logout. Preserve the application's recovery/offline UX; do not synthesize
authorized data or blanket-allow protected operations. Backend authorization is
always independent of frontend navigation.

## Route-driven state

Observe specific normalized params/query values. Component reuse can avoid a
new mount; update hooks and watchers still have their own documented lifecycle.
Do not claim that all lifecycle hooks stop running whenever a param changes.
Use reactive query options for existing query-managed data rather than building
a second fetch/cache watcher. Discard stale async results and errors.

Use URL state only for public/shareable navigation. Normalize null, repeated
values, booleans and numbers explicitly. Preserve unrelated query/hash fields;
choose replace for draft typing and push for intentional history entries.
Do not introduce two-way URL/store watcher loops as the default architecture.
Validate return destinations before redirecting; reject unapproved external paths.

## Reference routing

Read the reference matching the concern; raw Router code is standalone unless
explicitly labelled Nuxt:

- [Production routing](reference/router-use-vue-router-for-production.md)
- [Async guards](reference/router-guard-async-await-pattern.md)
- [Redirect loops](reference/router-navigation-guard-infinite-loop.md)
- [Optional next](reference/router-navigation-guard-next-optional.md)
- [Route reuse](reference/router-param-change-no-lifecycle.md)
- [beforeEnter behavior](reference/router-beforeenter-no-param-trigger.md)
- [Legacy beforeRouteEnter](reference/router-beforerouteenter-no-this.md)
- [Resource cleanup](reference/router-simple-routing-cleanup.md)
- [Typed URL state](../vue-pinia-best-practices/reference/state-url-for-ephemeral-filters.md)

## Version gate and verification

Read package.json and pnpm-lock.yaml; a skill revision is not a router release.
Router 5's migration guide describes the v4 core transition and integrated
file-based routing. Do not install its separate build plugin/data loaders inside
Nuxt merely because they exist; Nuxt and ecom already own those concerns.
Test direct SSR entry, hydration, same-page param changes, Back/Forward,
cancellation, thrown errors, repeated query values and convergent redirects.

## Primary sources

- [Nuxt useRoute](https://nuxt.com/docs/4.x/api/composables/use-route)
- [Nuxt middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware)
- [Guard results and optional next](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Dynamic matching](https://router.vuejs.org/guide/essentials/dynamic-matching.html)
- [Router 5 migration](https://router.vuejs.org/guide/migration/v4-to-v5.html)
