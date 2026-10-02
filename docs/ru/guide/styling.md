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

Не передавайте сырые CSS-строки как runtime-конфигурацию и не заставляйте ядро читать приватное состояние фабрики. Декларативным контрактом является само definition.

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
