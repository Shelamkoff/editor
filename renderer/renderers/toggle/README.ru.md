# Рендерер Toggle

Преобразует сохранённый блок `toggle` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createToggleRenderer } from '@shelamkoff/rector/renderer/renderers/toggle'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createToggleRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "title": "Details", "content": "Hidden text", "open": false }
```

Заголовок и содержимое проходят общий обработчик внутристрочной разметки, а раскрытие использует нативный элемент `details`. Рендерер объявляет одну таблицу стилей и не создаёт собственных обработчиков или сторонних экземпляров.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
