// @ts-check
import { sanitizeUrl } from '../../shared/sanitize/sanitizeUrl.js'

/**
 * Parse an absolute URL from a supported video provider.
 * @param {string} value
 * @returns {{ service: 'youtube' | 'vimeo', videoId: string } | null}
 */
export function parseEmbedUrl(value) {
  const safeUrl = sanitizeUrl(value, { policy: 'external', allowRelative: false, fallback: '' })
  if (!safeUrl) return null

  let parsed
  try { parsed = new URL(safeUrl) } catch { return null }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  const segments = parsed.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') {
    const videoId = segments[0] || ''
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? { service: 'youtube', videoId } : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const videoId = parsed.pathname === '/watch'
      ? parsed.searchParams.get('v') || ''
      : (segments[0] === 'embed' || segments[0] === 'shorts' ? segments[1] || '' : '')
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? { service: 'youtube', videoId } : null
  }

  if (host === 'vimeo.com') {
    const videoId = segments[0] || ''
    return /^\d+$/.test(videoId) ? { service: 'vimeo', videoId } : null
  }

  if (host === 'player.vimeo.com' && segments[0] === 'video') {
    const videoId = segments[1] || ''
    return /^\d+$/.test(videoId) ? { service: 'vimeo', videoId } : null
  }

  return null
}
