# Блочный плагин Person

Одна или несколько карточек профиля с обрезанным аватаром, биографией, ролью и ссылками.

## Установка и регистрация

```bash
npm install @shelamkoff/rector @shelamkoff/cropper
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Person } from '@shelamkoff/rector/plugins/person'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Person()],
})
```

Тип блока — `person`. Класс также экспортируется общей точкой входа `@shelamkoff/rector/plugins` и может загружаться по типу документа через `@shelamkoff/rector/plugins/async`.

## Данные

```json
{
  "persons": [{
    "avatar": "https://cdn.example/ada.jpg",
    "name": "Ada",
    "role": "Author",
    "bio": "",
    "links": [{ "type": "website", "url": "https://example.com" }]
  }]
}
```

Для обработки аватара нужен `@shelamkoff/cropper`, а для нескольких карточек в рендерере — `@shelamkoff/carousel`.

## Конфигурация

Каждый встроенный блочный плагин принимает два параметра владения стилями: `injectStyles?: boolean` по умолчанию равен `true`; укажите `false`, если приложение само включает CSS этого плагина. `css?: string` добавляет URL таблицы стилей приложения после стандартной, а при отключённой стандартной инъекции служит URL замены.

`uploadFile(file, { signal })` загружает `avatar.webp` и должен учитывать переданный `AbortSignal`. Возвращённый URL проходит общую политику адресов медиафайлов. `socialResolvers` расширяет определение типа и значка ссылки.


## Возможности

Несколько профилей; сортировка вкладок; обрезка и загрузка аватара; ссылки; детерминированное освобождение ресурсов диалога.

## История, жизненный цикл и стили

Действия плагина входят в конвейер команд через предоставленный контекст `mutate()`, поэтому одно завершённое действие создаёт один шаг отмены и повтора. Редактор подсчитывает владельцев объявленных URL стилей. Удаление блока вызывает его метод освобождения ресурсов; `editor.destroy()` освобождает оставшиеся блоки и общие ресурсы.

Не удаляйте контейнер редактора до вызова `editor.destroy()`.

## Вывод документа

Используйте фабричную функцию из `@shelamkoff/rector/renderer/renderers/person`. Последовательное руководство VitePress описывает проверку данных, миграции, разработку расширений, диагностику, безопасность и стили.
