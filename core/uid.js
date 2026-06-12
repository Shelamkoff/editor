const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 6
// Largest multiple of 62 that fits in a byte (62 * 4 = 248)
const MAX_VALID = 247

/**
 * Generate a random block ID.
 * Uses rejection sampling to eliminate modulo bias.
 * @returns {string}
 */
export function uid() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2))
  let id = ''
  for (let i = 0; i < bytes.length && id.length < ID_LENGTH; i++) {
    const b = /** @type {number} */ (bytes[i])
    if (b <= MAX_VALID) {
      id += ALPHABET[b % ALPHABET.length]
    }
  }
  // Extremely unlikely fallback: if too many bytes rejected, generate more
  while (id.length < ID_LENGTH) {
    const extra = crypto.getRandomValues(new Uint8Array(1))
    const b = /** @type {number} */ (extra[0])
    if (b <= MAX_VALID) {
      id += ALPHABET[b % ALPHABET.length]
    }
  }
  return id
}
