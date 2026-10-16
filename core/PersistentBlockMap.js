// @ts-check
/**
 * Immutable AVL index for canonical blocks. Updates path-copy O(log N) nodes;
 * unchanged keys, records and index subtrees remain shared by snapshots.
 * The owning DocumentStore maintains a separate ordered sequence of ids.
 */

const height = node => node?.height ?? 0

function branch(key, value, left = null, right = null) {
  return Object.freeze({ key, value, left, right, height: Math.max(height(left), height(right)) + 1 })
}

function rotateLeft(node) {
  const pivot = node.right
  return branch(pivot.key, pivot.value, branch(node.key, node.value, node.left, pivot.left), pivot.right)
}

function rotateRight(node) {
  const pivot = node.left
  return branch(pivot.key, pivot.value, pivot.left, branch(node.key, node.value, pivot.right, node.right))
}

function balanced(node) {
  const delta = height(node.left) - height(node.right)
  if (delta > 1) {
    const left = node.left
    const adjusted = height(left.left) < height(left.right)
      ? branch(node.key, node.value, rotateLeft(left), node.right)
      : node
    return rotateRight(adjusted)
  }
  if (delta < -1) {
    const right = node.right
    const adjusted = height(right.right) < height(right.left)
      ? branch(node.key, node.value, node.left, rotateRight(right))
      : node
    return rotateLeft(adjusted)
  }
  return node
}

function inserted(node, key, value) {
  if (!node) return branch(key, value)
  if (key === node.key) return branch(key, value, node.left, node.right)
  return key < node.key
    ? balanced(branch(node.key, node.value, inserted(node.left, key, value), node.right))
    : balanced(branch(node.key, node.value, node.left, inserted(node.right, key, value)))
}

function smallest(node) {
  while (node.left) node = node.left
  return node
}

function deleted(node, key) {
  if (!node) return null
  if (key === node.key) {
    if (!node.left) return node.right
    if (!node.right) return node.left
    const next = smallest(node.right)
    return balanced(branch(next.key, next.value, node.left, deleted(node.right, next.key)))
  }
  if (key < node.key) {
    const left = deleted(node.left, key)
    return left === node.left ? node : balanced(branch(node.key, node.value, left, node.right))
  }
  const right = deleted(node.right, key)
  return right === node.right ? node : balanced(branch(node.key, node.value, node.left, right))
}

export class PersistentBlockMap {
  #root

  constructor(root = null) { this.#root = root }

  static fromEntries(entries) {
    let index = new PersistentBlockMap()
    for (const [key, value] of entries) index = index.withSet(key, value)
    return index
  }

  get(key) {
    if (typeof key !== 'string') return undefined
    let node = this.#root
    while (node) {
      if (key === node.key) return node.value
      node = key < node.key ? node.left : node.right
    }
    return undefined
  }

  has(key) { return this.get(key) !== undefined }

  withSet(key, value) {
    if (typeof key !== 'string') throw new TypeError('Persistent block id must be a string')
    return new PersistentBlockMap(inserted(this.#root, key, value))
  }

  withDelete(key) {
    if (typeof key !== 'string') return this
    return new PersistentBlockMap(deleted(this.#root, key))
  }

  *[Symbol.iterator]() {
    const stack = []
    let node = this.#root
    while (node || stack.length > 0) {
      while (node) { stack.push(node); node = node.left }
      node = stack.pop()
      yield [node.key, node.value]
      node = node.right
    }
  }
}
