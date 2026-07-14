import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const blocks = [
  {
    path: 'paragraph', className: 'Paragraph', type: 'paragraph',
    description: 'Editable rich-text paragraph with alignment, inline tools, inline widgets, merge, and block conversion support.',
    data: `{ "text": "Hello <strong>world</strong>", "align": "left" }`,
    options: '`placeholder?: string` overrides the empty paragraph prompt.',
    notes: '`align` accepts `left`, `center`, `right`, or `justify`. `text` contains sanitized inline HTML and may contain inline-widget placeholder tokens while serialized.',
    capabilities: 'Inline tools and widgets; paragraph merge; export for conversion.',
  },
  {
    path: 'heading', className: 'Heading', type: 'heading',
    description: 'Heading levels 2-6 with alignment, inline formatting, inline widgets, shortcuts, and level controls.',
    data: `{ "text": "Section", "level": 2, "align": "left" }`,
    notes: '`level` accepts integers from `2` through `6`; `align` accepts `left`, `center`, or `right`.',
    capabilities: 'Inline tools and widgets; heading-tag paste; keyboard shortcuts; level changes; export for conversion.',
  },
  {
    path: 'list', className: 'List', type: 'list',
    description: 'Ordered and unordered rich-text lists with keyboard indentation behavior.',
    data: `{ "style": "unordered", "items": ["One", "Two"] }`,
    notes: '`style` is `ordered` or `unordered`. Every item uses the shared sanitized inline-markup and inline-widget contract. When only part of a list is converted, selected items are removed from the source list, ordered items are renumbered, and the new block is inserted immediately after the list. A text target receives the selected inline markup; a non-text target starts with its own default data.',
    capabilities: 'Inline tools and widgets; ordered/unordered toolbox entries; list paste; merge; whole-block conversion; data-aware partial-selection conversion.',
  },
  {
    path: 'quote', className: 'Quote', type: 'quote',
    description: 'Quotation text with an optional caption.',
    data: `{ "text": "Quote", "caption": "Author" }`,
    notes: 'Both `text` and `caption` participate in inline-widget marshaling.',
    capabilities: 'Inline tools and widgets; blockquote paste; merge; export for conversion.',
  },
  {
    path: 'code', className: 'Code', type: 'code',
    description: 'Code block with a language selector and optional syntax highlighting.',
    data: `{ "code": "const value = 1", "language": "javascript" }`,
    options: '`hljs?: object` supplies a compatible highlight.js instance. Without it the bundled highlighting runtime is loaded lazily; if highlighting is unavailable, code remains readable as plain text.',
    notes: 'Code is handled as text, not executable HTML.',
    capabilities: 'Code/pre tag paste; fenced-code pattern paste; language selection; export for conversion.',
  },
  {
    path: 'image', className: 'Image', type: 'image',
    description: 'Uploadable image with caption, sizing, border, background, and object-fit controls.',
    data: `{\n  "file": { "url": "https://cdn.example/image.jpg" },\n  "caption": "Caption",\n  "withBorder": false,\n  "expanded": false,\n  "withBackground": false,\n  "styles": { "objectFit": "cover", "borderRadius": "8px" }\n}`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; alt?: string }>` uploads a file. `actions?: Array<{ icon?; label; handler(context: { signal: AbortSignal }): Promise<{ url: string; alt?: string } | null> }>` adds application media sources. Both callbacks must stop work when the supplied signal is aborted.',
    notes: 'Without `uploadFile`, local files are stored as data URLs. Validate file size/type in application code before remote upload. Callback results are accepted only when `url` passes the shared media URL policy.',
    capabilities: 'Image-file and URL paste; async paste transaction; settings; custom media actions; deterministic cleanup.',
  },
  {
    path: 'delimiter', className: 'Delimiter', type: 'delimiter',
    description: 'A visual section separator with no content payload.',
    data: `{}`,
    notes: 'The serialized `data` object is always empty.',
    capabilities: 'Toolbox insertion and document rendering.',
  },
  {
    path: 'table', className: 'Table', type: 'table',
    description: 'Editable table with an optional heading row.',
    data: `{ "withHeadings": true, "content": [["Name", "Value"], ["A", "1"]] }`,
    notes: '`content` is a rectangular array of rows. Cells store sanitized inline HTML; table cells do not currently marshal inline widgets.',
    capabilities: 'Inline formatting; row/column editing; heading-row setting; table paste; export for conversion.',
  },
  {
    path: 'checklist', className: 'Checklist', type: 'checklist',
    description: 'Checklist with independently checked rich-text items.',
    data: `{ "items": [{ "text": "Ship", "checked": false }] }`,
    notes: 'Each item has a string `text` and boolean `checked`; item text supports inline tools and inline widgets.',
    capabilities: 'Inline tools and widgets; item add/remove/toggle; merge; export for conversion.',
  },
  {
    path: 'warning', className: 'Warning', type: 'warning',
    description: 'Callout block with editable title and message fields.',
    data: `{ "title": "Note", "message": "Important details" }`,
    notes: 'Both fields are serialized as strings.',
    capabilities: 'Inline formatting; editable title/message; merge; validation; export for conversion.',
  },
  {
    path: 'embed', className: 'Embed', type: 'embed',
    description: 'YouTube and Vimeo embed block with caption, cover image, and preview metadata.',
    data: `{ "service": "youtube", "videoId": "dQw4w9WgXcQ", "caption": "Caption", "cover": "", "title": "", "duration": "" }`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>` uploads a cover. `actions?: Array<{ icon?; label; handler(context: { signal: AbortSignal }): Promise<{ url: string } | null> }>` adds application cover sources. `resolvePreview?: false | (request) => Promise<{ thumbnailUrl: string; title?: string } | null>` overrides Vimeo preview resolution; `false` disables it. `previewTimeoutMs?: number` defaults to 5000 ms.',
    notes: 'Upload, action, and preview callbacks receive an `AbortSignal` and must stop work when it is aborted. The preview request is `{ service: "vimeo", videoId, url, signal }`. Only supported provider URLs and media URLs accepted by the shared policy are used.',
    capabilities: 'YouTube/Vimeo URL paste; cover upload; cancellable preview resolution; settings and cleanup.',
  },
  {
    path: 'raw', className: 'Raw', type: 'raw',
    description: 'Raw HTML authoring block.',
    data: `{ "html": "<section>Content</section>" }`,
    notes: 'HTML stays inert in the editable surface. The matching renderer sanitizes it before mounting; application-specific trust policy still belongs to the host.',
    capabilities: 'Raw text editing; sandboxed editor preview; sanitized document rendering.',
  },
  {
    path: 'gallery', className: 'Gallery', type: 'gallery',
    description: 'Multi-image gallery with layouts, captions, appearance settings, reordering, and viewer options.',
    data: `{\n  "images": [{ "url": "https://cdn.example/a.jpg", "caption": "A" }],\n  "layout": "auto",\n  "styles": { "gap": "8px", "borderRadius": "8px", "height": "420px" },\n  "options": { "loop": true, "zoom": true, "navigation": true, "captions": true, "thumbnails": true, "fullscreen": true, "autoplayInterval": 0 }\n}`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; alt?: string }>` uploads each file. `actions?: Array<{ icon?; label; handler(context: { signal: AbortSignal }): Promise<Array<{ url: string; alt?: string }> | null> }>` adds application media sources. Both callbacks must stop work when the supplied signal is aborted.',
    notes: 'Without `uploadFile`, local files become data URLs. Callback results are accepted only when `url` passes the shared media URL policy. The viewer requires `@shelamkoff/expose`.',
    capabilities: 'Multi-file upload; image-file paste with an async transaction; layout/style controls; drag reordering; custom media actions.',
  },
  {
    path: 'carousel', className: 'CarouselBlock', type: 'carousel',
    description: 'Mixed image, video, and sanitized HTML slides with navigation, pagination, thumbnails, autoplay, and ordering controls.',
    data: `{
  "slides": [
    { "id": "cover", "type": "image", "src": "https://cdn.example/cover.jpg", "alt": "Cover", "caption": "Opening slide" },
    { "id": "clip", "type": "video", "src": "https://cdn.example/clip.mp4", "poster": "https://cdn.example/poster.jpg", "caption": "Video" },
    { "id": "note", "type": "html", "html": "<strong>Sanitized HTML</strong>" }
  ],
  "options": { "loop": true, "autoplay": false, "autoplayDelay": 5000, "navigation": true, "pagination": true, "thumbnails": false, "aspectRatio": "16 / 9" }
}`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; poster?: string }>` persists image or video files. `actions?: Array<{ icon?; label; handler({ signal }): Promise<CarouselSlide[] | null> }>` adds application-provided slide sources. Both callbacks must respect the supplied abort signal.',
    notes: 'Every slide requires a stable `id` and a `type` of `image`, `video`, or `html`. Media sources pass the shared URL policy; HTML is sanitized. Without `uploadFile`, images become data URLs and videos use temporary object URLs, so persistent video documents require an uploader. The document renderer requires `@shelamkoff/carousel`.',
    capabilities: 'Image/video upload; URL and sanitized-HTML slides; add/remove/reorder; loop, autoplay, navigation, pagination, thumbnail, delay, and aspect-ratio controls; cancellable application actions and uploads.',
  },
  {
    path: 'attaches', className: 'Attaches', type: 'attaches',
    description: 'One or more downloadable files with selectable presentation variants.',
    data: `{\n  "files": [{ "url": "https://cdn.example/a.pdf", "name": "a.pdf", "size": 1024, "extension": "pdf" }],\n  "variant": "f"\n}`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string; size?: number }>` persists a selected browser file. `actions?: Array<{ icon?; label; handler({ signal }): Promise<Array<{ url; name; size?; extension? }> | null> }>` adds application file sources such as a media library. Both callbacks must respect the supplied abort signal.',
    notes: '`variant` accepts `a`, `b`, `f`, or `g`. Legacy input with a single `file` object is read, but saves use the `files` array. Callback URLs must pass the shared download URL policy. Without `uploadFile`, selected files use temporary object URLs; configure an uploader for data that must survive cleanup or page reload.',
    capabilities: 'Multiple files; device upload and application sources; editable names; presentation variants; listener/object-URL cleanup; stale results are ignored after disposal.',
  },
  {
    path: 'link-preview', className: 'LinkPreview', type: 'linkPreview',
    description: 'Bookmark preview with seven visual templates and optional application-provided metadata.',
    data: `{\n  "url": "https://example.com",\n  "title": "Example",\n  "description": "",\n  "image": "",\n  "favicon": "",\n  "domain": "example.com",\n  "template": "notion"\n}`,
    options: '`fetchMeta?: (url: string, context: { signal: AbortSignal }) => Promise<{ title?: string; description?: string; image?: string; favicon?: string; domain?: string }>` resolves metadata in application code and must stop work when the supplied signal is aborted.',
    notes: '`template` accepts `horizontal`, `compact`, `large-top`, `minimal`, `twitter`, `notion`, or `split`. Only HTTP(S) links are accepted. Returned image and favicon addresses pass the shared media URL policy.',
    capabilities: 'URL paste; async metadata; template selector; safe URL assignment and cleanup.',
  },
  {
    path: 'toggle', className: 'Toggle', type: 'toggle',
    description: 'Collapsible block with editable title, rich content, and persistent open state.',
    data: `{ "title": "Details", "content": "Hidden text", "open": false }`,
    notes: '`open` is serialized so the renderer can preserve the chosen initial state.',
    capabilities: 'Inline formatting; editable title/content; merge; persistent disclosure state; keyboard-accessible renderer.',
  },
  {
    path: 'columns', className: 'Columns', type: 'columns',
    description: 'Two- or three-column rich-content layouts.',
    data: `{ "columns": [{ "content": "Left" }, { "content": "Right" }], "layout": "1-1" }`,
    notes: '`layout` accepts `1-1`, `1-2`, `2-1`, or `1-1-1`. The number of columns must match the selected layout.',
    capabilities: 'Layout controls; editable column content; validation and document rendering.',
  },
  {
    path: 'spoiler', className: 'Spoiler', type: 'spoiler',
    description: 'User-revealed hidden content with an editable label.',
    data: `{ "label": "Reveal", "content": "Spoiler text" }`,
    notes: 'The renderer supplies keyboard and expanded-state semantics.',
    capabilities: 'Inline formatting; editable label/content; merge; accessible disclosure.',
  },
  {
    path: 'poll', className: 'Poll', type: 'poll',
    description: 'Single- or multiple-choice poll with local results or an application-provided live data source.',
    data: `{
  "pollId": "release-survey",
  "question": "Which channel should receive the release?",
  "type": "single",
  "options": [{ "id": "stable", "text": "Stable" }, { "id": "next", "text": "Next" }],
  "resultsMode": "afterVote",
  "initialResults": { "total": 0, "options": [{ "id": "stable", "votes": 0 }, { "id": "next", "votes": 0 }] }
}`,
    options: '`dataSource?: PollDataSource` supplies `load`, `vote`, and optional `subscribe` callbacks for server-owned results. Every callback receives an `AbortSignal`; `vote` also receives the current `revision`. `compareRevisions?: (next, current) => number` orders opaque revision strings when the backend can deliver updates out of order; without it, unequal revisions follow arrival order. `onError?: (error) => void` observes data-source failures. `maxVoters?: number` limits retained voter details.',
    notes: '`type` is `single` or `multiple`; `resultsMode` is `always`, `afterVote`, or `hidden`. Option ids are stable document identities. Without `dataSource`, votes update `initialResults` and enter undo/redo. With `dataSource`, live results, voter details, revisions, and the current user vote remain runtime state and are never serialized into editor history.',
    capabilities: 'Question and option editing; result visibility; option ordering; local voting; cancellable load/vote; live subscriptions; revision ordering; voter summaries; duplicate-submission protection and deterministic cleanup.',
  },
  {
    path: 'person', className: 'Person', type: 'person',
    description: 'One or more profile cards with cropped avatars, biography, role, and social links.',
    data: `{\n  "persons": [{\n    "avatar": "https://cdn.example/ada.jpg",\n    "name": "Ada",\n    "role": "Author",\n    "bio": "",\n    "links": [{ "type": "website", "url": "https://example.com" }]\n  }]\n}`,
    options: '`uploadFile?: (file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>` uploads the cropped avatar as `avatar.webp` and must stop work when the supplied signal is aborted. `socialResolvers?: Array<{ test: RegExp | ((url: string) => boolean); type: string; icon?: string }>` extends social-link icon resolution.',
    notes: 'Callback avatar URLs must pass the shared media URL policy. The editor plugin requires `@shelamkoff/cropper`. The multi-card renderer requires `@shelamkoff/carousel`.',
    capabilities: 'Multiple profiles; tab reordering; avatar crop/upload; social links and deterministic dialog cleanup.',
  },
]

const rendererFactory = {
  heading: 'createHeaderRenderer',
  carousel: 'createCarouselRenderer',
}

const fileSourceDocumentation = {
  image: `## Application file sources

Use \`uploadFile\` when the user selects a browser \`File\`. Use \`actions\` to add application-owned choices such as a media library, cloud drive, or stock catalog. Each action is shown both before an image is selected and in the controls of a populated block.

\`openMediaLibrary\` in this example belongs to the consuming application; Rector does not prescribe its UI or transport:

\`\`\`js
const image = new Image({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const asset = await openMediaLibrary({
        accept: ['image/*'],
        multiple: false,
        signal,
      })
      return asset ? { url: asset.url, alt: asset.alt } : null
    },
  }],
})
\`\`\`

Return \`null\` when selection is cancelled. A valid result replaces the image in one undo/redo step; \`alt\` initializes an empty caption. Multiple independent sources may be added as separate \`actions\` entries. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

`,
  gallery: `## Application file sources

Use \`uploadFile\` for browser \`File\` objects and \`actions\` for existing assets selected from a media library, cloud drive, or another application-owned catalog. An action may return several images; the complete selection becomes one undo/redo step.

\`\`\`js
const gallery = new Gallery({
  actions: [{
    label: 'Media library',
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
\`\`\`

Return \`null\` when selection is cancelled. The optional \`alt\` value initializes the image caption. Multiple independent sources may be added as separate \`actions\` entries. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

`,
  carousel: `## Application file sources

Use \`uploadFile\` for image or video \`File\` objects and \`actions\` for existing slides selected from a media library, cloud drive, or another application-owned catalog. One action may return mixed image, video, and HTML slides.

\`\`\`js
const carousel = new CarouselBlock({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const assets = await openMediaLibrary({
        accept: ['image/*', 'video/*', 'text/html'],
        multiple: true,
        signal,
      })
      return assets?.map(asset => asset.type === 'html'
        ? {
            id: asset.id,
            type: 'html',
            html: asset.html,
            caption: asset.caption,
          }
        : {
            id: asset.id,
            type: asset.type,
            src: asset.url,
            alt: asset.alt,
            poster: asset.poster,
            caption: asset.caption,
          }) ?? null
    },
  }],
})
\`\`\`

Every returned slide needs a stable, unique \`id\`. Media items use \`type: 'image' | 'video'\` and \`src\`; HTML items use \`type: 'html'\` and \`html\`. Return \`null\` when selection is cancelled. The complete selection becomes one undo/redo step. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

`,
  attaches: `## Application file sources

Use \`uploadFile\` for browser \`File\` objects and \`actions\` for existing downloads selected from a file library, cloud drive, or another application-owned catalog. An action may return several files in one selection.

\`\`\`js
const attaches = new Attaches({
  actions: [{
    label: 'File library',
    async handler({ signal }) {
      const assets = await openFileLibrary({ multiple: true, signal })
      return assets?.map(asset => ({
        url: asset.downloadUrl,
        name: asset.name,
        size: asset.size,
        extension: asset.extension,
      })) ?? null
    },
  }],
})
\`\`\`

\`url\` and \`name\` are required. \`size\` and \`extension\` are optional; the extension is inferred from \`name\` when omitted. Return \`null\` when selection is cancelled. The complete selection becomes one undo/redo step. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

`,
  embed: `## Application cover sources

\`uploadFile\` and \`actions\` apply to the video cover only; the video itself is selected with a supported YouTube or Vimeo URL. Use an action to add a media library, cloud drive, or another application-owned image source.

\`\`\`js
const embed = new Embed({
  actions: [{
    label: 'Media library',
    async handler({ signal }) {
      const asset = await openMediaLibrary({
        accept: ['image/*'],
        multiple: false,
        signal,
      })
      return asset ? { url: asset.url } : null
    },
  }],
})
\`\`\`

Return \`null\` when selection is cancelled. A valid result replaces the cover in one undo/redo step. Multiple independent cover sources may be added as separate \`actions\` entries. See [File sources and media libraries](https://shelamkoff.github.io/editor/guide/file-sources) for upload, cancellation, validation, and reusable adapter guidance.

`,
}

const rendererContracts = {
  paragraph: {
    en: 'The `text` field uses the shared inline parser, including supported inline widgets. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Поле `text` проходит общий обработчик внутристрочной разметки, включая поддерживаемые внутристрочные виджеты. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  heading: {
    en: 'The `text` field uses the shared inline parser; validated `level` and `align` values control the element and alignment. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Поле `text` проходит общий обработчик внутристрочной разметки; проверенные `level` и `align` определяют элемент и выравнивание. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  list: {
    en: 'Every item uses the shared inline parser. The renderer creates only ordered or unordered list markup, declares one stylesheet, and creates no listeners or external instances.',
    ru: 'Каждый пункт проходит общий обработчик внутристрочной разметки. Рендерер создаёт только нумерованный или маркированный список, объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  quote: {
    en: 'The `text` and `caption` fields use the shared inline parser. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Поля `text` и `caption` проходят общий обработчик внутристрочной разметки. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  code: {
    en: 'Code is rendered as text and optionally highlighted. The copy control owns a DOM-scoped listener released with the rendered root. The renderer declares one stylesheet.',
    ru: 'Код отображается как текст и при наличии модуля подсветки получает синтаксическое выделение. Обработчик кнопки копирования освобождается вместе с результатом. Рендерер объявляет одну таблицу стилей.',
  },
  image: {
    en: 'The image source uses the media URL policy and the caption uses the shared inline parser. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Адрес изображения проходит политику URL для медиафайлов, а подпись — общий обработчик внутристрочной разметки. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  delimiter: {
    en: 'The renderer creates a fixed separator and does not consume text, URLs, HTML, or the inline parser. It declares one stylesheet and creates no listeners or external instances.',
    ru: 'Рендерер создаёт фиксированный разделитель и не обрабатывает текст, URL, HTML или внутристрочную разметку. Он объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  table: {
    en: 'Every cell uses the shared inline parser and the validated rectangular shape controls the rows and columns. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Каждая ячейка проходит общий обработчик внутристрочной разметки, а проверенная прямоугольная структура определяет строки и столбцы. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  checklist: {
    en: 'Every item text uses the shared inline parser and checked state uses a native disabled checkbox. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Текст каждого пункта проходит общий обработчик внутристрочной разметки, а состояние представлено нативным недоступным для редактирования флажком. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  warning: {
    en: 'The title and message use the shared inline parser. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Заголовок и сообщение проходят общий обработчик внутристрочной разметки. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  embed: {
    en: 'The shared player builds output only for supported providers and the caption uses the inline parser. The play listener is released with the rendered root. The renderer declares one stylesheet.',
    ru: 'Общий модуль плеера создаёт вывод только для поддерживаемых сервисов, а подпись проходит обработчик внутристрочной разметки. Обработчик запуска освобождается вместе с результатом. Рендерер объявляет одну таблицу стилей.',
  },
  raw: {
    en: 'The `html` field uses the dedicated raw-HTML sanitizer; the inline parser is intentionally not used. The renderer creates no listeners or external instances and declares no stylesheet.',
    ru: 'Поле `html` проходит отдельный очиститель произвольного HTML; обработчик внутристрочной разметки намеренно не используется. Рендерер не создаёт обработчиков или сторонних экземпляров и не объявляет таблиц стилей.',
  },
  gallery: {
    en: 'Image sources use the media URL policy. The renderer owns its Expose viewers and image-readiness listeners; `destroy()` releases them. It declares gallery and Expose styles.',
    ru: 'Адреса изображений проходят политику URL для медиафайлов. Рендерер владеет экземплярами `Expose` и обработчиками готовности изображений; `destroy()` освобождает их. Он объявляет стили галереи и `Expose`.',
  },
  carousel: {
    en: 'Image and video sources use the media URL policy; HTML slides use the raw-HTML sanitizer. The renderer owns the Carousel instance and releases it in `destroy()`. It declares its own and Carousel styles.',
    ru: 'Адреса изображений и видео проходят политику URL для медиафайлов, а HTML-слайды — очиститель произвольного HTML. Рендерер владеет экземпляром Carousel и освобождает его в `destroy()`. Он объявляет собственные стили и стили Carousel.',
  },
  attaches: {
    en: 'Links use the download URL policy. Archive work, cancellation, object URLs, and interactive controls belong to the block and are released by `destroy()`. The renderer declares one stylesheet.',
    ru: 'Ссылки проходят политику URL для загрузок. Создание архива, отмена запросов, объектные URL и элементы управления принадлежат блоку и освобождаются в `destroy()`. Рендерер объявляет одну таблицу стилей.',
  },
  'link-preview': {
    en: 'The destination uses the external-link URL policy and image sources use the media URL policy; text fields are assigned as text. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Адрес назначения проходит политику внешних ссылок, а изображения — политику URL для медиафайлов; текстовые поля добавляются как текст. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  toggle: {
    en: 'Title and content use the shared inline parser and disclosure state uses native `details` semantics. The renderer declares one stylesheet and creates no custom listeners or external instances.',
    ru: 'Заголовок и содержимое проходят общий обработчик внутристрочной разметки, а раскрытие использует нативный элемент `details`. Рендерер объявляет одну таблицу стилей и не создаёт собственных обработчиков или сторонних экземпляров.',
  },
  columns: {
    en: 'Every column uses the shared inline parser and the validated layout controls the number and proportions of columns. The renderer declares one stylesheet and creates no listeners or external instances.',
    ru: 'Содержимое каждой колонки проходит общий обработчик внутристрочной разметки, а проверенная раскладка определяет число и пропорции колонок. Рендерер объявляет одну таблицу стилей и не создаёт обработчиков или сторонних экземпляров.',
  },
  spoiler: {
    en: 'Label and content use the shared inline parser. The disclosure listener updates accessibility state and is released with the rendered root. The renderer declares one stylesheet.',
    ru: 'Метка и содержимое проходят общий обработчик внутристрочной разметки. Обработчик раскрытия обновляет состояние доступности и освобождается вместе с результатом. Рендерер объявляет одну таблицу стилей.',
  },
  poll: {
    en: 'Question and option text use the inline parser; voter avatars use the media URL policy. The renderer owns vote state, cancellation, subscriptions, and controls and releases them in `destroy()`. It declares one stylesheet.',
    ru: 'Вопрос и варианты проходят обработчик внутристрочной разметки, а аватары — политику URL для медиафайлов. Рендерер владеет состоянием голосования, отменой запросов, подписками и элементами управления и освобождает их в `destroy()`. Он объявляет одну таблицу стилей.',
  },
  person: {
    en: 'Profile text uses the inline parser; avatars and links use the media and external URL policies. Multi-profile output owns a Carousel and navigation listeners, released in `destroy()`. The renderer declares profile and Carousel styles.',
    ru: 'Текст профиля проходит обработчик внутристрочной разметки, а аватары и ссылки — политики URL для медиафайлов и внешних адресов. Вывод нескольких профилей владеет Carousel и обработчиками навигации, которые освобождаются в `destroy()`. Рендерер объявляет стили профиля и Carousel.',
  },
}

function dependencyInstall(block) {
  if (block.path === 'person') return ' @shelamkoff/cropper'
  return ''
}

function pluginReadme(block) {
  const options = `## Configuration

Every built-in block plugin accepts two style ownership options: \`injectStyles?: boolean\` defaults to \`true\`; set it to \`false\` when the host bundles that plugin's CSS. \`css?: string\` adds one host-provided stylesheet URL after the plugin default, or acts as the replacement URL when default injection is disabled.${block.options ? `\n\n${block.options}` : ''}

`

  return `# ${block.className} block plugin

${block.description}

## Install and register

\`\`\`bash
npm install @shelamkoff/rector${dependencyInstall(block)}
\`\`\`

\`\`\`js
import { createEditor } from '@shelamkoff/rector'
import { ${block.className} } from '@shelamkoff/rector/plugins/${block.path}'
import '@shelamkoff/rector/styles/editor.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new ${block.className}()],
})
\`\`\`

The registered block type is \`${block.type}\`. The class is also exported by the complete \`@shelamkoff/rector/plugins\` preset and can be loaded through \`@shelamkoff/rector/plugins/async\`.

## Data

\`\`\`json
${block.data}
\`\`\`

${block.notes}

${options}${fileSourceDocumentation[block.path] ?? ''}## Capabilities

${block.capabilities}

## Undo, lifecycle, and styles

User actions exposed by the plugin enter the command pipeline through the supplied \`context.mutate()\` capability, so each completed action is one undo/redo step. The editor reference-counts the plugin's declared stylesheet URLs. Removing a block calls its cleanup hook; removing the editor calls \`destroy()\` for every remaining block and then releases shared plugin resources.

Do not remove the editor holder without first calling \`editor.destroy()\`.

## Document output

Use the matching renderer from \`@shelamkoff/rector/renderer/renderers/${block.path}\`. The VitePress guide documents configuration, commands and history, extension contracts, document migrations, styling, security, and lifecycle in a sequential form.
`
}

function rendererReadme(block) {
  const factory = rendererFactory[block.path] ?? `create${block.className}Renderer`
  const dependency = block.path === 'person'
    ? '\nThe Person renderer directly uses `@shelamkoff/carousel` and its `carouselStylesUrl` package export.'
    : block.path === 'carousel'
      ? '\nThe Carousel renderer directly uses `@shelamkoff/carousel` and its `carouselStylesUrl` package export.'
    : block.path === 'gallery'
      ? '\nThe Gallery renderer directly uses `@shelamkoff/expose` and its `exposeStylesUrl` package export.'
      : ''

  return `# ${block.className} renderer

Renderer for the \`${block.type}\` block. It converts persisted block data into renderer-owned DOM.${dependency}

The \`@shelamkoff/rector/renderer\` entry contains the synchronous built-in preset, so \`@shelamkoff/carousel\` and \`@shelamkoff/expose\` must be installed before importing it. Passing \`blockTypes: []\` prevents default renderer construction but does not change ESM module resolution.

## Usage

\`\`\`js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { ${factory} } from '@shelamkoff/rector/renderer/renderers/${block.path}'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(${factory}('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// When the mounted output is removed:
renderer.destroy()
rendererStyles.destroy()
\`\`\`

## Typical data

\`\`\`json
${block.data}
\`\`\`

${rendererContracts[block.path].en}

When styles are declared, the explicit \`EditorRenderer.injectStyles()\` call shown above acquires them and its returned owner releases them.

The VitePress guide documents renderer ownership, inline widget reconstruction, styles, cleanup, and security boundaries.
`
}

function rendererReadmeRu(block) {
  const factory = rendererFactory[block.path] ?? `create${block.className}Renderer`
  const dependency = block.path === 'person'
    ? '\nРендерер Person напрямую использует `@shelamkoff/carousel` и экспорт пакета `carouselStylesUrl`.'
    : block.path === 'carousel'
      ? '\nРендерер Carousel напрямую использует `@shelamkoff/carousel` и экспорт пакета `carouselStylesUrl`.'
      : block.path === 'gallery'
        ? '\nРендерер Gallery напрямую использует `@shelamkoff/expose` и экспорт пакета `exposeStylesUrl`.'
        : ''

  return `# Рендерер ${block.className}

Преобразует сохранённый блок \`${block.type}\` в принадлежащий рендереру DOM.${dependency}

Синхронная точка входа \`@shelamkoff/rector/renderer\` включает все встроенные рендереры, поэтому до её импорта установите \`@shelamkoff/carousel\` и \`@shelamkoff/expose\`. Значение \`blockTypes: []\` отключает создание встроенных рендереров, но не меняет правила разрешения модулей ESM.

## Использование

\`\`\`js
import { createEditorRenderer } from '@shelamkoff/rector/renderer'
import { ${factory} } from '@shelamkoff/rector/renderer/renderers/${block.path}'

const renderer = createEditorRenderer({ classPrefix: 'article', blockTypes: [] })
renderer.registerRenderer(${factory}('article', {}))
const rendererStyles = renderer.injectStyles()
renderer.renderTo(documentData, document.querySelector('#article'))

// При удалении добавленного результата:
renderer.destroy()
rendererStyles.destroy()
\`\`\`

## Типичные данные

\`\`\`json
${block.data}
\`\`\`

${rendererContracts[block.path].ru}

Если рендерер объявляет стили, показанный выше явный вызов \`EditorRenderer.injectStyles()\` подключает их, а возвращённый владелец освобождает.

Жизненный цикл, восстановление внутристрочных виджетов, стили и границы безопасности описаны в последовательном руководстве VitePress.
`
}

for (const block of blocks) {
  await writeFile(join(root, 'plugins', block.path, 'README.md'), pluginReadme(block), 'utf8')
  await writeFile(join(root, 'renderer', 'renderers', block.path, 'README.md'), rendererReadme(block), 'utf8')
  await writeFile(join(root, 'renderer', 'renderers', block.path, 'README.ru.md'), rendererReadmeRu(block), 'utf8')
}

await mkdir(join(root, 'inline-plugins', 'color'), { recursive: true })
await writeFile(join(root, 'inline-plugins', 'color', 'README.md'), `# Color swatch inline plugin

Atomic, non-editable color swatch persisted inside a text block by stable widget id.

## Install and register

\`\`\`bash
npm install @shelamkoff/rector @shelamkoff/color-picker
\`\`\`

\`\`\`js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { createColorSwatchPlugin } from '@shelamkoff/rector/inline-plugins/color'
import '@shelamkoff/rector/styles/editor.css'
import '@shelamkoff/color-picker/styles.css'

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
  inlinePlugins: [createColorSwatchPlugin()],
})
\`\`\`

The plugin type is \`color\`. Saved widget data is \`{ value: string }\`. The block text contains a \`{{widgetId}}\` token and the block-level \`inline\` map stores the widget type and payload.

Color parsing and the popup UI come from \`@shelamkoff/color-picker\`. Widget insertion, color changes, removal, undo, and redo use the common command dispatcher. Call \`editor.destroy()\` to release the popup, listeners, and shared styles.

The VitePress extension guide documents the complete inline widget contract, history boundary, storage shape, and cleanup rules.
`, 'utf8')

await writeFile(join(root, 'inline-plugins', 'mention', 'README.md'), `# Mention inline plugin

Trigger-driven mention search with keyboard navigation, cursor pagination, custom rendering, and stable saved widget identities.

## Register in the editor

\`\`\`js
import { createEditor } from '@shelamkoff/rector'
import { Paragraph } from '@shelamkoff/rector/plugins/paragraph'
import { createMentionPlugin } from '@shelamkoff/rector/inline-plugins/mention'
import '@shelamkoff/rector/styles/editor.css'

const mention = createMentionPlugin({
  async searchFunction(query, nextPageUrl, { signal }) {
    const response = await fetch(nextPageUrl ?? \`/api/people?q=\${encodeURIComponent(query)}\`, { signal })
    return response.json() // { items, nextPageUrl?: string | null } or MentionItem[]
  },
})

const editor = createEditor({
  holder: document.querySelector('#editor'),
  plugins: [new Paragraph()],
  inlinePlugins: [mention],
})
\`\`\`

## Options

- \`trigger?: string\` defaults to \`@\`;
- \`searchFunction(query, nextPageUrl, { signal })\` returns an item array or \`{ items, nextPageUrl? }\`; the second argument is \`null\` for the first page and the signal is aborted when the request becomes obsolete;
- \`debounceDelay?: number\`, \`noResultsText?: string\`, and \`dropdownClass?: string\` customize behavior and presentation;
- \`onMentionSelect?: ({ id, name }) => void\` observes committed mentions;
- \`renderItem\`, \`renderNoResults\`, and \`renderLoading\` may return custom elements or return nothing to use the fallback UI.

Each item requires \`id: string | number\` and \`name: string\`. Optional \`avatar\`, \`details\`, and extra application fields remain available to \`renderItem\`; they are not persisted and are not passed to \`onMentionSelect\`. Saved widget data and the selection callback contain only \`{ id, name }\` (the saved id is normalized to a string).

For document output, pass \`createMentionWidget()\` through \`RendererConfig.inlinePlugins\`. Pending searches use both stale-result suppression and \`AbortSignal\` cancellation. The signal is aborted by a newer query, popup closure, or \`editor.destroy()\`; the supplied callback must pass it to its network client. All popup listeners, timers, and plugin state are released by \`editor.destroy()\`.

The VitePress extension guide documents the complete inline widget contract, history boundary, storage shape, and cleanup rules.
`, 'utf8')

const catalogRows = blocks.map(block => `| [${block.className}](./${block.path}/README.md) | \`${block.type}\` | ${block.description} |`).join('\n')
await writeFile(join(root, 'plugins', 'README.md'), `# Block plugins

The package ships ${blocks.length} editable block plugins. Import a single plugin from \`@shelamkoff/rector/plugins/<path>\`, the complete synchronous preset from \`@shelamkoff/rector/plugins\`, or a document-driven subset from \`@shelamkoff/rector/plugins/async\`.

| Plugin | Block type | Purpose |
| --- | --- | --- |
${catalogRows}

## Loading only document types

\`\`\`js
import { createBlockPluginsAsync } from '@shelamkoff/rector/plugins/async'

const plugins = await createBlockPluginsAsync(documentData, {
  image: { uploadFile },
  gallery: { uploadFile },
})
\`\`\`

The async loader deduplicates imports and preserves the deterministic built-in type order. Unknown types reject instead of being silently ignored.

## Authoring

The VitePress extension guide documents the required contract, optional capabilities, command boundaries, text-field mapping, styles, localization, lifecycle, security, and the matching renderer contract.
`, 'utf8')

await writeFile(join(root, 'renderer', 'renderers', 'README.md'), `# Block renderers

Every built-in editor block has a matching renderer. Import an individual factory from \`@shelamkoff/rector/renderer/renderers/<path>\`, the complete synchronous preset from \`@shelamkoff/rector/renderer/renderers\`, or lazy factories from \`@shelamkoff/rector/renderer/renderers/async\`.

Renderer objects return DOM, declare stylesheet URLs, optionally map inline-widget fields, and expose deterministic per-element cleanup through the owning \`EditorRenderer\`.

The VitePress rendering and extension guides document registration, inline parsing, stylesheet ownership, cleanup, and the custom renderer contract.
`, 'utf8')

console.log(JSON.stringify({ blockPlugins: blocks.length, renderers: blocks.length, inlinePlugins: 2 }))
