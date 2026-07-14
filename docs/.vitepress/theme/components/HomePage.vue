<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useData, withBase } from 'vitepress'

const LiveDemo = defineAsyncComponent(() => import('./LiveDemo.vue'))
import {
  IconLayoutRows,
  IconPuzzle,
  IconTextSize,
  IconGripVertical,
  IconArrowBackUp,
  IconBraces,
  IconLanguage,
  IconPalette,
  IconFeather,
  IconStar,
  IconBrandGithub,
  IconArrowRight,
  // Plugin icons
  IconLetterT,
  IconH1,
  IconList,
  IconBlockquote,
  IconCode,
  IconPhoto,
  IconLayoutGrid,
  IconPlayerPlay,
  IconTable,
  IconPaperclip,
  IconListCheck,
  IconChevronDown,
  IconColumns3,
  IconEyeOff,
  IconAlertTriangle,
  IconMinus,
  IconChartBar,
  IconUser,
  IconLink,
  IconHtml,
  IconSlideshow,
} from '@tabler/icons-vue'

interface Feature {
  icon: any
  title: string
  description: string
}

interface Plugin {
  name: string
  type: string
}

interface Texts {
  heroTitle: string
  heroSub: string
  btnGetStarted: string
  btnGitHub: string
  featuresTitle: string
  features: Feature[]
  pluginsTitle: string
  plugins: Plugin[]
  demoTitle?: string
  demoSub?: string
  ctaTitle: string
  ctaSub: string
  ctaBtn: string
  footerText: string
}

const props = defineProps<{
  lang: string
  texts: Texts
}>()

const { isDark } = useData()

const featureIcons = [
  IconLayoutRows,
  IconPuzzle,
  IconTextSize,
  IconGripVertical,
  IconArrowBackUp,
  IconBraces,
  IconLanguage,
  IconPalette,
  IconFeather,
]

const pluginIcons: Record<string, any> = {
  'Paragraph': IconLetterT,
  'Heading': IconH1,
  'List': IconList,
  'Quote': IconBlockquote,
  'Code': IconCode,
  'Image': IconPhoto,
  'Gallery': IconLayoutGrid,
  'Embed': IconPlayerPlay,
  'Table': IconTable,
  'Attaches': IconPaperclip,
  'Checklist': IconListCheck,
  'Toggle': IconChevronDown,
  'Columns': IconColumns3,
  'Spoiler': IconEyeOff,
  'Warning': IconAlertTriangle,
  'Delimiter': IconMinus,
  'Poll': IconChartBar,
  'Person': IconUser,
  'Link Preview': IconLink,
  'Raw HTML': IconHtml,
  'Carousel': IconSlideshow,
  // RU names
  'Параграф': IconLetterT,
  'Заголовок': IconH1,
  'Список': IconList,
  'Цитата': IconBlockquote,
  'Код': IconCode,
  'Изображение': IconPhoto,
  'Галерея': IconLayoutGrid,
  'Видео': IconPlayerPlay,
  'Таблица': IconTable,
  'Файлы': IconPaperclip,
  'Чеклист': IconListCheck,
  'Аккордеон': IconChevronDown,
  'Колонки': IconColumns3,
  'Спойлер': IconEyeOff,
  'Предупреждение': IconAlertTriangle,
  'Разделитель': IconMinus,
  'Опрос': IconChartBar,
  'Персона': IconUser,
  'Превью ссылки': IconLink,
  'Предварительный просмотр ссылки': IconLink,
  'Карусель': IconSlideshow,
  'Произвольный HTML': IconHtml,
}

const githubUrl = 'https://github.com/Shelamkoff/editor'
const getStartedLink = withBase(props.lang === 'ru' ? '/ru/guide/getting-started' : '/guide/getting-started')

</script>

<template>
  <div class="home-page" :class="{ 'home-page--dark': isDark }">
    <!-- Hero -->
    <section class="hero">
      <div class="hero__container">
        <h1 class="hero__visually-hidden">{{ texts.heroTitle }}</h1>
        <div class="hero__logo-frame anim-hero" style="animation-delay: 0.1s">
          <img class="hero__logo" :src="withBase('/logo.svg')" alt="Rector" width="872" height="221">
        </div>
        <p class="hero__sub anim-hero" style="animation-delay: 0.2s">
          {{ texts.heroSub }}
        </p>
        <div class="hero__actions anim-hero" style="animation-delay: 0.3s">
          <a :href="getStartedLink" class="btn btn--fill">
            {{ texts.btnGetStarted }}
            <IconArrowRight class="btn__arrow" :size="14" :stroke-width="2.5" aria-hidden="true" />
          </a>
          <a :href="githubUrl" class="btn btn--outline" target="_blank" rel="noopener noreferrer">
            <IconBrandGithub :size="14" :stroke-width="2" />
            {{ texts.btnGitHub }}
          </a>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="sec">
      <div class="sec__container">
        <h2 class="sec__title">{{ texts.featuresTitle }}</h2>

        <div class="feat-grid">
          <article
            v-for="(feat, i) in texts.features"
            :key="feat.title"
            class="feat"
          >
            <div class="feat__ico" aria-hidden="true">
              <component :is="featureIcons[i]" :size="16" :stroke-width="1.5" />
            </div>
            <h3 class="feat__name">{{ feat.title }}</h3>
            <p class="feat__txt">{{ feat.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Plugins -->
    <section class="sec">
      <div class="sec__container">
        <h2 class="sec__title">{{ texts.pluginsTitle }}</h2>

        <div class="plug-grid">
          <div
            v-for="(plugin, i) in texts.plugins"
            :key="plugin.name"
            class="plug"
          >
            <div class="plug__ico" aria-hidden="true">
              <component :is="pluginIcons[plugin.name]" v-if="pluginIcons[plugin.name]" :size="20" :stroke-width="1.5" />
            </div>
            <div class="plug__name">{{ plugin.name }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Demo -->
    <section id="demo" class="sec home-demo">
      <div class="sec__container">
        <h2 class="sec__title">{{ texts.demoTitle || 'Try it' }}</h2>
        <p v-if="texts.demoSub" class="sec__sub">{{ texts.demoSub }}</p>
        <ClientOnly>
          <LiveDemo :lang="lang" />
        </ClientOnly>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta">
      <div class="sec__container cta__inner">
        <h2 class="cta__title">{{ texts.ctaTitle }}</h2>
        <p class="cta__sub">{{ texts.ctaSub }}</p>
        <div class="cta__arrows" aria-hidden="true">
          <svg class="cta__arrow cta__arrow--tl" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l10 -10"/><path d="M16 17l-9 0l0 -9"/></svg>
          <svg class="cta__arrow cta__arrow--t" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M18 13l-6 6l-6 -6"/></svg>
          <svg class="cta__arrow cta__arrow--tr" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17l-10 -10"/><path d="M8 17l9 0l0 -9"/></svg>
        </div>
        <a :href="githubUrl" class="cta__btn" target="_blank" rel="noopener noreferrer">
          <IconStar :size="18" :stroke-width="2" />
          {{ texts.ctaBtn }}
        </a>
        <div class="cta__arrows cta__arrows--bottom" aria-hidden="true">
          <svg class="cta__arrow cta__arrow--bl" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10"/><path d="M16 7l-9 0l0 9"/></svg>
          <svg class="cta__arrow cta__arrow--b" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M18 11l-6 -6l-6 6"/></svg>
          <svg class="cta__arrow cta__arrow--br" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7l-10 10"/><path d="M8 7l9 0l0 9"/></svg>
        </div>
      </div>
    </section>
  </div>
</template>


<style scoped>
/* ═══ BASE ═══════════════════════════════════════════════════════════════ */

.home-page {
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --surface: var(--vp-c-bg-soft);
  --surface-2: var(--vp-c-bg-mute);
  --border: var(--vp-c-divider);
  --border-2: var(--vp-c-border);
  --text: var(--vp-c-text-1);
  --text-2: var(--vp-c-text-2);
  --text-3: var(--vp-c-text-3);
  --accent: var(--vp-c-brand-1);
  --accent-hover: var(--vp-c-brand-2);
  --max-w: 1080px;
  font-family: var(--vp-font-family-base);
}

/* ═══ ANIMATIONS ═════════════════════════════════════════════════════════ */

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes buttonArrowTravel {
  0%, 18% { transform: translateX(0); }
  48% { transform: translateX(5px); }
  72%, 100% { transform: translateX(0); }
}

.anim-hero {
  animation: fadeUp 0.7s var(--ease) both;
}

/* ═══ LAYOUT ═════════════════════════════════════════════════════════════ */

.sec__container {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 2rem;
}

.sec {
  padding: 4rem 0;
}

.home-demo {
  scroll-margin-top: 88px;
}

.home-demo:focus,
.home-demo:focus-visible,
.home-demo:target {
  outline: none;
  border: 0;
  box-shadow: none;
}

.sec__title {
  font-size: clamp(1.375rem, 3vw, 2rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  margin-bottom: 2rem;
  color: var(--text);
  text-align: center;
}

/* ═══ HERO ═══════════════════════════════════════════════════════════════ */

.hero {
  position: relative;
  box-sizing: border-box;
  min-height: calc(100svh - var(--vp-nav-height, 64px));
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 0;
  overflow: hidden;
}

.hero::before {
  position: absolute;
  inset: 12% 18% auto;
  height: 320px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  content: '';
  filter: blur(110px);
  pointer-events: none;
}

.hero__container {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 0 2rem;
}

.hero__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.hero__logo-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
}

.hero__logo {
  width: min(420px, 88vw);
  height: auto;
  filter: invert(1);
}

.home-page--dark .hero__logo {
  filter: none;
}

:global(.dark .home-page .hero__logo) {
  filter: none;
}

.hero__sub {
  font-size: 1.0625rem;
  font-weight: 400;
  color: var(--text-2);
  max-width: 540px;
  margin: 0 auto 2.5rem;
  line-height: 1.65;
}

.hero__actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

/* ═══ BUTTONS ════════════════════════════════════════════════════════════ */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  justify-content: center;
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  font-family: var(--vp-font-family-base);
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.18s var(--ease), border-color 0.18s var(--ease), color 0.18s var(--ease);
}

.btn--fill {
  background: var(--accent);
  color: #fff;
}

.btn--fill:hover {
  background: var(--accent-hover);
}

.btn__arrow {
  flex: 0 0 auto;
  animation: buttonArrowTravel 1.65s var(--ease) infinite;
}

.btn--outline {
  background: color-mix(in srgb, var(--surface) 48%, transparent);
  color: var(--text);
  border: 1px solid var(--border-2);
}

.btn--outline:hover {
  border-color: var(--text-3);
  background: var(--surface);
}

.btn:focus-visible,
.cta__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* ═══ FEATURES ═══════════════════════════════════════════════════════════ */

.feat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.feat {
  min-height: 188px;
  background: var(--vp-c-bg);
  padding: 1.625rem;
  transition: background-color 0.2s var(--ease);
}

.home-page:not(.home-page--dark) .feat,
.home-page:not(.home-page--dark) .plug {
  background: var(--surface);
}

.feat:hover {
  background: var(--surface);
}

.feat__ico {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-2);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-2);
  margin-bottom: 1.25rem;
}

.feat__name {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 0.375rem;
  color: var(--text);
}

.feat__txt {
  font-size: 0.8125rem;
  color: var(--text-2);
  font-weight: 400;
  line-height: 1.6;
  margin: 0;
}

/* ═══ PLUGINS ════════════════════════════════════════════════════════════ */

.plug-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.625rem;
}

.plug {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--vp-c-bg);
  transition: background-color 0.18s var(--ease), border-color 0.18s var(--ease);
  cursor: default;
}

.plug:hover {
  border-color: var(--border-2);
  background: var(--surface);
}

.plug__ico {
  display: flex;
  flex: 0 0 auto;
  color: var(--text-3);
  transition: color 0.18s var(--ease);
}

.plug:hover .plug__ico {
  color: var(--accent);
}

.plug__name {
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plug:hover .plug__name {
  color: var(--text);
}

/* ═══ DEMO ═══════════════════════════════════════════════════════════════ */

.sec__sub {
  font-size: 0.9375rem;
  color: var(--text-3);
  text-align: center;
  max-width: 620px;
  margin: -1rem auto 2rem;
  line-height: 1.6;
}

/* ═══ CTA ════════════════════════════════════════════════════════════════ */

.cta {
  padding: 4rem 0 3.5rem;
}

.cta__inner {
  padding-top: 3.5rem;
  text-align: center;
}

.cta__title {
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
  color: var(--text);
}

.cta__sub {
  font-size: 0.9375rem;
  color: var(--text-2);
  font-weight: 400;
  max-width: 480px;
  margin: 0 auto 2rem;
  line-height: 1.6;
}

.cta__arrows {
  display: flex;
  justify-content: center;
  gap: 3rem;
  margin-bottom: 1rem;
  color: var(--text-3);
}

.cta__arrows--bottom {
  margin-top: 1rem;
  margin-bottom: 0;
}

.cta__arrow {
  animation: star-float 2s var(--ease) infinite alternate;
}

.cta__arrow--tl { animation-delay: 0s; }
.cta__arrow--t { animation-delay: 0.15s; }
.cta__arrow--tr { animation-delay: 0.3s; }
.cta__arrow--bl { animation-delay: 0.1s; }
.cta__arrow--b { animation-delay: 0.25s; }
.cta__arrow--br { animation-delay: 0.4s; }

@keyframes star-float {
  from { opacity: 0.3; transform: translateY(3px); }
  to { opacity: 0.7; transform: translateY(-3px); }
}

.cta__btn {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: var(--vp-font-family-base);
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.18s var(--ease), border-color 0.18s var(--ease), transform 0.18s var(--ease);
}

.cta__btn:hover {
  border-color: var(--text-3);
  background: var(--surface-2);
  transform: translateY(-1px);
}

.cta__btn :deep(svg) {
  color: #f5c542;
}

/* ═══ RESPONSIVE ═════════════════════════════════════════════════════════ */

@media (max-width: 900px) {
  .plug-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .sec__container,
  .hero__container {
    padding: 0 1.25rem;
  }

  .hero {
    min-height: calc(100svh - var(--vp-nav-height, 64px));
    padding: 3rem 0;
  }

  .hero::before {
    inset: 15% 0 auto;
  }

  .feat-grid {
    grid-template-columns: 1fr;
  }

  .feat {
    min-height: auto;
  }

  .plug-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .hero__actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .anim-hero {
    animation: none;
  }

  .btn,
  .cta__btn,
  .feat,
  .plug,
  .plug__ico {
    transition: none;
  }

  .cta__arrow {
    animation: none;
    opacity: 0.6;
  }

  .btn__arrow {
    animation: none;
  }
}
</style>
