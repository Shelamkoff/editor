import { createEditor, type BlockPluginDefinition, type InlinePluginDefinition, type EditorConfig } from '../../.package-tmp/declaration-tests/core/index.js'
import type { EditorBlockData, EditorInlineWidget, EditorOutputData, InlineTool, ParagraphBlock, PollData, Block, BlockType, BlockInstance, EditableField } from '../../.package-tmp/declaration-tests/types.js'
import { EditorRenderer } from '../../.package-tmp/declaration-tests/renderer/index.js'
import type { BlockRendererDefinition, InlineWidgetRenderer, PollDataSource } from '../../.package-tmp/declaration-tests/renderer/types.js'
import { setSanitizedHtml } from '../../.package-tmp/declaration-tests/plugin-kit/index.js'

// These former aliases must not keep a second document vocabulary alive.
// @ts-expect-error use EditorOutputData from the public types entry
type RemovedOutputData = import('../../.package-tmp/declaration-tests/renderer/types.js').OutputData
// @ts-expect-error use EditorBlockData from the public types entry
type RemovedOutputBlockData = import('../../.package-tmp/declaration-tests/renderer/types.js').OutputBlockData
// @ts-expect-error use EditorInlineWidget from the public types entry
type RemovedInlineWidget = import('../../.package-tmp/declaration-tests/renderer/types.js').InlineWidget
// @ts-expect-error editor save and renderer input use the same EditorOutputData
type RemovedEditorDocument = import('../../.package-tmp/declaration-tests/types.js').EditorDocument
// @ts-expect-error built-in data belongs to the neutral public types entry
type RemovedRendererParagraph = import('../../.package-tmp/declaration-tests/renderer/types.js').ParagraphBlock

interface NoteData { text: string; items: Array<{ id: string; html: string }> }
interface BadgeData { label: string }
const completeProjectedField: NonNullable<BlockInstance<NoteData>['afterProjection']> = (field: EditableField): void => {
  const key: string = field.key
  const element: HTMLElement = field.element
  const mode: 'rich-text' | 'plain-text' = field.mode
  void [key, element, mode]
  // @ts-expect-error completion receives an immutable field address
  field.key = 'successor'
  // @ts-expect-error a completed field is not a mutation or scheduling context
  field.updateData(() => ({ text: 'forbidden' }))
}
completeProjectedField({ key: 'text', mode: 'rich-text', element: document.createElement('div') })
// @ts-expect-error completion requires the full declared field descriptor
completeProjectedField({ key: 'text', element: document.createElement('div') })
// @ts-expect-error a DOM Text node is not a declared HTMLElement field
completeProjectedField({ key: 'text', mode: 'rich-text', element: document.createTextNode('text') })
const note: NoteData = { text: 'Note', items: [{ id: 'first', html: 'Content' }] }
const badge: BadgeData = { label: 'Badge' }
function decodeNote(data: unknown): NoteData {
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string'
    || !('items' in data) || !Array.isArray(data.items)) throw new TypeError('Invalid note')
  return { text: data.text, items: data.items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.html !== 'string') throw new TypeError('Invalid item')
    return { id: item.id, html: item.html }
  }) }
}
const noteSchema = {
  currentVersion: 1, createDefault: (): NoteData => ({ text: '', items: [] }),
  decode: ({ data }: { dataVersion: number; data: unknown }) => ({ dataVersion: 1, data: decodeNote(data) }),
  encode: (data: Readonly<NoteData>) => ({ dataVersion: 1, data: decodeNote(data) }),
  mapRichText: (data: NoteData, visit: (html: string, key: string) => string): NoteData => ({
    text: visit(data.text, 'text'), items: data.items.map(item => ({ ...item, html: visit(item.html, 'item:' + item.id) })),
  }),
}
const badgeSchema = {
  currentVersion: 1, createDefault: (): BadgeData => ({ label: '' }),
  decode({ data }: { dataVersion: number; data: unknown }) {
    if (!data || typeof data !== 'object' || !('label' in data) || typeof data.label !== 'string') throw new TypeError('Invalid badge')
    return { dataVersion: 1, data: { label: data.label } }
  },
  encode: (data: Readonly<BadgeData>) => ({ dataVersion: 1, data: { label: data.label } }),
}
const noteDefinition: BlockPluginDefinition<NoteData> = {
  type: 'external-note', label: { key: 'note', fallback: 'Note' }, icon: '', schema: noteSchema,
  setup(runtime) { return {
    create(initial, context) {
      const canonicalLabel: string = context.getFieldText('item:first')
      // @ts-expect-error only canonical rich-field keys are accepted
      context.getFieldText({ key: 'item:first' })
      // @ts-expect-error a text snapshot does not grant mutation authority
      context.getFieldText('text').updateData(() => note)
      void canonicalLabel
      const element = runtime.ownerDocument.createElement('div')
      let data = decodeNote(initial)
      setSanitizedHtml(element, data.text)
      return {
        element, read: () => decodeNote(data),
        update(next) { data = decodeNote(next); setSanitizedHtml(element, data.text) },
        editableFields: () => [{ key: 'text', mode: 'rich-text', element }],
        afterProjection: completeProjectedField,
        setReadOnly(value) { element.contentEditable = String(!value) },
        destroy() { element.remove() },
      }
    }, destroy() {},
  } },
}
const badgeDefinition: InlinePluginDefinition<BadgeData> = {
  type: 'external-badge', label: { key: 'badge', fallback: 'Badge' }, icon: '', schema: badgeSchema,
  toText(data) {
    const label: string = data.label
    // @ts-expect-error canonical text receives a readonly payload
    data.label = 'forbidden'
    return label
  },
  editing: {
    handle(input, data) {
      if (input.inputType !== 'deleteContentBackward') return null
      return { kind: 'update', data: { label: data.label.slice(0, -1) }, caret: input.offset - 1 }
    },
    reconcileNative(input, data) {
      return input.text
        ? { kind: 'update', data: { label: input.text } }
        : { kind: 'remove' }
    },
  },
  setup(runtime) { return {
    create(_id, initial, context) {
      const element = runtime.ownerDocument.createElement('span')
      element.textContent = initial.label
      element.addEventListener('click', () => {
        const handle = runtime.showPopup(element, runtime.ownerDocument.createElement('div'))
        handle.close()
        context.commitDomMutation(() => element.remove())
      }, { signal: context.signal })
      return {
        element,
        update(next) { element.textContent = next.label },
        afterNativeEdit(notice) {
          if (notice.caret !== null && notice.labelChanged) element.dataset.lastNativeCaret = String(notice.caret)
        },
        setReadOnly() {},
        destroy() {},
      }
    }, destroy() {},
  } },
}
declare const holder: HTMLElement
function createExternalTool(): InlineTool {
  let port: Parameters<NonNullable<InlineTool['bindSelectionPort']>>[0] = null
  return {
    type: 'external-format', icon: '', title: 'Format', isActive: () => false,
    bindSelectionPort(next) { port = next },
    toggle({ range }) {
      const token = port?.capture(range)
      if (token) port?.restore(token, { endOffsetDelta: 0 })
    },
    onMount(_button, mutations) {
      const token = port?.capture()
      if (token) mutations?.mutate(token, range => { range.cloneContents() })
    },
    renderActions(context) {
      context.setTextAlign('center')
      context.restoreSelection()
      return holder.ownerDocument.createElement('div')
    },
    destroy() { port = null },
  }
}
const config: EditorConfig = {
  holder, defaultBlock: 'external-note', plugins: [noteDefinition], inlinePlugins: [badgeDefinition],
  inlineTools: [createExternalTool()],
  data: { version: '2.0.0', blocks: [{ id: 'note', type: 'external-note', dataVersion: 1, data: note,
    inline: { badge: { type: 'external-badge', dataVersion: 1, data: badge } } }] },
}
const editor = createEditor(config)
editor.blocks.insert({ type: 'external-note', data: note })
editor.blocks.update('note', () => ({ data: note }))
editor.insertInlinePlugin('external-badge', badge)
const noteRenderer: BlockRendererDefinition<EditorBlockData<'external-note', NoteData>> = {
  type: 'external-note', schema: noteSchema,
  render(block, parseInline, context) {
    const ownerDocument = context?.ownerDocument ?? document
    const element = ownerDocument.createElement('div')
    element.append(parseInline(block.data.text))
    return element
  },
}
const badgeRenderer: InlineWidgetRenderer<BadgeData> = {
  type: 'external-badge', schema: badgeSchema,
  render(_id, data, { ownerDocument }) { const element = ownerDocument.createElement('span'); element.textContent = data.label; return element },
}
class ArticleRenderer extends EditorRenderer {
  override renderBlock(block: EditorBlockData) {
    return super.renderBlock(block)
  }
}
const renderer = new ArticleRenderer({ blockTypes: [], inlineRenderers: [badgeRenderer] })
renderer.registerRenderer(noteRenderer)

const widget: EditorInlineWidget<'external-badge', BadgeData> = {
  type: 'external-badge', dataVersion: 1, data: badge,
}
const noteBlock: EditorBlockData<'external-note', NoteData> = {
  id: 'note', type: 'external-note', dataVersion: 1, data: note, inline: { badge: widget },
}
const documentData: EditorOutputData<typeof noteBlock> = { version: '2.0.0', blocks: [noteBlock] }
editor.render(documentData)
renderer.render(documentData)
renderer.render(editor.save())

const paragraph: ParagraphBlock = { id: 'p', type: 'paragraph', dataVersion: 1, data: { text: 'Text' } }
const builtinDocument: EditorOutputData<Block> = { version: '2.0.0', blocks: [paragraph] }
renderer.render(builtinDocument)
// @ts-expect-error the named block keeps its exact payload type
paragraph.data.text = 42
// @ts-expect-error the canonical widget still requires an exact schema version
const unversionedWidget: EditorInlineWidget = { type: 'external-badge', data: badge }

const builtinTypes: Record<BlockType, true> = {
  paragraph: true, heading: true, list: true, quote: true, code: true, image: true,
  delimiter: true, table: true, checklist: true, warning: true, embed: true, raw: true,
  gallery: true, carousel: true, attaches: true, linkPreview: true, toggle: true,
  columns: true, spoiler: true, poll: true, person: true,
}
// @ts-expect-error the built-in union remains closed while EditorBlockData permits extensions
builtinTypes.external = true
declare const block: Block
if (block.type === 'heading') {
  const level: 2 | 3 | 4 | 5 | 6 = block.data.level
  void level
}

declare const poll: PollData
const pollSource: PollDataSource = {
  load: async () => poll.initialResults ?? { total: 0, options: [] },
  vote: async ({ optionIds }) => ({ total: 1, options: optionIds.map(id => ({ id, votes: 1 })) }),
}
void [builtinTypes, pollSource]
