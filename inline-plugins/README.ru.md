# Внутристрочные плагины

Внутристрочные плагины сохраняют структурированные данные внутри текста, не превращая их в непрозрачный HTML. Rector записывает устойчивый заполнитель `{{widgetId}}` в текстовое поле и соответствующий объект `{ type, data }` в карту `inline` блока.

## Встроенные плагины

| Плагин | Точка входа | Назначение |
| --- | --- | --- |
| [Образец цвета](./color/README.ru.md) | `@shelamkoff/rector/inline-plugins/color` | Сохраняемый образец с редактируемым значением цвета |
| [Упоминание](./mention/README.ru.md) | `@shelamkoff/rector/inline-plugins/mention` | Поиск и вставка сущности из источника приложения |

## Регистрация

```js
import { createEditor } from '@shelamkoff/rector'
import { createColorSwatchPlugin } from '@shelamkoff/rector/inline-plugins/color'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'

const editor = createEditor({
  holder,
  plugins,
  inlinePlugins: [
    createColorSwatchPlugin(),
    createMentionPlugin({
      searchFunction: async query => searchPeople(query),
    }),
  ],
})
```

Внутристрочный плагин — неизменяемый `InlinePluginDefinition`: он содержит версионируемую `schema`, необязательные возможности `paste`, `editing`, `insertion` и trigger, а также фабрику `setup()`. Runtime каждого редактора создаёт экземпляры виджетов через `create(id, initial, context)`. Изменение данных выполняется через `context.updateData()`, а устойчивый ID виджета принадлежит модели документа.

Интерактивные изменения выполняются через предоставленный Rector контекст изменения, чтобы одно завершённое действие создавало один шаг отмены. DOM всплывающего элемента, таймеры, запросы, обработчики событий и объектные URL освобождаются в жизненном цикле плагина.

Полный контракт, правила безопасности, соответствующий рендерер, граница истории и жизненный цикл описаны в последовательном руководстве VitePress.
