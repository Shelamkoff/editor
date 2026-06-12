/**
 * Resolve a URL to a social network type and icon.
 * Custom resolvers are checked first, then built-in hostname matchers.
 * @param {string} url
 * @param {Array<{ test: RegExp | ((url: string) => boolean), type: string, icon?: string }>} [customResolvers]
 * @returns {{ type: string, icon: string }}
 */
export function resolveSocialIcon(url: string, customResolvers?: Array<{
    test: RegExp | ((url: string) => boolean);
    type: string;
    icon?: string;
}>): {
    type: string;
    icon: string;
};
export { ICONS as SOCIAL_ICONS };
/** @type {Record<string, string>} */
declare const ICONS: Record<string, string>;
