// @ts-check
import { READ_ONLY_INTERACTIVE_ATTRIBUTE, setSanitizedHtml } from '../../plugin-kit/index.js'
import { insertTrustedHtml } from '../../shared/sanitize/sanitizeHtml.js'
import { embedDataSchema } from '../../shared/blockSchemas/embed.js'
import { sanitizeMediaUrl } from '../../shared/sanitize/sanitizeUrl.js'
import { isSupportedImageFile, triggerFileInput } from '../shared/fileInput.js'
import { buildPlayer } from './player.js'
import { parseEmbedUrl } from './url.js'

const editorStyles = new URL('./embed.css', import.meta.url).href
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
  if (snapshot.injectStyles !== false) styles.push(editorStyles)
  if (snapshot.css) styles.push(snapshot.css)

  const capabilities = Object.freeze({
    empty: Object.freeze({ isEmpty: data => !data.videoId }),
    conversion: Object.freeze({
      export: data => ({ kind: 'rich-text', data: { text: data.caption } }),
      canImport: payload => payload?.kind === 'rich-text' && typeof payload.data?.text === 'string',
      import(payload) {
        if (payload?.kind !== 'rich-text' || typeof payload.data?.text !== 'string') {
          throw new TypeError('Embed can only import rich-text payloads')
        }
        return { ...emptyData(), caption: payload.data.text }
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
          actions.append(replace, cover, remove)
          wrapper.append(actions)

          const commit = next => context.updateData(() => next)

          const parseInput = () => {
            if (readOnly || dead) return
            const parsed = parseEmbedUrl(input.value)
            if (!parsed) return
            coverTask?.cancel()
            coverTask = null
            commit({ ...emptyData(), ...parsed })
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
                const committed = !task.signal.aborted && !!url && task.commit(current => ({
                  ...current,
                  cover: url,
                }))
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
          replace.addEventListener('click', () => {
            if (readOnly) return
            input.value = ''
            input.focus()
          }, { signal: context.signal })
          cover.addEventListener('click', chooseCover, { signal: context.signal })
          remove.addEventListener('click', () => {
            if (readOnly) return
            coverTask?.cancel()
            coverTask = null
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
                if (safe) task.commit(current => ({ ...current, cover: safe }))
              }).catch(() => {}).finally(() => {
                task.cancel()
                if (coverTask === task) coverTask = null
              })
            }, { signal: context.signal })
            actions.insertBefore(button, remove)
          }

          const project = next => {
            const sourceChanged = data.service !== next.service || data.videoId !== next.videoId
            data = { ...next }
            if (sourceChanged) {
              coverTask?.cancel()
              coverTask = null
            }
            previewController?.abort()
            view.replaceChildren()
            const configured = !!data.service && !!data.videoId
            urlBar.hidden = configured || readOnly
            actions.hidden = readOnly || !configured
            wrapper.classList.toggle('oe-embed--filled', configured)

            if (!configured) return

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
            built.player.querySelector('button')?.setAttribute(READ_ONLY_INTERACTIVE_ATTRIBUTE, '')
            view.appendChild(built.player)
            void resolvePreview(built)

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
