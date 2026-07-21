# Стили и темы

Rector предоставляет устойчивые корневые классы и пользовательские свойства CSS. Один флаг управляет двумя способами доставки стилей: автоматическими `<link>` с подсчётом владельцев для browser-native использования или явными CSS-импортами для сборщика.

## Автоматические стили (по умолчанию)

```js
const editor = createEditor({
  holder,
  plugins,
  inlinePlugins,
  injectStyles: true,
})
```

`injectStyles` по умолчанию равен `true`. Rector загружает базовые стили и темы редактора, таблицы каждого зарегистрированного блочного и inline-плагина, а также объявленные ими стили зависимостей. Одинаковые URL учитываются совместно между экземплярами редактора и удаляются после уничтожения последнего владельца.

Рендерер использует тот же параметр и автоматически загружает базовые стили и стили зарегистрированных рендереров при первом рендеринге:

```js
const renderer = createEditorRenderer({ injectStyles: true })
renderer.renderTo(documentData, article)
renderer.destroy()
```

## Стили под управлением сборщика

Для Vite, Nuxt или другого сборщика с поддержкой CSS отключите runtime-ссылки и импортируйте только используемые стили:

```js
import '@shelamkoff/rector/styles/editor.css'
import '@shelamkoff/rector/plugins/image/styles.css'
import '@shelamkoff/rector/inline-plugins/color/styles.css'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins,
  injectStyles: false,
})
```

Для рендереров предусмотрены аналогичные точки входа:

```js
import '@shelamkoff/rector/styles/renderer.css'
import '@shelamkoff/rector/renderer/renderers/carousel/styles.css'

const renderer = createEditorRenderer({ injectStyles: false })
```

`@shelamkoff/rector/styles.css` — единая альтернатива со стилями редактора, inline-плагинов и всех встроенных рендереров. Импортируйте CSS пакета до переопределений приложения и ограничивайте свои правила контейнером.

## Выбор темы

```js
const editor = createEditor({
  holder,
  plugins,
  theme: 'light',
})
```

Корневой элемент получает `.oe-theme-light` или `.oe-theme-dark`. По умолчанию используется `dark`. Для переключения во время работы замените эти классы на `editor.rootElement`; конфигурация `theme` читается только при создании.

```js
function setTheme(editor, theme) {
  editor.rootElement.classList.toggle('oe-theme-light', theme === 'light')
  editor.rootElement.classList.toggle('oe-theme-dark', theme === 'dark')
}
```

## Основные переменные оформления

Задавайте переопределения на `.oe-editor` или классе темы внутри области приложения.

```css
.article-editor .oe-editor {
  --oe-font: Inter, system-ui, sans-serif;
  --oe-font-mono: 'JetBrains Mono', monospace;
  --oe-font-size: 16px;
  --oe-line-height: 1.7;
  --oe-block-gap: 0px;
  --oe-block-spacing: 1.25rem;
  --oe-radius: 10px;
  --oe-radius-sm: 5px;
  --oe-transition: 0.15s ease;
}

.article-editor .oe-theme-light {
  --oe-bg: #ffffff;
  --oe-surface: #f8fafc;
  --oe-card: #ffffff;
  --oe-card-hover: #eef2f7;
  --oe-border: #d8dee8;
  --oe-border-hover: #b9c3d1;
  --oe-text-1: #151a22;
  --oe-text-2: #465160;
  --oe-text-3: #758195;
  --oe-accent: #6d4de6;
  --oe-accent-alpha: rgb(109 77 230 / 12%);
  --oe-border-focus: #6d4de6;
  --oe-selection-bg: rgb(109 77 230 / 20%);
}
```

К общим переменным интерфейса также относятся `--oe-surface-2`, `--oe-surface-elevated`, `--oe-surface-hover`, `--oe-input-bg`, `--oe-input-bg-hover`, `--oe-success`, `--oe-danger`, `--oe-text-on-accent`, `--oe-toolbar-bg`, `--oe-toolbar-border`, `--oe-toolbar-shadow`, `--oe-mark-bg` и `--oe-overlay`.

Переопределяйте смысловые переменные, а не цвета отдельных кнопок или всплывающих элементов. Тогда панели, настройки, диалоги, выделение и плагины останутся согласованными.

## Устойчивые селекторы редактора

| Назначение | Селектор |
| --- | --- |
| Корень редактора | `.oe-editor` |
| Контейнер блоков | `.oe-blocks` |
| Оболочка блока | `.oe-block` |
| Блок с фокусом | `.oe-block--focused` |
| Панель блока | `.oe-toolbar` |
| Выбор типа блока | `.oe-toolbox` |
| Меню настроек | `.oe-settings-menu` |
| Внутристрочная панель | `.oe-inline-toolbar` |
| Меню быстрой вставки | `.oe-slash-menu` |
| Всплывающая подсказка | `.oe-tooltip` |

Для клавиатурного фокуса используйте `:focus-visible`. Не удаляйте видимый фокус без равноценной замены.

## Селекторы встроенных блоков

| Блок | Корневой селектор |
| --- | --- |
| Абзац | `.oe-paragraph` |
| Заголовок | `.oe-heading` |
| Список | `.oe-list` |
| Цитата | `.oe-quote` |
| Код | `.oe-code-wrap` |
| Изображение | `.oe-image` |
| Галерея | `.oe-gallery` |
| Карусель | `.oe-carousel-block` |
| Встраиваемый материал | `.oe-embed` |
| Таблица | `.oe-table-wrapper` |
| Вложения | `.oe-attaches` |
| Контрольный список | `.oe-checklist` |
| Сворачиваемый блок | `.oe-toggle` |
| Колонки | `.oe-columns` |
| Скрытое содержимое | `.oe-spoiler` |
| Предупреждение | `.oe-warning` |
| Разделитель | `.oe-delimiter` |
| Опрос | `.oe-poll` |
| Персона | `.oe-person` |
| Предварительный просмотр ссылки | `.oe-lp` |
| Произвольный HTML | `.oe-raw` |

```css
.article-editor .oe-paragraph {
  max-width: 72ch;
}

.article-editor .oe-heading--h2 {
  margin-block-start: 2.5rem;
  font-size: 2rem;
}
```

Не опирайтесь на сгенерированные идентификаторы, глубину DOM, временное положение панели и недокументированные классы. Это детали реализации.

## Владение стилями плагина

Пользовательский плагин объявляет URL своих таблиц на конструкторе:

```js
export class Callout {
  static styles = [new URL('./callout.css', import.meta.url).href]
  type = 'callout'
}
```

Rector собирает `static styles` блочных плагинов и `styles` inline-плагинов в одного владельца с подсчётом ссылок. Экземпляр рендерера собирает массивы `styles` зарегистрированных рендереров. Не удаляйте подключённые `<link>` вручную.

Конструкторы встроенных плагинов принимают `injectStyles: false`, если приложение собирает CSS самостоятельно. Необязательная строка `css` добавляет один URL таблицы стилей приложения после стандартной или задаёт URL замены, когда стандартная инъекция отключена.

```js
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'

new Paragraph({
  injectStyles: false,
  css: new URL('./paragraph.application.css', import.meta.url).href,
})
```

Пользовательский плагин, принимающий те же параметры, должен возвращать конфигурацию конструктора через `getPluginConfig()`. Наследование от `BlockPluginAbstract` предоставляет такое поведение.

В этом режиме приложение отвечает за подключение всех необходимых таблиц стилей и за жизненный цикл принадлежащих ему ссылок или пакета стилей.

## CSS пользовательского плагина

Ограничивайте расширение одним устойчивым корневым классом и используйте переменные Rector для общих смыслов:

```css
.callout {
  padding: 1rem;
  color: var(--oe-text-1);
  background: var(--oe-card);
  border: 1px solid var(--oe-border);
  border-left: 3px solid var(--oe-accent);
  border-radius: var(--oe-radius);
}

.callout:focus-visible {
  outline: 2px solid var(--oe-border-focus);
  outline-offset: 2px;
}
```

Для необязательной анимации учитывайте настройку уменьшения движения и сохраняйте читаемый контраст текста в обеих встроенных темах.

## Стили рендерера

У итогового отображения отдельный жизненный цикл стилей. Не связывайте опубликованное содержимое с классами интерфейса редактора. При автоматическом режиме рендеринг лениво получает необходимые URL; уничтожение последнего результата или полный `renderer.destroy()` освобождает их.

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'

const renderer = createEditorRenderer({ classPrefix: 'article' })
renderer.renderTo(documentData, article)
renderer.destroy()
```

`classPrefix` меняет пространство имён результата. `renderer.injectStyles()` остаётся доступным, если стили нужно получить до первого рендеринга; он возвращает независимого владельца, который требуется уничтожить. В режиме сборщика импортируйте `@shelamkoff/rector/styles/renderer.css` и subpath каждого выбранного рендерера, затем создайте рендерер с `injectStyles: false`.
