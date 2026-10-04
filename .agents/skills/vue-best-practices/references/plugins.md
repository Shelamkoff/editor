---
title: "Vue Plugins Inside an Owned Nuxt Application"
impact: HIGH
impactDescription: "A standalone install contract must not create a second Nuxt bootstrap or unapproved transport"
type: best-practice
tags: [vue3, nuxt4, plugins, injection, typescript]
---

# Distinguish Vue plugins from Nuxt plugins

A Vue plugin implements app.use via an install function/object. A Nuxt app plugin
uses defineNuxtPlugin and participates in the existing app/request lifecycle.
They are related integration points, not interchangeable file formats.

In ecom register an approved Vue plugin through an appropriate Nuxt app plugin
using nuxtApp.vueApp.use. Do not create another createApp, router, Pinia instance,
HTTP client or server-state cache. Keep real ordering dependencies explicit.

## A narrow typed Vue install contract

This complete standalone module illustrates a pure formatter capability, not a
replacement for ecom's existing formatting utilities. Add such a plugin only if
app-level injection is an actual variation point; a plain import is often simpler.

```ts
import { inject } from 'vue'
import type { InjectionKey, Plugin } from 'vue'

export interface LabelFormatter {
  format(value: string): string
}

export const labelFormatterKey: InjectionKey<LabelFormatter> = Symbol('labelFormatter')

export const labelFormatterPlugin: Plugin<[LabelFormatter]> = {
  install(app, formatter) {
    app.provide(labelFormatterKey, formatter)
  },
}

export function useLabelFormatter(): LabelFormatter {
  const formatter = inject(labelFormatterKey)
  if (!formatter) throw new Error('Label formatter was not provided')
  return formatter
}
```

Export keys from one module so providers and consumers share the same Symbol.
Capture injected dependencies in a valid setup/app context rather than calling
inject from arbitrary later promises. Keep required/optional dependency behavior
explicit; do not hide missing wiring behind a silently manufactured singleton.

## Lifetime and security

Types, pure keys and plugin definitions may be module-scoped. Mutable user state
and request-bound services must belong to the current app/request. Infrastructure
handles are not hydrated state. Never expose server-only keys or credentials
through a client plugin for convenience.

Global registration is not necessary for every component/helper. Prefer feature
ownership unless the capability is genuinely app-wide. Follow Nuxt lifecycle for
cleanup/reinitialization and test duplicate installation/HMR where relevant.

## Acceptance

Test provided and missing capabilities, request isolation, client-only dependencies
and plugin ordering. Use the existing `$api` boundary rather than copying an
Axios example from a different stack.

## Primary sources

- [Vue plugins](https://vuejs.org/guide/reusability/plugins.html)
- [Typed injection](https://vuejs.org/guide/typescript/composition-api.html#typing-provide-inject)
- [Nuxt plugins](https://nuxt.com/docs/4.x/directory-structure/app/plugins)
