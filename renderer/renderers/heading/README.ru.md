# Рендерер Heading

Преобразует сохранённый блок `heading` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createHeaderRenderer } from '@shelamkoff/rector/renderer/renderers/heading'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createHeaderRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "text": "Раздел", "level": 2 }
```

Поле `text` проходит общий обработчик внутристрочной разметки, а проверенное значение `level` определяет элемент заголовка. Выравнивание блока хранится в `block.tunes.textAlign`, а не в данных заголовка. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
