# Рендерер Raw

Преобразует сохранённый блок `raw` в принадлежащий рендереру DOM.

Синхронная точка входа `@shelamkoff/rector/renderer` включает все встроенные рендереры, поэтому до её импорта установите `@shelamkoff/carousel` и `@shelamkoff/expose`. Значение `blockTypes: []` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

```js
import { EditorRenderer } from '@shelamkoff/rector/renderer'
import { createRawRenderer } from '@shelamkoff/rector/renderer/renderers/raw'

const renderer = new EditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(createRawRenderer('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
```

## Типичные данные

```json
{ "html": "<section>Содержимое</section>" }
```

Поле `html` проходит отдельный очиститель произвольного HTML и отображается в документе без выполнения сценариев; обработчик внутристрочной разметки намеренно не используется. Результат владеет фреймом, измерением и обработчиками разрешённых ссылок и освобождает их в `destroy()`. Автоматические таблицы стилей не объявляются. CSS приложения передаётся через `EditorRenderer({ contentStyles: ['body { font: 20px sans-serif; }'] })`; таблицы стилей страницы автоматически не наследуются. Фрейм растёт по содержимому, а единицы размеров области просмотра считаются от окна страницы. Рендеринг не переписывает исходный HTML в записи.

Если рендерер объявляет стили, показанный выше явный вызов `EditorRenderer.injectStyles()` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
