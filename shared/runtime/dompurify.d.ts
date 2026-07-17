interface DOMPurifyRuntime {
  sanitize(source: string, config?: Record<string, unknown>): string | DocumentFragment | HTMLElement
}

declare const DOMPurify: DOMPurifyRuntime
export default DOMPurify
