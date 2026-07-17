import { defineConfig } from 'vitepress'
import { fileURLToPath } from 'node:url'
import readmeCatalog from './readme-catalog.json'

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
const isStaticBuild = process.argv.includes('build')
const requestedBase = process.env.DOCS_BASE || '/'
const base = requestedBase === '/'
  ? '/'
  : `/${requestedBase.replace(/^\/+|\/+$/g, '')}/`
const asset = (path: string) => `${base}${path.replace(/^\/+/, '')}`

const readmeGroups = [...new Set(readmeCatalog.map(item => item.group))].map(group => ({
  text: group,
  collapsed: group !== 'Rector',
  items: readmeCatalog
    .filter(item => item.group === group)
    .map(item => ({ text: item.title, link: item.route })),
}))

const readmeGroupsRu = readmeGroups.map(group => ({
  ...group,
  text: ({
    Rector: 'Rector',
    'Rector block plugins': 'Блочные плагины Rector',
    'Rector inline plugins': 'Инлайн-плагины Rector',
    'Rector renderers': 'Рендереры Rector',
  })[group.text] ?? group.text,
  items: group.items.map(item => {
    const catalogItem = readmeCatalog.find(entry => entry.route === item.link)
    return { ...item, text: catalogItem?.titleRu ?? item.text, link: item.link.replace('/reference/', '/ru/reference/') }
  }),
}))

const completeGuideSidebar = [
  {
    text: 'Introduction',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/guide/architecture' },
    ],
  },
  {
    text: 'Using the editor',
    items: [
      { text: 'Configuration', link: '/guide/configuration' },
      { text: 'Document format', link: '/guide/document-format' },
      { text: 'Editor API', link: '/guide/editor-api' },
      { text: 'Commands and history', link: '/guide/commands-history' },
    ],
  },
  {
    text: 'Extending Rector',
    items: [
      { text: 'Creating extensions', link: '/guide/extensions' },
      { text: 'Inline tools and plugins', link: '/guide/inline-extensions' },
      { text: 'File sources and media libraries', link: '/guide/file-sources' },
      { text: 'Block plugins', link: '/reference/editor/plugins/index' },
      { text: 'Inline plugins', link: '/reference/editor/inline-plugins/index' },
    ],
  },
  {
    text: 'Output and operations',
    items: [
      { text: 'Rendering documents', link: '/guide/rendering' },
      { text: 'Renderers', link: '/reference/editor/renderers/index' },
      { text: 'Styling and themes', link: '/guide/styling' },
      { text: 'Security and lifecycle', link: '/guide/security-lifecycle' },
    ],
  },
]

const completeGuideSidebarRu = [
  {
    text: 'Введение',
    items: [
      { text: 'Быстрый старт', link: '/ru/guide/getting-started' },
      { text: 'Архитектура', link: '/ru/guide/architecture' },
    ],
  },
  {
    text: 'Использование редактора',
    items: [
      { text: 'Конфигурация', link: '/ru/guide/configuration' },
      { text: 'Формат документа', link: '/ru/guide/document-format' },
      { text: 'API редактора', link: '/ru/guide/editor-api' },
      { text: 'Команды и история', link: '/ru/guide/commands-history' },
    ],
  },
  {
    text: 'Расширение Rector',
    items: [
      { text: 'Создание расширений', link: '/ru/guide/extensions' },
      { text: 'Внутристрочные инструменты и плагины', link: '/ru/guide/inline-extensions' },
      { text: 'Источники файлов и медиатека', link: '/ru/guide/file-sources' },
      { text: 'Блочные плагины', link: '/ru/reference/editor/plugins/index' },
      { text: 'Внутристрочные плагины', link: '/ru/reference/editor/inline-plugins/index' },
    ],
  },
  {
    text: 'Отображение и эксплуатация',
    items: [
      { text: 'Отображение документов', link: '/ru/guide/rendering' },
      { text: 'Рендереры', link: '/ru/reference/editor/renderers/index' },
      { text: 'Стили и темы', link: '/ru/guide/styling' },
      { text: 'Безопасность и жизненный цикл', link: '/ru/guide/security-lifecycle' },
    ],
  },
]

const referenceSidebar = [...completeGuideSidebar, ...readmeGroups.filter(group => group.text !== 'Rector')]
const referenceSidebarRu = [...completeGuideSidebarRu, ...readmeGroupsRu.filter(group => group.text !== 'Rector')]

const completeGuideNav = [
  ...completeGuideSidebar,
  {
    text: 'Project',
    items: [
      { text: 'GitHub', link: 'https://github.com/Shelamkoff/editor' },
      { text: 'Report an issue', link: 'https://github.com/Shelamkoff/editor/issues' },
    ],
  },
]

const completeGuideNavRu = [
  ...completeGuideSidebarRu,
  {
    text: 'Проект',
    items: [
      { text: 'GitHub', link: 'https://github.com/Shelamkoff/editor' },
      { text: 'Сообщить о проблеме', link: 'https://github.com/Shelamkoff/editor/issues' },
    ],
  },
]

export default defineConfig({
  base,
  title: 'Rector',
  description: 'Extensible browser-native block editor with atomic history, versioned JSON, and document rendering',
  cleanUrls: true,
  lastUpdated: true,

  vite: {
    build: {
      rollupOptions: {
        output: {
          assetFileNames(assetInfo) {
            return assetInfo.name === 'style.css'
              ? 'assets/site.css'
              : 'assets/[name].[hash][extname]'
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      fs: {
        allow: [workspaceRoot],
      },
    },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: asset('/favicon.ico') }],
    ...(isStaticBuild ? [['link', { rel: 'stylesheet', href: asset('/assets/site.css') }]] : []),
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap', rel: 'stylesheet' }],
    ['meta', { name: 'theme-color', content: '#3157d5' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', items: completeGuideNav },
          { text: 'Demo', link: '/#demo' },
        ],
        sidebar: {
          '/guide/': completeGuideSidebar,
          '/reference/': referenceSidebar,
        },
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      title: 'Rector',
      description: 'Расширяемый блочный редактор и рендерер документов',
      themeConfig: {
        nav: [
          { text: 'Руководство', items: completeGuideNavRu },
          { text: 'Демо', link: '/ru/#demo' },
        ],
        sidebar: {
          '/ru/guide/': completeGuideSidebarRu,
          '/ru/reference/': referenceSidebarRu,
        },
        outlineTitle: 'Содержание',
        docFooter: { prev: 'Назад', next: 'Далее' },
        darkModeSwitchLabel: 'Тема',
        sidebarMenuLabel: 'Меню',
        returnToTopLabel: 'Наверх',
        langMenuLabel: 'Язык',
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: false,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Shelamkoff/editor' },
    ],
    footer: {
      message: 'Rector is released under the MIT License.',
      copyright: 'Copyright © 2026 Shelamkoff',
    },
    search: {
      provider: 'local',
      options: {
        detailedView: false,
        locales: {
          ru: {
            translations: {
              button: { buttonText: 'Поиск', buttonAriaLabel: 'Поиск по документации' },
              modal: {
                displayDetails: 'Показать подробности',
                resetButtonTitle: 'Очистить поиск',
                backButtonTitle: 'Назад',
                noResultsText: 'Ничего не найдено',
                footer: {
                  selectText: 'выбрать',
                  selectKeyAriaLabel: 'Enter',
                  navigateText: 'перемещение',
                  navigateUpKeyAriaLabel: 'Стрелка вверх',
                  navigateDownKeyAriaLabel: 'Стрелка вниз',
                  closeText: 'закрыть',
                  closeKeyAriaLabel: 'Escape',
                },
              },
            },
          },
        },
      },
    },
  },
})
