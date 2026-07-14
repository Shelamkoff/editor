# Блочный плагин Gallery

Галерея изображений с макетами, подписями, настройками вида, сортировкой и параметрами просмотра.

## Установка и регистрация

```bash
npm install @shelamkoff/rector
```

```js
import { createEditor } from '@shelamkoff/rector'
import { Gallery } from '@shelamkoff/rector/plugins/gallery'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Gallery()],
})
```

Тип блока — `gallery`. Класс также экспортируется общей точкой входа `@shelamkoff/rector/plugins` и может загружаться по типу документа через `@shelamkoff/rector/plugins/async`.

## Данные

```json
{
  "images": [{ "url": "https://cdn.example/a.jpg", "caption": "A" }],
  "layout": "auto",
  "styles": { "gap": "8px", "borderRadius": "8px", "height": "420px" },
  "options": { "loop": true, "zoom": true, "navigation": true, "captions": true, "thumbnails": true, "fullscreen": true, "autoplayInterval": 0 }
}
```

Без `uploadFile` файлы сохраняются как URL со встроенными данными. Для полноэкранного просмотра нужен `@shelamkoff/expose`.

## Конфигурация

Каждый встроенный блочный плагин принимает два параметра владения стилями: `injectStyles?: boolean` по умолчанию равен `true`; укажите `false`, если приложение само включает CSS этого плагина. `css?: string` добавляет URL таблицы стилей приложения после стандартной, а при отключённой стандартной инъекции служит URL замены.

`uploadFile(file, { signal })` загружает каждый файл. Обработчики в `actions` получают `{ signal }` и возвращают массив объектов `{ url, alt? }` или `null`. Все обработчики должны учитывать переданный `AbortSignal`.

## Источники файлов приложения

Используйте `uploadFile` для браузерных объектов `File`, а `actions` — для материалов из медиатеки, облачного диска или другого каталога приложения. Одно действие может вернуть несколько изображений; весь выбор становится одним шагом отмены и повтора.

```js
const gallery = new Gallery({
  actions: [{
    label: 'Медиатека',
    async handler({ signal }) {
      const assets = await openMediaLibrary({
        accept: ['image/*'],
        multiple: true,
        signal,
      })
      return assets?.map(asset => ({
        url: asset.url,
        alt: asset.alt,
      })) ?? null
    },
  }],
})
```

При отмене выбора верните `null`. Необязательное поле `alt` заполняет подпись изображения. Для нескольких независимых источников добавьте несколько элементов в `actions`. Загрузка, отмена, проверка данных и общий адаптер описаны в разделе [«Источники файлов и медиатека»](https://shelamkoff.github.io/editor/ru/guide/file-sources).


## Возможности

Загрузка нескольких файлов; вставка с одной транзакцией истории; настройки макета и стилей; перетаскивание; пользовательские источники.

## История, жизненный цикл и стили

Действия плагина входят в конвейер команд через предоставленный контекст `mutate()`, поэтому одно завершённое действие создаёт один шаг отмены и повтора. Редактор подсчитывает владельцев объявленных URL стилей. Удаление блока вызывает его метод освобождения ресурсов; `editor.destroy()` освобождает оставшиеся блоки и общие ресурсы.

Не удаляйте контейнер редактора до вызова `editor.destroy()`.

## Вывод документа

Используйте фабричную функцию из `@shelamkoff/rector/renderer/renderers/gallery`. Последовательное руководство VitePress описывает проверку данных, миграции, разработку расширений, диагностику, безопасность и стили.
