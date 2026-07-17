// @ts-check
import { buildPlayer } from '../../../shared/embedPlayer.js'

const styles = new URL('./styles.css', import.meta.url).href

const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" stroke-width="0" fill="currentColor"/></svg>`

/**
 * Embed block renderer — uses shared buildPlayer() for identical DOM structure.
 * Data: { service, videoId, caption?, cover?, title?, duration? }
 * @param {string} classPrefix
 * @param {Record<string, import('../../../shared/localeTypes').LocaleValue>} locale
 * @returns {import('../../types').BlockRenderer<import('../../types').EmbedBlock>}
 */
export function createEmbedRenderer(classPrefix, locale) {
  /** @param {string} key @param {string} fallback */
  const t = (key, fallback) => typeof locale?.[key] === 'string' ? locale[key] : fallback
  return {
    type: 'embed',
    styles: [styles],

    /**
     * @param {import('../../types').EmbedBlock} block
     * @param {import('../../types').InlineParser} parseInline
     * @returns {HTMLElement}
     */
    render(block, parseInline) {
      const { service, videoId, caption, cover, title, duration } = block.data

      const figure = document.createElement('figure')
      figure.className = `${classPrefix}-embed`
      if (!videoId) return figure

      // Build player using shared module (same DOM as editor plugin)
      const result = buildPlayer({
        service,
        videoId,
        cover,
        title,
        duration,
        classPrefix,
        playIcon: ICON_PLAY,
        playLabel: t('renderer.embed.play', 'Play video'),
        videoLabel: t('renderer.embed.video', 'Video'),
      })

      // Wire play button
      /** @type {HTMLElement | null} */
      const playBtn = result.player.querySelector(`.${classPrefix}-embed__play-btn`)
      playBtn?.addEventListener('click', () => result.play())

      figure.appendChild(result.player)

      // Caption
      if (caption) {
        const figcaption = document.createElement('figcaption')
        figcaption.className = `${classPrefix}-embed__caption`
        figcaption.appendChild(parseInline(caption))
        figure.appendChild(figcaption)
      }

      return figure
    },
  }
}
