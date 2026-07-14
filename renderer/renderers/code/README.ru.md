# Рендерер Code

Преобразует сохранённый блок `code` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createCodeRenderer } from '@shelamkoff/rector/renderer/renderers/code'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createCodeRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "code": "const value = 1", "language": "javascript" }
```

Код отображается как текст и при наличии модуля подсветки получает синтаксическое выделение. Обработчик кнопки копирования освобождается вместе с результатом. Рендерер объявляет одну таблицу стилей.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
