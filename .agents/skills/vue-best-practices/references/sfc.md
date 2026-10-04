---
title: SFC Structure and Safe Template Boundaries
impact: HIGH
impactDescription: Copyable examples must preserve TypeScript, SSR and HTML trust boundaries
type: best-practice
tags: [vue3, sfc, typescript, styles, security]
---

# SFC structure

Use the project's script, template, style order. TypeScript syntax requires
`<script setup lang="ts">`, not a JavaScript script block. Colocate component
presentation by default while keeping reusable behavior at meaningful boundaries.
Do not create an empty style block for a component with no custom CSS.

Self-contained component with escaped text and scoped styling:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ firstName: string; lastName: string }>()
const displayName = computed(() => `${props.firstName} ${props.lastName}`.trim())
</script>

<template>
  <article class="user-card">
    <h2 class="user-card__name">{{ displayName }}</h2>
  </article>
</template>

<style scoped>
.user-card__name { margin: 0; }
</style>
```

Both a props object and Vue 3.5 reactive destructure are valid. Preserve project
naming and shared/theme styles rather than imposing new tokens. Component-local
styles normally stay scoped; intentional globals belong in the established
style boundary. Use :deep sparingly. Class selectors help keep styling explicit.

## Templates

Use stable primitive keys for stateful lists. Do not combine v-if and v-for on
the same element when the condition needs the loop variable: v-if has precedence.
Filter with computed or conditionally render the containing list.

Choose v-if/v-show by lifecycle, initial cost and toggle behavior. v-show keeps
the subtree mounted; neither directive authorizes a server operation. A hidden
admin control does not protect its API.

Use useTemplateRef in Vue 3.5 for template refs and account for null before mount
or after conditional removal. Guard browser APIs at client lifecycle boundaries.
Avoid arbitrary autofocus that disrupts keyboard users unless required by the UX.

## HTML and external libraries

Prefer escaped interpolation for text. Never compile untrusted Vue templates.
Only use v-html after an established trust/sanitization boundary. Do not invent
a regex sanitizer or assume calling a library makes every URL/template safe.

Before using a sanitizer, verify it is installed, correctly initialized for both
server and client, and appropriate to the rendering context. Do not copy a
browser-only DOMPurify import into SSR without its supported server integration.
Do not add a dependency without project approval. Preserve existing safe rendering
and theme/content contracts.

## Verification

Run Vue/Nuxt typecheck and relevant component/SSR tests for actual component code.
A TypeScript parser cannot validate SFC compilation, DOM behavior or sanitization.

## Primary sources

- [SFC script setup](https://vuejs.org/api/sfc-script-setup.html)
- [List rendering](https://vuejs.org/guide/essentials/list.html)
- [Scoped CSS](https://vuejs.org/api/sfc-css-features.html)
- [Vue security](https://vuejs.org/guide/best-practices/security.html)
