// Observe actual child content after the asynchronous, scriptless load. These
// helpers do not interpret product status attributes or substitute srcdoc bytes
// for visible content.
export async function waitForEmbeddedDocument(frame, predicate = document => document.body?.childNodes.length > 0) {
  if (frame?.tagName !== 'IFRAME' || frame.getAttribute('sandbox') !== 'allow-same-origin') {
    throw new Error('Expected the scriptless owned HTML frame')
  }
  const deadline = performance.now() + 3000
  while (performance.now() < deadline) {
    const document = frame.contentDocument
    if (document?.URL.startsWith('about:srcdoc') && document.readyState === 'complete' && predicate(document)) return document
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Embedded author content did not become available in its admitted document')
}
