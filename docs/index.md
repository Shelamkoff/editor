---
layout: page
---

<script setup>
import HomePage from './.vitepress/theme/components/HomePage.vue'

const texts = {
  heroTitle: 'Rector',
  heroSub: 'A browser-native editor for structured content. Rector combines extensible blocks, inline formatting, atomic undo and redo, versioned JSON, and production-ready document rendering.',
  btnGetStarted: 'GET STARTED',
  btnGitHub: 'GitHub',
  featuresTitle: 'Everything you need',
  features: [
    { title: 'Block Architecture', description: 'Independent editable blocks with explicit serialization, validation, lifecycle, and document renderer contracts.' },
    { title: '21 Block Plugins', description: 'Paragraph, media, carousels, tables, layouts, polls, people, attachments, previews, and more — each individually importable.' },
    { title: 'Inline Tools', description: 'Twelve default tools for formatting, links, code, color, font size, alignment, scripts, case, and cleanup.' },
    { title: 'Drag & Drop', description: 'Reorder blocks with keyboard-accessible controls, drag handles, selection, and configurable animation.' },
    { title: 'Undo / Redo', description: 'One completed action is one ordered history step across formatting, widgets, paste, split/merge, and block commands.' },
    { title: 'Versioned JSON', description: 'A stable document contract with deterministic migrations, validation modes, and plugin-owned data.' },
    { title: 'i18n', description: 'Built-in English and Russian dictionaries with scoped localization contracts for extensions.' },
    { title: 'Themes', description: 'Light and dark editor themes built on CSS custom properties and runtime-selectable appearance.' },
    { title: 'Framework Agnostic', description: 'Browser-native ESM that integrates with any application stack without coupling the editor to a UI framework.' },
  ],
  pluginsTitle: '21 blocks, ready to use',
  plugins: [
    { name: 'Paragraph', type: 'block' }, { name: 'Heading', type: 'block' },
    { name: 'List', type: 'block' }, { name: 'Quote', type: 'block' },
    { name: 'Code', type: 'block' }, { name: 'Image', type: 'block' },
    { name: 'Gallery', type: 'block' }, { name: 'Carousel', type: 'media' },
    { name: 'Embed', type: 'media' },
    { name: 'Table', type: 'block' }, { name: 'Attaches', type: 'block' },
    { name: 'Checklist', type: 'block' }, { name: 'Toggle', type: 'block' },
    { name: 'Columns', type: 'layout' }, { name: 'Spoiler', type: 'block' },
    { name: 'Warning', type: 'block' }, { name: 'Delimiter', type: 'block' },
    { name: 'Poll', type: 'block' }, { name: 'Person', type: 'block' },
    { name: 'Link Preview', type: 'media' }, { name: 'Raw HTML', type: 'block' },
  ],
  demoTitle: 'Try it right here',
  demoSub: 'Edit a real Rector document, try block and inline tools, inspect serialized JSON, and compare the result in renderer mode.',
  ctaTitle: 'Support the project',
  ctaSub: 'If Rector is useful to you, give it a star on GitHub. It helps the project grow.',
  ctaBtn: 'Star on GitHub',
  footerText: 'Framework-agnostic ESM. MIT licensed.',
}
</script>

<HomePage lang="en" :texts="texts" />
