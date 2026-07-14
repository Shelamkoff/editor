# Источники файлов и медиатека

Rector не предполагает наличие сервера, определённого хранилища или готового интерфейса медиатеки. Плагин с файлами передаёт сохранение и выбор из источников приложения обработчикам, указанным при создании плагина.

## Две разные точки интеграции

`uploadFile` обрабатывает объект `File`, выбранный на устройстве либо полученный через вставку или перетаскивание. Обработчик должен сохранить файл и вернуть общедоступный адрес, который попадёт в документ.

`actions` добавляет источники приложения: медиатеку, облачный диск, каталог изображений или систему управления цифровыми материалами. Каждое действие открывает интерфейс приложения и возвращает уже выбранные сериализуемые элементы. `Image`, `Gallery`, `CarouselBlock` и `Attaches` показывают настроенные действия и до выбора первого элемента, и в панели заполненного блока. `Embed` показывает их в панели обложки после ввода поддерживаемого адреса видео.

| Плагин | Результат `uploadFile` | Результат одного `actions[].handler` |
| --- | --- | --- |
| `Image` | `{ url, alt? }` | `{ url, alt? } \| null` |
| `Gallery` | `{ url, alt? }` для каждого файла | `Array<{ url, alt? }> \| null` |
| `CarouselBlock` | `{ url, poster? }` для каждого изображения или видео | `CarouselSlide[] \| null` |
| `Embed` | `{ url }` для заменяемой обложки | `{ url } \| null` |
| `Attaches` | `{ url, size? }` для каждого файла | `Array<{ url, name, size?, extension? }> \| null` |

`Person` использует отдельный процесс выбора и кадрирования аватара и намеренно не входит в этот общий контракт источников.

## Адаптер медиатеки

Следующий адаптер относится к приложению. `openMediaLibrary()` может показать любое модальное окно, обратиться к любому API и вернуть выбор пользователя. Rector отвечает только за контракт обработчика и изменение документа.

```js
import { Image } from '@shelamkoff/rector/plugins/image'
import { Gallery } from '@shelamkoff/rector/plugins/gallery'
import { CarouselBlock } from '@shelamkoff/rector/plugins/carousel'

const mediaLibraryAction = {
  label: 'Медиатека',
  async handler({ signal }) {
    const selection = await openMediaLibrary({
      accept: ['image/*', 'video/*'],
      multiple: true,
      signal,
    })
    if (!selection || signal.aborted) return null
    return selection
  },
}

const image = new Image({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      const item = items?.find(candidate => candidate.type === 'image')
      return item ? { url: item.url, alt: item.alt } : null
    },
  }],
})

const gallery = new Gallery({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      return items?.filter(item => item.type === 'image')
        .map(item => ({ url: item.url, alt: item.alt })) ?? null
    },
  }],
})

const carousel = new CarouselBlock({
  actions: [{
    ...mediaLibraryAction,
    async handler(context) {
      const items = await mediaLibraryAction.handler(context)
      return items?.map(item => item.type === 'html'
        ? {
            id: item.id,
            type: 'html',
            html: item.html,
            caption: item.caption,
          }
        : {
            id: item.id,
            type: item.type,
            src: item.url,
            alt: item.alt,
            poster: item.poster,
            caption: item.caption,
          }) ?? null
    },
  }],
})
```

Значок действия необязателен. Если он нужен, передавайте разметку из той же доверенной библиотеки значков, которую использует приложение; не помещайте пользовательский HTML в `icon`.

## Загрузка файлов с устройства

```js
const image = new Image({
  async uploadFile(file, { signal }) {
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/media', {
      method: 'POST',
      body,
      signal,
    })
    if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`)

    const asset = await response.json()
    return { url: asset.url, alt: asset.alt }
  },
})
```

Без `uploadFile` плагины `Image` и `Gallery` используют адреса со встроенными данными. `CarouselBlock` использует их для изображений и временные объектные адреса для видео. `Attaches` также использует временные объектные адреса. Они освобождаются при очистке и не образуют постоянный документ; для содержимого, которое должно пережить перезагрузку, настройте `uploadFile`.

## Примеры для отдельных плагинов

### Карусель

```js
new CarouselBlock({
  uploadFile: persistCarouselFile,
  actions: [{
    label: 'Медиатека',
    async handler({ signal }) {
      return await chooseCarouselSlides({ signal })
      // изображение: { id, type: 'image', src, alt?, caption? }
      // видео:       { id, type: 'video', src, poster?, caption? }
      // HTML:        { id, type: 'html', html, caption? }
    },
  }],
})
```

Каждому слайду нужен устойчивый уникальный `id`. Rector очищает адреса медиафайлов и HTML до сохранения. Одно действие может вернуть несколько слайдов разных типов; завершённый выбор записывается как один шаг отмены.

### Прикреплённые файлы

```js
import { Attaches } from '@shelamkoff/rector/plugins/attaches'

new Attaches({
  uploadFile: persistDownload,
  actions: [{
    label: 'Библиотека файлов',
    async handler({ signal }) {
      const files = await chooseDownloads({ signal })
      return files?.map(file => ({
        url: file.downloadUrl,
        name: file.name,
        size: file.size,
        extension: file.extension,
      })) ?? null
    },
  }],
})
```

Для прикреплённого файла из источника приложения поле `name` обязательно. `size` и `extension` необязательны; если расширение пропущено, оно определяется из `name`.

### Обложка видео

`Embed` использует `uploadFile` и `actions` только для обложки. Само видео выбирается по поддерживаемому адресу YouTube или Vimeo.

## Отмена, история и проверка

- Каждый обработчик получает `AbortSignal`. Передавайте его в `fetch` и закрывайте либо игнорируйте интерфейс приложения после отмены сигнала.
- Запоздалый результат игнорируется после уничтожения или замены блока либо после начала нового жизненного цикла представления.
- Сообщайте об ошибках источника из кода приложения, чтобы оно могло показать обратную связь или отправить диагностические данные. При ошибке отклоняйте промис, а при штатной отмене возвращайте `null`: в обоих случаях плагин не меняет документ, но приложение не должно использовать внутреннее журналирование плагина как канал обработки ошибок.
- Один завершённый выбор становится одним шагом отмены и повтора, даже если он возвращает несколько изображений галереи, слайдов или прикреплённых файлов.
- Возвращённые адреса проверяются политикой медиафайлов или скачивания соответствующего плагина. Приложение всё равно обязано проверять права доступа, тип и размер файла, вредоносное содержимое и правила доступа на своей границе доверия.
- Если сохранённый документ будет открыт в другом сеансе или рендерере, обработчик должен возвращать постоянные адреса.

## Выбор точки интеграции

Используйте `uploadFile`, когда исходное значение является браузерным объектом `File`. Используйте `actions`, когда материал уже находится в каталоге приложения. Настройте оба механизма, если в одном блоке нужны и загрузка с устройства, и медиатека.
