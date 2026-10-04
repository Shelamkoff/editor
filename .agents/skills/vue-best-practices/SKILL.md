---
name: vue-best-practices
description: >-
  Required for Vue tasks. Apply Vue reactivity, Composition API, TypeScript,
  component contracts, composables, SSR safety and measured performance practices.
  For ecom Nuxt application boundaries also load vue3-app and the applicable
  Pinia, Router and adaptable-composable skills.
license: MIT
metadata:
  author: "github.com/vuejs-ai"
  upstream-version: "18.0.0"
  version: "18.0.2-ecom.1"
  maintainer: "ecom project; locally revised instructions"
---

# Vue Best Practices Workflow

## Scope and related skills

Follow AGENTS and established project contracts. In ecom read
[vue3-app](../vue3-app/SKILL.md) for architecture and its task-routing table.
Apply [Pinia](../vue-pinia-best-practices/SKILL.md) for stores/consumers,
[Router](../vue-router-best-practices/SKILL.md) for navigation/URL state and
[adaptable composables](../create-adaptable-composable/SKILL.md) for reusable
value/ref/getter inputs. Load each applicable skill once, not recursively.

Examples describing standalone Vue do not replace Nuxt lifecycle, useRoute,
state isolation or the project's approved repository/transport boundary.
Versions in this header identify local documentation, not installed packages.

## 1. Read the core references

For Vue implementation or review, read these four references:

- [Reactivity](references/reactivity.md)
- [SFC structure and template safety](references/sfc.md)
- [Component data flow](references/component-data-flow.md)
- [Composable organization](references/composables.md)

Use Composition API and `<script setup lang="ts">` in ecom components. Respect
explicit project exceptions instead of rewriting syntax mechanically. Check
resolved versions before adopting new compiler macros or framework APIs.

## 2. Define responsibilities

For a non-trivial change, identify component responsibilities, props/emits,
state ownership and side effects. Keep pages/root components focused on route
composition and application wiring; put feature behavior at meaningful seams.

Extract a component/composable when it has an independent responsibility, useful
reuse, a distinct lifecycle or a boundary worth testing. There is no mandatory
number of child components, directories or UI sections. A small cohesive
production component can remain one file; do not add wrappers merely for a quota.

Keep dependency direction clear. Prefer explicit inputs and narrow contracts
rather than hidden globals or circular imports. Pure calculations are utilities,
not composables just because a component calls them.

## 3. Implement predictable Vue behavior

- Keep source state minimal; derive values using pure computed getters.
- Use watchers for effects, with cleanup and stale-completion protection.
- `ref` is a normal default; `shallowRef` expresses intentional shallow ownership.
- Preserve reactivity when passing props or destructuring stores.
- Use props down/events up and typed emits for ordinary component communication.
- Use v-model for genuine two-way contracts, not arbitrary shared mutation.
- Provide/inject is for meaningful tree context, not a service locator everywhere.
- Keep SFC sections script, template, style in the project's order.
- Scope component-local CSS; do not add empty style blocks to satisfy a rule.
- Keep templates declarative; never compile untrusted templates or render
  unsanitized HTML. Model loading, empty, error, disabled and success states.
- Keep store-owned mutable Pinia state distinct from readonly composable facades.
- In Nuxt, use its route/context/data lifecycle rather than generic SPA shortcuts.

## 4. Load optional references when their feature is used

| Feature | Reference |
| --- | --- |
| Slots | [component-slots](references/component-slots.md) |
| Attr/event forwarding | [component-fallthrough-attrs](references/component-fallthrough-attrs.md) |
| View caching | [component-keep-alive](references/component-keep-alive.md) |
| Overlays/portals | [component-teleport](references/component-teleport.md) |
| Async subtree fallback | [component-suspense](references/component-suspense.md) |
| Enter/leave motion | [component-transition](references/component-transition.md) |
| Animated list changes | [component-transition-group](references/component-transition-group.md) |
| Class-based animation | [animation-class-based-technique](references/animation-class-based-technique.md) |
| State-driven animation | [animation-state-driven-technique](references/animation-state-driven-technique.md) |
| DOM-specific directives | [directives](references/directives.md) |
| Lazy components | [component-async](references/component-async.md) |
| Render functions | [render-functions](references/render-functions.md) |
| App-wide installation | [plugins](references/plugins.md) |
| Shared state | [state-management](references/state-management.md) |

Nuxt already owns app plugins and page loading. Do not install a second bootstrap
from a standalone example. Check SSR support for optional DOM/async features.

## 5. Verify before micro-optimizing

Plan rendering/data-loading architecture early. Apply measured micro-optimizations
after correct behavior is established; do not confuse architecture with premature
optimization. Use these references for a demonstrated need:

- [Large lists](references/perf-virtualize-large-lists.md)
- [v-once/v-memo](references/perf-v-once-v-memo-directives.md)
- [Component overhead](references/perf-avoid-component-abstraction-in-lists.md)
- [Update hooks](references/updated-hook-performance.md)

Verify observable behavior, reactive input changes, disposal, error paths and
SSR/hydration where relevant. Run focused tests, typecheck and appropriate wider
checks. Do not claim runtime verification from a documentation or syntax check.

## Primary sources

- [Vue guide](https://vuejs.org/guide/introduction.html)
- [Vue composables](https://vuejs.org/guide/reusability/composables.html)
- [Vue performance](https://vuejs.org/guide/best-practices/performance.html)
- [Vue SSR](https://vuejs.org/guide/scaling-up/ssr.html)
