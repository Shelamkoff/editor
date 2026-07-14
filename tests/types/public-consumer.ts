import {
  Attaches,
  Checklist,
  CarouselBlock,
  Code,
  Columns,
  Delimiter,
  Embed,
  Gallery,
  Heading,
  Image,
  LinkPreview,
  List,
  Paragraph,
  Person,
  Poll,
  Quote,
  Raw,
  Spoiler,
  Table,
  Toggle,
  Warning,
} from '../../.package-tmp/declaration-tests/plugins/index.js'
import {
  createBlockPluginsAsync,
  getAsyncBlockPluginTypes,
} from '../../.package-tmp/declaration-tests/plugins/async.js'
import {
  createEditorRenderer,
  EditorRenderer,
  getSupportedBlockTypes,
} from '../../.package-tmp/declaration-tests/renderer/index.js'
import { createRendererAsync } from '../../.package-tmp/declaration-tests/renderer/async.js'
import type { BlockPlugin } from '../../.package-tmp/declaration-tests/core/index.js'
import type { MessageKey } from '../../.package-tmp/declaration-tests/core/types.js'
import type { BlockRenderer, OutputBlockData } from '../../.package-tmp/declaration-tests/renderer/types.js'
import type { PollDataSource } from '../../.package-tmp/declaration-tests/plugins/poll/index.js'
import { CropperDialog } from '../../../cropper/src/index.js'

const pluginConstructors = [
  Attaches,
  Checklist,
  CarouselBlock,
  Code,
  Columns,
  Delimiter,
  Embed,
  Gallery,
  Heading,
  Image,
  LinkPreview,
  List,
  Paragraph,
  Person,
  Poll,
  Quote,
  Raw,
  Spoiler,
  Table,
  Toggle,
  Warning,
]

const plugins = pluginConstructors.map(Plugin => new Plugin()) satisfies BlockPlugin[]
const paragraphLocaleKey: MessageKey = 'plugin.paragraph.title'

const pollDataSource: PollDataSource = {
  async load({ pollId, signal }) {
    void pollId
    void signal
    return { revision: '1', total: 0, options: [] }
  },
  async vote({ pollId, optionIds, revision, signal }) {
    void pollId
    void revision
    void signal
    return { revision: '2', total: optionIds.length, options: optionIds.map(id => ({ id, votes: 1 })) }
  },
}

const configuredPlugins = [
  new Image({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ({ url: '/image.jpg' }) }] }),
  new Gallery({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ url: '/image.jpg' }]) }] }),
  new CarouselBlock({
    uploadFile: async (_file, { signal }) => ({ url: signal.aborted ? '' : '/media.jpg' }),
    actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ id: 'slide', type: 'image', src: '/image.jpg' }]) }],
  }),
  new Attaches({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ url: '/file.pdf', name: 'file.pdf' }]) }] }),
  new Embed({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ({ url: '/cover.jpg' }) }] }),
  new Poll({ dataSource: pollDataSource, maxVoters: 20 }),
] satisfies BlockPlugin[]

const renderer: EditorRenderer = createEditorRenderer({
  validationMode: 'strict',
  blockConfigs: { poll: { dataSource: pollDataSource, maxVoters: 20 } },
})
const customRenderer: BlockRenderer<OutputBlockData<'custom', { text: string }>> = {
  type: 'custom',
  render: block => {
    const element = document.createElement('p')
    element.textContent = block.data.text
    return element
  },
}
renderer.registerRenderer(customRenderer)

void pluginConstructors
void plugins
void paragraphLocaleKey
void configuredPlugins
void renderer
void getSupportedBlockTypes()
void getAsyncBlockPluginTypes()
void createBlockPluginsAsync(['paragraph'])
void createRendererAsync('paragraph', 'editor')

declare const cropSource: Blob
const cropperDialog = new CropperDialog(cropSource, { title: 'Crop' })
cropperDialog.open()
cropperDialog.destroy()
void cropperDialog.result
