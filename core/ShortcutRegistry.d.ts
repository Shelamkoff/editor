export class ShortcutRegistry {
    /**
     * Register a keyboard shortcut.
     * Combo format: 'Mod+B', 'Mod+Shift+Z', 'Tab', 'Shift+Tab', 'Escape'
     * 'Mod' maps to Cmd (Mac) / Ctrl (other).
     *
     * @param {string} combo — normalized combo string
     * @param {(e: KeyboardEvent) => void} handler
     * @returns {() => void} Unregister function
     */
    register(combo: string, handler: (e: KeyboardEvent) => void): () => void;
    /**
     * Try to handle a keyboard event. If a matching shortcut is found,
     * calls its handler and returns true.
     *
     * @param {KeyboardEvent} e
     * @returns {boolean} Whether the event was handled
     */
    handle(e: KeyboardEvent): boolean;
    /**
     * Remove all registered shortcuts.
     */
    clear(): void;
    #private;
}
