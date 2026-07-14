# Внутристрочный плагин образца цвета

Неделимый неизменяемый образец цвета, который сохраняется внутри текста по устойчивому идентификатору.

## Установка и регистрация

```bash
npm install @shelamkoff/rector @shelamkoff/color-picker
```

```js
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
```

Тип — `color`, данные — `{ value: string }`. В тексте находится заполнитель `{{widgetId}}`, а карта `inline` хранит тип и данные. Разбор цвета и всплывающее окно предоставляет `@shelamkoff/color-picker`. Вставка, изменение и удаление проходят через общий диспетчер команд и становятся отдельными шагами отмены и повтора. `editor.destroy()` освобождает всплывающее окно, обработчики событий и стили.
