# Reactive data and SSR contracts

Read this for fetching, query factories, route-driven data, hydration and
identity-sensitive cache changes. Follow the main skill's routing and AGENTS.

## One owner per resource

Keep the existing repository and `$api` seam. Use one server-state owner for a
resource: TanStack for query-managed features; Nuxt async data where the feature
already uses it. A Pinia workflow may hold a deliberate draft/snapshot, but must
not silently become a second canonical cache of the same resource.

Keep request/context resolution outside pure mappers and query-key helpers.
Type assertions do not validate an API response. Validate/narrow untrusted data
at the established boundary; use application contracts in the UI.

## Preserve reactive inputs

Passing `route.params.id` or `ref.value` once to a plain options factory creates
a snapshot, not a reactive subscription. Use a getter/ref and computed options.
All values affecting results belong in the key: filters, sort, pagination,
locale/currency and non-secret identity/tenant scope where relevant.
Do not put tokens, credentials or the entire mutable route object in a key.

Self-contained query example (Vue + TanStack installed; call from setup):

```ts
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { queryOptions, useQuery } from '@tanstack/vue-query'

export interface Product {
  readonly id: string
  readonly title: string
}

export interface ProductRepository {
  getById(id: string, signal?: AbortSignal): Promise<Product>
}

export function useProductQuery(
  repository: ProductRepository,
  id: MaybeRefOrGetter<string>,
) {
  return useQuery(computed(() => {
    const productId = toValue(id)
    return queryOptions({
      queryKey: ['product', productId] as const,
      enabled: productId.length > 0,
      queryFn: ({ signal }) => repository.getById(productId, signal),
    })
  }))
}
```

At the Nuxt boundary validate route input, then pass a getter/computed string.
The query callback closes over the same snapshot used by its key. Do not use a
new mutable source value for an old key's delayed callback. Propagate AbortSignal
through the repository. On auth changes cancel/remove identity-sensitive queries
and reset owned state using the existing session flow; account B must never see
account A's cached data or drafts.

## Nuxt-native data fetching

`$fetch`/`$api` is transport, not by itself an SSR hydration cache. A setup-level
request may run on both server and client if no SSR-aware owner coordinates it.
For a Nuxt-owned resource use an appropriate `useFetch`/`useAsyncData` wrapper
around the approved transport/repository instead of bypassing `$api`.

Keep async-data keys stable, reactive when inputs change, and scoped correctly.
Handlers return data, not mutations, redirects or toast side effects. Check the
resolved Nuxt version's return and option-consistency requirements: avoid an
undefined result accidentally causing duplicate hydration fetches; explicitly
model empty/not-found results. For a thin custom wrapper,
return the Nuxt composable result so the caller retains its async-data contract;
check the resolved version before adopting newer wrapper-factory APIs. Do not name an
unrelated custom composable `useFetch` or `useAsyncData` and shadow Nuxt APIs.

Read Nuxt's custom-fetch recipe before replacing a fetcher: a custom client does
not automatically inherit incoming SSR cookies/headers. Preserve the server API
plugin's allowlisted forwarding and trusted base URL; never forward credentials
to arbitrary external destinations.

## SSR query lifecycle

Create a QueryClient per Nuxt app/SSR request, not at module scope. Preserve the
existing `app/plugins/vue-query.ts` hydration and safe dehydration policy.
Creating a client alone does not wait for queries. When SSR requires a resource,
coordinate its prefetch/suspense completion through the established page/composable
pattern (for example onServerPrefetch with query suspense when appropriate).
Do not await suspense for a query that stays disabled (for example after a
failed dependency): it can block SSR completion. Guard enabled/dependency state
and provide an explicit empty/error result. Hydrate before consumers need cache
state, and choose staleTime deliberately.

Do not dehydrate mutations, credentials or server-only errors/data into a public
payload. Review CDN/Nitro/full-page caching separately: per-request Pinia/QueryClient
is not sufficient when personalized HTML or payloads are cached across users.
Do not enable shared caching for protected pages without a reviewed isolation policy.

## Mutations, errors and drafts

Copy editable data into an explicit draft; query results are not writable form
state. On optimistic updates cancel conflicting reads, snapshot narrowly, roll
back on failure and reconcile with the authoritative response/invalidation.
Do not retry non-idempotent mutations blindly. Treat cancellation separately from
user-facing failures. For manual async effects, abort stale work and also guard
against late results/errors from a producer that ignores cancellation.

Distinguish 401, 403, transport errors and unknown session state. Preserve the
existing session/CSRF recovery path. A recovery request must not loop through its
own unauthorized handler. Redirects must converge, and any return URL must be
validated against the application's allowed internal destinations.

## Primary sources

- [TanStack reactivity](https://tanstack.com/query/latest/docs/framework/vue/reactivity)
- [TanStack SSR](https://tanstack.com/query/latest/docs/framework/vue/guides/ssr)
- [Nuxt data fetching](https://nuxt.com/docs/4.x/getting-started/data-fetching)
- [Nuxt useAsyncData](https://nuxt.com/docs/4.x/api/composables/use-async-data)
- [Nuxt custom fetch](https://nuxt.com/docs/4.x/guide/recipes/custom-usefetch)
- [Vue SSR isolation](https://vuejs.org/guide/scaling-up/ssr.html#cross-request-state-pollution)
