import { renderDropzone } from '../shared/dropzone.js'
import { CSS } from './css.js'
import { ICON_SELECT } from './icons.js'

/**
 * @typedef {Object} EmptyViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {() => void} onUploadClick
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<Array<{url: string, alt?: string}> | null> }>} customActions
 * @property {(handler: (context: { signal: AbortSignal }) => Promise<Array<{url: string, alt?: string}> | null>) => Promise<void>} runCustomAction
 * @property {(files: File[]) => void} onFilesDropped
 */

/**
 * Render the empty-state dropzone for the Gallery plugin.
 * Replaces wrapper contents and removes the `filled` class.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').GalleryState} state
 * @param {EmptyViewDeps} deps
 */
export function renderEmptyView(wrapper, state, deps) {
  state.resetTransient()

  const signal = /** @type {AbortController} */ (state.abortController).signal

  renderDropzone(wrapper, signal, {
    select: CSS.select,
    selectIcon: CSS.selectIcon,
    selectText: CSS.selectText,
    selectLink: CSS.selectLink,
    selectActions: CSS.selectActions,
    selectAction: CSS.selectAction,
    dropzoneActive: CSS.dropzoneActive,
    filled: CSS.filled,
  }, {
    iconHtml: ICON_SELECT,
    uploadText: deps.t('dropzoneUpload', 'Upload'),
    afterText: deps.t('dropzoneText', 'images from your device or drag and drop them here'),
    onUploadClick: deps.onUploadClick,
    actions: deps.customActions.map(action => ({
      icon: action.icon,
      label: action.label,
      onSelect: () => { void deps.runCustomAction(action.handler) },
    })),
    onDrop: (dt) => {
      const files = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'))
      if (files.length > 0) deps.onFilesDropped(files)
    },
  })
}
