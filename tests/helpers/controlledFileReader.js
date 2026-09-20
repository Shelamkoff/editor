// A manually completed reader: exercise the real uploader's event boundary
// without timers or filesystems. Dispatching a saved callback also models a
// late event queued before cancellation/cleanup.
export function controlledFileReader() {
  const readers = []
  class Reader {
    result = null
    onload = null
    onerror = null
    onabort = null
    constructor() { readers.push(this) }
    readAsDataURL() {}
    abort() { this.onabort?.() }
    complete(url = 'data:image/png;base64,AA==') {
      this.result = url
      this.onload?.()
    }
  }
  const controller = new AbortController()
  return {
    readers, controller,
    document: { defaultView: { FileReader: Reader, AbortController } },
    file: new File(['pixel'], 'pixel.png', { type: 'image/png' }),
  }
}

export async function observeCompletion(promise, action) {
  let status = 'pending', rejection, eventError
  promise.then(() => { status = 'fulfilled' }, error => { status = 'rejected'; rejection = error })
  try { action() } catch (error) { eventError = error }
  // Drain the finite async wrappers in handle(); a hanging Promise remains
  // observable rather than hanging the entire test runner.
  for (let i = 0; i < 10; i++) await Promise.resolve()
  return { status, rejection, eventError }
}
