---
title: Preserve Framework-Owned Routing and Navigation Contracts
impact: HIGH
impactDescription: Parallel router bootstraps and copied auth examples bypass Nuxt integration and project behavior
type: best-practice
tags: [vue3, vue-router, nuxt4, architecture]
---

# Framework-owned routing

A standalone Vue app can configure Vue Router directly. Nuxt already owns router
creation, generated page routes, middleware and rendering integration. Do not add
a second manual createRouter/createApp bootstrap in ecom.

Use app/pages, definePageMeta and app/middleware. Use Nuxt's useRoute auto-import
or #app implementation, not its vue-router namesake. In middleware use to/from;
helpers called there must not implicitly read useRoute either.

Page metadata fragment for an existing ecom admin page:

```vue
<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })
</script>
```

Compose the actual feature UI separately. For auth behavior inspect the existing
`frontend-public/app/middleware/admin.ts` and account/session contracts. Do not
invent `isAuthenticated` or collapse guest/authenticated/unresolved session states
just to fit a short example. Return/await Nuxt navigation helpers when redirecting.

Router 5 integrates file-based routing capabilities while retaining much of the
Router 4 core API. That is not a reason to enable a second route generator inside
Nuxt. Check version-specific types/releases and Nuxt compatibility before adopting
optional or experimental loader APIs.

Use the established Nuxt/TanStack data lifecycle for existing resources. Do not
add a competing route loader/cache merely because a Router example offers one.
Route-level lazy loading and SSR behavior should follow Nuxt page conventions.

Client navigation policy is not API authorization. Test direct URL entry, SSR,
hydration, same-route input changes and browser history, not only menu clicks.

## Primary sources

- [Router 5 migration](https://router.vuejs.org/guide/migration/v4-to-v5.html)
- [Nuxt pages](https://nuxt.com/docs/4.x/directory-structure/app/pages)
- [Nuxt middleware](https://nuxt.com/docs/4.x/directory-structure/app/middleware)
- [Nuxt useRoute](https://nuxt.com/docs/4.x/api/composables/use-route)
