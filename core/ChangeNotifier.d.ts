/**
 * Debounced change notification.
 * Calls the onChange callback after a quiet period following editor changes.
 */
export class ChangeNotifier {
    /**
     * @param {() => Promise<import('./types').EditorDocument>} saveFn
     * @param {((data: import('./types').EditorDocument) => void)} [onChange]
     * @param {number} [delay]
     */
    constructor(saveFn: () => Promise<import("./types").EditorDocument>, onChange?: ((data: import("./types").EditorDocument) => void), delay?: number);
    schedule(): void;
    destroy(): void;
    #private;
}
