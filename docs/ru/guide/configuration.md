# Конфигурация

`createEditor(config)` принимает один объект конфигурации. Публичный контракт намеренно небольшой: обязательны `holder` и `plugins`; каждое расширение представляет собой неизменяемое определение версии 2, созданное фабрикой.

## Публичная форма

```ts
interface EditorConfig {
  holder: HTMLElement
  plugins: readonly BlockPluginDefinition[]
  inlinePlugins?: readonly InlinePluginDefinition[]
  inlineTools?: readonly InlineTool[]
  data?: EditorDocument
  defaultBlock?: string
  placeholder?: string
  readOnly?: boolean
  autofocus?: boolean
  injectStyles?: boolean
  theme?: 'light' | 'dark'
  minHeight?: number
  locale?: Record<string, unknown>
  validationMode?: 'preserve' | 'strict'
  documentVersionPolicy?: 'preserve' | 'strict'
  migrations?: readonly DocumentMigration[]
  changeDebounceMs?: number
  historyMaxStack?: number
  historyCoalesceMs?: number
  dragThreshold?: number
  toolboxFilterThreshold?: number
  mobileBreakpoint?: number
  blockInsertAnimationMs?: number
  blockMoveAnimationMs?: number
  blockRemoveAnimationMs?: number
  onReady?: (editor: IEditor) => void | Promise<void>
  onChange?: (document: EditorDocument) => void | Promise<void>
  onValidationError?: (issue: EditorValidationIssue) => void
  onDiagnostic?: (diagnostic: EditorDiagnostic) => void | Promise<void>
  diagnosticThresholds?: Partial<DiagnosticThresholds>
}
```

## Параметры

| Параметр | Обязателен | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `holder` | да | — | DOM-элемент, принадлежащий этому экземпляру редактора. Один активный `holder` нельзя занять вторым редактором. |
| `plugins` | да | — | Непустой массив неизменяемых `BlockPluginDefinition`. Значения `type` должны быть уникальны. |
| `inlinePlugins` | нет | `[]` | Неизменяемые `InlinePluginDefinition` для постоянных внутристрочных виджетов. |
| `inlineTools` | нет | `[]` | Объекты инструментов форматирования для внутристрочной панели. |
| `data` | нет | пустой блок по умолчанию | Исходный версионируемый документ. На границе владения он копируется и нормализуется. |
| `defaultBlock` | нет | `paragraph`, если зарегистрирован, иначе первое определение | Тип для пустого документа и общих структурных операций. |
| `placeholder` | нет | значение расширения/локали | Подсказка уровня редактора, доступная runtime блока по умолчанию. |
| `readOnly` | нет | `false` | Исходный режим взаимодействия. В режиме чтения пользовательские изменения документа запрещены. |
| `autofocus` | нет | `false` | Фокус первого редактируемого поля после успешного создания. |
| `injectStyles` | нет | `true` | Подключение стилей ядра и зарегистрированных определений через общий реестр. |
| `theme` | нет | `light` | Встроенная тема: `light` или `dark`. |
| `minHeight` | нет | CSS | Конечная неотрицательная минимальная высота редактора в пикселях. |
| `locale` | нет | встроенный английский | Плоский словарь сообщений ядра и расширений. |
| `validationMode` | нет | `preserve` | Ошибочные данные известного блока/виджета сохраняются инертно либо отклоняются в `strict`. |
| `documentVersionPolicy` | нет | `preserve` | Неполная/будущая версия документа сохраняется либо отклоняется в `strict`. |
| `migrations` | нет | `[]` | Направленные синхронные миграции документа. |
| `changeDebounceMs` | нет | `250` | Задержка перед передачей отделённого снимка в `onChange`. |
| `historyMaxStack` | нет | `100` | Максимальное число записей operation-based истории отмены. |
| `historyCoalesceMs` | нет | `300` | Максимальная пауза для объединения последовательного нативного ввода в один шаг undo. |
| `dragThreshold` | нет | `5` | Смещение указателя в пикселях, после которого начинается перетаскивание блока. |
| `toolboxFilterThreshold` | нет | `7` | Показывать поиск по списку инструментов только при превышении этого числа элементов. |
| `mobileBreakpoint` | нет | `768` | Ширина окна просмотра в пикселях, ниже которой панели ядра переходят в мобильный режим. |
| `blockInsertAnimationMs` | нет | `350` | Длительность анимации появления нового блока; `0` отключает её. |
| `blockMoveAnimationMs` | нет | `200` | Длительность `FLIP`-анимации перемещения блоков; `0` отключает её. |
| `blockRemoveAnimationMs` | нет | `350` | Длительность безопасного схлопывания места удалённого блока; DOM удалённого расширения отсоединяется синхронно. |
| `onReady` | нет | не задан | Наблюдатель после успешной сборки. Его ошибка не ломает редактор. |
| `onChange` | нет | не задан | Наблюдатель канонических изменений с отделённым документом. |
| `onValidationError` | нет | не задан | Наблюдатель ошибок сохранения/проверки данных. |
| `onDiagnostic` | нет | не задан | Служебные диагностические сигналы без содержимого документа; ошибки callback изолируются. |
| `diagnosticThresholds` | нет | пороги не заданы | Неотрицательные пороги для диагностик command/save/render/paste. |

## Определения плагинов

Регистрируйте результаты фабрик, а не изменяемые экземпляры классов:

```js
import { createEditor } from '@shelamkoff/rector'
import { createParagraphPlugin } from '@shelamkoff/rector/plugins/paragraph'
import { createQuotePlugin } from '@shelamkoff/rector/plugins/quote'

const editor = createEditor({
  holder,
  plugins: [
    createParagraphPlugin(),
    createQuotePlugin(),
  ],
  defaultBlock: 'paragraph',
})
```

Одно определение можно использовать в нескольких редакторах. Состояние конкретного редактора принадлежит runtime из `setup()`, а состояние конкретного блока — `BlockInstance`, созданному этим runtime.

## Набор внутристрочных инструментов

Ядро не подключает полный набор инструментов автоматически. Для стандартного набора импортируйте `createDefaultInlineTools` из `@shelamkoff/rector/preset` и передайте результат в `inlineTools`. Отдельные инструменты по-прежнему импортируются через их собственные подмаршруты.

## Исходный документ и версии

`data` декодируется схемами зарегистрированных расширений до построения DOM. `documentVersionPolicy: 'preserve'` применяет все достижимые миграции и сохраняет последний достигнутый структурно корректный документ, если цепочка не доводит его до текущей версии. `strict` требует полный поддерживаемый путь.

`validationMode: 'preserve'` сохраняет ошибочные или будущие данные известного типа инертно, чтобы они могли пройти цикл чтения и сохранения без запуска кода расширения. `strict` их отклоняет.

Канонический формат описан в разделе [Формат документа](/ru/guide/document-format).

## Режим чтения и размеры

`editor.setReadOnly(true)` меняет режим работающего runtime без создания шага истории. Экземпляры определений получают переход через `setReadOnly()`. Ядро также отключает структурные клавиши, вставку, перетаскивание, изменения настроек, inline-команды, отмена и повтор.

`minHeight` задаёт только оболочку редактора. `mobileBreakpoint` управляет классом мобильного режима интерфейса ядра без дублирующего правила по ширине экрана. Анимации структурных изменений принадлежат слою проекции и автоматически подавляются при `prefers-reduced-motion`. Компоновка расширения принадлежит его стилям.

## Обработчики

`onReady`, `onChange`, `onValidationError` и `onDiagnostic` — наблюдатели, а не части транзакции. Ошибка наблюдателя изолируется от канонического состояния. Диагностика никогда не содержит данные документа или payload расширений.

`onChange` планируется только после зафиксированных изменений документа и получает отделённый документ. Более новая фиксация может заменить ещё не доставленное старое уведомление.

## Владение стилями

При `injectStyles: true` URL стилей ядра и расширений учитываются общим со счётчиком ссылок реестром документа. При `false` Rector не подключает стили определений; необходимые CSS должен импортировать приложение.

Фабрика конкретного расширения может дополнительно поддерживать `injectStyles: false`, если это задокументировано, но `injectStyles: false` редактора является глобальным ручным режимом.
