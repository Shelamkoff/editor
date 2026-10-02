import {
  createAttachesPlugin,
  createCarouselPlugin,
  createChecklistPlugin,
  createCodePlugin,
  createColumnsPlugin,
  createDelimiterPlugin,
  createEmbedPlugin,
  createGalleryPlugin,
  createHeadingPlugin,
  createImagePlugin,
  createLinkPreviewPlugin,
  createListPlugin,
  createParagraphPlugin,
  createPersonPlugin,
  createPollPlugin,
  createQuotePlugin,
  createRawPlugin,
  createSpoilerPlugin,
  createTablePlugin,
  createTogglePlugin,
  createWarningPlugin,
} from '../../.package-tmp/declaration-tests/plugins/index.js'
import {
  createBlockPluginsAsync,
  getAsyncBlockPluginTypes,
  loadBlockPluginDefinition,
  preloadBlockPluginDefinitions,
} from '../../.package-tmp/declaration-tests/plugins/async.js'
import {
  createEditorRenderer,
  EditorRenderer,
  getSupportedBlockTypes,
} from '../../.package-tmp/declaration-tests/renderer/index.js'
import { createRendererAsync } from '../../.package-tmp/declaration-tests/renderer/async.js'
import type { BlockPluginDefinition } from '../../.package-tmp/declaration-tests/core/index.js'
import type { BlockRenderer, OutputBlockData } from '../../.package-tmp/declaration-tests/renderer/types.js'
import { CropperDialog } from '@shelamkoff/cropper'

const factories = [
  createAttachesPlugin,
  createChecklistPlugin,
  createCarouselPlugin,
  createCodePlugin,
  createColumnsPlugin,
  createDelimiterPlugin,
  createEmbedPlugin,
  createGalleryPlugin,
  createHeadingPlugin,
  createImagePlugin,
  createLinkPreviewPlugin,
  createListPlugin,
  createParagraphPlugin,
  createPersonPlugin,
  createPollPlugin,
  createQuotePlugin,
  createRawPlugin,
  createSpoilerPlugin,
  createTablePlugin,
  createTogglePlugin,
  createWarningPlugin,
]

const plugins = factories.map(factory => factory()) satisfies BlockPluginDefinition[]

const configuredPlugins = [
  createImagePlugin({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ({ url: '/image.jpg' }) }] }),
  createGalleryPlugin({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ url: '/image.jpg' }]) }] }),
  createCarouselPlugin({
    uploadFile: async (_file, { signal }) => ({ url: signal.aborted ? '' : '/media.jpg' }),
    actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ id: 'slide', type: 'image', src: '/image.jpg' }]) }],
  }),
  createAttachesPlugin({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ([{ url: '/file.pdf', name: 'file.pdf' }]) }] }),
  createEmbedPlugin({ actions: [{ label: 'Library', handler: async ({ signal }) => signal.aborted ? null : ({ url: '/cover.jpg' }) }] }),
  createPollPlugin({
    dataSource: {
      load: async () => ({ revision: '1', total: 0, options: [] }),
      vote: async ({ optionIds }) => ({ revision: '2', total: optionIds.length, options: optionIds.map(id => ({ id, votes: 1 })) }),
    },
    maxVoters: 20,
  }),
] satisfies BlockPluginDefinition[]

const renderer: EditorRenderer = createEditorRenderer({ validationMode: 'strict' })
const customRenderer: BlockRenderer<OutputBlockData<'custom', { text: string }>> = {
  type: 'custom',
  render: block => {
    const element = document.createElement('p')
    element.textContent = block.data.text
    return element
  },
}
renderer.registerRenderer(customRenderer)

void factories
void plugins
void configuredPlugins
void renderer
void getSupportedBlockTypes()
void getAsyncBlockPluginTypes()
void loadBlockPluginDefinition('paragraph')
void preloadBlockPluginDefinitions(['paragraph'])
void createBlockPluginsAsync(['paragraph'])
void createRendererAsync('paragraph', 'editor')

declare const cropSource: Blob
const cropperDialog = new CropperDialog(cropSource, { title: 'Crop' })
cropperDialog.open()
cropperDialog.destroy()
void cropperDialog.result
