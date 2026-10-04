---
title: Prefer Return-Based Navigation Guards over the Optional next() Argument
impact: HIGH
impactDescription: Return-based guards avoid unresolved navigation, duplicate next calls, and hard-to-audit async control flow
type: gotcha
tags: [vue3, vue-router5, navigation-guards, migration, async]
---

# Prefer Return-Based Navigation Guards

The optional third `next()` argument is still supported in current Vue Router
(v4/v5). It is **not removed**, but the official documentation calls it a common
source of mistakes and recommends the return-based guard model.

Do not describe `next()` as already removed. For new code, simply avoid it.

## Preferred Pattern

    router.beforeEach(async (to) => {
      const user = await fetchUser()

      if (!user) {
        return {
          name: 'Login',
          query: { redirect: to.fullPath },
        }
      }

      return true
    })

A guard may:

- return nothing/undefined/true to continue;
- return false to cancel;
- return a route location to redirect;
- throw an Error to cancel and invoke router error handling.

## Why Avoid next()

Legacy code can easily:

- forget to call `next()`;
- call it more than once on overlapping paths;
- redirect and then fall through to another `next()`;
- combine callbacks and promises into confusing control flow.

Bad:

    router.beforeEach((to, from, next) => {
      if (!isAuthenticated) {
        next('/login')
      }

      next()
    })

Prefer:

    router.beforeEach((to) => {
      if (!isAuthenticated) {
        return '/login'
      }
    })

## If Maintaining Legacy next() Code

If a legacy guard still accepts `next`, every logical path must call it exactly
once. Exit immediately after redirects.

    router.beforeEach((to, from, next) => {
      if (!isAuthenticated) {
        next('/login')
        return
      }

      next()
    })

Refactor to return-based guards when the surrounding code is already being
changed and tests cover navigation behavior.

## Nuxt

In Nuxt route middleware use Nuxt's return model:

    export default defineNuxtRouteMiddleware((to) => {
      if (!canEnter(to)) {
        return navigateTo('/login')
      }
    })

Do not introduce `next()`-style guards into Nuxt middleware.

## Official Reference

- https://router.vuejs.org/guide/advanced/navigation-guards
