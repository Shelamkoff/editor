/** Number of cells in a fixed gallery template. */
export function gallerySlotCount(layout) {
  if (layout === 'auto' || layout === 'masonry') return Infinity
  if (layout === 'triptych') return 3
  const polygon = { 'poly-5': 5, 'poly-3arch': 3, 'poly-5flat': 5, 'poly-3steps': 3 }
  return Object.hasOwn(polygon, layout) ? polygon[layout] : (Number.parseInt(layout, 10) || 6)
}

/** Choose the same image-count/orientation layout for editor and renderer. */
export function autoGalleryLayout(count, orientations = []) {
  if (count <= 2) return String(Math.max(1, count))
  const n = Math.min(count, 6)
  if (!orientations.length) return n + 'a'
  const firstPortrait = orientations[0] === 'P'
  if (n === 3) return firstPortrait ? '3a' : orientations.at(-1) === 'P' ? '3b' : '3c'
  const allLandscape = orientations.every(value => value !== 'P')
  return n + (firstPortrait ? 'b' : allLandscape ? 'c' : 'a')
}

/** @param {HTMLImageElement} image */
export function galleryOrientation(image) {
  const ratio = image.naturalWidth / image.naturalHeight
  return ratio > 1.2 ? 'L' : ratio < 1 / 1.2 ? 'P' : 'S'
}
