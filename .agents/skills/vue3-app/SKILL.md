---
name: vue3-app
description: >-
  Architecture and integration guide for the ecom Nuxt frontend. Use for feature
  modules, pages, middleware, plugins, repositories, server-state queries,
  Pinia, SSR and hydration. Always apply vue-best-practices to Vue tasks too.
compatibility: "ecom frontend-public; Nuxt 4; Vue 3.5; TypeScript strict"
metadata:
  author: "Project"
  version: "2.0.2"
  revision: "ecom-local"
---

# Ecom Vue/Nuxt Application Architecture

## Start with contracts, not scaffolding

Read [AGENTS.md](../../../AGENTS.md), the closest relevant feature and its tests.
Preserve the precedence defined there. This skill owns application boundaries;
the specialized skills own Vue, Pinia and routing mechanics. A reference example
is not permission to override a project contract or ignore a demonstrated bug.

For a substantial change, identify the public contract, state owner, dependency
direction, failure behavior and verification before coding. Introduce a factory,
interface, mapper, barrel or composable only for a real responsibility or seam.
Do not create a fixed number of files/components to satisfy a pattern.

## Required skill routing

Load each applicable skill once; reciprocal links do not require recursive reads.
For every Vue task, **MUST** apply
[vue-best-practices](../vue-best-practices/SKILL.md) and its four core references.

| Task | Additional required skill |
| --- | --- |
| Pinia stores and their consumers | [vue-pinia-best-practices](../vue-pinia-best-practices/SKILL.md) |
| Routes, middleware, params, URL state | [vue-router-best-practices](../vue-router-best-practices/SKILL.md) |
| Reusable value/ref/getter inputs | [create-adaptable-composable](../create-adaptable-composable/SKILL.md) |
| JS/TS modernization or refactoring | [modern-javascript-patterns](../modern-javascript-patterns/SKILL.md) |
| New visual interfaces | [frontend-design](../frontend-design/SKILL.md) |
| UX, accessibility, interaction, visual refinement | [impeccable](../impeccable/SKILL.md) |
| Focused visual acceptance | [ui-quality-check](../ui-quality-check/SKILL.md) |

Use the complete relevant set, not unrelated skills mechanically. Reinspect
`.agents/skills` when the task changes; this table is not a whitelist preventing
use of another relevant installed skill. Generic JS advice to destructure objects
does not override Vue/Pinia reactivity rules.

## Version and source evidence

Read [package.json](../../../frontend-public/package.json),
[pnpm-lock.yaml](../../../frontend-public/pnpm-lock.yaml) and
[nuxt.config.ts](../../../frontend-public/nuxt.config.ts). The manifest declares
ranges/pins; the lockfile records resolutions. Neither proves that dependencies
were installed or that runtime tests passed in the current environment.

The manifest and root lockfile importer checked on 2026-09-27 record Nuxt 4.5.0,
Vue 3.5.40, Vue Router 5.2.0, Pinia 4.0.2, @pinia/nuxt 1.0.1,
TanStack Vue Query 5.101.4 and TypeScript 5.9.3. Recheck before version-sensitive
changes. These are project resolutions, not a claim about latest public releases.

Use the official documentation for behavior. Check release notes/types/source
for the resolved version when an API is version-sensitive. The public Pinia guide
retrieved in this review labels itself v3.x: its stable store/SSR guidance is not
proof that every Pinia 4-specific behavior has been verified. Do not relabel old
examples as a newer major without checking them.

Skill metadata versions describe local instruction revisions, not npm releases.
Preserve upstream attribution and identify local modifications. New runtime
libraries or dependency upgrades need explicit scope/approval; do not install
Axios, Bootstrap, an editor, date library or i18n library from a generic example.

## Module boundaries

Nuxt owns bootstrapping, SSR and normal route generation. Preserve this layout:

```text
frontend-public/
  app/
    pages/             # Route-level composition
    layouts/           # Application shells
    middleware/        # Navigation policy
    plugins/           # App/request-scoped infrastructure
    modules/<feature>/ # Feature-owned application code
    components/        # Shared presentation
    composables/       # Shared Vue behavior
    assets/styles/     # Established global styling
    types/
    utils/
  server/              # Nitro/server-only integration
  tests/
  nuxt.config.ts
```

Feature `app/modules/` is not Nuxt's framework-extension `modules/` directory.
Within a feature, use only the needed `contracts`, `mappers`, `repositories`,
`queries`, `stores`, `composables`, `components` and `utils` directories.

Contracts describe inputs/results. Mappers translate differing boundary shapes
without side effects. Repositories own feature transport. Query definitions own
remote cache keys/options. Composables orchestrate Vue behavior. Components own
presentation. Pinia owns shared application state when warranted.

Do not collapse these responsibilities into a giant `index.ts`, but do not add
an identity mapper or duplicate DTO merely because a directory exists. A payload
already suitable for application use can share a contract intentionally.
Keep imports acyclic and use stable feature seams. Do not make Nitro or another
feature depend on page/component internals. Preserve established backend API
ownership rather than duplicating authorization/business rules in the frontend.

Use existing `~/` app imports and configured aliases. Request-sensitive state,
Nuxt app instances, stores, HTTP clients and QueryClients must not be captured
by mutable process-wide module singletons. Pure functions/types/constants and
factory definitions may be module-scoped.

## Pages, routing and infrastructure

Use `app/pages`, `definePageMeta` and `app/middleware`. Do not add a parallel
`createRouter` bootstrap or a second `createPinia` beside @pinia/nuxt.
Nuxt app plugins belong in `app/plugins`; use client/server suffixes where needed.
Keep plugins small and declare real ordering dependencies.

Use Nuxt's auto-imported `useRoute` or `useRoute` from `#app`, not the direct
vue-router composable. In route middleware use `to`/`from`, including in helpers:
there is no current route to read with `useRoute` there. Return/await navigation
results. SSR middleware can run again during hydration.

A reused route does not necessarily remount. Track the specific params/query
inputs through reactive query options or a suitable watcher. Do not key the
whole page by `fullPath` as a default workaround; fragments differ in SSR.

## Transport and server state

Use the existing `$api` through feature repositories. Do not bypass its cookie,
auth recovery, CSRF, server/client and error behavior with a new HTTP client.
Resolve Nuxt dependencies in a valid context, then pass explicit dependencies to
plain factories. Avoid `as unknown as Client` as a standard recipe: use a typed
adapter/compatible contract at the integration seam, not assertions that pretend
to validate payloads. Do not call injection-dependent composables from arbitrary
late callbacks or after an untransformed async boundary.

Use TanStack Vue Query for existing query-managed resources. Keep query keys
reactive and complete, forward AbortSignal, model errors, and invalidate the
smallest correct scope after a mutation. Never mutate query-cache objects as form
drafts or duplicate the same resource into another store/cache without ownership.

For query, fetch, SSR, hydration or auth-cache work, **read**
[data and SSR contracts](references/data-and-ssr.md). It includes a self-contained
reactive query example and the distinctions between Nuxt and TanStack fetching.

## State and component rules

Choose by ownership, not by a mandatory promotion ladder:

- Local interaction: local ref/reactive or an instance-local composable.
- Shareable navigation: normalized URL state; draft typing may remain local.
- Small app/request-shared serializable state: Nuxt useState when appropriate.
- Shared application actions/invariants: existing Pinia stores.
- Remote resource/cache lifecycle: the established server-state query owner.

Use Composition API and `<script setup lang="ts">` for components. Keep strict
TypeScript; narrow unknown boundary values instead of introducing explicit any.
`ref` is a normal default. `shallowRef` expresses replacement-only/opaque state;
primitive shallow refs are valid and need not be churned for cosmetic consistency.
Both a props object and Vue 3.5 reactive props destructure are supported.
Pass a getter/ref when consumers must continue tracking a prop.

Return store-owned state from Pinia setup stores without wrapping that state in
readonly. Do not return injected router/app infrastructure as owned store state.
Readonly facades in ordinary composables are a different contract; apply the
Pinia reference before composing them into a setup store.

## SSR, security and UI

Keep initial server/client markup consistent. Delay DOM access until a client
lifecycle boundary, and clean up observers, listeners, timers and requests.
An `import.meta.client` branch alone does not fix mismatching initial markup.
Use Nuxt head APIs for titles/meta; do not imperatively race Nuxt with document.title.
Never hide hydration warnings instead of correcting their cause.

Backend authorization remains mandatory; route visibility is only navigation UX.
A timeout or unknown session is not confirmed authentication or confirmed logout.
Preserve the existing recovery/offline policy and never manufacture protected data.
Do not expose bearer credentials, session-cookie values or server-only secrets in
hydrated/persisted state. Browser-visible anti-CSRF tokens required by the existing
protocol are different: preserve their intended in-memory/header usage, but never
put them in URLs, logs, analytics or generic persistent storage.

Do not compile untrusted Vue templates or render unsanitized HTML. Reuse existing
theme tokens and styling contracts, including theme-package boundaries. Component
styles normally stay scoped; a component without custom CSS needs no empty style
block. Preserve useful responsive conventions, keyboard focus and reduced motion.
Let the design skills govern visual decisions rather than imposing another system.

## Verification and completion

Run focused checks first, then the relevant `pnpm lint`, `pnpm typecheck`,
`pnpm test`, component/e2e/a11y scripts or `pnpm verify` from frontend-public.
Check route reuse, stale request completion, SSR request isolation, hydration,
auth transitions, loading/empty/error/partial states and cleanup as applicable.
A build alone does not prove those behaviors. Report unexecuted checks explicitly.

For instruction edits, run the bundle checker with Python 3.10+ and its
development-only dependencies (PyYAML and markdown-it-py). Use an isolated
Python environment when installing them:

```sh
python3 -m pip install -r .agents/skills/vue3-app/scripts/requirements.txt
python3 .agents/skills/vue3-app/scripts/validate_bundle.py .agents/skills
python3 -m unittest discover -s .agents/skills/vue3-app/scripts -p 'test_*.py'
node --experimental-strip-types --test .agents/skills/vue3-app/scripts/test-examples.mjs
```

The checker validates five skill entrypoints and relative CommonMark links/images
in their Markdown files, including reference-style links and nested lists. It
ignores code, comments and frontmatter when extracting links. It does not verify
external URLs, anchor semantics, raw HTML links, framework compatibility or Vue
snippet execution. Use --frontmatter-only only for an explicitly partial snapshot
and do not report that mode as a full bundle/link check.

## Primary sources

- [Agent Skills format](https://agentskills.io/specification)
- [Vue reactivity](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)
- [Nuxt useRoute](https://nuxt.com/docs/4.x/api/composables/use-route)
- [Nuxt hydration](https://nuxt.com/docs/4.x/guide/best-practices/hydration)
- [Pinia setup stores](https://pinia.vuejs.org/core-concepts/)
- [Pinia Nuxt integration](https://pinia.vuejs.org/ssr/nuxt.html)
- [Vue Router migration](https://router.vuejs.org/guide/migration/v4-to-v5.html)
- [CSRF token handling](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
