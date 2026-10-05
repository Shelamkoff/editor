// @ts-check
import { READ_ONLY_INTERACTIVE_ATTRIBUTE, setSanitizedHtml } from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { embedDataSchema } from '../../shared/blockSchemas/embed.js'
import { acceptsTextPayload, richTextFromPayload } from '../shared/textConversion.js'
import { createTextSelectionSlice } from '../shared/textSelectionSlice.js'
import { createTextClipboardSlice } from '../shared/textClipboardSlice.js'
import { retainControlFocus } from '../shared/retainControlFocus.js'
import { createPluginPanelPositioner } from '../shared/positionPluginPanel.js'
import { createPluginLayer } from '../shared/layer.js'
import { openSourceEditor, preloadSourceEditor } from '../shared/sourceEditor.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { buildPlayer } from './player.js'
import { parseEmbedUrl } from './url.js'

const editorStyles = new URL('./embed.css', import.meta.url).href
const sourceEditorStyles = new URL('../shared/sourceEditor.css', import.meta.url).href
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 3l-4 4l-4-4"/></svg>'
const PLAY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4v16l13-8z"/></svg>'
const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M10 8l6 4l-6 4z"/></svg>'

/**
 * @typedef {Object} EmbedV2Config
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>} [uploadFile] Upload an image used as a custom video cover.
 * @property {Array<{ icon?: string, label: string, handler: (context: { signal: AbortSignal }) => Promise<{ url: string } | null> }>} [actions] Additional cover-source actions shown by the block.
 * @property {false | ((request: { service: 'vimeo', videoId: string, url: string, signal: AbortSignal }) => Promise<{ thumbnailUrl: string, title?: string } | null>)} [resolvePreview] Resolve Vimeo preview metadata, or disable preview resolution with false.
 * @property {number} [previewTimeoutMs] Timeout for the built-in Vimeo preview request.
 * @property {boolean} [injectStyles=true] Whether to acquire the built-in Embed stylesheet.
 * @property {string} [css] Additional stylesheet URL acquired with the definition.
 */

function emptyData() {
  return { service: '', videoId: '', caption: '', cover: '', title: '', duration: '' }
}

/** @param {string} videoId */
function vimeoUrl(videoId) {
  return 'https://vimeo.com/' + encodeURIComponent(videoId)
}

/** Create an immutable Embed block definition.\n * @param {EmbedV2Config} [config] Consumer-owned configuration snapshotted by the factory.\n * @returns {import('../../plugin-kit/types').BlockPluginDefinition<{service:string,videoId:string,caption:string,cover:string,title:string,duration:string}>}\n */
export function createEmbedPlugin(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Embed configuration must be an object')
  }
  const snapshot = Object.freeze({
    ...config,
    actions: Object.freeze([...(config.actions ?? [])]),
  })
  const styles = []
  if (snapshot.injectStyles !== false) styles.push(editorStyles, sourceEditorStyles)
  if (snapshot.css) styles.push(snapshot.css)

  const capabilities = Object.freeze({
    selectionSlice: createTextSelectionSlice(embedDataSchema),
    clipboard: createTextClipboardSlice(embedDataSchema),
    empty: Object.freeze({ isEmpty: data => !data.videoId }),
    conversion: Object.freeze({
      selectionMode:'single',
      export: data => ({ kind: 'rich-text', data: { text: data.caption } }),
      canImport: acceptsTextPayload,
      import(payload) {
        return { ...emptyData(), caption: richTextFromPayload(payload) }
      },
    }),
    paste: Object.freeze({
      accepts(input) {
        return input.kind === 'text' && !!parseEmbedUrl(input.text)
      },
      resolve(input) {
        if (input.kind !== 'text') return null
        const parsed = parseEmbedUrl(input.text)
        return parsed
          ? { kind: /** @type {'block'} */ ('block'), data: { ...emptyData(), ...parsed } }
          : null
      },
    }),
  })

  return Object.freeze({
    type: 'embed',
    label: Object.freeze({ key: 'title', fallback: 'Video' }),
    icon: ICON,
    styles: Object.freeze(styles),
    schema: embedDataSchema,
    capabilities,

    setup(runtimeContext) {
      let destroyed = false
      const objectUrls = new Set()

      const revokeAll = () => {
        const URLCtor = runtimeContext.ownerDocument.defaultView?.URL ?? URL
        for (const url of objectUrls) URLCtor.revokeObjectURL(url)
        objectUrls.clear()
      }

      return {
        create(initial, context) {
          if (destroyed) throw new Error('Embed runtime is destroyed')
          const document = context.ownerDocument
          const wrapper = document.createElement('div')
          wrapper.className = 'oe-embed'
          wrapper.contentEditable = 'false'
          wrapper.tabIndex = -1

          let data = { ...initial }
          let readOnly = context.isReadOnly()
          let dead = false
          let previewController = null
          let coverTask = null
          let inputTimer = null
          let playerController = null
          const timerHost = document.defaultView ?? globalThis
          const clearInputTimer = () => {
            if (inputTimer !== null) timerHost.clearTimeout(inputTimer)
            inputTimer = null
          }

          const urlBar = document.createElement('div')
          urlBar.className = 'oe-embed__url-bar'
          const input = document.createElement('input')
          input.type = 'url'
          input.className = 'oe-embed__url-input'
          input.placeholder = runtimeContext.t('urlPlaceholder', 'Paste YouTube or Vimeo URL')
          const insert = document.createElement('button')
          insert.type = 'button'
          insert.className = 'oe-embed__action-btn'
          insert.textContent = runtimeContext.t('insert', 'Insert')
          urlBar.append(input, insert)

          const view = document.createElement('div')
          view.className = 'oe-embed__view'
          wrapper.append(urlBar, view)

          const replace = document.createElement('button')
          replace.type = 'button'
          replace.className = 'oe-embed__action-btn'
          replace.textContent = runtimeContext.t('replace', 'Replace')

          const cover = document.createElement('button')
          cover.type = 'button'
          cover.className = 'oe-embed__action-btn'
          cover.textContent = runtimeContext.t('cover', 'Cover')

          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'oe-embed__action-btn oe-embed__action-btn--danger'
          remove.textContent = runtimeContext.t('delete', 'Delete')

          const actions = document.createElement('div')
          actions.className = 'oe-embed__actions'
          const mainActions = document.createElement('div')
          mainActions.className = 'oe-embed__actions-view'
          mainActions.append(replace, cover, remove)
          actions.append(mainActions)
          wrapper.append(actions)
          preloadSourceEditor(wrapper, context.signal, ['url'])

          const settings = document.createElement('div')
          settings.className = 'oe-embed__dropdown'
          const settingsButton = document.createElement('button')
          settingsButton.type = 'button'
          settingsButton.className = 'oe-embed__action-btn'
          settingsButton.textContent = runtimeContext.t('settings', 'Settings')
          settingsButton.setAttribute('aria-haspopup', 'true')
          settingsButton.setAttribute('aria-expanded', 'false')
          const settingsPanel = document.createElement('div')
          settingsPanel.className = 'oe-embed__dropdown-panel oe-embed__style-form'
          settingsPanel.setAttribute('role', 'group')
          const settingInputs = new Map()
          for (const [key, label] of [['title', runtimeContext.t('videoTitle', 'Title')], ['duration', runtimeContext.t('duration', 'Duration')]]) {
            const row = document.createElement('label')
            row.className = 'oe-embed__style-label'
            const text = document.createElement('span')
            text.textContent = label
            const field = document.createElement('input')
            field.className = 'oe-embed__style-input'
            field.dataset.setting = key
            field.addEventListener('change', () => {
              if (!readOnly && !dead) context.updateData(current => ({ ...current, [key]: field.value }))
            }, { signal: context.signal })
            row.append(text, field)
            settingsPanel.append(row)
            settingInputs.set(key, field)
          }
          const settingsLayer = createPluginLayer(wrapper, context.signal)
          const positioner = createPluginPanelPositioner(settingsPanel, settings, { signal: context.signal })
          const closeSettings = () => {
            settings.classList.remove('oe-embed__dropdown--open')
            settingsButton.setAttribute('aria-expanded', 'false')
            settingsLayer.close()
            positioner.close()
          }
          settingsButton.addEventListener('click', () => {
            const open = !settings.classList.contains('oe-embed__dropdown--open')
            settings.classList.toggle('oe-embed__dropdown--open', open)
            settingsButton.setAttribute('aria-expanded', String(open))
            if (open) {
              settingsLayer.open()
              positioner.open()
            } else { settingsLayer.close(); positioner.close() }
          }, { signal: context.signal })
          settings.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            closeSettings()
            wrapper.focus({ preventScroll: true })
          }, { signal: context.signal })
          document.addEventListener('mousedown', event => {
            if (!settings.contains(event.target)) closeSettings()
          }, { signal: context.signal })
          settings.append(settingsButton, settingsPanel)
          mainActions.insertBefore(settings, cover)

          const coverActions = document.createElement('div')
          coverActions.className = 'oe-embed__actions-view oe-embed__actions-view--cover'
          coverActions.hidden = true
          coverActions.style.display = 'none'
          const closeCover = () => {
            if (coverActions.contains(document.activeElement)) wrapper.focus({ preventScroll: true })
            coverActions.hidden = true
            coverActions.style.display = 'none'
            mainActions.style.display = 'contents'
          }
          const coverButton = (label, handler) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'oe-embed__action-btn'
            button.textContent = label
            button.addEventListener('click', () => { if (!readOnly && !dead) handler() }, { signal: context.signal })
            coverActions.append(button)
            return button
          }
          coverButton(runtimeContext.t('back', 'Back'), closeCover)
          coverButton(runtimeContext.t('uploadCover', 'Upload'), () => { closeCover(); chooseCover() })
          coverButton(runtimeContext.t('url', 'URL'), () => {
            closeCover()
            openSourceEditor({
              wrapper, signal: context.signal, kind: 'url',
              title: runtimeContext.t('cover', 'Cover'), label: runtimeContext.t('coverUrlPrompt', 'Cover image URL:'),
              placeholder: 'https://', submitText: runtimeContext.t('insert', 'Insert'),
              cancelText: runtimeContext.t('back', 'Back'), invalidText: runtimeContext.t('invalidCoverUrl', 'Enter a valid image URL'),
              normalize: sanitizeMediaUrl,
              onSubmit: url => {
                coverTask?.cancel()
                wrapper.focus({ preventScroll: true })
                context.updateData(current => ({ ...current, cover: url }))
              },
            })
          })
          const removeCover = coverButton(runtimeContext.t('removeCover', 'Remove'), () => {
            coverTask?.cancel()
            closeCover()
            wrapper.focus({ preventScroll: true })
            context.updateData(current => ({ ...current, cover: '' }))
          })
          actions.append(coverActions)

          const commit = next => context.updateData(() => next)

          const parseInput = () => {
            clearInputTimer()
            if (readOnly || dead) return
            const parsed = parseEmbedUrl(input.value)
            if (!parsed && !data.service) return
            if (parsed?.service === data.service && parsed?.videoId === data.videoId) return
            coverTask?.cancel()
            coverTask = null
            wrapper.focus({ preventScroll: true })
            commit({ ...data, ...(parsed ?? { service: '', videoId: '' }) })
          }

          const beginPreview = () => {
            previewController?.abort()
            const Ctor = document.defaultView?.AbortController ?? AbortController
            const controller = new Ctor()
            previewController = controller
            const abort = () => controller.abort(context.signal.reason)
            context.signal.addEventListener('abort', abort, { once: true, signal: controller.signal })
            return controller
          }

          const resolvePreview = async player => {
            if (data.service !== 'vimeo' || data.cover || !data.videoId || snapshot.resolvePreview === false) return
            const controller = beginPreview()
            try {
              const request = {
                service: /** @type {'vimeo'} */ ('vimeo'),
                videoId: data.videoId,
                url: vimeoUrl(data.videoId),
                signal: controller.signal,
              }
              let result = null
              if (typeof snapshot.resolvePreview === 'function') {
                result = await snapshot.resolvePreview(request)
              } else {
                const fetchFn = document.defaultView?.fetch ?? globalThis.fetch
                const timeout = Number.isFinite(snapshot.previewTimeoutMs)
                  ? Math.max(0, Number(snapshot.previewTimeoutMs))
                  : 5000
                const timer = (document.defaultView ?? globalThis).setTimeout(() => controller.abort(), timeout)
                try {
                  const response = await fetchFn('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(request.url), { signal: controller.signal })
                  if (response.ok) {
                    const json = await response.json()
                    result = {
                      thumbnailUrl: typeof json.thumbnail_url === 'string' ? json.thumbnail_url : '',
                      title: typeof json.title === 'string' ? json.title : '',
                    }
                  }
                } finally {
                  ;(document.defaultView ?? globalThis).clearTimeout(timer)
                }
              }
              if (controller.signal.aborted || dead || !result?.thumbnailUrl) return
              const safe = sanitizeMediaUrl(result.thumbnailUrl)
              if (!safe) return
              player.setPreview(safe, result.title)
            } catch {
              // Preview is presentation-only; failures leave canonical data unchanged.
            }
          }

          const beginCoverTask = () => {
            coverTask?.cancel()
            const task = context.beginTask()
            coverTask = task
            task.signal.addEventListener('abort', () => {
              if (coverTask === task) coverTask = null
            }, { once: true })
            return task
          }

          const startCoverUpload = file => {
            if (readOnly || !isSupportedImageFile(file)) return
            const task = beginCoverTask()

            const run = async () => {
              let objectUrl = ''
              try {
                let url = ''
                if (snapshot.uploadFile) {
                  const result = await snapshot.uploadFile(file, { signal: task.signal })
                  url = sanitizeMediaUrl(result?.url ?? '')
                } else {
                  const URLCtor = document.defaultView?.URL ?? URL
                  url = URLCtor.createObjectURL(file)
                  objectUrl = url
                  objectUrls.add(url)
                }
                const committed = !task.signal.aborted && !!url && retainControlFocus(wrapper, () => task.commit(current => ({
                  ...current,
                  cover: url,
                })))
                if (!committed && objectUrl) {
                  const URLCtor = document.defaultView?.URL ?? URL
                  URLCtor.revokeObjectURL(objectUrl)
                  objectUrls.delete(objectUrl)
                }
              } catch {
                if (objectUrl) {
                  const URLCtor = document.defaultView?.URL ?? URL
                  URLCtor.revokeObjectURL(objectUrl)
                  objectUrls.delete(objectUrl)
                }
                // Upload failure is contained.
              } finally {
                task.cancel()
                if (coverTask === task) coverTask = null
              }
            }
            void run()
          }

          const chooseCover = () => {
            if (readOnly) return
            triggerFileInput({
              ownerDocument: document,
              accept: 'image/*',
              signal: context.signal,
              onFiles: files => {
                const file = files[0]
                if (file) startCoverUpload(file)
              },
            })
          }

          insert.addEventListener('click', parseInput, { signal: context.signal })
          input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              parseInput()
            }
          }, { signal: context.signal })
          input.addEventListener('input', () => {
            clearInputTimer()
            if (!readOnly && !dead) inputTimer = timerHost.setTimeout(parseInput, 500)
          }, { signal: context.signal })
          input.addEventListener('paste', event => {
            event.stopPropagation()
            clearInputTimer()
            if (!readOnly && !dead) inputTimer = timerHost.setTimeout(parseInput, 0)
          }, { signal: context.signal })
          replace.addEventListener('click', () => {
            if (readOnly) return
            input.value = ''
            input.focus()
          }, { signal: context.signal })
          cover.addEventListener('click', () => {
            if (readOnly) return
            closeSettings()
            mainActions.style.display = 'none'
            coverActions.hidden = false
            coverActions.style.display = 'contents'
          }, { signal: context.signal })
          remove.addEventListener('click', () => {
            if (readOnly) return
            coverTask?.cancel()
            coverTask = null
            clearInputTimer()
            wrapper.focus({ preventScroll: true })
            commit(emptyData())
          }, { signal: context.signal })

          for (const action of snapshot.actions ?? []) {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'oe-embed__action-btn'
            if (action.icon) insertTrustedHtml(button, 'afterbegin', action.icon)
            button.append(document.createTextNode(action.label))
            button.addEventListener('click', () => {
              if (readOnly || dead) return
              const task = beginCoverTask()
              void Promise.resolve(action.handler({ signal: task.signal })).then(result => {
                if (task.signal.aborted || !result) return
                const safe = sanitizeMediaUrl(result.url)
                if (safe) retainControlFocus(wrapper, () => task.commit(current => ({ ...current, cover: safe })))
              }).catch(() => {}).finally(() => {
                task.cancel()
                if (coverTask === task) coverTask = null
              })
            }, { signal: context.signal })
            button.addEventListener('click', closeCover, { signal: context.signal })
            coverActions.insertBefore(button, removeCover)
          }

          const project = next => {
            clearInputTimer()
            playerController?.abort()
            const Ctor = document.defaultView?.AbortController ?? AbortController
            playerController = new Ctor()
            wrapper.classList.remove('oe-embed--playing')
            const sourceChanged = data.service !== next.service || data.videoId !== next.videoId
            data = { ...next }
            if (sourceChanged) {
              coverTask?.cancel()
              coverTask = null
            }
            previewController?.abort()
            view.replaceChildren()
            const configured = !!data.service && !!data.videoId
            urlBar.hidden = false
            insert.hidden = readOnly
            input.value = configured ? (data.service === 'youtube' ? 'https://youtu.be/' : 'https://vimeo.com/') + data.videoId : ''
            input.readOnly = readOnly
            actions.hidden = readOnly || !configured
            removeCover.hidden = !data.cover
            for (const [key, field] of settingInputs) if (document.activeElement !== field) field.value = data[key]
            if (readOnly || !configured) { closeSettings(); closeCover() }
            wrapper.classList.toggle('oe-embed--filled', configured)

            if (configured) {
            const built = buildPlayer({
              service: data.service,
              videoId: data.videoId,
              cover: data.cover,
              title: data.title,
              duration: data.duration,
              classPrefix: 'oe',
              playIcon: PLAY_ICON,
              placeholderHtml: PLACEHOLDER,
              playLabel: runtimeContext.t('play', 'Play'),
              videoLabel: runtimeContext.t('video', 'Video'),
              ownerDocument: document,
            })
            const play = built.player.querySelector('button')
            play?.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
            play?.addEventListener('click', () => {
              built.play()
              wrapper.classList.add('oe-embed--playing')
            }, { signal: playerController.signal })
            view.appendChild(built.player)
            void resolvePreview(built)
            }
            if (!configured && !data.caption) return

            const caption = document.createElement('div')
            caption.className = 'oe-embed__caption'
            caption.contentEditable = readOnly ? 'false' : 'true'
            caption.dataset.placeholder = runtimeContext.t('captionPlaceholder', 'Caption')
            if (data.caption) setSanitizedHtml(caption, data.caption)
            view.appendChild(caption)
          }

          project(data)

          return {
            element: wrapper,
            read() {
              const caption = view.querySelector('.oe-embed__caption')
              return { ...data, caption: caption?.innerHTML?.trim() ?? data.caption }
            },
            update(next) {
              if (!dead) project(next)
            },
            editableFields() {
              const caption = /** @type {HTMLElement | null} */ (view.querySelector('.oe-embed__caption'))
              return caption
                ? Object.freeze([Object.freeze({ key: 'caption', element: caption, mode: /** @type {'rich-text'} */ ('rich-text') })])
                : Object.freeze([])
            },
            setReadOnly(value) {
              clearInputTimer()
              readOnly = value
              if (value) {
                coverTask?.cancel()
                coverTask = null
              }
              project(data)
            },
            focus() {
              if (dead || readOnly) return
              const caption = /** @type {HTMLElement | null} */ (view.querySelector('.oe-embed__caption'))
              ;(caption ?? input).focus()
            },
            destroy() {
              dead = true
              clearInputTimer()
              playerController?.abort()
              previewController?.abort()
              coverTask?.cancel()
              coverTask = null
              view.replaceChildren()
            },
          }
        },
        destroy() {
          destroyed = true
          revokeAll()
        },
      }
    },
  })
}
