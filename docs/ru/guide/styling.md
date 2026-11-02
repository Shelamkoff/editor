# Стили

Rector v2 рассматривает стили как ресурсы с явным владельцем. CSS ядра и стили расширений объявляются URL и подключаются reference-counted реестром в документе, которому принадлежит редактор.

## Автоматические стили

При стандартном `injectStyles: true` `createEditor()` подключает:

- переменные ядра и выбранную light/dark тему;
- URL из `styles` каждого block definition;
- URL из `styles` каждого inline definition.

Несколько редакторов в одном документе используют одну ссылку на URL. Она удаляется только после уничтожения последнего владельца.

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'

const editor = createEditor({
  holder,
  plugins: [createParagraphPlugin()],
  theme: 'dark',
})
```

## Ручной режим стилей

Используйте `injectStyles: false` уровня редактора, если CSS собирает host:

```js
const editor = createEditor({
  holder,
  plugins: [createParagraphPlugin({ injectStyles: false })],
  injectStyles: false,
})
```

В ручном режиме Rector не подключает ни core, ни definition styles. Нужные файлы импортирует host. Встроенная фабрика, поддерживающая собственный `injectStyles`, может дополнительно убрать свой URL из definition.

## Встроенный HTML-контент

Передайте `contentStyles: readonly string[]` в `createEditor()` и `EditorRenderer`, чтобы задать самостоятельный CSS-текст приложения для Raw и HTML-слайдов Carousel. Например: `contentStyles: ['body { font: 20px sans-serif; } .article-accent { color: #12549c; }']`. Эти стили применяются и при `injectStyles:false`: этот параметр управляет автоматическим подключением стилей интерфейса.

Контент использует собственный документ без выполнения сценариев, занимает доступную ширину и растёт по содержимому. Таблицы стилей и классы страницы автоматически не копируются. При переносе темы передайте нужные правила контента через `contentStyles`. Единицы размеров области просмотра считаются от окна страницы; явно заданные области прокрутки содержимого остаются рабочими. Исходный HTML в авторской записи сохраняется.

## Классы inline-контента

Тот же `contentStyles` задаёт оформление rich text и завершённых производных представлений авторского текста. `:scope` обозначает отдельное поле контента. Например: `contentStyles: [':scope { font-size:20px; } :scope span.article-accent, :scope code.article-accent { color:#12549c; font-size:1.5em; }']`. Сохраняются обычные специфичность и каскад CSS. Переносите правила страницы с эквивалентной специфичностью, иначе стандартные стили библиотеки могут иметь приоритет. Этот доверенный CSS задаёт приложение; допустимые свойства авторского атрибута `style` по-прежнему ограничены.

Классы авторских элементов `span` и `code` сохраняют исходную HTML-запись в данных. В живом DOM их атрибут использует приватное пространство имён, поэтому обычные классовые селекторы страницы не включают правила интерфейса. Для наблюдения за DOM используйте `span[*|class~="article-accent"]` и `getAttribute('class')`; `classList` и обычный запрос `.article-accent` относятся к пространству классов интерфейса. Поля редактора остаются плоским DOM с нативным выделением; CSS контента не оборачивает и не обрезает глифы.

Стили принадлежат фактическому документу и освобождаются вместе с владельцем. `renderTo(data, foreignContainer)` использует документ контейнера. При переносе отдельного результата `renderBlock()` в другой документ получите там существующий дескриптор `renderer.injectStyles(targetDocument)` и освободите его после использования. Стили страницы автоматически не копируются.

Для живого DOM используйте `setSanitizedHtml()`, `insertSanitizedHtml()` или предоставленный парсер. `sanitizeHtml()` и `normalizeRichText()` остаются строковыми API канонического HTML: строка не переносит пространство имён живого атрибута. Повторный разбор через собственный `innerHTML` возвращает обычные классы; такое представление должно самостоятельно обеспечивать выбранную границу контента.

## Стили расширения

Пользовательское block definition публикует неизменяемые URL:

```js
export function createCalloutPlugin() {
  return Object.freeze({
    type: 'callout',
    label: Object.freeze({ key: 'title', fallback: 'Callout' }),
    icon: '<svg viewBox="0 0 24 24">...</svg>',
    styles: Object.freeze([
      new URL('./callout.css', import.meta.url).href,
    ]),
    schema,
    capabilities,
    setup,
  })
}
```

Стили интерфейса расширения задаются опубликованными URL определения; ядро не читает приватное состояние фабрики. Отдельный параметр `contentStyles` выше задаёт доверенный CSS контента и не берётся из сохранённого HTML или флагов атрибута `sandbox`.

## Стабильные селекторы

Оболочками редактора и блоков владеет ядро. К стабильным верхнеуровневым селекторам относятся:

- `.oe-editor`
- `.oe-blocks`
- `.oe-block`
- `.oe-toolbar`
- `.oe-toolbox`
- `.oe-settings-menu`
- `.oe-inline-toolbar`

Встроенные плагины документируют собственные корни, например `.oe-carousel-block`, `.oe-gallery`, `.oe-image` и `.oe-poll`.

Нельзя использовать DOM блока как состояние приложения. Host работает со снимками и ID из `editor.blocks`; проекция DOM может быть заменена после render, conversion, history replay, read-only перехода или schema-driven update.

## Темы

Корень редактора получает `.oe-theme-light` либо `.oe-theme-dark`. Переменные объявлены в `core/themes/variables.css`, а light/dark файлы задают значения.

CSS расширения должен использовать переменные `--oe-*`, а не дублировать цвета темы.

## Стили renderer

Владение стилями editor и renderer независимо. `EditorRenderer` подключает URL `styles` зарегистрированных block/inline renderers, пока его собственный `injectStyles` не отключён. Уничтожение renderer или owner освобождает ссылки.

## Безопасность CSS

Ограничивайте CSS расширения его корневым классом. Не применяйте селекторы к произвольному DOM приложения и не используйте CSS-состояние как сериализованные данные. Единственным persistence source остаётся канонический документ.
