/**
 * Unified allowlists for inline HTML sanitization.
 * Shared between core (plugin render / paste path) and renderer (read-only output).
 */
/** Inline tags permitted inside editable text blocks. */
export const ALLOWED_TAGS: Set<string>;
/**
 * Allowed HTML attributes per tag.
 * @type {Record<string, Set<string>>}
 */
export const ALLOWED_ATTRS: Record<string, Set<string>>;
/** CSS properties allowed in inline style attributes. */
export const ALLOWED_STYLE_PROPS: Set<string>;
/** URL schemes that must be blocked. */
export const DANGEROUS_URL_RE: RegExp;
