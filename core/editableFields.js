/**
 * Return every editable field owned by one block in DOM order.
 * @param {HTMLElement} block
 * @returns {HTMLElement[]}
 */
export function editableFields(block) {
  const descendants = Array.from(
    block.querySelectorAll('[contenteditable]'),
    element => /** @type {HTMLElement} */ (element),
  )
  const fields = block.matches('[contenteditable]') ? [block, ...descendants] : descendants
  return fields.filter(field => !field.closest('[data-inline-plugin]'))
}

/**
 * Resolve the editable field that owns a range boundary. A boundary may be an
 * element node positioned between children, so inspect that child before
 * falling back to the first field for legacy or synthetic ranges.
 * @param {HTMLElement} block
 * @param {Node} container
 * @param {number} offset
 * @returns {{ element: HTMLElement, index: number } | null}
 */
export function editableAtBoundary(block, container, offset) {
  const fields = editableFields(block)
  if (!fields.length) return null

  const containerElement = container.nodeType === Node.ELEMENT_NODE
    ? /** @type {HTMLElement} */ (container)
    : container.parentElement
  let candidate = containerElement?.closest('[contenteditable]') ?? null

  if (!candidate && container.nodeType === Node.ELEMENT_NODE) {
    const children = container.childNodes
    const child = children[Math.min(offset, children.length - 1)] ?? null
    const childElement = child?.nodeType === Node.ELEMENT_NODE
      ? /** @type {HTMLElement} */ (child)
      : child?.parentElement
    candidate = childElement?.closest('[contenteditable]')
      ?? childElement?.querySelector?.('[contenteditable]')
      ?? null
  }

  while (candidate && !fields.includes(/** @type {HTMLElement} */ (candidate))) {
    candidate = candidate.parentElement?.closest('[contenteditable]') ?? null
  }
  const editable = candidate instanceof HTMLElement ? candidate : null
  const index = editable && block.contains(editable) ? fields.indexOf(editable) : -1
  return index >= 0 ? { element: fields[index], index } : { element: fields[0], index: 0 }
}

