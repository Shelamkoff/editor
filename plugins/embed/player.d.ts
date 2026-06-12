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
 * }} opts
 * @returns {{ player: HTMLElement, play: () => void, setPreview: (src: string, alt?: string) => void }}
 */
export function buildPlayer(opts: {
    service: string;
    videoId: string;
    cover?: string;
    title?: string;
    duration?: string;
    classPrefix: string;
    playIcon: string;
    placeholderHtml?: string;
}): {
    player: HTMLElement;
    play: () => void;
    setPreview: (src: string, alt?: string) => void;
};
/** @type {Record<string, { regex: RegExp[], embedUrl: (id: string) => string, previewUrl: ((id: string) => string) | null }>} */
export const SERVICES: Record<string, {
    regex: RegExp[];
    embedUrl: (id: string) => string;
    previewUrl: ((id: string) => string) | null;
}>;
