---
title: "Render Functions with Explicit VNode and Event Contracts"
impact: HIGH
impactDescription: "Render functions are an intentional API choice, not a universal optimization for stateless components"
type: best-practice
tags: [vue3, render-functions, typescript, events]
---

# Prefer templates unless a render API is the useful boundary

Use a render function for dynamic composition that is clearer with an explicit
VNode API. A normal stateless SFC is valid; functional components are not a
universal Vue 3 performance upgrade. `defineComponent` with setup returning a
render function is Composition API, even though an options object wraps setup.

A function called render inside script setup does not by itself replace the SFC
template. Use an actual component render contract rather than an unused function.

## Generate fresh, keyed VNodes

Complete render helper intended to be called within a render function:

```ts
import { h } from 'vue'
import type { VNode } from 'vue'

export interface LabelItem {
  readonly id: string
  readonly label: string
}

export function renderLabels(items: readonly LabelItem[]): VNode {
  return h('ul', items.map(item =>
    h('li', { key: item.id }, item.label),
  ))
}
```

Keep VNodes unique within the rendered tree. Do not reuse one mutable VNode as
multiple siblings or snapshot reactive props/slot output once in setup. Invoke
component slots as functions in the render path; do not pre-evaluate slots into
an untracked cache.

## Events, attributes and models

Use Vue's h event props and withModifiers/withKeys when convenient. Explicit
stopPropagation/preventDefault calls are also valid; do not label equivalent
manual event logic as an error solely because a helper exists.

A component model uses modelValue plus an `onUpdate:modelValue` handler (or the
named-model equivalent). Passing the value without a handler is a read-only prop,
not a working two-way model. Use withDirectives for directives; a string `v-focus`
property passed to h does not install a directive.

Preserve intended attrs/events and avoid double forwarding. Text children are
escaped; innerHTML remains a trust-sensitive sink. Never compile untrusted code
or HTML into a render function. Keep setup-dependent injection and lifecycle
registration in a valid context, not arbitrary event callbacks.

## Acceptance

Check prop updates, model writes, keyed reordering, slot updates and events with
component tests. A TypeScript syntax check does not prove render-function behavior,
SFC compilation or SSR compatibility.

## Primary sources

- [Vue render functions](https://vuejs.org/guide/extras/render-function.html)
- [Vue 3 functional components](https://v3-migration.vuejs.org/breaking-changes/functional-components.html)
