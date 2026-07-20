<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useData } from 'vitepress'
import '../../../../plugins/shared/sourceEditor.css'

const props = defineProps<{ lang: string }>()
const { isDark } = useData()

const editorEl = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const outputOpen = ref(false)
const jsonOutput = ref('')
const previewMode = ref(false)
const errorMessage = ref('')

let editor: any = null
let renderer: any = null
let currentLocale: Record<string, string> = {}
let createRendererInlinePlugins: () => any[] = () => []

function highlightJson(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null) return '<span class="ld-json-null">null</span>'
  if (typeof obj === 'boolean') return `<span class="ld-json-bool">${obj}</span>`
  if (typeof obj === 'number') return `<span class="ld-json-num">${obj}</span>`
  if (typeof obj === 'string') {
    const escaped = obj.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<span class="ld-json-str">"${escaped}"</span>`
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    const items = obj.map(v => pad + '  ' + highlightJson(v, indent + 1))
    return '[\n' + items.join(',\n') + '\n' + pad + ']'
  }
  const keys = Object.keys(obj)
  if (keys.length === 0) return '{}'
  const entries = keys.map(k => {
    const escaped = k.replace(/"/g, '&quot;')
    return pad + '  ' + `<span class="ld-json-key">"${escaped}"</span>: ` + highlightJson(obj[k], indent + 1)
  })
  return '{\n' + entries.join(',\n') + '\n' + pad + '}'
}

import demoData from './demo-data.json'

async function initEditor() {
  if (!editorEl.value) return

  errorMessage.value = ''

  const [
    { createEditor },
    { Paragraph },
    { Heading },
    { List },
    { Quote },
    { Code },
    { Image },
    { Embed },
    { Gallery },
    { CarouselBlock },
    { Checklist },
    { Warning },
    { Raw },
    { Poll },
    { Person },
    { Attaches },
    { LinkPreview },
    { Toggle },
    { Columns },
    { Spoiler },
    { Delimiter },
    { Table },
    { createColorSwatchPlugin },
    { createMentionPlugin, createMentionWidget },
    localeModule,
    { EditorRenderer },
  ] = await Promise.all([
    import('../../../../core/index.js'),
    import('../../../../plugins/paragraph/index.js'),
    import('../../../../plugins/heading/index.js'),
    import('../../../../plugins/list/index.js'),
    import('../../../../plugins/quote/index.js'),
    import('../../../../plugins/code/index.js'),
    import('../../../../plugins/image/index.js'),
    import('../../../../plugins/embed/index.js'),
    import('../../../../plugins/gallery/index.js'),
    import('../../../../plugins/carousel/index.js'),
    import('../../../../plugins/checklist/index.js'),
    import('../../../../plugins/warning/index.js'),
    import('../../../../plugins/raw/index.js'),
    import('../../../../plugins/poll/index.js'),
    import('../../../../plugins/person/index.js'),
    import('../../../../plugins/attaches/index.js'),
    import('../../../../plugins/link-preview/index.js'),
    import('../../../../plugins/toggle/index.js'),
    import('../../../../plugins/columns/index.js'),
    import('../../../../plugins/spoiler/index.js'),
    import('../../../../plugins/delimiter/index.js'),
    import('../../../../plugins/table/index.js'),
    import('../../../../inline-plugins/color.js'),
    import('../../../../inline-plugins/mention/index.js'),
    props.lang === 'ru'
      ? import('../../../../locale/ru.js')
      : import('../../../../locale/en.js'),
    import('../../../../renderer/index.js'),
  ])

  const localeDict = localeModule.default
  currentLocale = localeDict
  const mentionItems = props.lang === 'ru'
    ? [
        { id: 'ada', name: 'Ада Лавлейс', details: 'Математик' },
        { id: 'grace', name: 'Грейс Хоппер', details: 'Учёный в области информатики' },
        { id: 'margaret', name: 'Маргарет Гамильтон', details: 'Инженер-программист' },
      ]
    : [
        { id: 'ada', name: 'Ada Lovelace', details: 'Mathematician' },
        { id: 'grace', name: 'Grace Hopper', details: 'Computer scientist' },
        { id: 'margaret', name: 'Margaret Hamilton', details: 'Software engineer' },
      ]
  const mention = createMentionPlugin({
    debounceDelay: 0,
    async searchFunction(query: string) {
      const normalizedQuery = query.trim().toLocaleLowerCase(props.lang)
      return mentionItems.filter(item => item.name.toLocaleLowerCase(props.lang).includes(normalizedQuery))
    },
  })

  createRendererInlinePlugins = () => [createColorSwatchPlugin(), createMentionWidget()]

  renderer = new EditorRenderer({
    theme: isDark.value ? 'dark' : 'light',
    throwOnUnknown: false,
    locale: localeDict,
    inlinePlugins: createRendererInlinePlugins(),
  })
  editor = createEditor({
    holder: editorEl.value,
    locale: localeDict,
    theme: isDark.value ? 'dark' : 'light',
    plugins: [
      new Paragraph({ injectStyles: false }), new Heading({ injectStyles: false }),
      new List({ injectStyles: false }), new Quote({ injectStyles: false }),
      new Code({ injectStyles: false }), new Image({ injectStyles: false }),
      new Embed({ injectStyles: false }), new Gallery({ injectStyles: false }),
      new CarouselBlock({ injectStyles: false }),
      new Checklist({ injectStyles: false }), new Warning({ injectStyles: false }),
      new Raw({ injectStyles: false }), new Poll({ injectStyles: false }),
      new Person({ injectStyles: false }), new Attaches({ injectStyles: false }),
      new LinkPreview({ injectStyles: false }), new Toggle({ injectStyles: false }),
      new Columns({ injectStyles: false }), new Spoiler({ injectStyles: false }),
      new Delimiter({ injectStyles: false }), new Table({ injectStyles: false }),
    ],
    inlinePlugins: [createColorSwatchPlugin(), mention],
    minHeight: 280,
    onChange(data: any) {
      jsonOutput.value = highlightJson(data)
    },
    data: { version: '1.0.0', blocks: props.lang === 'ru' ? demoData.ru : demoData.en },
  })

  const data = editor.save()
  jsonOutput.value = highlightJson(data)
}

async function renderPreview() {
  if (!editor || !renderer || !previewEl.value) return
  const data = editor.save()

  renderer.destroy(previewEl.value)
  previewEl.value.replaceChildren()

  const { EditorRenderer } = await import('../../../../renderer/index.js')
  renderer = new EditorRenderer({
    theme: isDark.value ? 'dark' : 'light',
    throwOnUnknown: false,
    locale: currentLocale,
    inlinePlugins: createRendererInlinePlugins(),
  })
  renderer.renderTo(data, previewEl.value)
}

async function setViewMode(mode: 'editor' | 'preview') {
  if (mode === 'editor') {
    previewMode.value = false
    return
  }

  await renderPreview()
  previewMode.value = true
}

onMounted(async () => {
  try {
    await initEditor()
  } catch (error) {
    console.error('[Rector docs] Live demo failed to initialize', error)
    errorMessage.value = props.lang === 'ru'
      ? 'Демо не удалось запустить. Проверьте консоль браузера.'
      : 'The demo could not start. Check the browser console.'
  }
})

onUnmounted(() => {
  editor?.destroy()
  if (renderer && previewEl.value) renderer.destroy(previewEl.value)
})

// Sync theme
watch(isDark, async (dark) => {
  const root = editorEl.value?.querySelector('.oe-editor')
  if (root) {
    root.classList.toggle('oe-theme-dark', dark)
    root.classList.toggle('oe-theme-light', !dark)
  }
  if (previewMode.value) await renderPreview()
})

function toggleOutput() {
  outputOpen.value = !outputOpen.value
}
</script>

<template>
  <div class="live-demo" :class="{ 'live-demo--dark': isDark }">
    <p v-if="errorMessage" class="ld-error" role="alert">{{ errorMessage }}</p>
    <!-- macOS frame -->
    <div class="ld-frame">
      <div class="ld-bar">
        <div class="ld-dots">
          <span class="ld-dot ld-dot--red" aria-hidden="true"></span>
          <span class="ld-dot ld-dot--amber" aria-hidden="true"></span>
          <span class="ld-dot ld-dot--green" aria-hidden="true"></span>
        </div>
        <div class="ld-bar__spacer"></div>
        <div class="ld-view-switch" role="group" :aria-label="lang === 'ru' ? 'Режим просмотра' : 'View mode'">
          <button
            type="button"
            class="ld-view-switch__btn"
            :class="{ 'ld-view-switch__btn--active': !previewMode }"
            :aria-pressed="!previewMode"
            @click="setViewMode('editor')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1l1-4Z"/></svg>
            {{ lang === 'ru' ? 'Редактор' : 'Editor' }}
          </button>
          <button
            type="button"
            class="ld-view-switch__btn"
            :class="{ 'ld-view-switch__btn--active': previewMode }"
            :aria-pressed="previewMode"
            @click="setViewMode('preview')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8s11 8 11 8s-4 8-11 8s-11-8-11-8"/><circle cx="12" cy="12" r="3"/></svg>
            {{ lang === 'ru' ? 'Превью' : 'Preview' }}
          </button>
        </div>
      </div>
      <div class="ld-editor" ref="editorEl" v-show="!previewMode"></div>
      <div class="ld-preview" ref="previewEl" v-show="previewMode"></div>
    </div>

    <!-- JSON output -->
    <div class="ld-output">
      <button type="button" class="ld-output__toggle" :aria-expanded="outputOpen" @click="toggleOutput">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'ld-output__chevron--open': outputOpen }"><polyline points="9 18 15 12 9 6"/></svg>
        {{ lang === 'ru' ? 'JSON на выходе' : 'Output JSON' }}
      </button>
      <!-- eslint-disable vue/no-v-html -->
      <pre v-show="outputOpen" class="ld-output__pre"><code v-html="jsonOutput"></code></pre>
    </div>
  </div>
</template>

<!--
  Unscoped: neutralize VitePress global resets inside .live-demo.
  Uses :where() for zero specificity (0,0,0) so the editor's own
  .oe-* class selectors always win.
-->
<style>
/* SVG: VP sets display:block — editor icons need inline.
   :where() ensures .oe-toolbar__icon etc. can override if needed. */
:where(.live-demo .oe-editor) svg { display: inline; }

/* Lists: VP removes list-style/padding/margin.
   Revert to browser defaults; editor's .oe-list classes will override. */
:where(.live-demo .oe-editor) ul,
:where(.live-demo .oe-editor) ol { list-style: revert; padding: revert; margin: revert; }

/* Headings: VP resets font-size/weight/line-height to 16px/400/24px
   and doc styles add border-bottom. Revert all to browser defaults;
   editor's .oe-heading--h2 etc. will override. */
:where(.live-demo .oe-editor) h2,
:where(.live-demo .oe-editor) h3,
:where(.live-demo .oe-editor) h4,
:where(.live-demo .oe-editor) h5,
:where(.live-demo .oe-editor) h6 { border: none; margin: revert; padding: revert; letter-spacing: revert; font-weight: revert; font-size: revert; line-height: revert; }

/* pre/code: VP overrides font-family with --vp-font-family-mono.
   Revert so editor's .oe-code-wrap class applies its own font. */
:where(.live-demo .oe-editor) pre,
:where(.live-demo .oe-editor) code { font-family: revert; background: revert; color: revert; border: revert; padding: revert; border-radius: revert; font-size: revert; }

/* Images: VP sets display:block and max-width:100% which breaks gallery grid */
:where(.live-demo .oe-editor) img { display: revert; max-width: revert; }

/* Buttons: VP applies 4px auto outline on :focus-visible. */
:where(.live-demo .oe-editor) button:focus,
:where(.live-demo .oe-editor) button:focus-visible { outline: none; }

/* Inputs: VP sets background:transparent and inherits vp colors. */
:where(.live-demo .oe-editor) input { background-color: revert; }
:where(.live-demo .oe-editor) .oe-toolbox__filter-input:focus,
:where(.live-demo .oe-editor) .oe-toolbox__filter-input:focus-visible,
:where(.live-demo .oe-editor) .oe-inline-toolbar__type-filter-input:focus,
:where(.live-demo .oe-editor) .oe-inline-toolbar__type-filter-input:focus-visible {
  outline: none;
  box-shadow: none;
}
:where(.live-demo .oe-editor) input::placeholder,
:where(.live-demo .oe-editor) textarea::placeholder { color: revert; }

/* Preview: same VP resets as editor */
:where(.live-demo .ld-preview .editor-content) svg { display: inline; }
:where(.live-demo .ld-preview .editor-content) ul,
:where(.live-demo .ld-preview .editor-content) ol { list-style: revert; padding: revert; margin: revert; }
:where(.live-demo .ld-preview .editor-content) h2,
:where(.live-demo .ld-preview .editor-content) h3,
:where(.live-demo .ld-preview .editor-content) h4,
:where(.live-demo .ld-preview .editor-content) h5,
:where(.live-demo .ld-preview .editor-content) h6 { border: none; margin: revert; padding: revert; letter-spacing: revert; font-weight: revert; font-size: revert; line-height: revert; }
:where(.live-demo .ld-preview .editor-content) p { margin: revert; }
:where(.live-demo .ld-preview .editor-content) pre,
:where(.live-demo .ld-preview .editor-content) code { font-family: revert; background: revert; color: revert; border: revert; padding: revert; border-radius: revert; font-size: revert; }
:where(.live-demo .ld-preview .editor-content) img { display: revert; max-width: revert; }
</style>

<style scoped>
.live-demo {
  width: 100%;
  --ld-switch-bg: var(--vp-c-bg-soft);
  --ld-switch-border: var(--vp-c-border);
  --ld-switch-text: var(--vp-c-text-2);
  --ld-switch-hover-bg: var(--vp-c-bg-alt);
  --ld-switch-active-bg: var(--vp-button-brand-bg);
  --ld-switch-active-hover-bg: var(--vp-button-brand-active-bg);
}

.ld-error {
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 45%, transparent);
  color: var(--vp-c-danger-1);
  background: color-mix(in srgb, var(--vp-c-danger-soft) 70%, transparent);
}

/* ── macOS frame ─────────────────────────────────────────────────────────── */

.ld-frame {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: visible;
  background: #fff;
}

.live-demo--dark .ld-frame {
  background: #0d1012;
}

.ld-bar {
  display: flex;
  min-height: 42px;
  align-items: center;
  padding: 6px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-mute);
  border-radius: 10px 10px 0 0;
}

.ld-dots {
  display: flex;
  gap: 6px;
}

.ld-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.ld-dot--red { background: #ff5f57; }
.ld-dot--amber { background: #febc2e; }
.ld-dot--green { background: #28c840; }

.ld-bar__spacer { flex: 1; }

.ld-view-switch {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--ld-switch-border);
  border-radius: 8px;
  background: var(--ld-switch-bg);
}

.ld-view-switch__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 11px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ld-switch-text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.ld-view-switch__btn:hover {
  color: var(--vp-c-text-1);
  background: var(--ld-switch-hover-bg);
}

.ld-view-switch__btn--active,
.ld-view-switch__btn[aria-pressed='true'] {
  color: #fff;
  background: var(--ld-switch-active-bg);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ld-switch-active-bg) 45%, transparent);
}

.ld-view-switch__btn--active:hover,
.ld-view-switch__btn[aria-pressed='true']:hover {
  color: #fff;
  background: var(--ld-switch-active-hover-bg);
}

.ld-view-switch__btn:focus-visible,
.ld-output__toggle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.ld-editor {
  padding: 24px 60px 24px 24px;
  min-height: 280px;
}

.ld-preview {
  padding: 24px;
  min-height: 280px;
}

/* ── JSON output ─────────────────────────────────────────────────────────── */

.ld-output {
  margin-top: 16px;
}

.ld-output__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  transition: color 0.15s;
}
.ld-output__toggle:hover {
  color: var(--vp-c-text-2);
}
.ld-output__toggle svg {
  transition: transform 0.2s;
}
.ld-output__chevron--open {
  transform: rotate(90deg);
}

/* JSON syntax colors: light by default, dark through an explicit root override. */
.ld-json-key { color: #1c5fb8; }
.ld-json-str { color: #1f7a3a; }
.ld-json-num { color: #a94d08; }
.ld-json-bool { color: #6c1fb8; }
.ld-json-null { color: #626978; }

.live-demo--dark .ld-json-key { color: #7aa2f7; }
.live-demo--dark .ld-json-str { color: #9ece6a; }
.live-demo--dark .ld-json-num { color: #ff9e64; }
.live-demo--dark .ld-json-bool { color: #bb9af7; }
.live-demo--dark .ld-json-null { color: #737aa2; }

.ld-output__pre {
  margin-top: 8px;
  padding: 16px 20px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  overflow-x: auto;
  white-space: pre;
  max-height: 400px;
  overflow-y: auto;
}
</style>
