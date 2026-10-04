---
title: "Profile Component Boundaries Without Losing Their Contracts"
impact: HIGH
impactDescription: "Instance count alone is not a memory or rendering benchmark"
type: best-practice
tags: [vue3, performance, components, architecture]
---

# Remove needless work, not useful boundaries

A component costs more than a plain element, and repetition can amplify that cost.
That does not make every wrapper harmful or prove memory grows exactly in
proportion to component count. Do not use invented multiplier tables as benchmarks.

Profile a realistic hot path before flattening it. Start with unnecessary data
work, unstable props, expensive effects and the number of rendered rows. Keep a
component when it owns meaningful interaction, accessibility, a lifecycle or a
reusable design contract. A shared button with keyboard/loading behavior is not
merely decorative markup to copy into every row.

## A practical review

Identify which repeated wrappers only forward props/slots and add no contract.
Compare a focused simplification with the existing implementation. Preserve
public props/events, attrs, focus, semantic HTML and theme tokens. Do not replace
a component with unapproved Bootstrap/Tailwind classes or import another scroller.

Keep feature modules cohesive and dependencies acyclic. Do not invert the rule
into a quota of files/components or move all behavior into one giant page.
Virtualization may reduce instance count enough that a useful abstraction is
not worth removing; profile that architecture before duplicating markup.

## Measurement and acceptance

Use Vue DevTools and browser performance/memory tooling with consistent workloads.
Do not traverse private VNode structures in a production helper just to count
components: children are not always a simple array and internals are not a
measurement contract. Record tested data volume/device and compare behavior as
well as render cost. Do not claim a universal threshold, frame rate or memory ratio.

Recheck keyboard operation, state retention, events and error/loading states after
flattening. Prefer the smallest change with a demonstrated benefit; maintainability
and accessibility are acceptance criteria, not optional overhead.

## Primary sources

- [Vue component abstraction costs](https://vuejs.org/guide/best-practices/performance.html#avoid-unnecessary-component-abstractions)
- [Props stability](https://vuejs.org/guide/best-practices/performance.html#props-stability)
