---
name: vue-pinia-best-practices
description: >-
  Use for Pinia stores, consumers, actions, reactivity, SSR and state ownership.
  Applies Nuxt integration and ecom contracts without treating generic examples
  as a second application bootstrap.
license: MIT
compatibility: "Vue/Nuxt; verify the project's resolved Pinia and @pinia/nuxt versions"
metadata:
  author: "github.com/vuejs-ai"
  maintainer: "ecom project"
  version: "1.1.2-ecom.1"
  upstream-version: "1.0.0"
  source: "https://github.com/vuejs-ai/skills"
---

# Pinia Best Practices

This is a locally maintained adaptation, not an upstream Pinia release.
For Vue work read [vue-best-practices](../vue-best-practices/SKILL.md); for ecom
integration read [vue3-app](../vue3-app/SKILL.md). Follow AGENTS precedence.

## State ownership before store syntax

Use local state for local interaction, URL state for shareable navigation,
Nuxt useState for suitable small app/request-shared values, and Pinia for shared
application state/actions. Keep query-managed remote resources in their query
cache. Do not mirror them to Pinia without an explicit draft/workflow contract.

Both Pinia store syntaxes are valid. Prefer setup stores for new ecom stores;
do not mechanically rewrite established option stores or equate them with Vue
component Options API. Neither syntax automatically makes state persistent.

## Nuxt integration and context

Use the existing @pinia/nuxt module and configured storesDirs. Do not create a
second Pinia instance. Export store definitions, not instantiated request stores.
Resolve stores in a valid app/request context. Outside injection-aware code,
pass the correct Pinia instance explicitly; do not use a process-global active
instance as SSR request identity. Capture dependencies before arbitrary awaits.
Nuxt's usePinia helper is available through @pinia/nuxt.

## Setup-store contract

Return all **store-owned** reactive state so Pinia can hydrate/inspect it. Do not
wrap owned state with readonly inside the store's return value. Ordinary
composables may expose readonly views, but that pattern cannot be copied blindly
into setup stores. Computed getters are naturally readonly and are not this error.

Do not return injected router/route/app infrastructure as owned state. Promises,
AbortControllers and subscription handles are implementation resources, not
serializable store state. Keep them scoped and cleaned up without exposing secrets.
An underscore prefix is not a security boundary. Do not put bearer credentials,
session-cookie values or server-only secrets in hydrated/persisted store state.
Preserve intentional browser-side anti-CSRF handling in the existing API boundary.

## Consumers and actions

Use storeToRefs when destructuring reactive state/getters; direct store.property
access is also valid. Destructure actions directly: Pinia binds them to the store.
Both a bare zero-argument Pinia action handler and an explicit action call can
work. Parentheses control arguments: a bare DOM handler receives the event, so
use an explicit call when the action expects a business value or optional parameter.

Setup stores implement their own reset action when reset behavior is required;
do not assume an automatically generated option-store $reset. Reset private
user/workflow state on identity changes according to the existing auth flow.

## Read the matching references

- Initialization/context: [active Pinia](reference/pinia-no-active-pinia-error.md).
- Owned state and hydration: [setup stores](reference/pinia-setup-store-return-all-state.md).
- Reactive consumers: [storeToRefs](reference/pinia-store-destructuring-breaks-reactivity.md).
- Handler arguments/binding: [store methods](reference/store-method-binding-parentheses.md).
- Filters/history: [URL state](reference/state-url-for-ephemeral-filters.md), together
  with [vue-router-best-practices](../vue-router-best-practices/SKILL.md).
- Store selection: [shared state](reference/state-use-pinia-for-large-apps.md).

Standalone bootstrap examples in references are not Nuxt setup instructions.
Read the manifest and lockfile before version-sensitive APIs. Metadata versions
are local skill revisions; they do not certify a library major or runtime suite.

## Verify

Test actions and observable transitions, reset/error behavior, consumers,
request isolation and SSR hydration where relevant. In unit tests create a fresh
Pinia per test. A testing helper that stubs actions cannot prove real action logic.
Never serialize test/production credentials for convenience.

## Primary sources

- [Store definitions and bound actions](https://pinia.vuejs.org/core-concepts/)
- [Store state/reset](https://pinia.vuejs.org/core-concepts/state.html)
- [Nuxt integration](https://pinia.vuejs.org/ssr/nuxt.html)
- [Outside components](https://pinia.vuejs.org/core-concepts/outside-component-usage.html)
- [Testing](https://pinia.vuejs.org/cookbook/testing.html)
