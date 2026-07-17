# Рендерер Embed

Преобразует сохранённый блок `embed` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { createEmbedRenderer } from '@shelamkoff/rector/renderer/renderers/embed'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createEmbedRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "service": "youtube", "videoId": "dQw4w9WgXcQ", "caption": "Подпись", "cover": "", "title": "", "duration": "" }
```

Канонический контракт сохраняемых данных, общий для редактора и рендерера, приведён в [справочнике полей плагина встраиваемого содержимого](../../../plugins/embed/README.ru.md#поля-данных).

Общий модуль плеера создаёт вывод только для поддерживаемых сервисов, а подпись проходит обработчик внутристрочной разметки. Обработчик запуска освобождается вместе с результатом. Рендерер объявляет одну таблицу стилей.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
