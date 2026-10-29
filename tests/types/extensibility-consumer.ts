import { createEditor, type BlockPluginDefinition, type InlinePluginDefinition, type EditorConfig } from '../../.package-tmp/declaration-tests/core/index.js'
import type { InlineTool } from '../../.package-tmp/declaration-tests/types.js'
import { EditorRenderer } from '../../.package-tmp/declaration-tests/renderer/index.js'
import type { BlockRendererDefinition, OutputBlockData, InlineWidgetRenderer } from '../../.package-tmp/declaration-tests/renderer/types.js'
import { setSanitizedHtml } from '../../.package-tmp/declaration-tests/plugin-kit/index.js'

interface NoteData { text: string; items: Array<{ id: string; html: string }> }
interface BadgeData { label: string }
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
      const element = runtime.ownerDocument.createElement('div')
      let data = decodeNote(initial)
      setSanitizedHtml(element, data.text)
      return {
        element, read: () => decodeNote(data),
        update(next) { data = decodeNote(next); setSanitizedHtml(element, data.text) },
        editableFields: () => [{ key: 'text', mode: 'rich-text', element }],
        setReadOnly(value) { element.contentEditable = String(!value) },
        destroy() { element.remove() },
      }
    }, destroy() {},
  } },
}
const badgeDefinition: InlinePluginDefinition<BadgeData> = {
  type: 'external-badge', label: { key: 'badge', fallback: 'Badge' }, icon: '', schema: badgeSchema,
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
const noteRenderer: BlockRendererDefinition<OutputBlockData<'external-note', NoteData>> = {
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
  override renderBlock(block: OutputBlockData) {
    return super.renderBlock(block)
  }
}
const renderer = new ArticleRenderer({ blockTypes: [], inlineRenderers: [badgeRenderer] })
renderer.registerRenderer(noteRenderer)
