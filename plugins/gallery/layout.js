import { LAYOUT_ICONS } from './icons.js'

/** All known layout names (auto, '1'..'6c', triptych, masonry, poly-*). */
export const ALL_LAYOUTS = Object.keys(LAYOUT_ICONS)

/** Maximum number of images visible in template-based layouts. */
export const MAX_VISIBLE = 6

/** Slot counts for `poly-*` templates. */
/** @type {Record<string, number>} */
const POLY_SLOTS = { 'poly-5': 5, 'poly-3arch': 3, 'poly-5flat': 5, 'poly-3steps': 3 }

/**
 * @param {string} layout
 * @returns {number} number of slots, or `Infinity` for layouts that flow all images
 */
export function getSlotsCount(layout) {
  if (layout === 'auto' || layout === 'masonry') return Infinity
  if (layout === 'triptych') return 3
  if (POLY_SLOTS[layout]) return POLY_SLOTS[layout]
  const m = layout.match(/^(\d)/)
  return m?.[1] ? parseInt(m[1], 10) : MAX_VISIBLE
}

/**
 * Pick a template based on image count + per-image orientations.
 * Used after images load and we know each image's aspect ratio.
 *
 * @param {number} count
 * @param {string[]} orientations  array of 'L' (landscape) | 'P' (portrait) | 'S' (square)
 * @returns {string}
 */
export function selectAutoTemplate(count, orientations) {
  if (count <= 1) return '1'
  if (count === 2) return '2'

  const firstP = orientations[0] === 'P'
  const lastP = orientations[orientations.length - 1] === 'P'
  const allLS = orientations.every((o) => o !== 'P')
  const n = Math.min(count, MAX_VISIBLE)

  switch (n) {
    case 3: return firstP ? '3a' : lastP ? '3b' : '3c'
    case 4: return firstP ? '4b' : allLS ? '4c' : '4a'
    case 5: return firstP ? '5b' : allLS ? '5c' : '5a'
    default: return firstP ? '6b' : allLS ? '6c' : '6a'
  }
}

/**
 * Initial template guess for `auto` layout, before images are loaded
 * (no orientation info available).
 *
 * @param {number} count
 * @returns {string}
 */
export function pickInitialAutoTemplate(count) {
  if (count <= 1) return '1'
  if (count === 2) return '2'
  if (count === 3) return '3a'
  if (count === 4) return '4a'
  if (count === 5) return '5a'
  return '6a'
}

/**
 * Classify an image's orientation from its loaded dimensions.
 * @param {number} width
 * @param {number} height
 * @returns {'L' | 'P' | 'S'}
 */
export function classifyOrientation(width, height) {
  const r = width / height
  if (r > 1.2) return 'L'
  if (r < 1 / 1.2) return 'P'
  return 'S'
}
