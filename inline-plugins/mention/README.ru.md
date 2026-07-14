# Внутристрочный плагин упоминаний

Поиск упоминаний по символу активации с клавиатурной навигацией, постраничной загрузкой по курсору, пользовательским отображением и устойчивым идентификатором.

## Регистрация

```js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'
import '@shelamkoff/rector/styles/editor.css'

const mention = createMentionPlugin({
  async searchFunction(query, nextPageUrl, { signal }) {
    const response = await fetch(nextPageUrl ?? `/api/people?q=${encodeURIComponent(query)}`, { signal })
    return response.json() // { items, nextPageUrl?: string | null } or MentionItem[]
  },
})

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
  inlinePlugins: [mention],
})
```

## Параметры

- `trigger` по умолчанию равен `@`;
- `searchFunction(query, nextPageUrl, { signal })` возвращает массив или `{ items, nextPageUrl? }`; для первой страницы второй аргумент равен `null`, а сигнал отменяется, когда запрос устаревает;
- `debounceDelay`, `noResultsText`, `dropdownClass` меняют поведение и представление;
- `onMentionSelect` наблюдает подтверждённый выбор;
- `renderItem`, `renderNoResults`, `renderLoading` могут вернуть `HTMLElement`.

Элемент требует `id` и `name`. Необязательные аватар, подробности и поля приложения доступны функции `renderItem`, но не сохраняются. В документ и обратный вызов попадают только `{ id, name }`; идентификатор нормализуется в строку. Для отображения передайте `createMentionWidget()` в `inlinePlugins` конфигурации рендерера. Плагин подавляет устаревшие результаты и отменяет запрос через `AbortSignal` при новом поиске, закрытии всплывающего окна и `editor.destroy()`; обработчик должен передать сигнал сетевому клиенту. При уничтожении редактора также удаляются всплывающее окно, таймеры и состояние.
