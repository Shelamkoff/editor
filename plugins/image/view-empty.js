import { renderDropzone } from '../shared/dropzone.js'
import { CSS } from './css.js'
import { ICON_SELECT } from './icons.js'

/**
 * @typedef {Object} EmptyViewDeps
 * @property {(key: string, fallback: string) => string} t
 * @property {(file: File) => void} onFileDropped
 * @property {() => void} onUploadClick
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null> }>} customActions
 * @property {(handler: (context: { signal: AbortSignal }) => Promise<{url: string, alt?: string} | null>) => Promise<void>} runCustomAction
 */

/**
 * Render the empty-state dropzone view into `wrapper`.
 * Replaces the wrapper's contents and removes the `filled` class.
 *
 * Listeners are attached with the state's AbortSignal so they're
 * automatically removed on the next render or on disposal.
 *
 * @param {HTMLElement} wrapper
 * @param {import('./state.js').ImageState} state
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
    afterText: deps.t('dropzoneText', 'an image from your device or drag and drop it here'),
    onUploadClick: deps.onUploadClick,
    actions: deps.customActions.map(action => ({
      icon: action.icon,
      label: action.label,
      onSelect: () => { void deps.runCustomAction(action.handler) },
    })),
    onDrop: (dt) => {
      const file = dt.files[0]
      if (file && file.type.startsWith('image/')) {
        deps.onFileDropped(file)
      }
    },
  })
}
