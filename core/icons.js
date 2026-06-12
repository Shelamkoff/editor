/**
 * Create a 16×16 Tabler-style SVG icon from path data.
 * @param {string} d — inner SVG elements (paths, circles, etc.)
 * @param {number} [size=16]
 * @returns {string}
 */
export const createSvgIcon = (d, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

// Toolbar icons
export const ICON_PLUS = createSvgIcon('<path d="M12 5l0 14"/><path d="M5 12l14 0"/>')
export const ICON_DRAG = createSvgIcon('<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>')

// BlockSettingsMenu icons
export const ICON_DELETE = createSvgIcon('<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>')
export const ICON_UP = createSvgIcon('<path d="M6 15l6 -6l6 6"/>')
export const ICON_DOWN = createSvgIcon('<path d="M6 9l6 6l6 -6"/>')
export const ICON_DUPLICATE = createSvgIcon('<path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -2.012 -2.012v-8.725c0 -1.656 1.344 -3 3 -3h8.725a2 2 0 0 1 2.013 2.013"/>')
export const ICON_BACK = createSvgIcon('<path d="M15 6l-6 6l6 6"/>')
export const ICON_SWITCH = createSvgIcon('<path d="M20 10h-16l5.5 -6"/><path d="M4 14h16l-5.5 6"/>')
export const ICON_CHEVRON_RIGHT = createSvgIcon('<path d="M9 6l6 6l-6 6"/>')
