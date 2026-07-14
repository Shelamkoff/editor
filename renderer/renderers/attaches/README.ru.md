# Рендерер Attaches

Преобразует сохранённый блок `attaches` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createAttachesRenderer } from '@shelamkoff/rector/renderer/renderers/attaches'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createAttachesRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{
  "files": [{ "url": "https://cdn.example/a.pdf", "name": "a.pdf", "size": 1024, "extension": "pdf" }],
  "variant": "f"
}
```

Ссылки проходят политику URL для загрузок. Создание архива, отмена запросов, объектные URL и элементы управления принадлежат блоку и освобождаются в `destroy()`. Рендерер объявляет одну таблицу стилей.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
