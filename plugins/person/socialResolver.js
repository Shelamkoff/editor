// @ts-check

const ti = (/** @type {string} */ d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

/** @type {Record<string, string>} */
const ICONS = {
  website: ti('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0 -20"/><path d="M2 12h20"/>'),
  twitter: ti('<path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/>'),
  github: ti('<path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"/>'),
  telegram: ti('<path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4"/>'),
  linkedin: ti('<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M8 11l0 5"/><path d="M8 8l0 .01"/><path d="M12 16l0 -5"/><path d="M16 16v-3a2 2 0 0 0 -4 0"/>'),
  instagram: ti('<path d="M4 4m0 4a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z"/><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M16.5 7.5l0 .01"/>'),
  facebook: ti('<path d="M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3"/>'),
  youtube: ti('<path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z"/><path d="M10 9l5 3l-5 3z"/>'),
  tiktok: ti('<path d="M21 7.917v4.034a9.948 9.948 0 0 1 -5 -1.951v4.5a6.5 6.5 0 1 1 -8 -6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z"/>'),
  discord: ti('<path d="M8 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M14 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M15.5 17c0 1 1.5 3 2 3c1.5 0 2.833 -1.667 3.5 -3c.667 -1.667 .5 -5.833 -1.5 -11.5c-1.457 -1.015 -3 -1.34 -4.5 -1.5l-1 2.5"/><path d="M8.5 17c0 1 -1.356 3 -1.832 3c-1.429 0 -2.698 -1.667 -3.333 -3c-.635 -1.667 -.476 -5.833 1.428 -11.5c1.388 -1.015 2.782 -1.34 4.237 -1.5l1 2.5"/>'),
  reddit: ti('<path d="M12 8c2.648 0 5.028 .826 6.675 2.14a2.5 2.5 0 0 1 2.326 4.36c0 3.59 -4.03 6.5 -9 6.5c-4.875 0 -8.845 -2.8 -9 -6.294l0 -.206a2.5 2.5 0 0 1 2.326 -4.36c1.646 -1.313 4.026 -2.14 6.674 -2.14z"/><path d="M12 8l1 -5l6 1"/><circle cx="19" cy="4" r="1"/><circle cx="9" cy="13" r=".5" fill="currentColor"/><circle cx="15" cy="13" r=".5" fill="currentColor"/><path d="M10 17c.667 .333 1.333 .5 2 .5s1.333 -.167 2 -.5"/>'),
}

/** @type {{ hostname: RegExp, type: string }[]} */
const DEFAULT_MATCHERS = [
  { hostname: /^(www\.)?(twitter\.com|x\.com)$/i, type: 'twitter' },
  { hostname: /^(www\.)?github\.com$/i, type: 'github' },
  { hostname: /^(t\.me|telegram\.me)$/i, type: 'telegram' },
  { hostname: /^(www\.)?linkedin\.com$/i, type: 'linkedin' },
  { hostname: /^(www\.)?instagram\.com$/i, type: 'instagram' },
  { hostname: /^(www\.)?facebook\.com$/i, type: 'facebook' },
  { hostname: /^(www\.)?youtube\.com$/i, type: 'youtube' },
  { hostname: /^(www\.)?tiktok\.com$/i, type: 'tiktok' },
  { hostname: /^(discord\.(gg|com))$/i, type: 'discord' },
  { hostname: /^(www\.)?reddit\.com$/i, type: 'reddit' },
]

/**
 * Resolve a URL to a social network type and icon.
 * Custom resolvers are checked first, then built-in hostname matchers.
 * @param {string} url
 * @param {Array<{ test: RegExp | ((url: string) => boolean), type: string, icon?: string }>} [customResolvers]
 * @returns {{ type: string, icon: string }}
 */
export function resolveSocialIcon(url, customResolvers) {
  if (customResolvers) {
    for (const r of customResolvers) {
      let match = false
      if (typeof r.test === 'function') {
        match = r.test(url)
      } else {
        // Global and sticky regular expressions retain `lastIndex` between
        // calls. Reset it so the same URL always produces the same result.
        r.test.lastIndex = 0
        match = r.test.test(url)
        r.test.lastIndex = 0
      }
      if (match) return { type: r.type, icon: r.icon || ICONS[r.type] || ICONS['website'] || '' }
    }
  }

  try {
    const { hostname } = new URL(url)
    for (const m of DEFAULT_MATCHERS) {
      if (m.hostname.test(hostname)) return { type: m.type, icon: ICONS[m.type] || '' }
    }
  } catch { /* invalid URL */ }

  return { type: 'website', icon: ICONS['website'] || '' }
}

export { ICONS as SOCIAL_ICONS }
