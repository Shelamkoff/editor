# Рендерер Warning

Преобразует сохранённый блок `warning` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createWarningRenderer } from '@shelamkoff/rector/renderer/renderers/warning'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createWarningRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "title": "Note", "message": "Important details" }
```

Заголовок и сообщение проходят общий обработчик внутристрочной разметки. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
