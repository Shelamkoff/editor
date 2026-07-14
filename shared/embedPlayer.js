import { setSafeUrlAttribute } from './sanitize/sanitizeUrl.js'

/** @type {Record<string, { regex: RegExp[], embedUrl: (id: string) => string, previewUrl: ((id: string) => string) | null }>} */
export const SERVICES = {
  youtube: {
    regex: [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/],
    embedUrl: (id) => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
    previewUrl: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  },
  vimeo: {
    regex: [/vimeo\.com\/(\d+)/],
    embedUrl: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
    previewUrl: null,
  },
}

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups'

/**
 * Build a video player DOM subtree.
 *
 * @param {{
 *   service: string,
 *   videoId: string,
 *   cover?: string,
 *   title?: string,
 *   duration?: string,
 *   classPrefix: string,
 *   playIcon: string,
 *   placeholderHtml?: string,
 *   playLabel?: string,
 *   videoLabel?: string,
 * }} opts
 * @returns {{ player: HTMLElement, play: () => void, setPreview: (src: string, alt?: string) => void }}
 */
export function buildPlayer(opts) {
  const { service, videoId, cover, title, duration, classPrefix, playIcon, placeholderHtml } = opts
  const playLabel = opts.playLabel || 'Play'
  const videoLabel = opts.videoLabel || 'Video'
  const svc = SERVICES[service]
  const prefix = `${classPrefix}-embed`

  const player = document.createElement('div')
  player.className = `${prefix}__player`

  // Preview: custom cover → service thumbnail → placeholder
  const previewUrl = cover || svc?.previewUrl?.(videoId) || ''

  /** @type {HTMLElement | null} */
  let previewEl = null

  if (previewUrl) {
    const img = document.createElement('img')
    img.className = `${prefix}__preview`
    setSafeUrlAttribute(img, 'src', previewUrl, 'media')
    img.alt = title || videoLabel
    img.loading = 'lazy'
    player.appendChild(img)
    previewEl = img
  } else if (placeholderHtml) {
    previewEl = document.createElement('div')
    previewEl.className = `${prefix}__placeholder`
    previewEl.innerHTML = placeholderHtml
    player.appendChild(previewEl)
  }

  // Play button
  const playBtn = document.createElement('button')
  playBtn.type = 'button'
  playBtn.className = `${prefix}__play-btn`
  playBtn.innerHTML = playIcon
  playBtn.setAttribute('aria-label', playLabel)
  player.appendChild(playBtn)

  // Title overlay (top-left)
  if (title) {
    const titleEl = document.createElement('span')
    titleEl.className = `${prefix}__title`
    titleEl.textContent = title
    player.appendChild(titleEl)
  }

  // Duration overlay (bottom-right)
  if (duration) {
    const durEl = document.createElement('span')
    durEl.className = `${prefix}__duration`
    durEl.textContent = duration
    player.appendChild(durEl)
  }

  // Iframe container (empty until play)
  const iframeWrap = document.createElement('div')
  iframeWrap.className = `${prefix}__iframe`
  player.appendChild(iframeWrap)

  /** Create and inject the iframe, toggle playing state. */
  function play() {
    if (iframeWrap.firstElementChild) return
    const embedUrl = svc?.embedUrl(videoId)
    if (!embedUrl) return

    player.classList.add(`${prefix}__player--playing`)

    const iframe = document.createElement('iframe')
    setSafeUrlAttribute(iframe, 'src', embedUrl, 'external')
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('allowfullscreen', 'true')
    iframe.setAttribute('allow', IFRAME_ALLOW)
    iframe.setAttribute('sandbox', IFRAME_SANDBOX)
    iframe.title = title || videoLabel
    iframeWrap.appendChild(iframe)
  }

  /**
   * Replace the preview image (e.g. after async Vimeo oEmbed fetch).
   * @param {string} src
   * @param {string} [alt]
   */
  function setPreview(src, alt) {
    if (previewEl) previewEl.remove()
    const img = document.createElement('img')
    img.className = `${prefix}__preview`
    setSafeUrlAttribute(img, 'src', src, 'media')
    img.alt = alt || videoLabel
    img.loading = 'lazy'
    player.insertBefore(img, player.firstChild)
    previewEl = img
  }

  return { player, play, setPreview }
}
